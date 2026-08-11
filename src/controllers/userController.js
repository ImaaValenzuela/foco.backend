const userService = require('../services/userService');

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

module.exports = { crear, obtenerTodos, obtenerPorId, actualizar, eliminar };
