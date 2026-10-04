const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const { requireAuth } = require('../middleware/require-auth');

// Rutas protegidas de Google Calendar
router.post('/tokens', requireAuth, calendarController.saveTokens);
router.get('/status', requireAuth, calendarController.getStatus);
router.get('/events', requireAuth, calendarController.getEvents);
router.post('/events', requireAuth, calendarController.createEvent);
router.delete('/disconnect', requireAuth, calendarController.disconnect);

module.exports = router;
