const userService = require('../services/userService');
const profileService = require('../services/profileService');

async function crear(req, res) {
  try {
    const { name, email, password, role, subscription_tier } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email y password son requeridos' });
    }
    const usuario = await userService.crearUsuario({ name, email, password, role, subscription_tier });
    res.status(201).json(usuario);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el usuario' });
  }
}

async function obtenerTodos(req, res) {
  try {
    const usuarios = await userService.obtenerUsuarios();
    res.json(usuarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener los usuarios' });
  }
}

async function obtenerPerfil(req, res) {
  try {
    const userId = req.user.profileId;
    const perfil = await profileService.obtenerPerfilCompleto(userId);
    if (!perfil) {
      return res.status(404).json({ error: 'Perfil de usuario no encontrado' });
    }
    res.json(perfil);
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno al obtener el perfil' });
  }
}

async function actualizarPerfil(req, res) {
  try {
    const userId = req.user.profileId;
    const { study_hours_daily, work_hours_daily, leisure_hours_daily, routine_hours_daily } = req.body;

    // Validación de presupuesto diario si se envían horas
    const s = study_hours_daily !== undefined ? Number(study_hours_daily) : 0;
    const w = work_hours_daily !== undefined ? Number(work_hours_daily) : 0;
    const l = leisure_hours_daily !== undefined ? Number(leisure_hours_daily) : 0;
    const r = routine_hours_daily !== undefined ? Number(routine_hours_daily) : 0;

    if (s < 0 || w < 0 || l < 0 || r < 0) {
      return res.status(400).json({ error: 'Las horas no pueden ser negativas' });
    }

    if (s + w + l + r > 24) {
      return res.status(400).json({ error: 'El total de horas diarias no puede exceder las 24 horas' });
    }

    const resultado = await profileService.actualizarPerfil(userId, req.body);
    res.status(200).json({
      message: 'Perfil actualizado con éxito',
      ...resultado,
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error interno al actualizar el perfil' });
  }
}

async function obtenerPorId(req, res) {
  try {
    const usuario = await userService.obtenerUsuarioPorId(req.params.id);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el usuario' });
  }
}

async function actualizar(req, res) {
  try {
    const { name, role, subscription_tier } = req.body;
    const usuario = await userService.actualizarUsuario(req.params.id, { name, role, subscription_tier });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(usuario);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar el usuario' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await userService.eliminarUsuario(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar el usuario' });
  }
}

module.exports = {
  crear,
  obtenerTodos,
  obtenerPerfil,
  actualizarPerfil,
  obtenerPorId,
  actualizar,
  eliminar,
};
