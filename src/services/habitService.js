const pool = require('../db');

// Recibe embeddingArray como tercer parámetro, por defecto null por si hay fallos o viene vacío
async function crearHabit(user_id, name, embeddingArray = null) {
    // Transforma el array de JS a formato string para que pgvector lo interprete correctamente
    const embeddingString = embeddingArray ? JSON.stringify(embeddingArray) : null;

    const res = await pool.query(
        `INSERT INTO habits (user_id, name, embedding)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, name, created_at`,
        [user_id, name, embeddingString]
    );
    return res.rows[0];
}

// En los SELECT no devolvemos la columna embedding para no sobrecargar las respuestas al frontend
async function obtenerHabitsPorUsuario(user_id) {
    const res = await pool.query(
        `SELECT id, user_id, name, created_at
         FROM habits WHERE user_id = $1 ORDER BY created_at DESC`,
        [user_id]
    );
    return res.rows;
}

async function obtenerHabitPorId(id) {
    const res = await pool.query(
        `SELECT id, user_id, name, created_at FROM habits WHERE id = $1`,
        [id]
    );
    return res.rows[0];
}

// Se añade soporte opcional para actualizar el embedding si el usuario edita el nombre del hábito
async function actualizarHabit(id, name, embeddingArray = null) {
    if (embeddingArray) {
        const embeddingString = JSON.stringify(embeddingArray);
        const res = await pool.query(
            `UPDATE habits SET name = $2, embedding = $3 WHERE id = $1
             RETURNING id, user_id, name, created_at`,
            [id, name, embeddingString]
        );
        return res.rows[0];
    } else {
        const res = await pool.query(
            `UPDATE habits SET name = $2 WHERE id = $1
             RETURNING id, user_id, name, created_at`,
            [id, name]
        );
        return res.rows[0];
    }
}

async function eliminarHabit(id) {
    const res = await pool.query(`DELETE FROM habits WHERE id = $1 RETURNING id`, [id]);
    return res.rows[0];
}

module.exports = {
    crearHabit,
    obtenerHabitsPorUsuario,
    obtenerHabitPorId,
    actualizarHabit,
    eliminarHabit,
};