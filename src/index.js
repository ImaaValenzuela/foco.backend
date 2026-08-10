const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

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
    res.status(500).json({ 
      status: 'error', 
      message: 'API running but Database connection failed',
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
