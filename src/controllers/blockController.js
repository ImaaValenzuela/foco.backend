const blockService = require('../services/blockService');

async function inyectarVectoresFaltantes(content) {
  if (content && Array.isArray(content.notes)) {
    const notasParaVectorizar = content.notes.filter(note => note.text && !note.embedding);
    
    if (notasParaVectorizar.length > 0) {
      await Promise.all(notasParaVectorizar.map(async (note) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);

          const iaResponse = await fetch(`${process.env.IA_SERVICE_URL}/vectorize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: note.text }),
              signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (iaResponse.ok) {
              note.embedding = (await iaResponse.json()).embedding;
          }
        } catch (err) {
          console.warn(`Vectorizacion fallida para nota: ${note.id}`);
        }
      }));
    }
  }
}

function sanitizarBloqueParaFrontend(block) {
  if (!block) return block;
  const bloqueClon = JSON.parse(JSON.stringify(block));
  if (bloqueClon.content && Array.isArray(bloqueClon.content.notes)) {
    bloqueClon.content.notes = bloqueClon.content.notes.map(note => {
      const { embedding, ...resto } = note;
      return resto;
    });
  }
  return bloqueClon;
}

function sanitizarBloquesParaFrontend(blocks) {
  return blocks.map(sanitizarBloqueParaFrontend);
}

async function vectorizarBloquesEnSegundoPlano(userId) {
  try {
    const blocks = await blockService.obtenerBlocksPorUsuario(userId);
    for (const bloque of blocks) {
      if (bloque.content && Array.isArray(bloque.content.notes)) {
        const notasFaltantes = bloque.content.notes.filter(n => n.text && !n.embedding);
        
        if (notasFaltantes.length > 0) {
           await inyectarVectoresFaltantes(bloque.content);
           await blockService.actualizarBlock(bloque.id, userId, { type: bloque.type, content: bloque.content });
           console.log(`[Background] Bloque ${bloque.type} actualizado con vectores.`);
        }
      }
    }
  } catch (error) {
    console.warn('[Background] Error silencioso vectorizando bloques:', error.message);
  }
}

async function crear(req, res) {
  try {
    const { type, content } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'type es requerido' });
    }
    
    await inyectarVectoresFaltantes(content);

    const block = await blockService.crearBlock(req.user.profileId, type, content);
    res.status(201).json(sanitizarBloqueParaFrontend(block));
  } catch (error) {
    console.error(error);
    if (error.code === '23505' && error.constraint === 'unique_user_block_type') {
      return res.status(409).json({ error: 'Ya existe un block de este tipo para el usuario' });
    }
    res.status(500).json({ error: 'Error interno al crear el block' });
  }
}

async function obtenerTodos(req, res) {
  try {
    if (![req.user.id, String(req.user.profileId)].includes(req.params.userId)) {
      return res.status(403).json({ error: 'No puedes acceder a notas de otro usuario' });
    }
    
    const blocks = await blockService.obtenerBlocksPorUsuario(req.user.profileId);
    
    vectorizarBloquesEnSegundoPlano(req.user.profileId);

    res.json(sanitizarBloquesParaFrontend(blocks));
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
    res.json(sanitizarBloqueParaFrontend(block));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el block' });
  }
}

async function obtenerBlocks(req, res) {
  try {
    const blocks = await blockService.obtenerBlocks();
    res.json(sanitizarBloquesParaFrontend(blocks));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener los blocks' });
  }
}

async function actualizar(req, res) {
  try {
    await inyectarVectoresFaltantes(req.body.content);

    const block = await blockService.actualizarBlock(req.params.id, req.user.profileId, req.body);
    if (!block) {
      return res.status(404).json({ error: 'Block no encontrado' });
    }
    res.json(sanitizarBloqueParaFrontend(block));
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