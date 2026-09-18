const pool = require('../db');

async function crearHabit(user_id, name, embeddingArray = null) {
    const embeddingString = embeddingArray ? JSON.stringify(embeddingArray) : null;

    const res = await pool.query(
        `INSERT INTO habits (user_id, name, embedding)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, name, created_at`,
        [user_id, name, embeddingString]
    );
    return res.rows[0];
}

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

async function obtenerHabitosSinVector(user_id) {
    const res = await pool.query(
        `SELECT id, name FROM habits WHERE user_id = $1 AND embedding IS NULL`,
        [user_id]
    );
    return res.rows;
}

async function guardarVectorHabito(id, embeddingArray) {
    await pool.query(
        `UPDATE habits SET embedding = $1 WHERE id = $2`,
        [JSON.stringify(embeddingArray), id]
    );
}

module.exports = {
    crearHabit,
    obtenerHabitsPorUsuario,
    obtenerHabitPorId,
    actualizarHabit,
    eliminarHabit,
    obtenerHabitosSinVector,
    guardarVectorHabito
};