const pool = require('../db');

async function me(req, res) {
  const result = await pool.query(
    `SELECT id, name, email, role, subscription_tier
     FROM users WHERE id = $1 OR email = $2 LIMIT 1`,
    [req.user.profileId, req.user.email]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Perfil de usuario no encontrado' });
  }

  return res.json({ auth_user_id: req.user.id, profile: result.rows[0] });
}

module.exports = { me };
