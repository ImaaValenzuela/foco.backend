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
const auth = createClient.mock.results[0].value.auth;

describe('API', () => {
  beforeEach(() => {
    pool.query.mockReset();
    auth.getUser.mockReset();
    ensureProfile.mockReset();
  });

  test('GET /api/health returns the API and database status', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ now: '2026-01-01T00:00:00.000Z' }] });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      message: 'Mente API is running!',
      db_time: '2026-01-01T00:00:00.000Z',
    });
  });

  test('GET /api/health returns 503 when the database is unavailable', async () => {
    pool.query.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('error');
  });

  test('rejects authenticated routes without a bearer token', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Autenticación requerida' });
  });

  test('rejects invalid tokens', async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid token') });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Token inválido o expirado' });
  });

  test('returns the authenticated user profile', async () => {
    const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
    const profile = { id: 'profile-1', email: user.email, role: 'user' };
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    ensureProfile.mockResolvedValue(profile);

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ auth_user_id: user.id, profile });
  });

  test('creates or updates onboarding for the authenticated profile', async () => {
    const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
    const profile = { id: 'profile-1', email: user.email };
    const onboarding = { id: 'onboarding-1', user_id: profile.id };
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    ensureProfile.mockResolvedValueOnce(profile);
    pool.query.mockResolvedValueOnce({ rows: [onboarding] });

    const response = await request(app)
      .post('/api/onboarding')
      .set('Authorization', 'Bearer valid-token')
      .send({ study_hours_daily: 2 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(onboarding);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][1][0]).toBe(profile.id);
  });

  test('prevents access to another user onboarding', async () => {
    const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    ensureProfile.mockResolvedValueOnce({ id: 'profile-1', email: user.email });

    const response = await request(app)
      .get('/api/onboarding/user/other-user')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'No puedes acceder a otro onboarding' });
  });

  test('creates a block with lists and arrow connections in content', async () => {
    const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
    const profile = { id: 'profile-1', email: user.email };
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    ensureProfile.mockResolvedValueOnce(profile);

    const mockCreatedBlock = {
      id: 'block-1',
      user_id: profile.id,
      type: 'active_objectives',
      content: {
        notes: [
          {
            id: 'list-1',
            title: 'Mis tareas',
            type: 'list',
            items: [{ id: 'item-1', text: 'Paso 1', checked: false }]
          }
        ],
        connections: [
          { id: 'conn-1', sourceId: 'list-1', targetId: 'note-2' }
        ]
      },
      updated_at: '2026-09-29T20:00:00Z'
    };

    pool.query.mockResolvedValueOnce({ rows: [mockCreatedBlock] });

    const response = await request(app)
      .post('/api/blocks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        type: 'active_objectives',
        content: mockCreatedBlock.content
      });

    expect(response.status).toBe(201);
    expect(response.body.content.notes[0].type).toBe('list');
    expect(response.body.content.connections).toHaveLength(1);
    expect(pool.query).toHaveBeenCalled();
  });

  test('creates a block with task and note, ensuring tasks are not converted to lists', async () => {
    const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
    const profile = { id: 'profile-1', email: user.email };
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    ensureProfile.mockResolvedValueOnce(profile);

    const payloadContent = {
      notes: [
        { id: 'task-1', text: 'Comprar insumos', isTask: true, checked: false },
        { id: 'note-1', text: 'Nota de inspiración', isTask: false }
      ]
    };

    pool.query.mockImplementationOnce((sql, params) => {
      // Retorna el bloque guardado tomando el content sanitizado que se pasó en el insert
      return Promise.resolve({
        rows: [{
          id: 'block-task',
          user_id: profile.id,
          type: 'personal_block',
          content: params[2],
          updated_at: '2026-09-29T20:00:00Z'
        }]
      });
    });

    const response = await request(app)
      .post('/api/blocks')
      .set('Authorization', 'Bearer valid-token')
      .send({
        type: 'personal_block',
        content: payloadContent
      });

    expect(response.status).toBe(201);
    const [tarea, nota] = response.body.content.notes;
    expect(tarea.type).toBe('task');
    expect(tarea.isTask).toBe(true);
    expect(tarea.items).toBeUndefined();

    expect(nota.type).toBe('note');
    expect(nota.isTask).toBe(false);
    expect(nota.items).toBeUndefined();
  });

  test('GET /api/blocks/:id sanitizes existing blocks and preserves task identity over list', async () => {
    const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
    const profile = { id: 'profile-1', email: user.email };
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    ensureProfile.mockResolvedValueOnce(profile);

    const mockStoredBlock = {
      id: 'block-legacy',
      user_id: profile.id,
      type: 'active_objectives',
      content: {
        notes: [
          // Simula un registro corrupto en DB donde una tarea tenía items: [] y type: 'list'
          { id: 'task-legacy', text: 'Tarea recuperada', isTask: true, type: 'list', items: [] },
          // Simula una lista real con items
          { id: 'list-real', title: 'Checklist', type: 'list', items: [{ id: '1', text: 'Item 1', checked: true }] }
        ]
      },
      updated_at: '2026-09-29T20:00:00Z'
    };

    pool.query.mockResolvedValueOnce({ rows: [mockStoredBlock] });

    const response = await request(app)
      .get('/api/blocks/block-legacy')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    const [tarea, lista] = response.body.content.notes;
    expect(tarea.type).toBe('task');
    expect(tarea.isTask).toBe(true);
    expect(tarea.items).toBeUndefined();

    expect(lista.type).toBe('list');
    expect(lista.items).toHaveLength(1);
  });
});
