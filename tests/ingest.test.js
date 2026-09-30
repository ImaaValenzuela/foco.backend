jest.mock('../src/db', () => ({
  query: jest.fn(),
  end: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: jest.fn() },
  })),
}));

jest.mock('../src/services/profileService', () => ({
  ensureProfile: jest.fn(),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

const request = require('supertest');
const pool = require('../src/db');
const { createClient } = require('@supabase/supabase-js');
const { ensureProfile } = require('../src/services/profileService');
const app = require('../src/app');
const { classifyIntentLocal } = require('../src/services/nluService');
const auth = createClient.mock.results[0].value.auth;

describe('NLU Pipeline & Ingestion Processing', () => {
  beforeEach(() => {
    pool.query.mockReset();
    auth.getUser.mockReset();
    ensureProfile.mockReset();
  });

  describe('Local NLU Rule Engine (classifyIntentLocal)', () => {
    test('classifies a task statement accurately', () => {
      const result = classifyIntentLocal('Crear una tarea para comprar insumos en objetivos activos');
      expect(result.intent).toBe('CREATE_BLOCK_ITEM');
      expect(result.action).toBe('ADD_TASK');
      expect(result.targetBlock).toBe('active_objectives');
      expect(result.extractedData.isTask).toBe(true);
      expect(result.extractedData.type).toBe('task');
      expect(result.extractedData.text).toContain('Comprar insumos');
    });

    test('classifies a structured list with items accurately', () => {
      const result = classifyIntentLocal('Crea una lista para el supermercado con leche, huevos y pan en personal');
      expect(result.intent).toBe('CREATE_BLOCK_ITEM');
      expect(result.action).toBe('ADD_LIST');
      expect(result.targetBlock).toBe('personal_block');
      expect(result.extractedData.isList).toBe(true);
      expect(result.extractedData.type).toBe('list');
      expect(result.extractedData.title).toBe('Supermercado');
      expect(result.extractedData.items).toHaveLength(3);
      expect(result.extractedData.items[0].text).toBe('Leche');
      expect(result.extractedData.items[1].text).toBe('Huevos');
      expect(result.extractedData.items[2].text).toBe('Pan');
    });

    test('classifies a habit statement accurately', () => {
      const result = classifyIntentLocal('Nuevo hábito de meditar 10 minutos cada mañana');
      expect(result.intent).toBe('CREATE_HABIT');
      expect(result.action).toBe('ADD_HABIT');
      expect(result.extractedData.name).toContain('Meditar 10 minutos');
    });

    test('classifies a connection/arrow statement accurately', () => {
      const result = classifyIntentLocal('Conectar la tarea comprar insumos con la nota proveedores');
      expect(result.intent).toBe('CREATE_CONNECTION');
      expect(result.action).toBe('ADD_CONNECTION');
      expect(result.extractedData.sourceQuery).toContain('comprar insumos');
      expect(result.extractedData.targetQuery).toContain('proveedores');
    });

    test('falls back gracefully to note for general reflections', () => {
      const result = classifyIntentLocal('Tengo una idea brillante para la portada del libro');
      expect(result.intent).toBe('CREATE_BLOCK_ITEM');
      expect(result.action).toBe('ADD_NOTE');
      expect(result.extractedData.type).toBe('note');
      expect(result.extractedData.isTask).toBe(false);
    });
  });

  describe('POST /api/ingest Endpoint', () => {
    test('creates a task in the target block via ingestion', async () => {
      const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
      const profile = { id: 'profile-1', email: user.email };
      auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
      ensureProfile.mockResolvedValueOnce(profile);

      // 1. SELECT query para obtenerBlockPorUsuarioYTipo
      pool.query.mockResolvedValueOnce({ rows: [] });

      // 2. INSERT query para crearBlock
      pool.query.mockImplementationOnce((sql, params) => {
        return Promise.resolve({
          rows: [{
            id: 'block-1',
            user_id: profile.id,
            type: params[1],
            content: params[2],
            updated_at: '2026-09-29T21:00:00Z'
          }]
        });
      });

      const response = await request(app)
        .post('/api/ingest')
        .set('Authorization', 'Bearer valid-token')
        .send({ text: 'Anotar tarea: enviar reporte semanal en objetivos activos' });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('BLOCK');
      const savedNote = response.body.data.content.notes[0];
      expect(savedNote.type).toBe('task');
      expect(savedNote.isTask).toBe(true);
      expect(savedNote.checked).toBe(false);
      expect(savedNote.items).toBeUndefined();
    });

    test('creates a dynamic checklist in personal block via ingestion', async () => {
      const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
      const profile = { id: 'profile-1', email: user.email };
      auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
      ensureProfile.mockResolvedValueOnce(profile);

      pool.query.mockResolvedValueOnce({ rows: [] });
      pool.query.mockImplementationOnce((sql, params) => {
        return Promise.resolve({
          rows: [{
            id: 'block-2',
            user_id: profile.id,
            type: params[1],
            content: params[2],
            updated_at: '2026-09-29T21:00:00Z'
          }]
        });
      });

      const response = await request(app)
        .post('/api/ingest')
        .set('Authorization', 'Bearer valid-token')
        .send({ text: 'Crear lista de compras con manzanas, bananas y leche' });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('BLOCK');
      const savedList = response.body.data.content.notes[0];
      expect(savedList.type).toBe('list');
      expect(savedList.isTask).toBe(false);
      expect(savedList.items).toHaveLength(3);
    });

    test('creates an arrow connection between existing notes via ingestion', async () => {
      const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
      const profile = { id: 'profile-1', email: user.email };
      auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
      ensureProfile.mockResolvedValueOnce(profile);

      // Simula bloques con 2 notas
      const mockBlocks = [
        {
          id: 'block-a',
          user_id: profile.id,
          type: 'active_objectives',
          content: {
            notes: [{ id: 'n-1', text: 'Comprar insumos', type: 'task' }],
            connections: []
          }
        },
        {
          id: 'block-b',
          user_id: profile.id,
          type: 'inspiration_creativity',
          content: {
            notes: [{ id: 'n-2', text: 'Proveedores de tela', type: 'note' }],
            connections: []
          }
        }
      ];

      // obtenerBlocksPorUsuario
      pool.query.mockResolvedValueOnce({ rows: mockBlocks });
      // actualizarBlock
      pool.query.mockResolvedValueOnce({ rows: [mockBlocks[0]] });

      const response = await request(app)
        .post('/api/ingest')
        .set('Authorization', 'Bearer valid-token')
        .send({ text: 'Conectar comprar insumos con proveedores' });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('CONNECTION');
      expect(response.body.data.sourceId).toBe('n-1');
      expect(response.body.data.targetId).toBe('n-2');
    });
  });
});
