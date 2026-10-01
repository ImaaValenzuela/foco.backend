const pool = require('../db');

async function ensureProfile(authUser) {
  const existing = await pool.query(
    `SELECT id, name, email, role, subscription_tier
     FROM users WHERE id = $1 OR email = $2 LIMIT 1`,
    [authUser.id, authUser.email]
  );

  if (existing.rows[0]) return existing.rows[0];

  const name = authUser.user_metadata?.full_name
    || authUser.user_metadata?.name
    || authUser.email?.split('@')[0]
    || 'Usuario';

  try {
    const created = await pool.query(
      `INSERT INTO users (id, name, email, password, role, subscription_tier)
       VALUES ($1, $2, $3, $4, 'user', 'freemium')
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, name, email, role, subscription_tier`,
      [authUser.id, name, authUser.email, 'supabase-auth']
    );
    return created.rows[0];
  } catch (error) {
    if (error.code !== '23505') throw error;
    const existingByEmail = await pool.query(
      `SELECT id, name, email, role, subscription_tier FROM users WHERE email = $1 LIMIT 1`,
      [authUser.email]
    );
    return existingByEmail.rows[0];
  }
}

/**
 * Obtiene el perfil completo del usuario, incluyendo sus datos básicos
 * y su información de onboarding_profiling.
 */
async function obtenerPerfilCompleto(userId) {
  const userRes = await pool.query(
    `SELECT id, name, email, role, subscription_tier, created_at, updated_at
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  if (!userRes.rows[0]) return null;

  const profilingRes = await pool.query(
    `SELECT id, study_hours_daily, work_hours_daily, leisure_hours_daily,
            routine_hours_daily, interests, mot_create_habits, mot_avoid_dispersion,
            mot_organization, mot_reduce_fatigue, completed_at
     FROM onboarding_profiling WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  return {
    user: userRes.rows[0],
    profiling: profilingRes.rows[0] || null,
  };
}

/**
 * Actualiza el perfil de usuario (nombre) y sus preferencias en onboarding_profiling
 * (horas de rutina, intereses y motivaciones).
 */
async function actualizarPerfil(userId, data) {
  const {
    name,
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

  // 1. Actualizar nombre de usuario si viene en el payload
  let updatedUser = null;
  if (name !== undefined) {
    const userRes = await pool.query(
      `UPDATE users
       SET name = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, role, subscription_tier, created_at, updated_at`,
      [userId, name]
    );
    updatedUser = userRes.rows[0];
  } else {
    const userRes = await pool.query(
      `SELECT id, name, email, role, subscription_tier, created_at, updated_at FROM users WHERE id = $1`,
      [userId]
    );
    updatedUser = userRes.rows[0];
  }

  // 2. Upsert en onboarding_profiling
  const profilingRes = await pool.query(
    `INSERT INTO onboarding_profiling
      (user_id, study_hours_daily, work_hours_daily, leisure_hours_daily,
       routine_hours_daily, interests, mot_create_habits, mot_avoid_dispersion,
       mot_organization, mot_reduce_fatigue, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       study_hours_daily = COALESCE(EXCLUDED.study_hours_daily, onboarding_profiling.study_hours_daily),
       work_hours_daily = COALESCE(EXCLUDED.work_hours_daily, onboarding_profiling.work_hours_daily),
       leisure_hours_daily = COALESCE(EXCLUDED.leisure_hours_daily, onboarding_profiling.leisure_hours_daily),
       routine_hours_daily = COALESCE(EXCLUDED.routine_hours_daily, onboarding_profiling.routine_hours_daily),
       interests = COALESCE(EXCLUDED.interests, onboarding_profiling.interests),
       mot_create_habits = COALESCE(EXCLUDED.mot_create_habits, onboarding_profiling.mot_create_habits),
       mot_avoid_dispersion = COALESCE(EXCLUDED.mot_avoid_dispersion, onboarding_profiling.mot_avoid_dispersion),
       mot_organization = COALESCE(EXCLUDED.mot_organization, onboarding_profiling.mot_organization),
       mot_reduce_fatigue = COALESCE(EXCLUDED.mot_reduce_fatigue, onboarding_profiling.mot_reduce_fatigue),
       completed_at = NOW()
     RETURNING *`,
    [
      userId,
      study_hours_daily !== undefined ? study_hours_daily : null,
      work_hours_daily !== undefined ? work_hours_daily : null,
      leisure_hours_daily !== undefined ? leisure_hours_daily : null,
      routine_hours_daily !== undefined ? routine_hours_daily : null,
      interests !== undefined ? interests : null,
      mot_create_habits !== undefined ? mot_create_habits : null,
      mot_avoid_dispersion !== undefined ? mot_avoid_dispersion : null,
      mot_organization !== undefined ? mot_organization : null,
      mot_reduce_fatigue !== undefined ? mot_reduce_fatigue : null,
    ]
  );

  // 3. Al actualizar la información básica de onboarding, marcar notificaciones pendientes
  await pool.query(
    `UPDATE notifications SET read = true, updated_at = NOW()
     WHERE user_id = $1 AND type = 'ONBOARDING_REQUIRED' AND read = false`,
    [userId]
  ).catch(() => {}); // Resiliente si la tabla aún no tiene datos

  return {
    user: updatedUser,
    profiling: profilingRes.rows[0],
  };
}

module.exports = {
  ensureProfile,
  obtenerPerfilCompleto,
  actualizarPerfil,
};
