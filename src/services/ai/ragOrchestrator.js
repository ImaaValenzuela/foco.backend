const pool = require('../../db');
const { CircuitBreaker } = require('../../utils/circuitBreaker');

/**
 * Servicio Orquestador de RAG (Fase 4: Retrieval y Ensamble de Prompt)
 *
 * Conecta la recuperación híbrida semántica (pgvector / SBERT) sobre los bloques
 * y notas del lienzo con los logs del motor de inferencia (ai_inference_logs) y
 * el perfil de onboarding (onboarding_profiling) para ensamblar el prompt dinámico
 * de inyección para el Copiloto de IA de F.O.C.O.
 */
class RagOrchestratorService {
  constructor() {
    this.circuitBreaker = new CircuitBreaker(3, 30000);
    this.iaServiceUrl = process.env.IA_SERVICE_URL || 'http://localhost:5000';
  }

  /**
   * Calcula la similitud de coseno entre dos vectores densos numéricos.
   * Complejidad: O(D), donde D = 384 dimensiones.
   *
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} Coeficiente en el rango [-1, 1], normalizado típicamente a [0, 1]
   */
  calculateCosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB)) return 0;
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i];
      const b = vecB[i];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Genera el embedding denso de un texto consultando el microservicio Python FastAPI (SBERT).
   * Aislado mediante Circuit Breaker y AbortController con timeout estricto de 1500 ms.
   *
   * @param {string} text
   * @returns {Promise<number[]|null>} Vector de 384 dimensiones o null ante fallback
   */
  async vectorizeQuery(text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return null;
    }

    if (!this.circuitBreaker.canExecute()) {
      return null;
    }

    try {
      const url = `${this.iaServiceUrl.replace(/\/$/, '')}/vectorize`;
      const signal = typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(1500)
        : (() => {
            const c = new AbortController();
            setTimeout(() => c.abort(), 1500);
            return c.signal;
          })();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Microservicio IA respondió con HTTP ${response.status}`);
      }

      const data = await response.json();
      this.circuitBreaker.recordSuccess();
      return Array.isArray(data.embedding) ? data.embedding : null;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      console.warn(`[RagOrchestrator] Vectorización no disponible (${err.message}). Activando fallback.`);
      return null;
    }
  }

  /**
   * Búsqueda semántica híbrida sobre la tabla `blocks` del usuario.
   * 1. Si existe embedding de consulta, calcula similitud de coseno contra notas vectorizadas.
   * 2. Si no hay embedding o falla la vectorización, aplica coincidencia léxica/palabras clave.
   *
   * @param {string} userId
   * @param {string|number[]} queryOrVector Texto de consulta o vector ya calculado
   * @param {object} options
   * @returns {Promise<Array<{ id: string, blockType: string, title: string, text: string, similarity: number, matchType: string }>>}
   */
  async searchSemanticBlocks(userId, queryOrVector, options = {}) {
    const { limit = 3, threshold = 0.25 } = options;

    try {
      let queryVector = null;
      let queryText = '';

      if (Array.isArray(queryOrVector)) {
        queryVector = queryOrVector;
      } else if (typeof queryOrVector === 'string' && queryOrVector.trim()) {
        queryText = queryOrVector.trim();
        queryVector = await this.vectorizeQuery(queryText);
      }

      // Consulta de bloques del usuario
      const { rows } = await pool.query(
        `SELECT id, user_id, type, content, updated_at
         FROM blocks
         WHERE user_id = $1`,
        [userId]
      );

      if (!rows || rows.length === 0) {
        return [];
      }

      const allNotes = [];
      for (const block of rows) {
        const notes = Array.isArray(block.content?.notes) ? block.content.notes : [];
        for (const note of notes) {
          allNotes.push({
            id: note.id || null,
            blockType: block.type,
            title: note.title || null,
            text: note.text || '',
            type: note.type || (note.isTask ? 'task' : 'note'),
            embedding: Array.isArray(note.embedding) ? note.embedding : null,
            checked: Boolean(note.checked)
          });
        }
      }

      if (allNotes.length === 0) {
        return [];
      }

      const scoredNotes = [];

      // A) Recuperación vectorial densa (si contamos con vector de consulta)
      if (queryVector) {
        for (const note of allNotes) {
          if (note.embedding) {
            const similarity = this.calculateCosineSimilarity(queryVector, note.embedding);
            if (similarity >= threshold) {
              scoredNotes.push({
                id: note.id,
                blockType: note.blockType,
                title: note.title,
                text: note.text,
                type: note.type,
                similarity: Number(similarity.toFixed(4)),
                matchType: 'vector'
              });
            }
          }
        }
      }

      // B) Fallback / Complemento léxico si no hay suficientes resultados vectoriales o no hay vector
      if (scoredNotes.length === 0 && queryText) {
        const queryTokens = queryText.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        for (const note of allNotes) {
          const contentStr = `${note.title || ''} ${note.text || ''}`.toLowerCase();
          let matches = 0;
          for (const token of queryTokens) {
            if (contentStr.includes(token)) matches++;
          }
          if (matches > 0) {
            const lexicalScore = matches / (queryTokens.length || 1);
            scoredNotes.push({
              id: note.id,
              blockType: note.blockType,
              title: note.title,
              text: note.text,
              type: note.type,
              similarity: Number((0.3 + 0.5 * lexicalScore).toFixed(4)),
              matchType: 'lexical_fallback'
            });
          }
        }
      }

      // C) Si aún no hay notas y la consulta está vacía, devuelve notas recientes prioritarias
      if (scoredNotes.length === 0 && !queryText && !queryVector) {
        for (const note of allNotes.slice(0, limit)) {
          scoredNotes.push({
            id: note.id,
            blockType: note.blockType,
            title: note.title,
            text: note.text,
            type: note.type,
            similarity: 0.5,
            matchType: 'context_sample'
          });
        }
      }

      // Orden descendente por similitud y recorte
      scoredNotes.sort((a, b) => b.similarity - a.similarity);
      return scoredNotes.slice(0, limit);
    } catch (err) {
      console.warn(`[RagOrchestrator] Error en búsqueda semántica: ${err.message}`);
      return [];
    }
  }

  /**
   * Obtiene el último registro de inferencia guardado en `ai_inference_logs` para el usuario.
   *
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getLastInferenceLog(userId) {
    const { rows } = await pool.query(
        `SELECT id, user_id, rule_id, associated_pomodoro_id, action_taken, suggested_message,
                snap_motivations, snap_interests, snap_routine, snap_blocks_content, snap_habits_metrics,
                created_at
         FROM ai_inference_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (!rows || rows.length === 0) {
        return null;
      }

      const log = rows[0];

      // Sanitizar JSONB si viene como string
      const parseJsonSafe = (val, defaultVal = {}) => {
        if (!val) return defaultVal;
        if (typeof val === 'object') return val;
        try {
          return JSON.parse(val);
        } catch {
          return defaultVal;
        }
      };

      return {
        id: log.id,
        user_id: log.user_id,
        rule_id: log.rule_id,
        associated_pomodoro_id: log.associated_pomodoro_id,
        action_taken: log.action_taken,
        suggested_message: log.suggested_message,
        snap_motivations: parseJsonSafe(log.snap_motivations),
        snap_interests: Array.isArray(log.snap_interests) ? log.snap_interests : parseJsonSafe(log.snap_interests, []),
        snap_routine: parseJsonSafe(log.snap_routine),
        snap_blocks_content: parseJsonSafe(log.snap_blocks_content, []),
        snap_habits_metrics: parseJsonSafe(log.snap_habits_metrics),
        created_at: log.created_at
      };
  }

  /**
   * Obtiene la línea base actualizada desde `onboarding_profiling`.
   *
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getOnboardingProfile(userId) {
    const { rows } = await pool.query(
      `SELECT study_hours_daily, work_hours_daily, leisure_hours_daily, routine_hours_daily,
              interests, mot_create_habits, mot_avoid_dispersion, mot_organization, mot_reduce_fatigue,
              completed_at
       FROM onboarding_profiling
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (rows && rows[0]) {
      const p = rows[0];
      return {
        study_hours_daily: Number(p.study_hours_daily) || 0,
        work_hours_daily: Number(p.work_hours_daily) || 0,
        leisure_hours_daily: Number(p.leisure_hours_daily) || 0,
        routine_hours_daily: Number(p.routine_hours_daily) || 0,
        interests: Array.isArray(p.interests) ? p.interests : [],
        mot_create_habits: Boolean(p.mot_create_habits),
        mot_avoid_dispersion: Boolean(p.mot_avoid_dispersion),
        mot_organization: Boolean(p.mot_organization),
        mot_reduce_fatigue: Boolean(p.mot_reduce_fatigue),
        completed_at: p.completed_at
      };
    }

    return {
      study_hours_daily: 0,
      work_hours_daily: 0,
      leisure_hours_daily: 0,
      routine_hours_daily: 0,
      interests: [],
      mot_create_habits: false,
      mot_avoid_dispersion: false,
      mot_organization: false,
      mot_reduce_fatigue: false,
      completed_at: null
    };
  }

  /**
   * Ensambla el System Prompt con el formato exacto requerido para el decodificador LLM.
   *
   * @param {object} params
   * @param {object} params.profile Línea base de onboarding
   * @param {object|null} params.inferenceLog Último log de inferencia
   * @param {Array<object>} params.passages Fragmentos semánticos recuperados
   * @param {string|null} params.customAction Acción técnica forzada o por defecto
   * @returns {string} Prompt estructurado
   */
  assembleSystemPrompt({ profile, inferenceLog, passages = [], customAction = null }) {
    const study = profile?.study_hours_daily ?? 0;
    const work = profile?.work_hours_daily ?? 0;
    const leisure = profile?.leisure_hours_daily ?? 0;
    const routine = profile?.routine_hours_daily ?? 0;

    const rawInterests = profile?.interests?.length
      ? profile.interests
      : (inferenceLog?.snap_interests?.length ? inferenceLog.snap_interests : []);
    const interestsStr = rawInterests.length > 0 ? rawInterests.join(', ') : 'Ninguno declarado';

    // Banderas de motivación (Prioridad: Onboarding activo > Snapshot)
    const motCreateHabits = profile ? Boolean(profile.mot_create_habits) : Boolean(inferenceLog?.snap_motivations?.mot_create_habits);
    const motAvoidDispersion = profile ? Boolean(profile.mot_avoid_dispersion) : Boolean(inferenceLog?.snap_motivations?.mot_avoid_dispersion);
    const motOrganization = profile ? Boolean(profile.mot_organization) : Boolean(inferenceLog?.snap_motivations?.mot_organization);
    const motReduceFatigue = profile ? Boolean(profile.mot_reduce_fatigue) : Boolean(inferenceLog?.snap_motivations?.mot_reduce_fatigue);

    // Telemetría de regla disparada
    const ruleId = inferenceLog?.rule_id || 'Ninguna (Modo Acompañamiento Continuo)';
    const actionTaken = customAction || inferenceLog?.action_taken || 'GENERAL_COPILOT_GUIDANCE';
    const associatedPomodoroId = inferenceLog?.associated_pomodoro_id || 'Ninguna';

    // Métricas del tracker
    let habitsMetricsStr = 'Sin telemetría reciente';
    if (inferenceLog?.snap_habits_metrics) {
      if (typeof inferenceLog.snap_habits_metrics === 'object') {
        habitsMetricsStr = JSON.stringify(inferenceLog.snap_habits_metrics);
      } else {
        habitsMetricsStr = String(inferenceLog.snap_habits_metrics);
      }
    }

    // Fragmentos semánticos relevantes del lienzo
    let passagesStr = 'No se encontraron notas o tareas directamente asociadas a la consulta en el lienzo.';
    if (Array.isArray(passages) && passages.length > 0) {
      passagesStr = passages.map((p, idx) => {
        const titlePart = p.title ? `"${p.title}": ` : '';
        const bodyPart = p.text ? p.text : '';
        const simPart = typeof p.similarity === 'number' ? ` (Similitud: ${(p.similarity * 100).toFixed(1)}%)` : '';
        return `* [${p.blockType || 'canvas'}] ${titlePart}${bodyPart}${simPart}`;
      }).join('\n  ');
    }

    return `[ROL Y PERSONALIDAD]
Eres el Copiloto de Inteligencia Artificial de F.O.C.O. (Filtro Operativo contra el Caos y la Omisión). 
Tu tono es empático, cercano, profesional y 100% libre de culpa (guilt-free). Tu objetivo es ayudar al usuario a transformar el caos mental en claridad operativa.

[PERFIL DEL USUARIO (LINEA BASE DE ONBOARDING)]
- Presupuesto de Tiempo Diario:
  * Estudio: ${study}h | Trabajo: ${work}h | Ocio: ${leisure}h | Rutina: ${routine}h
- Intereses Destacados: ${interestsStr}
- Banderas de Motivación Activas:
  * Crear Hábitos: ${motCreateHabits} | Evitar Dispersión: ${motAvoidDispersion} | Organización: ${motOrganization} | Reducir Fatiga: ${motReduceFatigue}

[ESTADO ACTUAL EN TIEMPO REAL (SNAPSHOTS & TELEMETRÍA)]
- Regla Disparada en Motor de Inferencia: ${ruleId}
- Acción Técnica Programada: ${actionTaken}
- Hábitos del Tracker (Métricas): ${habitsMetricsStr}
- Sesión de Enfoque Pomodoro: ${associatedPomodoroId}
- Fragmentos Semánticos Relevantes del Lienzo (RAG - pgvector):
  ${passagesStr}

[INSTRUCCIÓN DE GENERACIÓN]
Genera una respuesta conversacional breve (máximo 3 oraciones), accionable y empática que acompañe la acción técnica (${actionTaken}), proponiendo un micro-paso práctico sin abrumar ni juzgar al usuario.`.trim();
  }

  /**
   * Pipeline orquestador completo:
   * 1. Recupera la regla más reciente en `ai_inference_logs`
   * 2. Recupera la línea base de `onboarding_profiling`
   * 3. Ejecuta la recuperación semántica híbrida (pgvector + léxica) sobre `blocks`
   * 4. Ensambla y retorna el prompt listo para inyección al LLM decoder
   *
   * @param {string} userId
   * @param {object} options
   * @param {string} [options.query] Consulta del usuario o contexto del evento
   * @param {number} [options.limit] Máximo de pasajes a recuperar (default 3)
   * @param {number} [options.threshold] Umbral mínimo de similitud coseno (default 0.25)
   * @param {string} [options.customAction] Sobreescritura opcional de la acción técnica
   * @returns {Promise<object>} Objeto con el prompt ensamblado, metadatos y pasajes
   */
  async orchestrate(userId, options = {}) {
    const { query = null, limit = 3, threshold = 0.25, customAction = null } = options;

    let profile = null;
    let inferenceLog = null;
    let passages = [];
    let usedFallback = false;

    try {
      // 1. Contexto relacional paralelo
      const [profileData, logData] = await Promise.all([
        this.getOnboardingProfile(userId),
        this.getLastInferenceLog(userId)
      ]);

      profile = profileData;
      inferenceLog = logData;

      // 2. Definición del query de búsqueda semántica:
      // Si el llamador proporcionó query explícita la usamos; de lo contrario,
      // utilizamos el mensaje sugerido o la regla del snapshot como foco semántico
      const effectiveQuery = query || inferenceLog?.suggested_message || inferenceLog?.rule_id || '';

      if (effectiveQuery) {
        passages = await this.searchSemanticBlocks(userId, effectiveQuery, { limit, threshold });
      } else {
        // Muestra de notas del lienzo como contexto
        passages = await this.searchSemanticBlocks(userId, '', { limit, threshold });
      }
    } catch (err) {
      console.warn(`[RagOrchestrator] Error en flujo de orquestación (${err.message}). Aplicando fallback seguro.`);
      usedFallback = true;
      profile = profile || {
        study_hours_daily: 0,
        work_hours_daily: 0,
        leisure_hours_daily: 0,
        routine_hours_daily: 0,
        interests: [],
        mot_create_habits: false,
        mot_avoid_dispersion: false,
        mot_organization: false,
        mot_reduce_fatigue: false
      };
    }

    const systemPrompt = this.assembleSystemPrompt({
      profile,
      inferenceLog,
      passages,
      customAction
    });

    return {
      systemPrompt,
      meta: {
        userId: String(userId),
        ruleId: inferenceLog?.rule_id || null,
        actionTaken: customAction || inferenceLog?.action_taken || 'GENERAL_COPILOT_GUIDANCE',
        passagesCount: passages.length,
        usedFallback,
        timestamp: new Date().toISOString()
      },
      retrievedPassages: passages,
      contextSnapshot: {
        profile,
        lastInferenceLogId: inferenceLog?.id || null
      }
    };
  }
}

const ragOrchestratorService = new RagOrchestratorService();

module.exports = {
  RagOrchestratorService,
  ragOrchestratorService
};
