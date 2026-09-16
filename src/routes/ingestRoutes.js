// src/routes/ingestRoutes.js
const express = require('express');
const router = express.Router();
const ingestController = require('../controllers/ingestController');
const { requireAuth } = require('../middleware/require-auth');

// POST /api/ingest
router.post('/', requireAuth, ingestController.processIngestion);

module.exports = router;