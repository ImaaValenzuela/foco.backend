const blockService = require('../services/blockService');

async function crear(req, res) {
  try {
    const { user_id, type, content } = req.body;
    if (!user_id || !type) {
      return res.status(400).json({ error: 'user_id y type son requeridos' });
    }
    const block = await blockService.crearBlock(user_id, type, content);
    res.status(201).json(block);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el block' });
  }
}

async function obtenerTodos(req, res) {
  try {
    const blocks = await blockService.obtenerBlocksPorUsuario(req.params.userId);
    res.json(blocks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener los blocks' });
  }
}

async function obtenerPorId(req, res) {
  try {
    const block = await blockService.obtenerBlockPorId(req.params.id);
    if (!block) {
      return res.status(404).json({ error: 'Block no encontrado' });
    }
    res.json(block);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el block' });
  }
}

async function obtenerBlocks(req, res) {
  try {
    const blocks = await blockService.obtenerBlocks();
    res.json(blocks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener los blocks' });
  }
}

async function actualizar(req, res) {
  try {
    const block = await blockService.actualizarBlock(req.params.id, req.body);
    if (!block) {
      return res.status(404).json({ error: 'Block no encontrado' });
    }
    res.json(block);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar el block' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await blockService.eliminarBlock(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Block no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar el block' });
  }
}

module.exports = { crear, obtenerTodos, obtenerPorId, obtenerBlocks, actualizar, eliminar };
