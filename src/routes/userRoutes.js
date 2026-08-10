// Este archivo conecta cada URL con la función del controller que la maneja
const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');

const boardController = require('../controllers/boardController'); 

// Cuando llegue un pedido POST a /api/users, se ejecuta userController.crear
router.post('/', userController.crear);

// Cuando llegue un pedido GET a /api/users/:id, se ejecuta userController.obtenerPorId
router.get('/:id', userController.obtenerPorId);

// Cuando llegue un pedido GET a /api/boards/:id, se ejecuta boardController.obtenerTablerosDeUsuario
router.get('/:id/boards', boardController.obtenerTablerosDeUsuario);

module.exports = router;