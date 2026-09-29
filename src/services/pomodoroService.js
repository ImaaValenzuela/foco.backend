const pool = require('../db');

/**
 * Inserta un nuevo registro de sesión Pomodoro en la base de datos.
 * Utiliza los campos definidos en el Diccionario de Datos (Tabla 6).
 */
async function crearSession(user_id, focus_duration, break_duration, is_completed) {
  const res = await pool.query(
    `INSERT INTO pomodoro_sessions (user_id, focus_duration, break_duration, is_completed)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, focus_duration, break_duration, is_completed, created_at`,
    [user_id, focus_duration, break_duration, is_completed]
  );
  return res.rows[0];
}

/**
 * Obtiene el historial completo de Pomodoros de un usuario, 
 * ordenado desde el más reciente al más antiguo.
 */
async function obtenerSessionsPorUsuario(user_id) {
  const res = await pool.query(
    `SELECT id, user_id, focus_duration, break_duration, is_completed, created_at
     FROM pomodoro_sessions 
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [user_id]
  );
  return res.rows;
}

/**
 * Obtiene una sesión de Pomodoro específica mediante su ID.
 */
async function obtenerSessionPorId(id) {
  const res = await pool.query(
    `SELECT id, user_id, focus_duration, break_duration, is_completed, created_at 
     FROM pomodoro_sessions 
     WHERE id = $1`,
    [id]
  );
  return res.rows[0];
}

/**
 * Elimina una sesión de Pomodoro asegurando que pertenezca al usuario solicitante.
 * Retorna el registro eliminado si la operación fue exitosa.
 */
async function eliminarSession(id, user_id) {
  const res = await pool.query(
    `DELETE FROM pomodoro_sessions 
     WHERE id = $1 AND user_id = $2 
     RETURNING id, user_id`,
    [id, user_id]
  );
  return res.rows[0];
}

module.exports = {
  crearSession,
  obtenerSessionsPorUsuario,
  obtenerSessionPorId,
  eliminarSession
};