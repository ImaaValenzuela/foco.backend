// src/controllers/ingestController.js
const nluService = require('../services/nluService');
const blockService = require('../services/blockService');

async function processIngestion(req, res) {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'El campo text es requerido y debe ser una cadena' });
    }

    // 1. Clasificación Semántica (NLU)
    const inferenceResult = await nluService.classifyIntent(text);
    const { targetBlock, extractedData } = inferenceResult;

    // 2. Lógica de Persistencia (Ensamble del JSONB)
    // Buscamos si el bloque ya existe para anexar los datos, en lugar de sobrescribir
    const blocksExistentes = await blockService.obtenerBlocksPorUsuario(req.user.profileId);
    const bloqueActual = blocksExistentes.find(b => b.type === targetBlock);

    let nuevoContenido = {};
    if (bloqueActual && bloqueActual.content) {
      // Clonamos el contenido actual (JSONB)
      nuevoContenido = { ...bloqueActual.content };
    }

    // Estructuramos el nuevo ítem dentro del JSONB. 
    // Asumimos un array "items" dentro del JSONB de cada bloque.
    if (!nuevoContenido.items) {
      nuevoContenido.items = [];
    }
    
    nuevoContenido.items.push({
      id: crypto.randomUUID(),
      ...extractedData,
      createdAt: new Date().toISOString()
    });

    // 3. UPSERT en Supabase utilizando la función existente que maneja ON CONFLICT
    const savedBlock = await blockService.crearBlock(
      req.user.profileId, 
      targetBlock, 
      nuevoContenido
    );

    res.status(200).json({
      message: 'Ingesta procesada correctamente',
      inference: inferenceResult,
      block: savedBlock
    });

  } catch (error) {
    console.error('Error en processIngestion:', error);
    res.status(500).json({ error: 'Error interno procesando la ingesta de texto' });
  }
}

module.exports = { processIngestion };