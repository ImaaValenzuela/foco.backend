const pool = require('../db');

/**
 * Verifica si el usuario tiene su diagnóstico de onboarding completado.
 * Si no lo tiene (o completed_at es null), asegura que exista una notificación
 * activa y prioritaria de tipo 'ONBOARDING_REQUIRED'.
 */
async function ensureOnboardingNotification(userId) {
  if (!userId) return;

  // Consultar estado de onboarding_profiling
  const onboardingRes = await pool.query(
    `SELECT id, completed_at FROM onboarding_profiling WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  const profiling = onboardingRes.rows[0];
  const isCompleted = profiling && profiling.completed_at !== null;

  if (!isCompleted) {
    // Verificar si ya existe una notificación no leída de tipo ONBOARDING_REQUIRED
    const existingNotif = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = 'ONBOARDING_REQUIRED' AND read = false
       LIMIT 1`,
      [userId]
    );

    if (existingNotif.rows.length === 0) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, action_url, priority, read)
         VALUES ($1, 'ONBOARDING_REQUIRED', $2, $3, $4, 'high', false)`,
        [
          userId,
          'Completá tu diagnóstico inicial',
          'Para que F.O.C.O. calibre tu IA y adapte tu espacio de trabajo, completá tu rutina y preferencias.',
          '/onboarding.html',
        ]
      );
    }
  } else {
    // Si ya completó el onboarding, marcamos como leídas las notificaciones de ONBOARDING_REQUIRED
    await pool.query(
      `UPDATE notifications SET read = true, updated_at = NOW()
       WHERE user_id = $1 AND type = 'ONBOARDING_REQUIRED' AND read = false`,
      [userId]
    );
  }
}

/**
 * Obtiene todas las notificaciones de un usuario y el conteo de no leídas.
 */
async function getNotifications(userId) {
  await ensureOnboardingNotification(userId);

  const res = await pool.query(
    `SELECT id, user_id, type, title, message, action_url, priority, read, created_at, updated_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  const notifications = res.rows;
  const unread_count = notifications.filter((n) => !n.read).length;

  return { notifications, unread_count };
}

/**
 * Marca una notificación específica como leída.
 */
async function markAsRead(notificationId, userId) {
  const res = await pool.query(
    `UPDATE notifications
     SET read = true, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );
  return res.rows[0] || null;
}

/**
 * Marca todas las notificaciones del usuario como leídas.
 */
async function markAllAsRead(userId) {
  const res = await pool.query(
    `UPDATE notifications
     SET read = true, updated_at = NOW()
     WHERE user_id = $1 AND read = false
     RETURNING id`,
    [userId]
  );
  return { updated_count: res.rowCount };
}

/**
 * Elimina/descarta una notificación.
 */
async function dismissNotification(notificationId, userId) {
  const res = await pool.query(
    `DELETE FROM notifications
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [notificationId, userId]
  );
  return res.rows[0] || null;
}

/**
 * Crea una notificación genérica para un usuario.
 */
async function createNotification(userId, { type, title, message, action_url, priority = 'normal' }) {
  const res = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, action_url, priority, read)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     RETURNING *`,
    [userId, type, title, message, action_url || null, priority]
  );
  return res.rows[0];
}

module.exports = {
  ensureOnboardingNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  createNotification,
};
