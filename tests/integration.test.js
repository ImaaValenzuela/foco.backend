const request = require('supertest');

// Mocks para simular Supabase Auth y aislar pruebas unitarias / de integración en Jest
jest.mock('../src/db', () => ({
  query: jest.fn(),
  end: jest.fn(),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: jest.fn() },
  })),
}));

jest.mock('../src/services/profileService', () => {
  const original = jest.requireActual('../src/services/profileService');
  return {
    ...original,
    ensureProfile: jest.fn(),
  };
});

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

const pool = require('../src/db');
const { createClient } = require('@supabase/supabase-js');
const { ensureProfile, actualizarPerfil, obtenerPerfilCompleto } = require('../src/services/profileService');
const app = require('../src/app');

const auth = createClient.mock.results[0].value.auth;

describe('Suite de Pruebas de Integración (Backend - API, Auth, Onboarding, Perfil, Notificaciones)', () => {
  const mockUser = {
    id: 'usr-int-001',
    email: 'integracion@foco.app',
    user_metadata: { full_name: 'Usuario Integración' },
  };

  const mockProfile = {
    id: 'usr-int-001',
    name: 'Usuario Integración',
    email: 'integracion@foco.app',
    role: 'user',
    subscription_tier: 'freemium',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    auth.getUser.mockResolvedValue({ data: { user: mockUser }, error: null });
    ensureProfile.mockResolvedValue(mockProfile);
  });

  describe('Test 1.1: Persistencia y Registro Auth + Onboarding', () => {
    test('1.1.1: Consulta de estado de onboarding devuelve completed: false cuando no existe registro', async () => {
      // Simula que no tiene registros en onboarding_profiling
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/onboarding/status')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        completed: false,
        profiling: null,
      });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM onboarding_profiling WHERE user_id = $1'),
        [mockProfile.id]
      );
    });

    test('1.1.2: Envío de payload completo a POST /api/onboarding persiste en onboarding_profiling', async () => {
      const payloadOnboarding = {
        study_hours_daily: 4,
        work_hours_daily: 4,
        leisure_hours_daily: 2,
        routine_hours_daily: 2,
        interests: ['yoga_mindfulness', 'entrepreneurship'],
        mot_create_habits: true,
        mot_avoid_dispersion: true,
        mot_organization: false,
        mot_reduce_fatigue: true,
      };

      const savedProfiling = {
        id: 'onb-uuid-1',
        user_id: mockProfile.id,
        ...payloadOnboarding,
        completed_at: '2026-10-01T01:00:00Z',
      };

      pool.query.mockResolvedValueOnce({ rows: [savedProfiling] });

      const response = await request(app)
        .post('/api/onboarding')
        .set('Authorization', 'Bearer valid-token')
        .send(payloadOnboarding);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: 'onb-uuid-1',
        user_id: mockProfile.id,
        study_hours_daily: 4,
        mot_create_habits: true,
      });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO onboarding_profiling'),
        expect.arrayContaining([
          mockProfile.id,
          payloadOnboarding.study_hours_daily,
          payloadOnboarding.work_hours_daily,
        ])
      );
    });
  });

  describe('Test 1.2: Endpoint de Actualización de Perfil (PUT /api/users/profile)', () => {
    test('1.2.1: Actualiza intereses, motivaciones y horas de rutina retornando 200 OK y datos persistidos', async () => {
      const updatePayload = {
        name: 'Usuario Actualizado',
        study_hours_daily: 5,
        work_hours_daily: 3,
        leisure_hours_daily: 3,
        routine_hours_daily: 1,
        interests: ['academic_research', 'personal_finance'],
        mot_create_habits: true,
        mot_avoid_dispersion: false,
        mot_organization: true,
        mot_reduce_fatigue: false,
      };

      // Mock para UPDATE users
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: mockProfile.id,
          name: updatePayload.name,
          email: mockProfile.email,
          role: mockProfile.role,
          subscription_tier: mockProfile.subscription_tier,
        }],
      });

      // Mock para INSERT/UPDATE onboarding_profiling
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'onb-uuid-1',
          user_id: mockProfile.id,
          study_hours_daily: updatePayload.study_hours_daily,
          work_hours_daily: updatePayload.work_hours_daily,
          leisure_hours_daily: updatePayload.leisure_hours_daily,
          routine_hours_daily: updatePayload.routine_hours_daily,
          interests: updatePayload.interests,
          mot_create_habits: updatePayload.mot_create_habits,
          mot_avoid_dispersion: updatePayload.mot_avoid_dispersion,
          mot_organization: updatePayload.mot_organization,
          mot_reduce_fatigue: updatePayload.mot_reduce_fatigue,
          completed_at: '2026-10-01T01:10:00Z',
        }],
      });

      // Mock para UPDATE notifications (marcar como leídas las alertas pendientes)
      pool.query.mockResolvedValueOnce({ rowCount: 1 });

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(updatePayload);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Perfil actualizado con éxito');
      expect(response.body.user.name).toBe('Usuario Actualizado');
      expect(response.body.profiling.study_hours_daily).toBe(5);
      expect(response.body.profiling.interests).toEqual(['academic_research', 'personal_finance']);
    });

    test('1.2.2: Rechaza actualización si el presupuesto diario excede las 24 horas', async () => {
      const invalidPayload = {
        study_hours_daily: 12,
        work_hours_daily: 10,
        leisure_hours_daily: 4,
        routine_hours_daily: 2, // Total: 28 hrs (> 24)
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', 'Bearer valid-token')
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('24 horas');
    });

    test('1.2.3: Consulta GET /api/users/profile devuelve usuario y profiling consolidado', async () => {
      // Mock SELECT users
      pool.query.mockResolvedValueOnce({
        rows: [{ id: mockProfile.id, name: 'Usuario FOCO', email: mockProfile.email }],
      });
      // Mock SELECT onboarding_profiling
      pool.query.mockResolvedValueOnce({
        rows: [{
          user_id: mockProfile.id,
          study_hours_daily: 3,
          work_hours_daily: 5,
          interests: ['team_sports'],
          completed_at: '2026-10-01T00:00:00Z',
        }],
      });

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.user.name).toBe('Usuario FOCO');
      expect(response.body.profiling.study_hours_daily).toBe(3);
    });
  });

  describe('Test 1.3: Servicio de Notificaciones y Alerta de Onboarding Pendiente', () => {
    test('1.3.1: Usuario sin onboarding completado genera y recibe notificación ONBOARDING_REQUIRED', async () => {
      // 1. SELECT onboarding_profiling -> no completado (null o completed_at null)
      pool.query.mockResolvedValueOnce({ rows: [] });
      // 2. SELECT notifications para verificar si ya existía -> no existe
      pool.query.mockResolvedValueOnce({ rows: [] });
      // 3. INSERT INTO notifications (crea alerta prioritaria)
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'notif-alert-1' }] });
      // 4. SELECT notifications -> retorna la alerta generada
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'notif-alert-1',
          user_id: mockProfile.id,
          type: 'ONBOARDING_REQUIRED',
          title: 'Completá tu diagnóstico inicial',
          message: 'Para que F.O.C.O. calibre tu IA y adapte tu espacio de trabajo, completá tu rutina y preferencias.',
          action_url: '/onboarding.html',
          priority: 'high',
          read: false,
          created_at: '2026-10-01T01:15:00Z',
        }],
      });

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.unread_count).toBe(1);
      expect(response.body.notifications).toHaveLength(1);
      expect(response.body.notifications[0].type).toBe('ONBOARDING_REQUIRED');
      expect(response.body.notifications[0].priority).toBe('high');
      expect(response.body.notifications[0].action_url).toBe('/onboarding.html');
    });

    test('1.3.2: Marcar notificación como leída (PATCH /api/notifications/:id/read)', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{
          id: 'notif-alert-1',
          user_id: mockProfile.id,
          type: 'ONBOARDING_REQUIRED',
          read: true,
        }],
      });

      const response = await request(app)
        .patch('/api/notifications/notif-alert-1/read')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.read).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notifications'),
        ['notif-alert-1', mockProfile.id]
      );
    });

    test('1.3.3: Marcar todas como leídas (PATCH /api/notifications/read-all)', async () => {
      pool.query.mockResolvedValueOnce({ rowCount: 3 });

      const response = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.updated_count).toBe(3);
    });

    test('1.3.4: Descartar / eliminar notificación (DELETE /api/notifications/:id)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'notif-alert-1' }] });

      const response = await request(app)
        .delete('/api/notifications/notif-alert-1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(204);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM notifications'),
        ['notif-alert-1', mockProfile.id]
      );
    });
  });
});
