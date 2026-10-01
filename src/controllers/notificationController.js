const notificationService = require('../services/notificationService');

async function listar(req, res) {
  try {
    const data = await notificationService.getNotifications(req.user.profileId);
    res.json(data);
  } catch (error) {
    console.error('Error al listar notificaciones:', error);
    res.status(500).json({ error: 'Error interno al obtener notificaciones' });
  }
}

async function marcarLeida(req, res) {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user.profileId);
    if (!notification) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    res.json(notification);
  } catch (error) {
    console.error('Error al marcar notificación como leída:', error);
    res.status(500).json({ error: 'Error interno al actualizar notificación' });
  }
}

async function marcarTodasLeidas(req, res) {
  try {
    const result = await notificationService.markAllAsRead(req.user.profileId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error al marcar todas las notificaciones:', error);
    res.status(500).json({ error: 'Error interno al marcar notificaciones' });
  }
}

async function eliminar(req, res) {
  try {
    const result = await notificationService.dismissNotification(req.params.id, req.user.profileId);
    if (!result) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error al descartar notificación:', error);
    res.status(500).json({ error: 'Error interno al eliminar notificación' });
  }
}

module.exports = {
  listar,
  marcarLeida,
  marcarTodasLeidas,
  eliminar,
};
