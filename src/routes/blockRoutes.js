const express = require('express');
const router = express.Router();

const blockController = require('../controllers/blockController');

router.post('/', blockController.crear);
router.get('/user/:userId', blockController.obtenerTodos);
router.get('/:id', blockController.obtenerPorId);
router.put('/:id', blockController.actualizar);
router.delete('/:id', blockController.eliminar);

module.exports = router;
