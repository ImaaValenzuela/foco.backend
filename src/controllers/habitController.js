const habitService = require('../services/habitService');

async function vectorizarHabitosEnSegundoPlano(userId) {
  try {
    const habitosFaltantes = await habitService.obtenerHabitosSinVector(userId);
    
    for (const hab of habitosFaltantes) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const iaResponse = await fetch(`${process.env.IA_SERVICE_URL}/vectorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: hab.name }),
          signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (iaResponse.ok) {
          const vector = (await iaResponse.json()).embedding;
          await habitService.guardarVectorHabito(hab.id, vector);
          console.log(`[Background] Habito '${hab.name}' vectorizado.`);
      }
    }
  } catch (error) {
    console.warn('[Background] Error silencioso vectorizando habitos:', error.message);
  }
}

async function crear(req, res) {
  try {
    const { user_id, name } = req.body;
    if (!user_id || !name) {
      return res.status(400).json({ error: 'user_id y name son requeridos' });
    }

    let vectorData = null;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const iaResponse = await fetch(`${process.env.IA_SERVICE_URL}/vectorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: name }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (iaResponse.ok) {
            vectorData = (await iaResponse.json()).embedding;
        }
    } catch (error) {
        console.warn('Fallo al vectorizar habito. Se guardara sin vector.');
    }

    const habit = await habitService.crearHabit(user_id, name, vectorData);
    res.status(201).json(habit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al crear el habito' });
  }
}

async function obtenerTodos(req, res) {
  try {
    const habits = await habitService.obtenerHabitsPorUsuario(req.params.userId);
    
    vectorizarHabitosEnSegundoPlano(req.params.userId);

    res.json(habits);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener los habitos' });
  }
}

async function obtenerPorId(req, res) {
  try {
    const habit = await habitService.obtenerHabitPorId(req.params.id);
    if (!habit) {
      return res.status(404).json({ error: 'Habito no encontrado' });
    }
    res.json(habit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener el habito' });
  }
}

async function actualizar(req, res) {
  try {
    const { name } = req.body;
    
    let vectorData = null;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        const iaResponse = await fetch(`${process.env.IA_SERVICE_URL}/vectorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: name }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (iaResponse.ok) {
            vectorData = (await iaResponse.json()).embedding;
        }
    } catch (error) {
        console.warn('Fallo al actualizar vector de habito manual.');
    }

    const habit = await habitService.actualizarHabit(req.params.id, name, vectorData);
    if (!habit) {
      return res.status(404).json({ error: 'Habito no encontrado' });
    }
    res.json(habit);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al actualizar el habito' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await habitService.eliminarHabit(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Habito no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar el habito' });
  }
}

module.exports = { crear, obtenerTodos, obtenerPorId, actualizar, eliminar };