const onboardingService = require('../services/onboardingService');

async function crear(req, res) {
  try {
    const perfil = await onboardingService.crearOnboarding(req.user.profileId, req.body);
    res.status(201).json(perfil);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el onboarding' });
  }
}

async function obtenerPorUsuario(req, res) {
  try {
    if (![req.user.id, String(req.user.profileId)].includes(req.params.userId)) {
      return res.status(403).json({ error: 'No puedes acceder a otro onboarding' });
    }
    const perfiles = await onboardingService.obtenerOnboardingPorUsuario(req.user.profileId);
    res.json(perfiles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el onboarding' });
  }
}

async function obtenerPorId(req, res) {
  try {
    const perfil = await onboardingService.obtenerOnboardingPorId(req.params.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Onboarding no encontrado' });
    }
    res.json(perfil);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el onboarding' });
  }
}

async function actualizar(req, res) {
  try {
    const perfil = await onboardingService.actualizarOnboarding(req.params.id, req.body);
    if (!perfil) {
      return res.status(404).json({ error: 'Onboarding no encontrado' });
    }
    res.json(perfil);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar el onboarding' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await onboardingService.eliminarOnboarding(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Onboarding no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar el onboarding' });
  }
}

module.exports = { crear, obtenerPorUsuario, obtenerPorId, actualizar, eliminar };
