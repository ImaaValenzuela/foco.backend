// Este archivo recibe los pedidos HTTP de usuarios y responde usando el service
const userService = require('../services/userService');

// Se ejecuta cuando llega un pedido POST /api/users
function crear(req, res) {
  // req.body es un objeto con los datos que mandaron para crear el usuario
  const email = req.body.email;
  const nombreCompleto = req.body.nombreCompleto;

  // Si no mandaron email, no dejamos crear el usuario
  if (!email) {
    res.status(400).json({ error: 'El email es requerido' });
    return;
  }

  // Le pedimos al service que cree el usuario y guarde los datos
  const usuario = userService.crearUsuario(email, nombreCompleto);

  // Respondemos con el usuario creado y código 201 (creado con éxito)
  res.status(201).json(usuario);
}

// Se ejecuta cuando llega un pedido GET /api/users/:id
function obtenerPorId(req, res) {
  // req.params.id es el valor que viene en la URL, ej: /api/users/5 -> "5"
  const id = req.params.id;

  const usuario = userService.obtenerUsuarioPorId(id);

  // Si no se encontró el usuario, respondemos con error 404
  if (!usuario) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  res.json(usuario);
}

module.exports = { crear, obtenerPorId };