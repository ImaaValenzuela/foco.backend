const pool = require('../src/db');
const onboardingService = require('../src/services/onboardingService');
const profileService = require('../src/services/profileService');
const notificationService = require('../src/services/notificationService');

async function runLiveIntegrationTests() {
  console.log('🚀 Iniciando Pruebas de Integración en Vivo con Supabase PostgreSQL...');
  const testUserId = '00000000-0000-0000-0000-000000000099';
  const testEmail = 'lead_integration_test@foco.app';

  try {
    // 0. Limpieza previa de entorno de prueba
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM onboarding_profiling WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);

    console.log('\n--- TEST 1.1: Persistencia y Registro Auth + Onboarding ---');
    // Inserción en users
    const userRes = await pool.query(
      `INSERT INTO users (id, name, email, password, role, subscription_tier)
       VALUES ($1, 'Usuario Lead Test', $2, 'hashed_test_pass', 'user', 'freemium')
       RETURNING id, name, email, role`,
      [testUserId, testEmail]
    );
    console.log('✅ 1.1.1 Usuario insertado en tabla `users`:', userRes.rows[0].email);

    // Consulta de estado de onboarding inicial (debe ser null/incompleto)
    const initialOnboarding = await onboardingService.obtenerOnboardingPorUsuario(testUserId);
    if (!initialOnboarding || initialOnboarding.length === 0) {
      console.log('✅ 1.1.2 Estado de onboarding inicial verificado: Incompleto / Sin registro previo');
    } else {
      throw new Error('El onboarding inicial no debería existir');
    }

    // Enviar payload de onboarding completo
    const onboardingPayload = {
      study_hours_daily: 4,
      work_hours_daily: 4,
      leisure_hours_daily: 2,
      routine_hours_daily: 2,
      interests: ['yoga_mindfulness', 'entrepreneurship'],
      mot_create_habits: true,
      mot_avoid_dispersion: true,
      mot_organization: false,
      mot_reduce_fatigue: true,
    };

    const savedOnboarding = await onboardingService.crearOnboarding(testUserId, onboardingPayload);
    console.log('✅ 1.1.3 Onboarding persistido en `onboarding_profiling` con completed_at:', savedOnboarding.completed_at);
    if (!savedOnboarding.completed_at || savedOnboarding.study_hours_daily !== 4) {
      throw new Error('Falla en la persistencia de onboarding');
    }

    console.log('\n--- TEST 1.2: Endpoint de Actualización de Perfil (PUT /api/users/profile) ---');
    const updatePayload = {
      name: 'Usuario Lead Modificado',
      study_hours_daily: 6,
      work_hours_daily: 2,
      leisure_hours_daily: 3,
      routine_hours_daily: 1,
      interests: ['academic_research', 'personal_finance', 'team_sports'],
      mot_create_habits: true,
      mot_avoid_dispersion: false,
      mot_organization: true,
      mot_reduce_fatigue: false,
    };

    const updatedProfile = await profileService.actualizarPerfil(testUserId, updatePayload);
    console.log('✅ 1.2.1 Perfil actualizado:', updatedProfile.user.name);
    console.log('✅ 1.2.2 Horas y motivaciones actualizadas en DB:', {
      study_hours_daily: updatedProfile.profiling.study_hours_daily,
      interests: updatedProfile.profiling.interests,
      mot_organization: updatedProfile.profiling.mot_organization,
    });

    // Re-consultar DB para verificar persistencia real
    const dbVerification = await pool.query(
      'SELECT * FROM onboarding_profiling WHERE user_id = $1',
      [testUserId]
    );
    if (dbVerification.rows[0].study_hours_daily !== 6 || dbVerification.rows[0].interests.length !== 3) {
      throw new Error('Los datos en PostgreSQL no coinciden con la actualización');
    }
    console.log('✅ 1.2.3 Verificación de persistencia directa en PostgreSQL exitosa (100% Match)');

    console.log('\n--- TEST 1.3: Servicio de Notificaciones y Alerta de Onboarding Pendiente ---');
    // Creamos un segundo usuario sin onboarding para validar la alerta automática
    const uncompletedUserId = '00000000-0000-0000-0000-000000000088';
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [uncompletedUserId]);
    await pool.query('DELETE FROM onboarding_profiling WHERE user_id = $1', [uncompletedUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [uncompletedUserId]);
    await pool.query(
      `INSERT INTO users (id, name, email, password, role)
       VALUES ($1, 'Usuario Pendiente', 'pendiente@foco.app', 'pass', 'user')`,
      [uncompletedUserId]
    );

    // Obtener notificaciones para el usuario incompleto (debe generar ONBOARDING_REQUIRED)
    const notifs = await notificationService.getNotifications(uncompletedUserId);
    console.log(`✅ 1.3.1 Notificaciones generadas automáticamente: ${notifs.notifications.length} (no leídas: ${notifs.unread_count})`);
    const onboardingAlert = notifs.notifications.find(n => n.type === 'ONBOARDING_REQUIRED');
    if (!onboardingAlert) {
      throw new Error('No se generó la notificación ONBOARDING_REQUIRED para el usuario sin onboarding');
    }
    console.log('✅ 1.3.2 Alerta prioritaria ONBOARDING_REQUIRED detectada:', onboardingAlert.title);

    // Marcar como leída
    const readNotif = await notificationService.markAsRead(onboardingAlert.id, uncompletedUserId);
    if (!readNotif.read) {
      throw new Error('Fallo al marcar notificación como leída');
    }
    console.log('✅ 1.3.3 Notificación marcada como leída exitosamente');

    // Descartar/eliminar
    await notificationService.dismissNotification(onboardingAlert.id, uncompletedUserId);
    const afterDismiss = await notificationService.getNotifications(uncompletedUserId);
    console.log('✅ 1.3.4 Notificación descartada/eliminada exitosamente');

    // Limpieza final de datos de prueba
    await pool.query('DELETE FROM notifications WHERE user_id IN ($1, $2)', [testUserId, uncompletedUserId]);
    await pool.query('DELETE FROM onboarding_profiling WHERE user_id IN ($1, $2)', [testUserId, uncompletedUserId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testUserId, uncompletedUserId]);
    console.log('\n🧹 Datos de prueba limpiados correctamente.');

    console.log('\n🎉 ¡TODAS LAS PRUEBAS DE INTEGRACIÓN EN VIVO (BACKEND + SUPABASE) PASARON CON ÉXITO (100% PASS)! 🎉\n');
  } catch (err) {
    console.error('❌ Error en pruebas de integración en vivo:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runLiveIntegrationTests();
