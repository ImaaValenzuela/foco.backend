# 📋 Requisitos del Proyecto Académico

> Documento de mapeo entre las funcionalidades del producto **Mente** y los requisitos de la consigna **"Proyector Integrador 2026"** (Fundación Pescar).

---

## 1. Resumen Ejecutivo del Cumplimiento

| Requisito de la Consigna | Feature de Mente | Estado |
|---|---|---|
| Sistema de Login con Registro | Auth completa (email/pass + JWT) | ✅ Planificado |
| Onboarding Activo (diagnóstico) | Formulario 3 ejes (Rutina, Intereses, Motivaciones) | ✅ Planificado |
| ABM de Usuarios | Crear / Editar / Eliminar cuenta desde settings | ✅ Planificado |
| Entidad Principal con CRUD | Canvas con Bloques (notas, tareas, referencias) | ✅ Planificado |
| Herramientas de Fidelización | Pomodoro, Habit Tracker, Chatbot IA | ✅ Planificado |
| Pasarela de Pago (Sandbox) | Stripe modo test, flujo Free → Pro | ✅ Planificado |
| Dashboard Admin | Panel de auditoría, métricas, gestión de usuarios | ✅ Planificado |
| Arquitectura desacoplada | 3 repositorios independientes | ✅ Implementado |
| Base de Datos Relacional | PostgreSQL vía Supabase + Prisma ORM | ✅ Planificado |

---

## 2. Mapeo Detallado por Requisito

### 2.1 Sistema de Login con Onboarding Activo

**Requisito de la consigna:** El registro e inicio de sesión son obligatorios. Al registrarse, el usuario completa un formulario de diagnóstico con tres ejes clave.

**Implementación en Mente:**

```
Flujo de Registro:
1. Usuario accede a app.mente.com
2. Redirigido a /register si no está autenticado
3. Completa: email + contraseña + nombre
4. Backend crea registro en tabla `users`
5. JWT emitido, redirigido a /onboarding

Flujo de Onboarding (obligatorio, 1 sola vez):
1. Paso 1: Eje Rutina → horas de estudio, ocio, sueño
2. Paso 2: Eje Intereses → tags seleccionables + texto libre
3. Paso 3: Eje Motivaciones → objetivos en texto libre
4. Backend persiste en tabla `onboarding_profiles`
5. Redirigido al Dashboard (app principal)

Uso de los datos:
- Alimentan el prompt del Chatbot de IA
- Permiten generar métricas de engagement por perfil
- Base para futuras funciones de recomendación
```

**Endpoints involucrados:**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/onboarding`
- `GET  /api/onboarding` (para editar desde settings)

---

### 2.2 ABM de Usuarios

**Requisito de la consigna:** Cada usuario puede crear su perfil, modificar sus datos de onboarding o eliminar su cuenta de forma autónoma.

**Implementación en Mente:**

| Operación | Pantalla | Endpoint |
|---|---|---|
| **Crear** (Alta) | Página de Registro + Onboarding | `POST /api/auth/register` + `POST /api/onboarding` |
| **Leer** (Consulta) | Página de Perfil / Settings | `GET /api/users/me` |
| **Modificar** (Baja) | Settings → "Editar perfil" | `PATCH /api/users/me` + `PATCH /api/onboarding` |
| **Eliminar** (Baja) | Settings → "Eliminar cuenta" + modal de confirmación | `DELETE /api/users/me` |

> **Nota de seguridad:** La eliminación de cuenta dispara una **soft delete** (campo `is_active = false`) para preservar logs de auditoría, con anonimización de datos personales a las 30 días según normativa de privacidad.

---

### 2.3 Entidad Principal con CRUD — El Canvas y sus Bloques

**Requisito de la consigna:** El sistema debe tener una entidad principal que el usuario pueda gestionar completamente.

**Implementación en Mente:**

La entidad principal es el **Canvas con sus Bloques**. Cada bloque es un elemento que el usuario puede:

| Operación | Acción del Usuario | Endpoint |
|---|---|---|
| **Crear** | Clic en "+" o drag desde Inbox | `POST /api/blocks` |
| **Leer** | Visualizar el canvas de un proyecto | `GET /api/projects/:id/blocks` |
| **Modificar** | Editar contenido, mover en canvas, redimensionar | `PATCH /api/blocks/:id` |
| **Eliminar** | Tecla Delete o menú contextual | `DELETE /api/blocks/:id` |

**Entidades secundarias también con CRUD completo:**
- `/api/areas` — Áreas de Vida
- `/api/projects` — Proyectos
- `/api/habits` — Hábitos
- `/api/recurring-tasks` — Tareas Recurrentes

---

### 2.4 Herramientas de Gestión del Tiempo (Features de Fidelización)

**Requisito de la consigna:** El sistema debe incluir herramientas que generen un uso diario de la aplicación.

| Feature | Descripción de Fidelización |
|---|---|
| **Reloj Pomodoro** | El usuario viene a la app para iniciar sesiones de trabajo. Hábito diario de uso. |
| **Habit Tracker** | El usuario viene todos los días a marcar hábitos completados. Gamificación por racha. |
| **Chatbot IA** | Resúmenes semanales automáticos traen al usuario de vuelta cada semana. |
| **Automatización de Rutinas** | Las tareas recurrentes aseguran que el usuario siempre tenga una razón para abrir la app. |

---

### 2.5 Chatbot de IA Personalizado

**Requisito de la consigna:** Asistente inteligente integrado que consume el perfil inicial del usuario y su historial.

**Implementación técnica:**

```
Prompt base del sistema (generado dinámicamente por el backend):

