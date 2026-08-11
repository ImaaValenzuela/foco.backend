const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');

router.post('/', userController.crear);
router.get('/', userController.obtenerTodos);
router.get('/:id', userController.obtenerPorId);
router.put('/:id', userController.actualizar);
router.delete('/:id', userController.eliminar);

module.exports = router;
