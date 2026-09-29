const crypto = require('crypto');
const blockService = require('../services/blockService');
const inferenceService = require('../services/inferenceService');

function validarYSanitizarContent(content) {
  if (!content || typeof content !== 'object') {
    return { notes: [], connections: [] };
  }

  const contentLimpio = { ...content };

  if (Array.isArray(contentLimpio.notes)) {
    contentLimpio.notes = contentLimpio.notes.map(note => {
      if (!note || typeof note !== 'object') return null;

      const esTarea = note.type === 'task' || Boolean(note.isTask);
      const esLista = !esTarea && (note.type === 'list' || (Array.isArray(note.items) && note.items.length > 0 && note.type !== 'note'));

      let textoPlano = note.text ? String(note.text).trim() : '';

      if (esTarea) {
        return {
          id: note.id || crypto.randomUUID(),
          title: note.title ? String(note.title).trim() : null,
          text: textoPlano,
          type: 'task',
          isTask: true,
          checked: Boolean(note.checked),
          createdAt: note.createdAt || new Date().toISOString(),
          ...(note.embedding ? { embedding: note.embedding } : {})
        };
      }

      if (esLista) {
        const itemsLimpios = Array.isArray(note.items)
          ? note.items.map(item => ({
              id: item.id || crypto.randomUUID(),
              text: String(item.text || '').trim(),
              checked: Boolean(item.checked)
            }))
          : [];

        if (!textoPlano) {
          textoPlano = [note.title, ...itemsLimpios.map(i => i.text)].filter(Boolean).join(' - ');
        }

        return {
          id: note.id || crypto.randomUUID(),
          title: note.title ? String(note.title).trim() : null,
          text: textoPlano,
          type: 'list',
          isTask: false,
          checked: Boolean(note.checked),
          items: itemsLimpios,
          createdAt: note.createdAt || new Date().toISOString(),
          ...(note.embedding ? { embedding: note.embedding } : {})
        };
      }

      return {
        id: note.id || crypto.randomUUID(),
        title: note.title ? String(note.title).trim() : null,
        text: textoPlano,
        type: 'note',
        isTask: false,
        checked: false,
        createdAt: note.createdAt || new Date().toISOString(),
        ...(note.embedding ? { embedding: note.embedding } : {})
      };
    }).filter(Boolean);
  } else {
    contentLimpio.notes = [];
  }

  if (Array.isArray(contentLimpio.connections)) {
    contentLimpio.connections = contentLimpio.connections.map(conn => {
      if (!conn || typeof conn !== 'object' || !conn.sourceId || !conn.targetId) return null;
      return {
        id: conn.id || crypto.randomUUID(),
        sourceId: String(conn.sourceId),
        targetId: String(conn.targetId),
        sourceBlockId: conn.sourceBlockId ? String(conn.sourceBlockId) : null,
        targetBlockId: conn.targetBlockId ? String(conn.targetBlockId) : null,
        label: conn.label ? String(conn.label) : undefined,
        createdAt: conn.createdAt || new Date().toISOString()
      };
    }).filter(Boolean);
  } else {
    contentLimpio.connections = [];
  }

  return contentLimpio;
}

async function inyectarVectoresFaltantes(content) {
  if (process.env.NODE_ENV === 'test' || !process.env.IA_SERVICE_URL) return;
  if (content && Array.isArray(content.notes)) {
    content.notes.forEach(note => {
      if (note.type === 'list' && Array.isArray(note.items) && !note.text) {
        note.text = [note.title, ...note.items.map(i => i.text)].filter(Boolean).join(' - ');
      }
    });

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
      const esTarea = resto.type === 'task' || Boolean(resto.isTask);
      if (esTarea) {
        resto.type = 'task';
        resto.isTask = true;
        delete resto.items;
      } else if (resto.type === 'list' && !resto.isTask) {
        resto.type = 'list';
        resto.isTask = false;
        resto.items = Array.isArray(resto.items) ? resto.items : [];
      } else {
        resto.type = 'note';
        resto.isTask = false;
        delete resto.items;
      }
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
    if (!type) return res.status(400).json({ error: 'type es requerido' });
    
    const contentSanitizado = validarYSanitizarContent(content);
    await inyectarVectoresFaltantes(contentSanitizado);
    const block = await blockService.crearBlock(req.user.profileId, type, contentSanitizado);
    
    // DISPARADOR IA (Fire-and-Forget)
    inferenceService.evaluarEstadoGlobal(req.user.profileId, 'block', block.id).catch(()=>{});

    res.status(201).json(sanitizarBloqueParaFrontend(block));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el block' });
  }
}

async function actualizar(req, res) {
  try {
    const updatePayload = { type: req.body.type };
    if (req.body.content !== undefined) {
      updatePayload.content = validarYSanitizarContent(req.body.content);
      await inyectarVectoresFaltantes(updatePayload.content);
    }
    const block = await blockService.actualizarBlock(req.params.id, req.user.profileId, updatePayload);
    if (!block) return res.status(404).json({ error: 'Block no encontrado' });

    // DISPARADOR IA (Fire-and-Forget)
    inferenceService.evaluarEstadoGlobal(req.user.profileId, 'block', block.id).catch(()=>{});

    res.json(sanitizarBloqueParaFrontend(block));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar el block' });
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