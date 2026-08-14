const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Necesario a veces para conexiones en Supabase u otros servicios en la nube
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  console.log('🔗 Conectado a la base de datos PostgreSQL (Supabase)');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el cliente inactivo de PostgreSQL', err);
  process.exit(-1);
});

module.exports = pool;
