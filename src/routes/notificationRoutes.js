const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/require-auth');

router.use(requireAuth);

router.get('/', notificationController.listar);
router.patch('/read-all', notificationController.marcarTodasLeidas);
router.patch('/:id/read', notificationController.marcarLeida);
router.put('/:id/read', notificationController.marcarLeida);
router.delete('/:id', notificationController.eliminar);

module.exports = router;
