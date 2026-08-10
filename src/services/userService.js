// "Base de datos" temporal en memoria
let usuarios = [];
let siguienteId = 1;

// Crea un usuario nuevo y lo guarda en el array
function crearUsuario(email, nombreCompleto) {
  const nuevoUsuario = {
    id: siguienteId,
    email: email,
    nombreCompleto: nombreCompleto,
    creadoEn: new Date(),
  };

  usuarios.push(nuevoUsuario);
  siguienteId = siguienteId + 1;

  return nuevoUsuario;
}

// Busca un usuario por su id y lo devuelve (o undefined si no existe)
function obtenerUsuarioPorId(id) {
  const idNumero = Number(id);

  for (let i = 0; i < usuarios.length; i++) {
    if (usuarios[i].id === idNumero) {
      return usuarios[i];
    }
  }

  return undefined;
}

module.exports = { crearUsuario, obtenerUsuarioPorId, usuarios };