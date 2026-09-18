// Actualizamos las rutas apuntando hacia '../src/...'
const { evaluarReglasPomodoro } = require('../src/services/inferenceService');
const pool = require('../src/db');

// Actualizamos la ruta del mock para que coincida con la importación
jest.mock('../src/db', () => ({
  query: jest.fn()
}));

// 2. Mockeamos la API fetch global para simular la respuesta de Python
global.fetch = jest.fn();

describe('Fase 3: Motor de Inferencia de IA (inferenceService)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Debe inyectar un registro en ai_inference_logs cuando la IA dispara una regla (F_FAT_POMODORO_SOBRE_ENFOQUE)', async () => {
    
    // A. PREPARACIÓN (Arrange)
    const mockUserId = 'user-uuid-123';
    const mockPomodoroId = 'pomo-uuid-456';

    // Simulamos que la DB devuelve el perfil del usuario (Onboarding)
    pool.query.mockResolvedValueOnce({
      rows: [{
        study_hours_daily: 0,
        work_hours_daily: 8,
        leisure_hours_daily: 2,
        routine_hours_daily: 2,
        interests: ['software_development'],
        mot_create_habits: false,
        mot_avoid_dispersion: false,
        mot_organization: false,
        mot_reduce_fatigue: true 
      }]
    });

    // Simulamos que la DB devuelve un lienzo vacío (Blocks)
    pool.query.mockResolvedValueOnce({ rows: [] });

    // B. SIMULACIÓN DEL MICROSERVICIO PYTHON
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        triggered: true,
        rule_id: 'F_FAT_POMODORO_SOBRE_ENFOQUE',
        action_taken: 'LOCK_POMODORO_COOLDOWN',
        suggested_message: 'Mensaje de prueba IA'
      })
    });

    // C. EJECUCIÓN (Act)
    await evaluarReglasPomodoro(mockUserId, mockPomodoroId);

    // D. VALIDACIÓN (Assert)
    expect(pool.query).toHaveBeenCalledTimes(3); 
    
    const insertCall = pool.query.mock.calls[2];
    const insertQuery = insertCall[0];
    const insertValues = insertCall[1];

    expect(insertQuery).toContain('INSERT INTO ai_inference_logs');
    expect(insertValues[0]).toBe(mockUserId); 
    expect(insertValues[1]).toBe('F_FAT_POMODORO_SOBRE_ENFOQUE'); 
    
    const snapMotivationsGuardado = JSON.parse(insertValues[5]);
    expect(snapMotivationsGuardado.mot_reduce_fatigue).toBe(true);
  });

  it('Debe fallar silenciosamente si Python excede el timeout (Circuit Breaker)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ mot_reduce_fatigue: true }] });
    pool.query.mockResolvedValueOnce({ rows: [] });

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch.mockRejectedValueOnce(abortError);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await evaluarReglasPomodoro('user-123', 'pomo-456');

    expect(pool.query).toHaveBeenCalledTimes(2); 
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Timeout 1500ms excedido'));
    
    consoleSpy.mockRestore();
  });
});