"Eres el asistente personal de {user.full_name}. 
Datos de su perfil:
- Rutina: estudia {study_hours}h, duerme {sleep_hours}h
- Intereses: {interests.join(', ')}
- Motivaciones: {motivation_text}
- Hábitos activos: {habits.map(h => h.name).join(', ')}
- Racha actual de {best_habit}: {streak} días consecutivos
- Proyectos activos: {projects.count} proyectos
- Tareas pendientes esta semana: {pending_tasks.count}

Tu rol es ayudar al usuario a organizarse mejor, mantenerse motivado 
y dar resúmenes claros de su productividad. Responde siempre en español, 
de forma cálida, concisa y accionable."
```

**Capacidades:**
1. **Recomendaciones de organización** — basadas en el perfil y proyectos activos
2. **Resúmenes semanales** — generados automáticamente cada domingo (cron job)
3. **Mensajes motivacionales** — basados en la racha de hábitos y objetivos
4. **Asistencia en tiempo real** — responde preguntas del usuario en el chat

---

### 2.6 Pasarela de Pago (Sandbox)

**Requisito de la consigna:** Simulación de cobro mediante sandbox para desbloquear funciones avanzadas.

**Implementación:**
- **Proveedor:** Stripe (modo sandbox/test)
- **Trigger:** Usuario alcanza límite del plan Free
- **Flujo:** Modal de upgrade → Stripe Checkout → Webhook → activación Pro automática
- **Gestión:** Portal de cliente Stripe para cancelar o actualizar método de pago

**Tarjeta de prueba para demo:** `4242 4242 4242 4242` (Stripe test card)

---

### 2.7 Dashboard Admin

**Requisito de la consigna:** Panel de control para administradores con auditoría y métricas globales.

**Acceso:** Solo usuarios con `role = 'admin'` (protegido por guard en el backend)

**Secciones del Panel Admin:**

```
/admin
├── /users          → Listado de usuarios (búsqueda, filtros, paginación)
│   ├── Ver perfil completo + onboarding data
│   ├── Cambiar estado (activo/inactivo)
│   └── Eliminar cuenta (con confirmación)
│
├── /metrics        → KPIs globales de la plataforma
│   ├── Total usuarios registrados / activos
│   ├── DAU / MAU del último mes
│   ├── Distribución Free vs Pro
│   ├── Bloques creados por día (gráfico de línea)
│   └── Hábitos registrados por día
│
├── /subscriptions  → Estado de suscripciones
│   ├── MRR actual
│   ├── Churn del mes
│   └── Lista de usuarios Pro con estado Stripe
│
└── /logs           → Registro de actividad
    ├── Últimos registros
    ├── Últimas conversiones Free → Pro
    └── Errores de pago recientes
```

---

## 3. Cronograma Estimado del MVP (5 Meses)

| Mes | Sprint | Deliverables Principales |
|---|---|---|
| **Mes 1** | Setup & Auth | Repos inicializados, DB schema, Auth completa (register/login/onboarding) |
| **Mes 2** | Canvas Core | Panel General (PARA blocks), Inbox lateral, Drag & Drop básico |
| **Mes 3** | Workspace | Lienzo de Proyecto, 4 tipos de bloques, Conectores visuales |
| **Mes 4** | Features | Habit Tracker, Pomodoro, Chatbot IA, Búsqueda global (Ctrl+K) |
| **Mes 5** | Monetización & Admin | Stripe sandbox, Dashboard Admin, polish UX, testing E2E, deploy |

---

## 4. Estructura del Equipo (8 Desarrolladores)

| Rol | Cantidad | Responsabilidad |
|---|---|---|
| **Tech Lead / Arquitecto** | 1 | Decisiones técnicas, code review, CI/CD, integración entre repos |
| **Frontend Developers** | 3 | Canvas, Inbox, Habit Tracker, Pomodoro, UI Components |
| **Backend Developers** | 2 | API REST, Auth, modelo de datos, Chatbot IA, Stripe |
| **Full Stack / DevOps** | 1 | Landing page, deploy, variables de entorno, monitoreo |
| **UX/UI Designer + Dev** | 1 | Sistema de diseño, componentes, animaciones, responsive |

---

## 5. Convenciones y Estándares del Proyecto

### Código
- **Lenguaje:** TypeScript en todos los repos (strict mode)
- **Linting:** ESLint + Prettier (config compartida en monorepo o archivo de configuración)
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`)
- **Branches:** `main` (producción), `develop` (integración), `feature/*` (nuevas features)

### Variables de Entorno
Cada repo tiene su propio `.env` y `.env.example` versionado. **Nunca commitear secrets.**

### Testing
- **Backend:** Jest + Supertest (unit + integration tests)
- **Frontend:** Vitest + React Testing Library (component tests)
- **E2E:** Playwright (flujos críticos: registro, onboarding, crear bloque, pago)
