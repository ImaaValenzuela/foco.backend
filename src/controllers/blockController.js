const blockService = require('../services/blockService');

async function crear(req, res) {
  try {
    const { type, content } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'type es requerido' });
    }
    const block = await blockService.crearBlock(req.user.profileId, type, content);
    res.status(201).json(block);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el block' });
  }
}

async function obtenerTodos(req, res) {
  try {
    if (![req.user.id, String(req.user.profileId)].includes(req.params.userId)) {
      return res.status(403).json({ error: 'No puedes acceder a notas de otro usuario' });
    }
    const blocks = await blockService.obtenerBlocksPorUsuario(req.user.profileId);
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
    if (block.user_id !== req.user.profileId) {
      return res.status(403).json({ error: 'No puedes acceder a esta nota' });
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
    const block = await blockService.actualizarBlock(req.params.id, req.user.profileId, req.body);
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
    const result = await blockService.eliminarBlock(req.params.id, req.user.profileId);
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
