const pool = require('../db');

async function crearHabit(user_id, name) {
  const res = await pool.query(
    `INSERT INTO habits (user_id, name)
     VALUES ($1, $2)
     RETURNING id, user_id, name, created_at`,
    [user_id, name]
  );
  return res.rows[0];
}

async function obtenerHabitsPorUsuario(user_id) {
  const res = await pool.query(
    `SELECT id, user_id, name, created_at
     FROM habits WHERE user_id = $1 ORDER BY created_at DESC`,
    [user_id]
  );
  return res.rows;
}

async function obtenerHabitPorId(id) {
  const res = await pool.query(
    `SELECT id, user_id, name, created_at FROM habits WHERE id = $1`,
    [id]
  );
  return res.rows[0];
}

async function actualizarHabit(id, name) {
  const res = await pool.query(
    `UPDATE habits SET name = $2 WHERE id = $1
     RETURNING id, user_id, name, created_at`,
    [id, name]
  );
  return res.rows[0];
}

async function eliminarHabit(id) {
  const res = await pool.query(`DELETE FROM habits WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0];
}

module.exports = {
  crearHabit,
  obtenerHabitsPorUsuario,
  obtenerHabitPorId,
  actualizarHabit,
  eliminarHabit,
};
