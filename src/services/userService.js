const pool = require('../db');

async function crearUsuario({ name, email, password, role, subscription_tier }) {
  const res = await pool.query(
    `INSERT INTO users (name, email, password, role, subscription_tier)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, subscription_tier, created_at, updated_at`,
    [name, email, password, role || 'user', subscription_tier || 'freemium']
  );
  return res.rows[0];
}

async function obtenerUsuarios() {
  const res = await pool.query(
    `SELECT id, name, email, role, subscription_tier, created_at, updated_at
     FROM users ORDER BY created_at DESC`
  );
  return res.rows;
}

async function obtenerUsuarioPorId(id) {
  const res = await pool.query(
    `SELECT id, name, email, role, subscription_tier, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );
  return res.rows[0];
}

async function obtenerUsuarioPorEmail(email) {
  const res = await pool.query(
    `SELECT id, name, email, password, role, subscription_tier, created_at, updated_at
     FROM users WHERE email = $1`,
    [email]
  );
  return res.rows[0];
}

async function actualizarUsuario(id, { name, role, subscription_tier }) {
  const res = await pool.query(
    `UPDATE users
     SET name = COALESCE($2, name),
         role = COALESCE($3, role),
         subscription_tier = COALESCE($4, subscription_tier),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, role, subscription_tier, created_at, updated_at`,
    [id, name, role, subscription_tier]
  );
  return res.rows[0];
}

async function eliminarUsuario(id) {
  const res = await pool.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [id]);
  return res.rows[0];
}

module.exports = {
  crearUsuario,
  obtenerUsuarios,
  obtenerUsuarioPorId,
  obtenerUsuarioPorEmail,
  actualizarUsuario,
  eliminarUsuario,
};
