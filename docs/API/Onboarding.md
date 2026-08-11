# Onboarding

Rutas base: `/api/onboarding`

## `POST /api/onboarding` — Crear perfil de onboarding

**Body:**

```json
{
  "user_id": "uuid",
  "study_hours_daily": 6,
  "work_hours_daily": 0,
  "leisure_hours_daily": 2,
  "routine_hours_daily": 8,
  "interests": ["estudio", "programación"],
  "mot_create_habits": true,
  "mot_avoid_dispersion": false,
  "mot_organization": true,
  "mot_reduce_fatigue": true
}
```

| Campo | Tipo | Requerido |
|---|---|---|
| `user_id` | uuid | ✅ |
| `study_hours_daily` | integer | ❌ |
| `work_hours_daily` | integer | ❌ |
| `leisure_hours_daily` | integer | ❌ |
| `routine_hours_daily` | integer | ❌ |
| `interests` | string[] | ❌ |
| `mot_create_habits` | boolean | ❌ |
| `mot_avoid_dispersion` | boolean | ❌ |
| `mot_organization` | boolean | ❌ |
| `mot_reduce_fatigue` | boolean | ❌ |

**Respuestas:**

```json
// 201 Created → devuelve el perfil completo
{
  "id": "uuid",
  "user_id": "uuid",
  "study_hours_daily": 6,
  "work_hours_daily": 0,
  "leisure_hours_daily": 2,
  "routine_hours_daily": 8,
  "interests": ["estudio", "programación"],
  "mot_create_habits": true,
  "mot_avoid_dispersion": false,
  "mot_organization": true,
  "mot_reduce_fatigue": true,
  "completed_at": "2026-08-10T06:36:42Z"
}

// 400 Bad Request
{ "error": "user_id es requerido" }
```

## `GET /api/onboarding/user/:userId` — Perfiles de un usuario

```json
// 200 OK
[ { "id": "uuid", "user_id": "uuid", "...": "..." } ]
```

## `GET /api/onboarding/:id` — Obtener perfil por id

```json
// 200 OK
{ "id": "uuid", "user_id": "uuid", "...": "..." }

// 404 Not Found
{ "error": "Onboarding no encontrado" }
```

## `PUT /api/onboarding/:id` — Actualizar perfil

Acepta cualquiera de los campos del POST (todos opcionales).

**Respuestas:** `200 OK` / `404 Not Found`.

## `DELETE /api/onboarding/:id` — Eliminar perfil

**Respuestas:** `204 No Content` / `404 Not Found`.

---

Volver a [Home](Home.md)
