# Habits

Rutas base: `/api/habits`

## `POST /api/habits` — Crear hábito

**Body:**

```json
{
  "user_id": "uuid",
  "name": "Estudiar 2 horas"
}
```

**Respuestas:**

```json
// 201 Created
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Estudiar 2 horas",
  "created_at": "2026-08-10T06:36:42Z"
}

// 400 Bad Request
{ "error": "user_id y name son requeridos" }
```

## `GET /api/habits/user/:userId` — Listar hábitos de un usuario

```json
// 200 OK
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Estudiar 2 horas",
    "created_at": "2026-08-10T06:36:42Z"
  }
]
```

## `GET /api/habits/:id` — Obtener hábito por id

```json
// 200 OK
{ "id": "uuid", "user_id": "uuid", "name": "...", "created_at": "..." }

// 404 Not Found
{ "error": "Hábito no encontrado" }
```

## `PUT /api/habits/:id` — Renombrar hábito

**Body:**

```json
{ "name": "Nuevo nombre" }
```

**Respuestas:** `200 OK` / `404 Not Found`.

## `DELETE /api/habits/:id` — Eliminar hábito

**Respuestas:** `204 No Content` / `404 Not Found`.

---

Volver a [Home](Home.md)
