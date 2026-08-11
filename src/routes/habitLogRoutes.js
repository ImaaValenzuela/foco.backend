const express = require('express');
const router = express.Router();

const habitLogController = require('../controllers/habitLogController');

router.post('/', habitLogController.crear);
router.get('/habit/:habitId', habitLogController.obtenerPorHabit);
router.get('/:id', habitLogController.obtenerPorId);
router.put('/:id', habitLogController.actualizar);
router.delete('/:id', habitLogController.eliminar);

module.exports = router;
