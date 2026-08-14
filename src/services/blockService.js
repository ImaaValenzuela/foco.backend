const pool = require('../db');

async function crearBlock(user_id, type, content) {
  const res = await pool.query(
    `INSERT INTO blocks (user_id, type, content)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, type, content, updated_at`,
    [user_id, type, content || {}]
  );
  return res.rows[0];
}

async function obtenerBlocksPorUsuario(user_id) {
  const res = await pool.query(
    `SELECT id, user_id, type, content, updated_at
     FROM blocks WHERE user_id = $1 ORDER BY updated_at DESC`,
    [user_id]
  );
  return res.rows;
}

async function obtenerBlockPorId(id) {
  const res = await pool.query(
    `SELECT id, user_id, type, content, updated_at FROM blocks WHERE id = $1`,
    [id]
  );
  return res.rows[0];
}

async function actualizarBlock(id, { type, content }) {
  const res = await pool.query(
    `UPDATE blocks
     SET type = COALESCE($2, type),
         content = COALESCE($3, content),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, user_id, type, content, updated_at`,
    [id, type, content]
  );
  return res.rows[0];
}

async function eliminarBlock(id) {
  const res = await pool.query(`DELETE FROM blocks WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0];
}

module.exports = {
  crearBlock,
  obtenerBlocksPorUsuario,
  obtenerBlockPorId,
  actualizarBlock,
  eliminarBlock,
};
