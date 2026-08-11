# Habit Logs

Rutas base: `/api/habit-logs`

## `POST /api/habit-logs` — Crear registro de hábito

**Body:**

```json
{
  "habit_id": "uuid",
  "logged_date": "2026-08-09",
  "is_completed": true
}
```

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `habit_id` | uuid | ✅ | |
| `logged_date` | date | ✅ | formato `YYYY-MM-DD` |
| `is_completed` | boolean | ❌ | default `false` |

**Respuestas:**

```json
// 201 Created
{
  "id": "uuid",
  "habit_id": "uuid",
  "logged_date": "2026-08-09",
  "is_completed": true,
  "created_at": "2026-08-10T06:36:42Z"
}

// 400 Bad Request
{ "error": "habit_id y logged_date son requeridos" }
```

## `GET /api/habit-logs/habit/:habitId` — Logs de un hábito

```json
// 200 OK
[
  {
    "id": "uuid",
    "habit_id": "uuid",
    "logged_date": "2026-08-09",
    "is_completed": true,
    "created_at": "2026-08-10T06:36:42Z"
  }
]
```

## `GET /api/habit-logs/:id` — Obtener log por id

```json
// 200 OK
{ "id": "uuid", "habit_id": "uuid", "logged_date": "2026-08-09", "is_completed": true, "created_at": "..." }

// 404 Not Found
{ "error": "Log no encontrado" }
```

## `PUT /api/habit-logs/:id` — Marcar como completado

**Body:**

```json
{ "is_completed": true }
```

**Respuestas:** `200 OK` / `404 Not Found`.

## `DELETE /api/habit-logs/:id` — Eliminar log

**Respuestas:** `204 No Content` / `404 Not Found`.

---

Volver a [Home](Home.md)
