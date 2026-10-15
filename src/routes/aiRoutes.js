const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { requireAuth } = require('../middleware/require-auth');

// Todas las rutas de IA requieren autenticación
router.use(requireAuth);

// GET /api/ai/copilot/prompt -> Obtiene prompt contextual del copiloto ensamblado
router.get('/copilot/prompt', aiController.getCopilotPrompt);

// POST /api/ai/copilot/prompt -> Ensambla prompt dinámico con query o acción opcional
router.post('/copilot/prompt', aiController.assemblePrompt);

// POST /api/ai/rag/assemble -> Alias canónico de ensamblado RAG
router.post('/rag/assemble', aiController.assemblePrompt);

// POST /api/ai/rag/search -> Búsqueda semántica híbrida en bloques
router.post('/rag/search', aiController.searchSemantic);

module.exports = router;
