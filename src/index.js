const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:8081')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Native mobile requests normally do not send Origin, so keep them allowed.
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const error = new Error('Origen no permitido por CORS');
      error.status = 403;
      return callback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userRoutes = require('./routes/userRoutes');
const habitRoutes = require('./routes/habitRoutes');
const habitLogRoutes = require('./routes/habitLogRoutes');
const blockRoutes = require('./routes/blockRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');

app.use('/api/users', userRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/habit-logs', habitLogRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/onboarding', onboardingRoutes);

const pool = require('./db');

app.get('/api/health', async (req, res) => {
  try {
    const dbRes = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      message: 'Mente API is running!', 
      db_time: dbRes.rows[0].now 
    });
  } catch (error) {
    console.error('Error connecting to DB:', error);
    res.status(503).json({
      status: 'error', 
      message: 'API running but Database connection failed'
    });
  }
});

app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'Origen no permitido por CORS' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const server = app.listen(port, host, () => {
  console.log(`[server]: Server is running at http://${host}:${port}`);
});

async function shutdown(signal) {
  console.log(`[server]: ${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
