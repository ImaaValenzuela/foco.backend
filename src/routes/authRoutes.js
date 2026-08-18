const express = require('express');
const { requireAuth } = require('../middleware/require-auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/me', requireAuth, authController.me);

module.exports = router;
