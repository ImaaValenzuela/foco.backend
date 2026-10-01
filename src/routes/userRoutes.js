const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const { requireAuth } = require('../middleware/require-auth');

// Rutas de perfil autenticado (deben ir antes de las rutas paramétricas /:id)
router.get('/profile', requireAuth, userController.obtenerPerfil);
router.put('/profile', requireAuth, userController.actualizarPerfil);

router.post('/', userController.crear);
router.get('/', userController.obtenerTodos);
router.get('/:id', userController.obtenerPorId);
router.put('/:id', userController.actualizar);
router.delete('/:id', userController.eliminar);

module.exports = router;
