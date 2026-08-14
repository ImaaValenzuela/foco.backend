const onboardingService = require('../services/onboardingService');

async function crear(req, res) {
  try {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id es requerido' });
    }
    const perfil = await onboardingService.crearOnboarding(user_id, req.body);
    res.status(201).json(perfil);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el onboarding' });
  }
}

async function obtenerPorUsuario(req, res) {
  try {
    const perfiles = await onboardingService.obtenerOnboardingPorUsuario(req.params.userId);
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
