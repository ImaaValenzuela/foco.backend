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

module.exports = { ensureProfile };
