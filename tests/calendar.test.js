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

const request = require('supertest');
const pool = require('../src/db');
const { createClient } = require('@supabase/supabase-js');
const { ensureProfile } = require('../src/services/profileService');
const app = require('../src/app');
const {
  GoogleCalendarService,
  googleCalendarService,
  encryptToken,
  decryptToken
} = require('../src/services/googleCalendar.service');
const { classifyIntentLocal, parseCalendarDateTime } = require('../src/services/nluService');
const { buildRagPromptContext } = require('../src/services/inferenceService');

const auth = createClient.mock.results[0].value.auth;

describe('Google Calendar Integration Suite (F.O.C.O.)', () => {
  const mockUser = {
    id: 'user-cal-test-uuid',
    email: 'test@foco.app'
  };
  const mockProfile = {
    id: 'user-cal-test-uuid',
    name: 'Usuario Calendar Test',
    email: 'test@foco.app',
    role: 'user',
    subscription_tier: 'pro'
  };

  beforeEach(() => {
    pool.query.mockReset();
    auth.getUser.mockReset();
    ensureProfile.mockReset();

    auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    });
    ensureProfile.mockResolvedValue(mockProfile);
  });

  describe('1. Cifrado y Gestión Segura de Tokens', () => {
    test('cifra y descifra tokens correctamente usando AES-256-GCM', () => {
      const originalToken = 'ya29.a0AcM6123456789_sample_google_refresh_token_xyz';
      const encrypted = encryptToken(originalToken);

      expect(encrypted).not.toBe(originalToken);
      expect(encrypted.split(':')).toHaveLength(3); // iv:tag:ciphertext

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(originalToken);
    });

    test('guarda tokens en base de datos cifrando el refresh_token', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // ensureTable
        .mockResolvedValueOnce({ rows: [{ user_id: mockUser.id, expiry_date: Date.now() + 3600000 }] }); // insert

      const result = await googleCalendarService.saveTokens(mockUser.id, {
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        expiry_date: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/calendar.events'
      });

      expect(result).toBeDefined();
      expect(pool.query).toHaveBeenCalled();
      const insertCallArgs = pool.query.mock.calls[1];
      const params = insertCallArgs[1];
      expect(params[1]).toBe(mockUser.id);
      expect(params[2]).toBe('fake-access-token');
      // El refresh token almacenado no debe estar en texto plano
      expect(params[3]).not.toBe('fake-refresh-token');
      expect(params[3].split(':')).toHaveLength(3);
    });

    test('POST /api/calendar/tokens almacena los tokens provenientes del OAuth de Supabase', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // ensureTable
        .mockResolvedValueOnce({ rows: [{ user_id: mockUser.id, expiry_date: 1800000000000 }] });

      const res = await request(app)
        .post('/api/calendar/tokens')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          provider_token: 'google-access-token-123',
          provider_refresh_token: 'google-refresh-token-456',
          expires_at: 1800000000
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('sincronizados correctamente');
    });
  });

  describe('2. Renovación Transparente de Token (Token Refresh)', () => {
    test('renueva el access_token automáticamente si está próximo a expirar sin arrojar 401', async () => {
      const mockOAuthClient = {
        credentials: {},
        setCredentials: jest.fn(function(creds) { this.credentials = creds; }),
        refreshAccessToken: jest.fn().mockResolvedValue({
          credentials: {
            access_token: 'renewed-access-token-999',
            refresh_token: 'current-refresh-token',
            expiry_date: Date.now() + 3600000,
            scope: 'https://www.googleapis.com/auth/calendar.events'
          }
        }),
        on: jest.fn()
      };

      const customService = new GoogleCalendarService(pool, mockOAuthClient);

      // Simular token expirado en la BD
      const encryptedRefresh = encryptToken('current-refresh-token');
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // ensureTable
        .mockResolvedValueOnce({
          rows: [{
            access_token: 'expired-access-token',
            refresh_token: encryptedRefresh,
            expiry_date: Date.now() - 10000, // Ya expiró
            scope: 'https://www.googleapis.com/auth/calendar.events'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // saveTokens al refrescar

      const client = await customService.getAuthenticatedClient(mockUser.id);

      expect(client).toBe(mockOAuthClient);
      expect(mockOAuthClient.refreshAccessToken).toHaveBeenCalled();
      expect(mockOAuthClient.credentials.access_token).toBe('renewed-access-token-999');
    });
  });

  describe('3. Detección NLU e Ingesta Dual (Fase 1)', () => {
    test('detecta la intención CREATE_CALENDAR_EVENT con fecha y hora para "Reunión de equipo mañana a las 10am"', () => {
      const statement = 'Reunión de equipo mañana a las 10am';
      const result = classifyIntentLocal(statement);

      expect(result.intent).toBe('CREATE_CALENDAR_EVENT');
      expect(result.action).toBe('ADD_CALENDAR_EVENT');
      expect(result.targetBlock).toBe('active_objectives');
      expect(result.extractedData.title).toBe('Reunión de equipo');
      expect(result.extractedData.startDate).toBeDefined();
      expect(result.extractedData.endDate).toBeDefined();
      expect(result.extractedData.timeStr).toBe('10:00');
      expect(result.extractedData.isTask).toBe(true);
    });

    test('asigna personal_block si el texto menciona "personal"', () => {
      const result = classifyIntentLocal('Cita con el médico mañana a las 15:30 en el bloque personal');
      expect(result.intent).toBe('CREATE_CALENDAR_EVENT');
      expect(result.targetBlock).toBe('personal_block');
      expect(result.extractedData.title).toContain('Cita con el médico');
      expect(result.extractedData.timeStr).toBe('15:30');
    });

    test('POST /api/ingest ejecuta el efecto dual: agenda en Google Calendar y crea nota en blocks', async () => {
      // Mock de createCalendarEvent
      jest.spyOn(googleCalendarService, 'createCalendarEvent').mockResolvedValueOnce({
        id: 'gcal-event-uuid-123',
        title: 'Reunión de equipo',
        htmlLink: 'https://calendar.google.com/event?id=123',
        start: '2026-10-05T10:00:00.000Z',
        end: '2026-10-05T11:00:00.000Z'
      });

      // Mock de bloques en PostgreSQL
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // obtenerBlockPorUsuarioYTipo (no existe aún)
        .mockResolvedValueOnce({
          rows: [{
            id: 'block-123',
            user_id: mockUser.id,
            type: 'active_objectives',
            content: { notes: [], connections: [] }
          }]
        });

      const res = await request(app)
        .post('/api/ingest')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ text: 'Reunión de equipo mañana a las 10am' });

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('CALENDAR_EVENT');
      expect(res.body.calendarSynced).toBe(true);
      expect(res.body.calendarEvent).toBeDefined();
      expect(res.body.calendarEvent.id).toBe('gcal-event-uuid-123');
      expect(res.body.note).toBeDefined();
      expect(res.body.note.calendarEventId).toBe('gcal-event-uuid-123');
      expect(res.body.note.isTask).toBe(true);

      googleCalendarService.createCalendarEvent.mockRestore();
    });

    test('POST /api/nlu/ingest funciona como alias transparente de ingesta', async () => {
      jest.spyOn(googleCalendarService, 'createCalendarEvent').mockResolvedValueOnce({
        id: 'gcal-event-alias',
        title: 'Llamada con cliente'
      });

      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'b1', type: 'active_objectives', content: { notes: [] } }] });

      const res = await request(app)
        .post('/api/nlu/ingest')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({ text: 'Agendar llamada con cliente mañana a las 11:00' });

      expect(res.status).toBe(200);
      expect(res.body.type).toBe('CALENDAR_EVENT');
      googleCalendarService.createCalendarEvent.mockRestore();
    });
  });

  describe('4. Endpoints de Calendario y Listado de Eventos', () => {
    test('GET /api/calendar/events devuelve eventos si el usuario está conectado', async () => {
      jest.spyOn(googleCalendarService, 'listTodayEvents').mockResolvedValueOnce([
        {
          id: 'event-1',
          title: 'Daily Standup',
          start: '2026-10-04T09:00:00Z',
          end: '2026-10-04T09:30:00Z',
          allDay: false
        }
      ]);

      const res = await request(app)
        .get('/api/calendar/events')
        .set('Authorization', 'Bearer valid-jwt-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.connected).toBe(true);
      expect(res.body.events).toHaveLength(1);
      expect(res.body.events[0].title).toBe('Daily Standup');

      googleCalendarService.listTodayEvents.mockRestore();
    });

    test('GET /api/calendar/events traslada timeMin, timeMax y timeZone a listTodayEvents', async () => {
      const spy = jest.spyOn(googleCalendarService, 'listTodayEvents').mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/calendar/events?date=2026-10-04&timeMin=2026-10-04T03:00:00.000Z&timeMax=2026-10-05T02:59:59.999Z&timeZone=America/Argentina/Buenos_Aires')
        .set('Authorization', 'Bearer valid-jwt-token');

      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(
        mockUser.id,
        '2026-10-04',
        expect.objectContaining({
          timeMin: '2026-10-04T03:00:00.000Z',
          timeMax: '2026-10-05T02:59:59.999Z',
          timeZone: 'America/Argentina/Buenos_Aires'
        })
      );
      spy.mockRestore();
    });

    test('POST /api/calendar/events permite agendar una tarjeta arrastrada (Drag & Drop)', async () => {
      jest.spyOn(googleCalendarService, 'createCalendarEvent').mockResolvedValueOnce({
        id: 'gcal-card-drop-1',
        title: 'Entregar informe financiero',
        start: '2026-10-04T15:00:00Z',
        end: '2026-10-04T16:00:00Z'
      });

      const res = await request(app)
        .post('/api/calendar/events')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send({
          summary: 'Entregar informe financiero',
          description: 'Arrastrado desde Objetivos Activos',
          start: '2026-10-04T15:00:00Z',
          end: '2026-10-04T16:00:00Z'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.event.id).toBe('gcal-card-drop-1');

      googleCalendarService.createCalendarEvent.mockRestore();
    });
  });

  describe('5. RAG y Consumo Contextual de Agenda', () => {
    test('buildRagPromptContext genera un prompt enriquecido con las reuniones del día para el LLM', () => {
      const mockUserProfile = {
        mot_reduce_fatigue: true,
        interests: ['software_development', 'productivity'],
        work_hours_daily: 7
      };
      const mockCalendarSummary = {
        totalCount: 2,
        busyHours: 2.5,
        hasNightEvents: true,
        events: [
          { title: 'Reunión de Diseño', start: '2026-10-04T14:00:00Z' },
          { title: 'Sync de Cierre', start: '2026-10-04T18:30:00Z' }
        ]
      };

      const promptContext = buildRagPromptContext(mockUserProfile, [], {}, mockCalendarSummary);

      expect(promptContext).toContain('=== AGENDA Y EVENTOS DEL DÍA (GOOGLE CALENDAR) ===');
      expect(promptContext).toContain('Eventos hoy: 2 reunión(es)');
      expect(promptContext).toContain('Horas ocupadas en reuniones: 2.5h');
      expect(promptContext).toContain('Eventos nocturnos (>=18hs): Sí');
      expect(promptContext).toContain('Reunión de Diseño');
      expect(promptContext).toContain('Carga total de jornada (Trabajo + Reuniones Calendar): 9.5h');
    });
  });
});
