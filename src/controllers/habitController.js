const habitService = require('../services/habitService');

async function crear(req, res) {
  try {
    const { user_id, name } = req.body;
    if (!user_id || !name) {
      return res.status(400).json({ error: 'user_id y name son requeridos' });
    }
    const habit = await habitService.crearHabit(user_id, name);
    res.status(201).json(habit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el hábito' });
  }
}

async function obtenerTodos(req, res) {
  try {
    const habits = await habitService.obtenerHabitsPorUsuario(req.params.userId);
    res.json(habits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener los hábitos' });
  }
}

async function obtenerPorId(req, res) {
  try {
    const habit = await habitService.obtenerHabitPorId(req.params.id);
    if (!habit) {
      return res.status(404).json({ error: 'Hábito no encontrado' });
    }
    res.json(habit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el hábito' });
  }
}

async function actualizar(req, res) {
  try {
    const { name } = req.body;
    const habit = await habitService.actualizarHabit(req.params.id, name);
    if (!habit) {
      return res.status(404).json({ error: 'Hábito no encontrado' });
    }
    res.json(habit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar el hábito' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await habitService.eliminarHabit(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Hábito no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar el hábito' });
  }
}

module.exports = { crear, obtenerTodos, obtenerPorId, actualizar, eliminar };
