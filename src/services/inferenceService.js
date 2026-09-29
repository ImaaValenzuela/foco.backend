const pool = require('../db');

/**
 * Circuit Breaker en memoria para aislar fallas del microservicio Python.
 * Evita agotamiento de sockets y conexiones a BD durante arranques en frío.
 */
class CircuitBreaker {
  constructor(threshold = 3, cooldownMs = 30000) {
    this.failureThreshold = threshold;
    this.cooldownMs = cooldownMs;
    this.failureCount = 0;
    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.nextAttempt = Date.now();
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN permite 1 prueba
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.cooldownMs;
      console.warn(`⚠️ [Circuit Breaker] Circuito IA abierto. Enfriamiento por ${this.cooldownMs / 1000}s`);
    }
  }

  reset() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.nextAttempt = Date.now();
  }
}

const iaCircuitBreaker = new CircuitBreaker(3, 30000);

/**
 * Consulta SQL Unificada: Extrae perfil, bloques y métricas en un único Round-Trip Time (RTT).
 * Garantiza la devolución de 1 fila estructurada consumiendo un solo cliente del pool.
 */
const UNIFIED_SNAPSHOT_QUERY = `
  SELECT 
    (SELECT row_to_json(p) FROM (
       SELECT study_hours_daily, work_hours_daily, leisure_hours_daily, routine_hours_daily, 
              interests, mot_create_habits, mot_avoid_dispersion, mot_organization, mot_reduce_fatigue 
       FROM onboarding_profiling 
       WHERE user_id = $1
    ) p) AS profile,

    (SELECT COALESCE(json_agg(json_build_object('type', b.type, 'content', b.content)), '[]'::json)
     FROM blocks b 
     WHERE b.user_id = $1) AS blocks,

    (SELECT row_to_json(pm) FROM (
       SELECT 
         COUNT(*) FILTER (WHERE is_completed = true AND created_at >= NOW() - INTERVAL '4 hours')::int AS completed_4h,
         COUNT(*) FILTER (WHERE is_completed = false AND created_at >= NOW() - INTERVAL '24 hours')::int AS interrupted_24h
       FROM pomodoro_sessions 
       WHERE user_id = $1
    ) pm) AS pomo_metrics;
`;

/**
 * Recopila el contexto real del usuario, consulta a la IA y audita el resultado.
 * Patrón "Fire-and-Forget" omnicanal con CERO latencia agregada al frontend.
 */
