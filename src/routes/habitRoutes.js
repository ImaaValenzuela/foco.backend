const express = require('express');
const router = express.Router();

const habitController = require('../controllers/habitController');

router.post('/', habitController.crear);
router.get('/user/:userId', habitController.obtenerTodos);
router.get('/:id', habitController.obtenerPorId);
router.put('/:id', habitController.actualizar);
router.delete('/:id', habitController.eliminar);

module.exports = router;
