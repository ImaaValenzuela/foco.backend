jest.mock('../src/db', () => ({
  query: jest.fn(),
  end: jest.fn(),
}));

const mockAuth = {
  getUser: jest.fn(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: mockAuth,
  })),
}));

jest.mock('../src/services/profileService', () => ({
  ensureProfile: jest.fn(),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

const request = require('supertest');
const pool = require('../src/db');
const { ensureProfile } = require('../src/services/profileService');
const app = require('../src/app');
const {
  RagOrchestratorService,
  ragOrchestratorService
} = require('../src/services/ai/ragOrchestrator');
const { CircuitBreaker } = require('../src/utils/circuitBreaker');

describe('FASE 4: Orquestación del Prompt RAG (Retrieval y Ensamble)', () => {
  const mockUserId = 'user-rag-test-1234';
  const mockUser = { id: mockUserId, email: 'ragtest@foco.app' };
  const mockProfile = {
    id: mockUserId,
    name: 'Usuario RAG',
    email: 'ragtest@foco.app',
    role: 'user',
    subscription_tier: 'pro'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ragOrchestratorService.circuitBreaker.reset();

    mockAuth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });
    ensureProfile.mockResolvedValue(mockProfile);
  });

  describe('1. Motor Matemático: Similitud de Coseno', () => {
    test('Calcula similitud 1.0 para vectores idénticos de 384 dimensiones', () => {
      const vecA = new Array(384).fill(0.5);
      const vecB = new Array(384).fill(0.5);
      const sim = ragOrchestratorService.calculateCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    test('Calcula similitud 0.0 para vectores ortogonales', () => {
      const vecA = [1, 0, 0, 0];
      const vecB = [0, 1, 0, 0];
      const sim = ragOrchestratorService.calculateCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(0.0, 5);
    });

    test('Calcula similitud -1.0 para vectores opuestos', () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      const sim = ragOrchestratorService.calculateCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(-1.0, 5);
    });

    test('Retorna 0 de forma segura ante entradas nulas, vacías o de longitudes dispares', () => {
      expect(ragOrchestratorService.calculateCosineSimilarity(null, [1, 2])).toBe(0);
      expect(ragOrchestratorService.calculateCosineSimilarity([1, 2], [])).toBe(0);
      expect(ragOrchestratorService.calculateCosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
      expect(ragOrchestratorService.calculateCosineSimilarity([0, 0], [0, 0])).toBe(0);
    });
  });

  describe('2. Recuperación Híbrida Semántica (searchSemanticBlocks)', () => {
    test('Recupera y ordena notas por similitud de coseno cuando existen embeddings', async () => {
      const mockVectorQuery = [1, 0, 0];
      const mockBlocks = [
        {
          id: 'block-active',
          type: 'active_objectives',
          content: {
            notes: [
              {
                id: 'note-1',
                title: 'Estudiar Arquitectura RAG',
                text: 'Comprender pgvector y cosine similarity',
                embedding: [0.95, 0.05, 0] // Alta similitud
              },
              {
                id: 'note-2',
                title: 'Comprar verduras',
                text: 'Zanahorias y manzanas',
                embedding: [0.5, 0.5, 0] // Similitud moderada (> 0.1)
              }
            ]
          }
        }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockBlocks });

      const passages = await ragOrchestratorService.searchSemanticBlocks(
        mockUserId,
        mockVectorQuery,
        { limit: 2, threshold: 0.1 }
      );

      expect(passages).toHaveLength(2);
      expect(passages[0].id).toBe('note-1');
      expect(passages[0].matchType).toBe('vector');
      expect(passages[0].similarity).toBeGreaterThan(passages[1].similarity);
    });

    test('Aplica fallback léxico por palabras clave cuando el microservicio de vectores no está disponible', async () => {
      // Mock de bloques sin embeddings calculados
      const mockBlocks = [
        {
          id: 'block-personal',
          type: 'personal_block',
          content: {
            notes: [
              {
                id: 'note-lexical',
                title: 'Entregar tesis de ingeniería',
                text: 'Revisión bibliográfica de sistemas distribuidos'
              }
            ]
          }
        }
      ];

      pool.query.mockResolvedValueOnce({ rows: mockBlocks });

      // Forzar que vectorizeQuery devuelva null (falla de vectorización)
      jest.spyOn(ragOrchestratorService, 'vectorizeQuery').mockResolvedValueOnce(null);

      const passages = await ragOrchestratorService.searchSemanticBlocks(
        mockUserId,
        'tesis distribuidos',
        { limit: 2 }
      );

      expect(passages).toHaveLength(1);
      expect(passages[0].id).toBe('note-lexical');
      expect(passages[0].matchType).toBe('lexical_fallback');
    });

    test('Maneja limpiamente usuarios sin bloques o con listas de notas vacías', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const passages = await ragOrchestratorService.searchSemanticBlocks(
        mockUserId,
        'consulta cualquiera'
      );

      expect(passages).toEqual([]);
    });
  });

  describe('3. Ensamble Estructurado del System Prompt (assembleSystemPrompt)', () => {
    test('Ensambla el prompt con la estructura exacta, metadatos de onboarding y snapshots', () => {
      const mockProfileData = {
        study_hours_daily: 4,
        work_hours_daily: 6,
        leisure_hours_daily: 2,
        routine_hours_daily: 8,
        interests: ['software_development', 'data_science'],
        mot_create_habits: true,
        mot_avoid_dispersion: true,
        mot_organization: false,
        mot_reduce_fatigue: true
      };

      const mockInferenceLog = {
        id: 'log-123',
        rule_id: 'F_FAT_POMODORO_SOBRE_ENFOQUE',
        associated_pomodoro_id: 'pomo-session-789',
        action_taken: 'LOCK_POMODORO_COOLDOWN',
        suggested_message: 'Pausa obligatoria para estirar',
        snap_habits_metrics: { pomodoro_completed_last_4h: 4, calendar_busy_hours: 2 }
      };

      const mockPassages = [
        {
          id: 'p-1',
          blockType: 'active_objectives',
          title: 'Módulo Copiloto RAG',
          text: 'Completar pipeline de inyección',
          similarity: 0.895
        }
      ];

      const prompt = ragOrchestratorService.assembleSystemPrompt({
        profile: mockProfileData,
        inferenceLog: mockInferenceLog,
        passages: mockPassages
      });

      // Validar secciones fundamentales del contrato
      expect(prompt).toContain('[ROL Y PERSONALIDAD]');
      expect(prompt).toContain('Eres el Copiloto de Inteligencia Artificial de F.O.C.O.');
      expect(prompt).toContain('[PERFIL DEL USUARIO (LINEA BASE DE ONBOARDING)]');
      expect(prompt).toContain('* Estudio: 4h | Trabajo: 6h | Ocio: 2h | Rutina: 8h');
      expect(prompt).toContain('Intereses Destacados: software_development, data_science');
      expect(prompt).toContain('* Crear Hábitos: true | Evitar Dispersión: true | Organización: false | Reducir Fatiga: true');

      expect(prompt).toContain('[ESTADO ACTUAL EN TIEMPO REAL (SNAPSHOTS & TELEMETRÍA)]');
      expect(prompt).toContain('- Regla Disparada en Motor de Inferencia: F_FAT_POMODORO_SOBRE_ENFOQUE');
      expect(prompt).toContain('- Acción Técnica Programada: LOCK_POMODORO_COOLDOWN');
      expect(prompt).toContain('- Sesión de Enfoque Pomodoro: pomo-session-789');
      expect(prompt).toContain('- Fragmentos Semánticos Relevantes del Lienzo (RAG - pgvector):');
      expect(prompt).toContain('* [active_objectives] "Módulo Copiloto RAG": Completar pipeline de inyección (Similitud: 89.5%)');

      expect(prompt).toContain('[INSTRUCCIÓN DE GENERACIÓN]');
      expect(prompt).toContain('Genera una respuesta conversacional breve (máximo 3 oraciones), accionable y empática que acompañe la acción técnica (LOCK_POMODORO_COOLDOWN)');
    });

    test('Genera un prompt con plantilla de contingencia cuando no hay regla activa ni logs previos', () => {
      const emptyProfile = {
        study_hours_daily: 0,
        work_hours_daily: 0,
        leisure_hours_daily: 0,
        routine_hours_daily: 0,
        interests: [],
        mot_create_habits: false,
        mot_avoid_dispersion: false,
        mot_organization: false,
        mot_reduce_fatigue: false
      };

      const prompt = ragOrchestratorService.assembleSystemPrompt({
        profile: emptyProfile,
        inferenceLog: null,
        passages: []
      });

      expect(prompt).toContain('- Regla Disparada en Motor de Inferencia: Ninguna (Modo Acompañamiento Continuo)');
      expect(prompt).toContain('- Acción Técnica Programada: GENERAL_COPILOT_GUIDANCE');
      expect(prompt).toContain('- Sesión de Enfoque Pomodoro: Ninguna');
      expect(prompt).toContain('No se encontraron notas o tareas directamente asociadas a la consulta en el lienzo.');
    });
  });

  describe('4. Pipeline Completo de Orquestación y Resiliencia (orchestrate)', () => {
    test('Ejecuta el flujo completo combinando BD, logs e inferencia sin errores', async () => {
      // 1. Mock de onboarding_profiling
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            study_hours_daily: 3,
            work_hours_daily: 5,
            leisure_hours_daily: 2,
            routine_hours_daily: 6,
            interests: ['software_development'],
            mot_create_habits: true,
            mot_avoid_dispersion: true,
            mot_organization: true,
            mot_reduce_fatigue: true
          }
        ]
      });

      // 2. Mock de ai_inference_logs
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'log-uuid-1',
            rule_id: 'F_DISP_DESVIO_ESTUDIO',
            associated_pomodoro_id: null,
            action_taken: 'INJECT_CONVERSATIONAL_ALERT',
            suggested_message: '¿Retomamos objetivos activos?',
            snap_motivations: { mot_avoid_dispersion: true },
            snap_interests: ['software_development'],
            snap_routine: { study: 3, work: 5 },
            snap_habits_metrics: { active_objectives_pending_older_48h: 2 },
            created_at: new Date().toISOString()
          }
        ]
      });

      // 3. Mock de búsqueda en blocks
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'block-1',
            type: 'active_objectives',
            content: {
              notes: [
                {
                  id: 'note-pomo',
                  title: 'Aprender Python',
                  text: 'Estudiar decoradores y asyncio',
                  embedding: [0.1, 0.2, 0.3]
                }
              ]
            }
          }
        ]
      });

      // Simular que vectorizeQuery devuelve un vector de prueba
      jest.spyOn(ragOrchestratorService, 'vectorizeQuery').mockResolvedValueOnce([0.1, 0.2, 0.3]);

      const result = await ragOrchestratorService.orchestrate(mockUserId, {
        query: 'Necesito estudiar python'
      });

      expect(result).toHaveProperty('systemPrompt');
      expect(result.meta.ruleId).toBe('F_DISP_DESVIO_ESTUDIO');
      expect(result.meta.actionTaken).toBe('INJECT_CONVERSATIONAL_ALERT');
      expect(result.meta.passagesCount).toBe(1);
      expect(result.meta.usedFallback).toBe(false);
      expect(result.retrievedPassages[0].title).toBe('Aprender Python');
    });

    test('Tolera desconexión de BD y activa Circuit Breaker / Fallback sin lanzar excepciones', async () => {
      // Forzar que la base de datos rechace la conexión
      pool.query.mockRejectedValue(new Error('Connection terminated unexpectedly'));

      const result = await ragOrchestratorService.orchestrate(mockUserId, {
        query: 'Cualquier consulta'
      });

      expect(result).toHaveProperty('systemPrompt');
      expect(result.meta.usedFallback).toBe(true);
      expect(result.systemPrompt).toContain('[ROL Y PERSONALIDAD]');
    });
  });

  describe('5. Endpoints REST de la Fase 4 (/api/ai)', () => {
    test('POST /api/ai/copilot/prompt responde 200 con el prompt ensamblado para usuario autenticado', async () => {
      // 1. Mock de perfil
      pool.query.mockResolvedValueOnce({
        rows: [{ study_hours_daily: 2, interests: ['ux_ui_design'], mot_organization: true }]
      });
      // 2. Mock de log
      pool.query.mockResolvedValueOnce({ rows: [] });
      // 3. Mock de blocks
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/ai/copilot/prompt')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ query: '¿Cómo organizo mis notas hoy?' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('systemPrompt');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta.userId).toBe(mockUserId);
    });

    test('POST /api/ai/rag/assemble es alias funcional de /api/ai/copilot/prompt', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      pool.query.mockResolvedValueOnce({ rows: [] });
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/ai/rag/assemble')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('systemPrompt');
    });

    test('GET /api/ai/copilot/prompt responde 200 sin necesidad de payload', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      pool.query.mockResolvedValueOnce({ rows: [] });
      pool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/ai/copilot/prompt')
        .set('Authorization', 'Bearer valid-jwt-token');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('systemPrompt');
    });

    test('POST /api/ai/rag/search ejecuta búsqueda semántica directa y retorna pasajes', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            type: 'active_objectives',
            content: {
              notes: [
                { id: 'search-note-1', title: 'Objetivo Semántico', text: 'Nota de prueba para búsqueda' }
              ]
            }
          }
        ]
      });

      const res = await request(app)
        .post('/api/ai/rag/search')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ query: 'Objetivo Semántico' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('passages');
      expect(res.body.count).toBeGreaterThanOrEqual(1);
    });

    test('Endpoints de /api/ai rechazan peticiones no autenticadas con 401', async () => {
      mockAuth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Token inválido') });

      const res = await request(app)
        .get('/api/ai/copilot/prompt');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });
});
