const pomodoroService = require('../services/pomodoroService');
// Importamos el servicio que orquestará la llamada al microservicio Python (Fase 3)
const inferenceService = require('../services/inferenceService'); 

/**
 * Crea un registro de sesión Pomodoro y dispara la evaluación de IA en segundo plano.
 */
async function crear(req, res) {
  try {
    // 1. Recepción de parámetros según el Diccionario de Datos
    // Valores por defecto: focus 25, break 5, is_completed true
    const { 
      focus_duration = 25, 
      break_duration = 5, 
      is_completed = true 
    } = req.body;
    
    // Asumimos que el middleware require-auth.js inyecta el user en req
    const user_id = req.user.id; 

    // 2. Persistencia en PostgreSQL (Supabase)
    const session = await pomodoroService.crearSession(
      user_id, 
      focus_duration, 
      break_duration, 
      is_completed
    );

    // 3. Disparador del Motor de Inferencia (Fire-and-Forget) (FASE 3)
    // Ejecutamos la promesa SIN 'await' para no bloquear el Event Loop ni la respuesta al Frontend.
    // Esto evalúa reglas como F_DISP_POMODORO_ABANDONO o F_FAT_POMODORO_SOBRE_ENFOQUE
    inferenceService.evaluarReglasPomodoro(user_id, session.id)
      .catch(err => {
        // Circuit Breaker: Si Python falla o tarda más de 1500ms, el error muere aquí 
        // y no afecta la experiencia del usuario.
        console.error('Fallo silencioso en Evaluación de IA (Pomodoro):', err.message);
      });

    // 4. Respuesta inmediata y ligera al Frontend
    res.status(201).json(session);

  } catch (error) {
    console.error('Error en pomodoroController.crear:', error);
    res.status(500).json({ error: 'Error interno al registrar la sesión Pomodoro' });
  }
}

/**
 * Obtiene el historial de Pomodoros del usuario autenticado.
 */
async function obtenerPorUsuario(req, res) {
  try {
    const user_id = req.user.id;
    const sessions = await pomodoroService.obtenerSessionsPorUsuario(user_id);
    res.json(sessions);
  } catch (error) {
    console.error('Error en pomodoroController.obtenerPorUsuario:', error);
    res.status(500).json({ error: 'Error interno al obtener las sesiones' });
  }
}

/**
 * Obtiene una sesión específica por su ID.
 */
async function obtenerPorId(req, res) {
  try {
    const session = await pomodoroService.obtenerSessionPorId(req.params.id);
    
    if (!session) {
      return res.status(404).json({ error: 'Sesión Pomodoro no encontrada' });
    }

    // Validar que el pomodoro pertenezca al usuario que lo solicita
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error en pomodoroController.obtenerPorId:', error);
    res.status(500).json({ error: 'Error interno al obtener la sesión' });
  }
}

/**
 * Elimina un registro de Pomodoro (Soft delete o Hard delete según reglas de negocio).
 */
async function eliminar(req, res) {
  try {
    const user_id = req.user.id;
    const result = await pomodoroService.eliminarSession(req.params.id, user_id);
    
    if (!result) {
      return res.status(404).json({ error: 'Sesión no encontrada o no autorizada' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error en pomodoroController.eliminar:', error);
    res.status(500).json({ error: 'Error interno al eliminar la sesión' });
  }
}

module.exports = { 
  crear, 
  obtenerPorUsuario, 
  obtenerPorId, 
  eliminar 
};