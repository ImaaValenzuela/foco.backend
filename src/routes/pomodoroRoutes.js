const express = require('express');
const router = express.Router();
const pomodoroController = require('../controllers/pomodoroController');
const { requireAuth } = require('../middleware/require-auth');

router.use(requireAuth);

router.post('/', pomodoroController.crear);
router.get('/', pomodoroController.obtenerPorUsuario);
router.get('/:id', pomodoroController.obtenerPorId);
router.delete('/:id', pomodoroController.eliminar);

module.exports = router;