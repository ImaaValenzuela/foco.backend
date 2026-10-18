const { ragOrchestratorService } = require('../services/ai/ragOrchestrator');
const { langchainOrchestratorService } = require('../services/ai/langchainOrchestrator');

/**
 * Controlador de Inteligencia Artificial, RAG y Orquestador LangChain (Fases 4 y 5)
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

/**
 * FASE 5: Endpoint de Inferencia Estructurada con LangChain
 * Recibe mensaje del usuario, rule_id activada o intención, consume el prompt de Fase 4
 * y devuelve respuesta en JSON estructurado (Structured Outputs).
 */
async function inferStructured(req, res) {
  try {
    const userId = req.user.profileId || req.user.id;
    const { message, text, query, rule_id, ruleId, customAction } = req.body || {};

    const effectiveMessage = message || text || query || '';
    const effectiveRuleId = rule_id || ruleId || null;

    const result = await langchainOrchestratorService.orchestrateInference({
      userId,
      message: effectiveMessage,
      ruleId: effectiveRuleId,
      customAction
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en aiController.inferStructured:', error);
    return res.status(500).json({
      error: 'Error interno en orquestador estructurado LangChain',
      message: error.message
    });
  }
}

/**
 * FASE 5: Telemetría de Feedback de Usuario (thumbs up / down)
 * Persiste la calificación en la fila correspondiente de ai_inference_logs.
 */
async function handleFeedback(req, res) {
  try {
    const userId = req.user.profileId || req.user.id;
    const { logId, log_id, rating, feedback, messageId } = req.body || {};

    const targetLogId = logId || log_id;
    if (!targetLogId) {
      // Si no viene logId, aceptamos la telemetría sin error fatal
      return res.status(200).json({
        success: true,
        message: 'Feedback recibido (sin logId asociado)',
        rating,
        messageId
      });
    }

    const result = await langchainOrchestratorService.persistFeedback(
      userId,
      targetLogId,
      rating,
      feedback
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en aiController.handleFeedback:', error);
    return res.status(500).json({
      error: 'Error registrando feedback de inferencia',
      message: error.message
    });
  }
}

module.exports = {
  assemblePrompt,
  getCopilotPrompt,
  searchSemantic,
  inferStructured,
  handleFeedback
};
