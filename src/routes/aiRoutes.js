const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { requireAuth } = require('../middleware/require-auth');

// Todas las rutas de IA requieren autenticación
router.use(requireAuth);

// --- RUTAS FASE 4 (RAG Y PROMPT BUILDER) ---
// GET /api/ai/copilot/prompt -> Obtiene prompt contextual del copiloto ensamblado
router.get('/copilot/prompt', aiController.getCopilotPrompt);

// POST /api/ai/copilot/prompt -> Ensambla prompt dinámico con query o acción opcional
router.post('/copilot/prompt', aiController.assemblePrompt);

// POST /api/ai/rag/assemble -> Alias canónico de ensamblado RAG
router.post('/rag/assemble', aiController.assemblePrompt);

// POST /api/ai/rag/search -> Búsqueda semántica híbrida en bloques
router.post('/rag/search', aiController.searchSemantic);

// --- RUTAS FASE 5 (ORQUESTADOR LANGCHAIN Y STRUCTURED OUTPUTS) ---
// POST /api/ai/infer -> Inferencia estructurada LangChain consumiendo prompt de Fase 4
router.post('/infer', aiController.inferStructured);

// POST /api/ai/chat -> Alias conversacional para chatbot nativo
router.post('/chat', aiController.inferStructured);

// POST /api/ai/copilot/message -> Alias semántico para copiloto
router.post('/copilot/message', aiController.inferStructured);

// PATCH & POST /api/ai/feedback y /api/ai/copilot/feedback -> Telemetría de feedback (👍 / 👎)
router.patch('/feedback', aiController.handleFeedback);
router.post('/feedback', aiController.handleFeedback);
router.patch('/copilot/feedback', aiController.handleFeedback);
router.post('/copilot/feedback', aiController.handleFeedback);

module.exports = router;
