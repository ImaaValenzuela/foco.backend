const { googleCalendarService } = require('../services/googleCalendar.service');

async function saveTokens(req, res) {
  try {
    const userId = req.user.profileId;
    const { provider_token, provider_refresh_token, expires_at, scope } = req.body;

    if (!provider_token && !provider_refresh_token) {
      return res.status(400).json({ error: 'Se requiere provider_token o provider_refresh_token' });
    }

    const expiryDate = expires_at ? Number(expires_at) * 1000 : Date.now() + 3600 * 1000;

    await googleCalendarService.saveTokens(userId, {
      access_token: provider_token,
      refresh_token: provider_refresh_token,
      expiry_date: expiryDate,
      scope
    });

    return res.status(200).json({
      success: true,
      message: 'Tokens de Google Calendar sincronizados correctamente'
    });
  } catch (error) {
    console.error('Error guardando tokens de Calendar:', error);
    return res.status(500).json({ error: 'Error guardando tokens de Google Calendar' });
  }
}

async function getStatus(req, res) {
  try {
    const userId = req.user.profileId;
    const status = await googleCalendarService.getConnectionStatus(userId);
    return res.status(200).json({ success: true, ...status });
  } catch (error) {
    console.error('Error obteniendo estado de Calendar:', error);
    return res.status(500).json({ error: 'Error consultando estado de Google Calendar' });
  }
}

async function getEvents(req, res) {
  try {
    const userId = req.user.profileId;
    const { date, timeMin, timeMax, timeZone } = req.query;

    const events = await googleCalendarService.listTodayEvents(userId, date || new Date().toISOString(), {
      timeMin,
      timeMax,
      timeZone
    });
    return res.status(200).json({
      success: true,
      connected: true,
      events
    });
  } catch (error) {
    if (error.message && error.message.includes('CALENDAR_NOT_CONNECTED')) {
      return res.status(200).json({
        success: true,
        connected: false,
        events: []
      });
    }
    console.error('Error obteniendo eventos de Calendar:', error);
    return res.status(500).json({ error: 'Error al consultar Google Calendar' });
  }
}

async function createEvent(req, res) {
  try {
    const userId = req.user.profileId;
    const { summary, description, start, end, location } = req.body;

    if (!summary) {
      return res.status(400).json({ error: 'El título (summary) es requerido' });
    }

    const event = await googleCalendarService.createCalendarEvent(userId, {
      summary,
      description,
      start,
      end,
      location
    });

    return res.status(201).json({
      success: true,
      message: 'Evento creado en Google Calendar',
      event
    });
  } catch (error) {
    if (error.message && error.message.includes('CALENDAR_NOT_CONNECTED')) {
      return res.status(400).json({
        error: 'Google Calendar no está conectado. Por favor autoriza los permisos de Google Calendar.'
      });
    }
    console.error('Error creando evento en Calendar:', error);
    return res.status(500).json({ error: 'Error al agendar evento en Google Calendar' });
  }
}

async function disconnect(req, res) {
  try {
    const userId = req.user.profileId;
    await googleCalendarService.disconnectCalendar(userId);
    return res.status(200).json({
      success: true,
      message: 'Google Calendar desconectado correctamente'
    });
  } catch (error) {
    console.error('Error desconectando Calendar:', error);
    return res.status(500).json({ error: 'Error desconectando Google Calendar' });
  }
}

module.exports = {
  saveTokens,
  getStatus,
  getEvents,
  createEvent,
  disconnect
};
