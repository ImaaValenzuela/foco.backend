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

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.OPENAI_API_KEY;

const request = require('supertest');
const pool = require('../src/db');
const { ensureProfile } = require('../src/services/profileService');
const app = require('../src/app');
const {
  LangChainOrchestratorService,
  langchainOrchestratorService,
  StructuredInferenceSchema,
  build_rag_prompt
} = require('../src/services/ai/langchainOrchestrator');
const { ragOrchestratorService } = require('../src/services/ai/ragOrchestrator');

describe('FASE 5: Orquestador LangChain con Prompt de Fase 4 y Structured Outputs', () => {
  const mockUserId = 'user-phase5-test-uuid';
  const mockUser = { id: mockUserId, email: 'phase5@foco.app' };
  const mockProfile = {
    id: mockUserId,
    name: 'Alex Desarrollador',
    email: 'phase5@foco.app',
    role: 'user',
    subscription_tier: 'pro'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ragOrchestratorService.circuitBreaker.reset();
    langchainOrchestratorService.geminiApiKey = null;

    mockAuth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });
    ensureProfile.mockResolvedValue(mockProfile);
  });

  describe('1. Integración Obligatoria con el Prompt de Fase 4', () => {
    test('El orquestador de Fase 5 importa y utiliza directamente build_rag_prompt de la Fase 4', async () => {
      expect(typeof build_rag_prompt).toBe('function');

      // Mock de BD para onboarding_profiling y ai_inference_logs
      pool.query
        .mockResolvedValueOnce({
          rows: [{
            study_hours_daily: 4,
            work_hours_daily: 4,
            leisure_hours_daily: 2,
            routine_hours_daily: 8,
            interests: ['programación', 'react'],
            mot_create_habits: true,
            mot_avoid_dispersion: true,
            mot_organization: true,
            mot_reduce_fatigue: false
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'log-previo-123',
            user_id: mockUserId,
            rule_id: 'F_DISP_DESVIO_ESTUDIO',
            action_taken: 'INJECT_CONVERSATIONAL_ALERT',
            suggested_message: 'Mensaje previo de prueba'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'blk-1',
            type: 'active_objectives',
            content: { notes: [{ id: 'n-1', text: 'Repasar React', embedding: null }] }
          }]
        })
        // Inserción en ai_inference_logs
        .mockResolvedValueOnce({
          rows: [{ id: 'log-nuevo-999', created_at: new Date().toISOString() }]
        });

      const response = await langchainOrchestratorService.orchestrateInference({
        userId: mockUserId,
        message: 'Tengo pendiente repasar React',
        ruleId: 'F_DISP_DESVIO_ESTUDIO'
      });

      expect(response).toBeDefined();
      expect(response.rule_id).toBe('F_DISP_DESVIO_ESTUDIO');
      expect(response.action_taken).toBe('INJECT_CONVERSATIONAL_ALERT');
      expect(response.suggested_message).toContain('React');
      expect(response.action_payload).toBeDefined();
      expect(response.action_payload.type).toBe('add_card');
      expect(response.action_payload.block_type).toBe('active_objectives');
      expect(response.log_id).toBe('log-nuevo-999');
    });
  });

  describe('2. Validación Estricta de Esquema (Structured Outputs)', () => {
    test('Valida correctamente un objeto conforme al esquema Zod', () => {
      const validPayload = {
        rule_id: 'F_DISP_DESVIO_ESTUDIO',
        suggested_message: "¡Hola, Alex! Noté que tenés un objetivo pendiente ('Repasar React'). ¿Qué tal si hoy le dedicamos un solo ciclo Pomodoro de 25 minutos?",
        action_taken: 'INJECT_CONVERSATIONAL_ALERT',
        action_payload: {
          type: 'add_card',
          block_type: 'active_objectives',
          title: 'Repasar React - Ciclo Pomodoro',
          content: 'Tarea sugerida por el copiloto para despejar la mente'
        }
      };

      const parsed = StructuredInferenceSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.rule_id).toBe('F_DISP_DESVIO_ESTUDIO');
      expect(parsed.data.action_payload.type).toBe('add_card');
    });

    test('Rechaza objetos sin campos obligatorios o tipos de acción inválidos', () => {
      const invalidPayload = {
        rule_id: 123, // debe ser string
        suggested_message: '',
        action_payload: {
          type: 'INVALID_ACTION_TYPE'
        }
      };

      const parsed = StructuredInferenceSchema.safeParse(invalidPayload);
      expect(parsed.success).toBe(false);
    });

    test('Valida correctamente sugerencias planas de texto sin action_payload (conversación pura)', () => {
      const conversationalPayload = {
        rule_id: 'GENERAL_CONVERSATION',
        suggested_message: 'Para avanzar con React podés desglosarlo en partes pequeñas y avanzar con tranquilidad.',
        action_taken: 'CONVERSATIONAL_SUGGESTION',
        action_payload: null
      };

      const parsed = StructuredInferenceSchema.safeParse(conversationalPayload);
      expect(parsed.success).toBe(true);
      expect(parsed.data.rule_id).toBe('GENERAL_CONVERSATION');
      expect(parsed.data.action_payload).toBeNull();
    });
  });

  describe('3. Persistencia de Telemetría y Feedback Loop en BD', () => {
    test('persistFeedback ejecuta UPDATE en ai_inference_logs actualizando user_feedback', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await langchainOrchestratorService.persistFeedback(
        mockUserId,
        'log-nuevo-999',
        'positive',
        'Muy útil'
      );

      expect(result.success).toBe(true);
      expect(result.user_feedback).toBe('positive');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE ai_inference_logs'),
        ['positive', 'log-nuevo-999', mockUserId]
      );
    });

    test('persistFeedback soporta calificación negativa (thumbs down)', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await langchainOrchestratorService.persistFeedback(
        mockUserId,
        'log-nuevo-999',
        'negative'
      );

      expect(result.success).toBe(true);
      expect(result.user_feedback).toBe('negative');
    });
  });

  describe('4. Endpoints HTTP de Fase 5 en aiController y aiRoutes', () => {
    test('POST /api/ai/infer responde HTTP 200 con JSON estructurado y log_id', async () => {
      // Mock de BD
      pool.query
        .mockResolvedValueOnce({ rows: [{ study_hours_daily: 2 }] }) // onboarding
        .mockResolvedValueOnce({ rows: [] }) // last inference log
        .mockResolvedValueOnce({ rows: [] }) // blocks
        .mockResolvedValueOnce({ rows: [{ id: 'log-http-test-1', created_at: new Date().toISOString() }] }); // insert

      const res = await request(app)
        .post('/api/ai/infer')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          message: 'Necesito avanzar con el estudio',
          rule_id: 'F_DISP_DESVIO_ESTUDIO'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rule_id', 'F_DISP_DESVIO_ESTUDIO');
      expect(res.body).toHaveProperty('suggested_message');
      expect(res.body).toHaveProperty('action_taken');
      expect(res.body).toHaveProperty('action_payload');
      expect(res.body).toHaveProperty('log_id', 'log-http-test-1');
    });

    test('POST /api/ai/chat responde como alias válido de inferencia conversacional', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'log-chat-alias', created_at: new Date().toISOString() }] });

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          message: 'Tengo fatiga por pomodoro continuo',
          rule_id: 'F_FAT_POMODORO_SOBRE_ENFOQUE'
        });

      expect(res.status).toBe(200);
      expect(res.body.rule_id).toBe('F_FAT_POMODORO_SOBRE_ENFOQUE');
      expect(res.body.action_taken).toBe('LOCK_POMODORO_COOLDOWN');
      expect(res.body.action_payload.type).toBe('break_prompt');
    });

    test('POST /api/ai/infer responde con sugerencia plana en texto y action_payload null en consultas conversacionales libres', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'log-conversational', created_at: new Date().toISOString() }] });

      const res = await request(app)
        .post('/api/ai/infer')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          message: 'Hola, ¿cómo estás hoy? Quiero pedirte un consejo para mi día'
        });

      expect(res.status).toBe(200);
      expect(res.body.rule_id).toBe('GENERAL_CONVERSATION');
      expect(res.body.action_taken).toBe('CONVERSATIONAL_SUGGESTION');
      expect(res.body.action_payload).toBeNull();
      expect(res.body.suggested_message).not.toContain('ciclo Pomodoro de 25 minutos');
    });

    test('POST /api/ai/infer genera action_payload con isTask: true cuando el usuario pide crear una tarea', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'log-task-creation', created_at: new Date().toISOString() }] });

      const res = await request(app)
        .post('/api/ai/infer')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          message: 'Crear una tarea para comprar café'
        });

      expect(res.status).toBe(200);
      expect(res.body.action_taken).toBe('ADD_CARD');
      expect(res.body.action_payload).toBeDefined();
      expect(res.body.action_payload.type).toBe('add_card');
      expect(res.body.action_payload.isTask).toBe(true);
      expect(res.body.action_payload.content).toContain('Comprar café');
    });

    test('POST /api/ai/infer genera action_payload con isTask: false cuando el usuario pide agregar una nota', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'log-note-creation', created_at: new Date().toISOString() }] });

      const res = await request(app)
        .post('/api/ai/infer')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          message: 'Agregar una nota de repasar React'
        });

      expect(res.status).toBe(200);
      expect(res.body.action_taken).toBe('ADD_CARD');
      expect(res.body.action_payload).toBeDefined();
      expect(res.body.action_payload.type).toBe('add_card');
      expect(res.body.action_payload.isTask).toBe(false);
      expect(res.body.action_payload.content).toContain('Repasar React');
    });

    test('POST /api/ai/infer genera action_payload para nuevo hábito', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'log-habit-creation', created_at: new Date().toISOString() }] });

      const res = await request(app)
        .post('/api/ai/infer')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          message: 'Crear hábito de meditar 10 minutos'
        });

      expect(res.status).toBe(200);
      expect(res.body.action_taken).toBe('ADD_HABIT');
      expect(res.body.action_payload).toBeDefined();
      expect(res.body.action_payload.type).toBe('add_habit');
      expect(res.body.action_payload.title).toContain('Meditar');
    });

    test('PATCH /api/ai/copilot/feedback actualiza user_feedback en ai_inference_logs', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .patch('/api/ai/copilot/feedback')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          logId: 'log-http-test-1',
          rating: 'positive',
          feedback: 'Excelente recomendación'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user_feedback).toBe('positive');
    });
  });
});
