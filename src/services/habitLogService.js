const pool = require('../db');

async function crearHabitLog(habit_id, logged_date, is_completed) {
  const res = await pool.query(
    `INSERT INTO habit_logs (habit_id, logged_date, is_completed)
     VALUES ($1, $2, $3)
     RETURNING id, habit_id, logged_date, is_completed, created_at`,
    [habit_id, logged_date, is_completed || false]
  );
  return res.rows[0];
}

async function obtenerHabitLogsPorHabit(habit_id) {
  const res = await pool.query(
    `SELECT id, habit_id, logged_date, is_completed, created_at
     FROM habit_logs WHERE habit_id = $1 ORDER BY logged_date DESC`,
    [habit_id]
  );
  return res.rows;
}

async function obtenerHabitLogPorId(id) {
  const res = await pool.query(
    `SELECT id, habit_id, logged_date, is_completed, created_at
     FROM habit_logs WHERE id = $1`,
    [id]
  );
  return res.rows[0];
}

async function actualizarHabitLog(id, is_completed) {
  const res = await pool.query(
    `UPDATE habit_logs SET is_completed = $2 WHERE id = $1
     RETURNING id, habit_id, logged_date, is_completed, created_at`,
    [id, is_completed]
  );
  return res.rows[0];
}

async function eliminarHabitLog(id) {
  const res = await pool.query(`DELETE FROM habit_logs WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0];
}

module.exports = {
  crearHabitLog,
  obtenerHabitLogsPorHabit,
  obtenerHabitLogPorId,
  actualizarHabitLog,
  eliminarHabitLog,
};
