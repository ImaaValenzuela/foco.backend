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

jest.mock('../src/services/blockService', () => ({
  obtenerBlocksPorUsuario: jest.fn(),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

const request = require('supertest');
const pool = require('../src/db');
const { createClient } = require('@supabase/supabase-js');
const { ensureProfile } = require('../src/services/profileService');
const blockService = require('../src/services/blockService');
const app = require('../src/app');
const auth = createClient.mock.results[0].value.auth;

describe('API', () => {
  beforeEach(() => {
    pool.query.mockReset();
    auth.getUser.mockReset();
    ensureProfile.mockReset();
    blockService.obtenerBlocksPorUsuario.mockReset();
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

  test('GET /blocks returns blocks for the authenticated profile', async () => {
    const user = { id: 'auth-user-1', email: 'user@example.com', user_metadata: {} };
    const profile = { id: 'profile-1', email: user.email };
    const blocks = [{ id: 'block-1', user_id: profile.id, type: 'note' }];
    auth.getUser.mockResolvedValueOnce({ data: { user }, error: null });
    ensureProfile.mockResolvedValueOnce(profile);
    blockService.obtenerBlocksPorUsuario.mockResolvedValueOnce(blocks);

    const response = await request(app)
      .get('/blocks')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(blocks);
    expect(blockService.obtenerBlocksPorUsuario).toHaveBeenCalledWith(profile.id);
  });
});
