// Temporalmente guardamos los tableros en memoria, en un array
let tableros = 
[
    { id: 1, nombre: "Facultad", usuario: 1, descripcion: "Materias y entregas", creadoEn: new Date() },
    { id: 2, nombre: "Trabajo", usuario: 1, descripcion: "Tareas laborales", creadoEn: new Date() },
    { id: 3, nombre: "Vida Personal", usuario: 2, descripcion: "Hábitos y rutina", creadoEn: new Date() },
];

// Crea un board nuevo y lo guarda en el array
function crearTablero(nombreTablero, usuarioTablero, descripcionTablero) 
{
    const nuevoTablero = 
    {
    id: tableros.length + 1,
    nombre: nombreTablero,
    usuario: usuarioTablero,
    descripcion: descripcionTablero,
    creadoEn: new Date(),
    };

    tableros.push(nuevoTablero);

    return nuevoTablero;
}

// Busca un tablero por el id del usuario
function obtenerTableroPorIdUsuario(idUsuario) 
{
    const idUsuarioConsultar = Number(idUsuario);

    const tablerosUsuario = [];

    for (let i = 0; i < tableros.length; i++) //recorremos el array de tableros
    {
    if (tableros[i].usuario === idUsuarioConsultar) 
    {
        tablerosUsuario.push(tableros[i]);
    }
    }
    return tablerosUsuario;
}

module.exports = {crearTablero, obtenerTableroPorIdUsuario, tableros};