const pool = require('../db');

async function crearOnboarding(user_id, data) {
  const {
    study_hours_daily,
    work_hours_daily,
    leisure_hours_daily,
    routine_hours_daily,
    interests,
    mot_create_habits,
    mot_avoid_dispersion,
    mot_organization,
    mot_reduce_fatigue,
  } = data;

  const res = await pool.query(
    `INSERT INTO onboarding_profiling
      (user_id, study_hours_daily, work_hours_daily, leisure_hours_daily,
       routine_hours_daily, interests, mot_create_habits, mot_avoid_dispersion,
       mot_organization, mot_reduce_fatigue)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      user_id,
      study_hours_daily,
      work_hours_daily,
      leisure_hours_daily,
      routine_hours_daily,
      interests || [],
      mot_create_habits || false,
      mot_avoid_dispersion || false,
      mot_organization || false,
      mot_reduce_fatigue || false,
    ]
  );
  return res.rows[0];
}

async function obtenerOnboardingPorUsuario(user_id) {
  const res = await pool.query(
    `SELECT * FROM onboarding_profiling WHERE user_id = $1`,
    [user_id]
  );
  return res.rows;
}

async function obtenerOnboardingPorId(id) {
  const res = await pool.query(
    `SELECT * FROM onboarding_profiling WHERE id = $1`,
    [id]
  );
  return res.rows[0];
}

async function actualizarOnboarding(id, data) {
  const {
    study_hours_daily,
    work_hours_daily,
    leisure_hours_daily,
    routine_hours_daily,
    interests,
    mot_create_habits,
    mot_avoid_dispersion,
    mot_organization,
    mot_reduce_fatigue,
  } = data;

  const res = await pool.query(
    `UPDATE onboarding_profiling SET
      study_hours_daily = COALESCE($2, study_hours_daily),
      work_hours_daily = COALESCE($3, work_hours_daily),
      leisure_hours_daily = COALESCE($4, leisure_hours_daily),
      routine_hours_daily = COALESCE($5, routine_hours_daily),
      interests = COALESCE($6, interests),
      mot_create_habits = COALESCE($7, mot_create_habits),
      mot_avoid_dispersion = COALESCE($8, mot_avoid_dispersion),
      mot_organization = COALESCE($9, mot_organization),
      mot_reduce_fatigue = COALESCE($10, mot_reduce_fatigue),
      completed_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      study_hours_daily,
      work_hours_daily,
      leisure_hours_daily,
      routine_hours_daily,
      interests,
      mot_create_habits,
      mot_avoid_dispersion,
      mot_organization,
      mot_reduce_fatigue,
    ]
  );
  return res.rows[0];
}

async function eliminarOnboarding(id) {
  const res = await pool.query(`DELETE FROM onboarding_profiling WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0];
}

module.exports = {
  crearOnboarding,
  obtenerOnboardingPorUsuario,
  obtenerOnboardingPorId,
  actualizarOnboarding,
  eliminarOnboarding,
};
