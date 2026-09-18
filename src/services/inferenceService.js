const pool = require('../db');

/**
 * Recopila el contexto real del usuario, consulta a la IA y audita el resultado.
 * Patrón "Fire-and-Forget" omnicanal (soporta disparos desde Pomodoro, Hábitos o Bloques).
 */
async function evaluarEstadoGlobal(userId, triggerSource, sourceId = null) {
  try {
    // 1. LÍNEA BASE: Extracción del Onboarding
    const profileRes = await pool.query(
      `SELECT study_hours_daily, work_hours_daily, leisure_hours_daily, routine_hours_daily, 
              interests, mot_create_habits, mot_avoid_dispersion, mot_organization, mot_reduce_fatigue 
       FROM onboarding_profiling WHERE user_id = $1`, 
       [userId]
    );
    const profile = profileRes.rows[0] || {};

    // 2. LIENZO: Extracción de Bloques para métricas de Organización
    const blocksRes = await pool.query(`SELECT type, content FROM blocks WHERE user_id = $1`, [userId]);
    const blocks = blocksRes.rows;
    
    // Cálculo de métricas del lienzo
    let personalPending = 0;
    let allBlocksTotal = 0;
    blocks.forEach(b => {
      const items = b.content?.notes?.length || 0;
      allBlocksTotal += items;
      if (b.type === 'personal_block') personalPending = items;
    });

    // 3. PRODUCTIVIDAD: Extracción de Métricas de Pomodoro
    const pomoRes = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE is_completed = true AND created_at >= NOW() - INTERVAL '4 hours') as completed_4h,
        COUNT(*) FILTER (WHERE is_completed = false AND created_at >= NOW() - INTERVAL '24 hours') as interrupted_24h
       FROM pomodoro_sessions WHERE user_id = $1`,
       [userId]
    );
    const pomoMetrics = pomoRes.rows[0] || {};

    // 4. ENSAMBLAJE DEL SNAPSHOT
    const snapshotPayload = {
      user_id: userId,
      trigger_source: triggerSource, // 'pomodoro', 'habit', 'block'
      associated_id: sourceId,
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
      snap_blocks_content: blocks,
      snap_habits_metrics: {
        pomodoro_completed_last_4h: parseInt(pomoMetrics.completed_4h) || 0,
        pomodoro_interrupted_last_24h: parseInt(pomoMetrics.interrupted_24h) || 0,
        personal_block_pending_items: personalPending,
        all_blocks_total_items: allBlocksTotal
      }
    };

    // 5. EVALUACIÓN Y CIRCUIT BREAKER
    const BASE_IA_URL = process.env.IA_SERVICE_URL || 'http://localhost:5000';
    const IA_URL = `${BASE_IA_URL.replace(/\/$/, '')}/evaluate-rules`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const response = await fetch(IA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotPayload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Error HTTP del motor IA');
    const iaResult = await response.json();

    // 6. AUDITORÍA (Si se dispara una regla)
    if (iaResult.triggered) {
      await pool.query(
        `INSERT INTO ai_inference_logs 
         (user_id, rule_id, associated_pomodoro_id, action_taken, suggested_message, 
          snap_motivations, snap_interests, snap_routine, snap_blocks_content, snap_habits_metrics) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId, iaResult.rule_id, triggerSource === 'pomodoro' ? sourceId : null,
          iaResult.action_taken, iaResult.suggested_message,
          JSON.stringify(snapshotPayload.snap_motivations),
          snapshotPayload.snap_interests,
          JSON.stringify(snapshotPayload.snap_routine),
          JSON.stringify(snapshotPayload.snap_blocks_content),
          JSON.stringify(snapshotPayload.snap_habits_metrics)
        ]
      );
      console.log(`🤖 IA DISPARADA [${triggerSource}]: Regla ${iaResult.rule_id}`);
    }

  } catch (error) {
    if (error.name !== 'AbortError') console.error('❌ Error IA:', error.message);
  }
}

module.exports = { evaluarEstadoGlobal };