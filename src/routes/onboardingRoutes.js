const express = require('express');
const router = express.Router();

const onboardingController = require('../controllers/onboardingController');

router.post('/', onboardingController.crear);
router.get('/user/:userId', onboardingController.obtenerPorUsuario);
router.get('/:id', onboardingController.obtenerPorId);
router.put('/:id', onboardingController.actualizar);
router.delete('/:id', onboardingController.eliminar);

module.exports = router;
