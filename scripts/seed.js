require('dotenv').config();

const pool = require('../src/db');

async function limpiarTablas() {
  await pool.query('TRUNCATE habit_logs, habits, onboarding_profiling, blocks, users RESTART IDENTITY CASCADE');
  console.log('✓ Tablas limpiadas');
}

async function seed() {
  try {
    await limpiarTablas();

    const users = await pool.query(
      `INSERT INTO users (name, email, password, role, subscription_tier) VALUES
        ('Ana García', 'ana@foco.com', 'password123', 'user', 'freemium'),
        ('Luis Pérez', 'luis@foco.com', 'password123', 'user', 'pro'),
        ('María López', 'maria@foco.com', 'password123', 'admin', 'pro')
       RETURNING id, name, email`
    );

    console.log('✓ Usuarios creados:');
    const userIds = {};
    users.rows.forEach((u) => {
      userIds[u.name] = u.id;
      console.log(`   - ${u.name} <${u.email}> (${u.id})`);
    });

    const habits = await pool.query(
      `INSERT INTO habits (user_id, name) VALUES
        ($1, 'Estudiar 2 horas'),
        ($1, 'Leer 30 minutos'),
        ($2, 'Hacer ejercicio'),
        ($2, 'Meditar'),
        ($3, 'Planificar el día')
       RETURNING id, user_id, name`,
      [userIds['Ana García'], userIds['Luis Pérez'], userIds['María López']]
    );

    console.log('✓ Hábitos creados:');
    const habitIds = [];
    habits.rows.forEach((h) => {
      habitIds.push(h.id);
      console.log(`   - ${h.name} (${h.id})`);
    });

    await pool.query(
      `INSERT INTO habit_logs (habit_id, logged_date, is_completed) VALUES
        ($1, CURRENT_DATE - 1, true),
        ($1, CURRENT_DATE - 2, false),
        ($2, CURRENT_DATE - 1, true),
        ($3, CURRENT_DATE, true),
        ($4, CURRENT_DATE - 1, true)
       ON CONFLICT DO NOTHING`,
      [habitIds[0], habitIds[1], habitIds[2], habitIds[3]]
    );
    console.log('✓ Registros de hábitos (habit_logs) creados');

    await pool.query(
      `INSERT INTO onboarding_profiling
        (user_id, study_hours_daily, work_hours_daily, leisure_hours_daily,
         routine_hours_daily, interests, mot_create_habits, mot_avoid_dispersion,
         mot_organization, mot_reduce_fatigue)
       VALUES
        ($1, 6, 0, 2, 8, ARRAY['estudio','programación'], true, true, true, false),
        ($2, 2, 8, 3, 4, ARRAY['ejercicio','lectura'], false, true, true, true),
        ($3, 0, 9, 1, 5, ARRAY['gestión','organización'], true, true, true, true)`,
      [userIds['Ana García'], userIds['Luis Pérez'], userIds['María López']]
    );
    console.log('✓ Onboarding profiling creado');

    await pool.query(
      `INSERT INTO blocks (user_id, type, content) VALUES
        ($1, 'active_objectives', '{"title":"Entregar proyecto","done":false}'),
        ($1, 'inspiration_creativity', '{"title":"Ideas","text":"Repasar apuntes de matemáticas"}'),
        ($2, 'personal_block', '{"title":"Reunión de equipo","done":true}'),
        ($3, 'active_objectives', '{"title":"Revisar reporte","done":false}')`,
       [userIds['Ana García'], userIds['Luis Pérez'], userIds['María López']]
    );
    console.log('✓ Blocks creados');

    console.log('\n✅ Seed completado correctamente.');
  } catch (error) {
    console.error('❌ Error durante el seed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
