const { createClient } = require('@supabase/supabase-js');
const pool = require('../db');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!supabase || !token) {
    return res.status(401).json({ error: 'Autenticación requerida' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  req.user = data.user;
  const profile = await pool.query(
    'SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1',
    [data.user.id, data.user.email]
  );
  req.user.profileId = profile.rows[0]?.id || data.user.id;
  return next();
}

module.exports = { requireAuth };
