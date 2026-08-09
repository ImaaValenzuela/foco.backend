// Este archivo recibe los pedidos HTTP de tableros y responde usando el service
const boardService = require('../services/boardService');

// Se ejecuta cuando llega un pedido GET /api/users/:id/boards
function obtenerTablerosDeUsuario(req, res) 
{
    // req.params.id es el id del usuario que viene en la URL
    const idUsuario = req.params.id;

    const tableros = boardService.obtenerTableroPorIdUsuario(idUsuario);

    // Respondemos con el array de tableros
    res.json(tableros);
}

module.exports = { obtenerTablerosDeUsuario };