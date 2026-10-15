const { ragOrchestratorService } = require('../services/ai/ragOrchestrator');

/**
 * Controlador de Inteligencia Artificial y RAG (Fase 4)
 */
async function assemblePrompt(req, res) {
  try {
    const userId = req.user.profileId || req.user.id;
    const { query, limit, threshold, customAction } = req.body || {};

    const result = await ragOrchestratorService.orchestrate(userId, {
      query,
      limit: limit ? Number(limit) : 3,
      threshold: threshold ? Number(threshold) : 0.25,
      customAction
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en aiController.assemblePrompt:', error);
    return res.status(500).json({
      error: 'Error interno ensamblando prompt RAG',
      message: error.message
    });
  }
}

async function getCopilotPrompt(req, res) {
  try {
    const userId = req.user.profileId || req.user.id;
    const { query } = req.query || {};

    const result = await ragOrchestratorService.orchestrate(userId, {
      query: query || null
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en aiController.getCopilotPrompt:', error);
    return res.status(500).json({
      error: 'Error interno obteniendo prompt del copiloto',
      message: error.message
    });
  }
}

async function searchSemantic(req, res) {
  try {
    const userId = req.user.profileId || req.user.id;
    const { query, limit, threshold } = req.body || {};

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Parámetro query es requerido' });
    }

    const passages = await ragOrchestratorService.searchSemanticBlocks(userId, query, {
      limit: limit ? Number(limit) : 5,
      threshold: threshold ? Number(threshold) : 0.25
    });

    return res.status(200).json({
      query,
      count: passages.length,
      passages
    });
  } catch (error) {
    console.error('Error en aiController.searchSemantic:', error);
    return res.status(500).json({
      error: 'Error interno en búsqueda semántica',
      message: error.message
    });
  }
}

module.exports = {
  assemblePrompt,
  getCopilotPrompt,
  searchSemantic
};