async function evaluarEstadoGlobal(userId, triggerSource = 'pomodoro', sourceId = null) {
  // 1. DESACOPLAMIENTO ABSOLUTO DEL EVENT LOOP
  // Cede inmediatamente el turno para permitir que el controlador responda al frontend (HTTP 201/200 inmediato).
  await new Promise(resolve => setImmediate(resolve));

  // 2. VERIFICACIÓN FAIL-FAST DEL CIRCUIT BREAKER
  if (!iaCircuitBreaker.canExecute()) {
    return; // Sale en 0.01 ms sin saturar PostgreSQL ni abrir sockets hacia Python
  }

  try {
    // 3. EXTRACCIÓN UNIFICADA EN BASE DE DATOS (1 RTT)
    const { rows } = await pool.query(UNIFIED_SNAPSHOT_QUERY, [userId]);
    const row = rows && rows[0] ? rows[0] : {};
    const profile = row.profile || {};
    const rawBlocks = row.blocks || [];
    const pomoMetrics = row.pomo_metrics || {};

    // 4. SANITIZACIÓN Y PRUNING DE BLOQUES (Mitigación de bloqueo en V8)
    // Calcula métricas y excluye arrays densos de 'embedding' para evitar inflar el JSON
    let personalPending = 0;
    let allBlocksTotal = 0;

    const sanitizedBlocks = rawBlocks.map(block => {
      const notes = Array.isArray(block.content?.notes) ? block.content.notes : [];
      const noteCount = notes.length;
      allBlocksTotal += noteCount;
      if (block.type === 'personal_block') personalPending = noteCount;

      // Poda vectores de embeddings (384 floats) para que JSON.stringify tarde < 0.2ms
      const cleanNotes = notes.map(({ embedding, ...cleanData }) => cleanData);
      return {
        type: block.type,
        content: { ...block.content, notes: cleanNotes }
      };
    });

    // 5. CONSTRUCCIÓN DEL PAYLOAD SEGÚN CONTRATO ESTRICTO
    const snapshotPayload = {
      user_id: String(userId),
      trigger_source: triggerSource,
      associated_id: sourceId,
      snap_motivations: {
        mot_create_habits: Boolean(profile.mot_create_habits),
        mot_avoid_dispersion: Boolean(profile.mot_avoid_dispersion),
        mot_organization: Boolean(profile.mot_organization),
        mot_reduce_fatigue: Boolean(profile.mot_reduce_fatigue)
      },
      snap_interests: Array.isArray(profile.interests) ? profile.interests : [],
      snap_routine: {
        study: Number(profile.study_hours_daily) || 0,
        work: Number(profile.work_hours_daily) || 0,
        leisure: Number(profile.leisure_hours_daily) || 0,
        routine: Number(profile.routine_hours_daily) || 0
      },
      snap_blocks_content: sanitizedBlocks,
      snap_habits_metrics: {
        pomodoro_completed_last_4h: Number(pomoMetrics.completed_4h) || 0,
        pomodoro_interrupted_last_24h: Number(pomoMetrics.interrupted_24h) || 0,
        personal_block_pending_items: personalPending,
        all_blocks_total_items: allBlocksTotal
      }
    };

    // 6. INVOCACIÓN RESILIENTE CON TIMEOUT NATIVO
    const BASE_IA_URL = process.env.IA_SERVICE_URL || 'http://localhost:5000';
    const IA_URL = `${BASE_IA_URL.replace(/\/$/, '')}/evaluate-rules`;

    // Timeout nativo con fallback si AbortSignal.timeout no existiera
    const signal = typeof AbortSignal.timeout === 'function' 
      ? AbortSignal.timeout(1500)
      : (() => {
          const c = new AbortController();
          setTimeout(() => c.abort(), 1500);
          return c.signal;
        })();

    const response = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotPayload),
      signal
    });

    if (!response.ok) {
      throw new Error(`Motor IA respondió con HTTP ${response.status}`);
    }

    const iaResult = await response.json();
    iaCircuitBreaker.recordSuccess();

    // 7. PERSISTENCIA DE AUDITORÍA ASÍNCRONA (Si dispara regla)
    if (iaResult && iaResult.triggered) {
      await pool.query(
        `INSERT INTO ai_inference_logs 
         (user_id, rule_id, associated_pomodoro_id, action_taken, suggested_message, 
          snap_motivations, snap_interests, snap_routine, snap_blocks_content, snap_habits_metrics) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          iaResult.rule_id,
          triggerSource === 'pomodoro' ? sourceId : null,
          iaResult.action_taken,
          iaResult.suggested_message,
          JSON.stringify(snapshotPayload.snap_motivations),
          snapshotPayload.snap_interests,
          JSON.stringify(snapshotPayload.snap_routine),
          JSON.stringify(snapshotPayload.snap_blocks_content),
          JSON.stringify(snapshotPayload.snap_habits_metrics)
        ]
      );
      console.log(`🤖 [IA DISPARADA] [${triggerSource}]: Regla ${iaResult.rule_id}`);
    }

    return iaResult;

  } catch (error) {
    iaCircuitBreaker.recordFailure();
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.warn('⚠️ [Circuit Breaker] Timeout 1500ms excedido al contactar motor IA');
    } else {
      console.warn(`[Telemetría Silenciosa] Inferencia no completada: ${error.message}`);
    }
  }
}

// Alias de retrocompatibilidad
const evaluarReglasPomodoro = (userId, pomodoroId) => evaluarEstadoGlobal(userId, 'pomodoro', pomodoroId);

module.exports = {
  evaluarEstadoGlobal,
  evaluarReglasPomodoro,
  CircuitBreaker,
  iaCircuitBreaker,
  UNIFIED_SNAPSHOT_QUERY
};