const habitLogService = require('../services/habitLogService');

async function crear(req, res) {
  try {
    const { habit_id, logged_date, is_completed } = req.body;
    if (!habit_id || !logged_date) {
      return res.status(400).json({ error: 'habit_id y logged_date son requeridos' });
    }
    const log = await habitLogService.crearHabitLog(habit_id, logged_date, is_completed);
    res.status(201).json(log);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el log' });
  }
}

async function obtenerPorHabit(req, res) {
  try {
    const logs = await habitLogService.obtenerHabitLogsPorHabit(req.params.habitId);
    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener los logs' });
  }
}

async function obtenerPorId(req, res) {
  try {
    const log = await habitLogService.obtenerHabitLogPorId(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Log no encontrado' });
    }
    res.json(log);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el log' });
  }
}

async function actualizar(req, res) {
  try {
    const { is_completed } = req.body;
    const log = await habitLogService.actualizarHabitLog(req.params.id, is_completed);
    if (!log) {
      return res.status(404).json({ error: 'Log no encontrado' });
    }
    res.json(log);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar el log' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await habitLogService.eliminarHabitLog(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Log no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar el log' });
  }
}

module.exports = { crear, obtenerPorHabit, obtenerPorId, actualizar, eliminar };
