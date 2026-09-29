const pomodoroService = require('../services/pomodoroService');
// Importamos el servicio que orquestará la llamada al microservicio Python (Fase 3)
const inferenceService = require('../services/inferenceService'); 

async function crear(req, res) {
  try {
    const { 
      focus_duration = 25, 
      break_duration = 5, 
      is_completed = true 
    } = req.body;
    
    const user_id = req.user.id; 

    // 1. Persistencia en BBDD (Esto ya está funcionando bien)
    const session = await pomodoroService.crearSession(
      user_id, focus_duration, break_duration, is_completed
    );

    // 2. CORRECCIÓN: Llamamos a la nueva función Omnicanal
    inferenceService.evaluarEstadoGlobal(user_id, 'pomodoro', session.id)
      .catch(err => {
        console.warn('Fallo silencioso en IA:', err.message);
      });

    // 3. Respuesta al frontend (Ahora sí llegará al cliente)
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