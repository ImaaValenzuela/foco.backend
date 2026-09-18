const pool = require('../db');

/**
 * Recopila el contexto del usuario, consulta a la IA y audita el resultado.
 * Patrón "Fire-and-Forget" (No arroja errores fatales que rompan la UI).
 */
async function evaluarReglasPomodoro(userId, pomodoroId) {
  try {
    // 1. RECOPILACIÓN DEL SNAPSHOT (Estado estático y dinámico)
    // Extraemos la línea base del Onboarding
    const profileRes = await pool.query(
      `SELECT study_hours_daily, work_hours_daily, leisure_hours_daily, routine_hours_daily, 
              interests, mot_create_habits, mot_avoid_dispersion, mot_organization, mot_reduce_fatigue 
       FROM onboarding_profiling WHERE user_id = $1`, 
       [userId]
    );
    const profile = profileRes.rows[0] || {};

    // Extraemos el lienzo (Para evaluar notas huérfanas en reglas Cat C)
    const blocksRes = await pool.query(`SELECT type, content FROM blocks WHERE user_id = $1`, [userId]);
    
    // Simulamos métricas calculadas (En producción, harías un COUNT/AVG de pomodoro_sessions)
    // Aquí calculamos si la tasa de abandono es alta en los últimos días
    const pomodoroMetrics = {
        pomodoro_abandon_rate: 0.5, // Mocked temporalmente para disparar la Regla A.2
        consecutive_focus_hours: 1
    };

    // Estructuramos el Payload según el diccionario de la Tabla 7
    const snapshotPayload = {
      user_id: userId,
      associated_pomodoro_id: pomodoroId,
      snap_motivations: {
        mot_create_habits: profile.mot_create_habits || false,
        mot_avoid_dispersion: profile.mot_avoid_dispersion || false,
        mot_organization: profile.mot_organization || false,
        mot_reduce_fatigue: profile.mot_reduce_fatigue || false
      },
      snap_interests: profile.interests || [],
      snap_routine: {
        study: profile.study_hours_daily || 0,
        work: profile.work_hours_daily || 0,
        leisure: profile.leisure_hours_daily || 0,
        routine: profile.routine_hours_daily || 0
      },
      snap_blocks_content: blocksRes.rows,
      snap_habits_metrics: pomodoroMetrics
    };

    // 2. PATRÓN CIRCUIT BREAKER (Tolerancia a fallos en el microservicio Python)
    const IA_URL = process.env.IA_SERVICE_URL || 'http://localhost:5000/evaluate-rules';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // Límite de 1500ms

    const response = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('El motor de inferencia devolvió un error HTTP.');
    const iaResult = await response.json();

    // 3. PERSISTENCIA Y AUDITORÍA (Si la IA decidió intervenir)
    if (iaResult.triggered) {
      await pool.query(
        `INSERT INTO ai_inference_logs 
         (user_id, rule_id, associated_pomodoro_id, action_taken, suggested_message, 
          snap_motivations, snap_interests, snap_routine, snap_blocks_content, snap_habits_metrics) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId, 
          iaResult.rule_id, 
          pomodoroId, 
          iaResult.action_taken, 
          iaResult.suggested_message,
          JSON.stringify(snapshotPayload.snap_motivations),
          snapshotPayload.snap_interests, // Es un array (TEXT[])
          JSON.stringify(snapshotPayload.snap_routine),
          JSON.stringify(snapshotPayload.snap_blocks_content),
          JSON.stringify(snapshotPayload.snap_habits_metrics)
        ]
      );
      console.log(`🤖 IA DISPARADA: Regla ${iaResult.rule_id} ejecutada exitosamente.`);
    }

  } catch (error) {
    // Si la latencia pasa de 1500ms, fallamos silenciosamente.
    if (error.name === 'AbortError') {
      console.warn('⚠️ Motor de inferencia abortado (Timeout 1500ms excedido).');
    } else {
      console.error('❌ Error asíncrono en inferenceService:', error.message);
    }
  }
}

module.exports = { evaluarReglasPomodoro };