const { evaluarEstadoGlobal, evaluarReglasPomodoro, iaCircuitBreaker } = require('../src/services/inferenceService');
const pool = require('../src/db');

// Mockeamos la base de datos
jest.mock('../src/db', () => ({
  query: jest.fn()
}));

// Mockeamos la API fetch global para simular la respuesta de Python
global.fetch = jest.fn();

describe('Fase 3: Motor de Inferencia de IA (inferenceService) - Rendimiento y Resiliencia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    iaCircuitBreaker.reset();
  });

  it('Debe inyectar un registro en ai_inference_logs con consulta unificada (Single RTT) cuando la IA dispara una regla', async () => {
    const mockUserId = 'user-uuid-123';
    const mockPomodoroId = 'pomo-uuid-456';

    // Simulamos la respuesta de la consulta SQL unificada (1 solo RTT)
    pool.query.mockResolvedValueOnce({
      rows: [{
        profile: {
          study_hours_daily: 0,
          work_hours_daily: 8,
          leisure_hours_daily: 2,
          routine_hours_daily: 2,
          interests: ['software_development'],
          mot_create_habits: false,
          mot_avoid_dispersion: false,
          mot_organization: false,
          mot_reduce_fatigue: true
        },
        blocks: [],
        pomo_metrics: {
          completed_4h: 4,
          interrupted_24h: 0
        }
      }]
    });

    // Simulamos inserción en ai_inference_logs
    pool.query.mockResolvedValueOnce({ rows: [] });

    // Simulamos microservicio Python respondiendo a /evaluate-rules
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        triggered: true,
        rule_id: 'F_FAT_POMODORO_SOBRE_ENFOQUE',
        action_taken: 'LOCK_POMODORO_COOLDOWN',
        suggested_message: 'Mensaje de prueba IA'
      })
    });

    // Ejecución mediante alias retrocompatible y omnicanal
    await evaluarReglasPomodoro(mockUserId, mockPomodoroId);

    // Con consulta unificada: 1 SELECT + 1 INSERT = 2 consultas exactas (reducción de 33% en RTT)
    expect(pool.query).toHaveBeenCalledTimes(2);

    const insertCall = pool.query.mock.calls[1];
    const insertQuery = insertCall[0];
    const insertValues = insertCall[1];

    expect(insertQuery).toContain('INSERT INTO ai_inference_logs');
    expect(insertValues[0]).toBe(mockUserId);
    expect(insertValues[1]).toBe('F_FAT_POMODORO_SOBRE_ENFOQUE');

    const snapMotivationsGuardado = JSON.parse(insertValues[5]);
    expect(snapMotivationsGuardado.mot_reduce_fatigue).toBe(true);
  });

  it('Debe capturar TimeoutError/AbortError limpiamente y activar Circuit Breaker', async () => {
    // 1 consulta unificada a BD
    pool.query.mockResolvedValueOnce({
      rows: [{
        profile: { mot_reduce_fatigue: true },
        blocks: [],
        pomo_metrics: {}
      }]
    });

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValueOnce(abortError);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await evaluarEstadoGlobal('user-123', 'pomodoro', 'pomo-456');

    // Solo se ejecutó el SELECT unificado (el INSERT no se ejecutó debido a la falla)
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Timeout 1500ms excedido'));

    consoleSpy.mockRestore();
  });

  it('El Circuit Breaker debe prevenir llamadas adicionales cuando alcanza el umbral de fallas', async () => {
    const abortError = new Error('Connection refused');
    abortError.name = 'AbortError';

    // Disparamos 3 fallas para abrir el circuito
    for (let i = 0; i < 3; i++) {
      pool.query.mockResolvedValueOnce({ rows: [{ profile: {}, blocks: [], pomo_metrics: {} }] });
      global.fetch.mockRejectedValueOnce(abortError);
      await evaluarEstadoGlobal('user-fail', 'pomodoro', 'pomo-fail');
    }

    expect(iaCircuitBreaker.state).toBe('OPEN');

    // La 4ta llamada debe salir en 0 ms sin consultar BD ni fetch
    const querySpyBefore = pool.query.mock.calls.length;
    const fetchSpyBefore = global.fetch.mock.calls.length;

    await evaluarEstadoGlobal('user-fail', 'pomodoro', 'pomo-fail');

    expect(pool.query.mock.calls.length).toBe(querySpyBefore);
    expect(global.fetch.mock.calls.length).toBe(fetchSpyBefore);
  });
});