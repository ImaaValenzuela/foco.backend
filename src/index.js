const app = require('./app');
const pool = require('./db');

const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0';

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
