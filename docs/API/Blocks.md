# Blocks

Rutas base: `/api/blocks`

> ⚠️ **Importante:** el campo `type` solo acepta estos valores, la base de datos rechaza cualquier otro con error:
> - `active_objectives`
> - `personal_block`
> - `inspiration_creativity`
> - `life_archive`

## `POST /api/blocks` — Crear block

**Body:**

```json
{
  "user_id": "uuid",
  "type": "active_objectives",
  "content": { "title": "Entregar proyecto", "done": false }
}
```

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `user_id` | uuid | ✅ | |
| `type` | string | ✅ | uno de los 4 valores permitidos |
| `content` | json | ❌ | JSON libre — default `{}` |

**Respuestas:**

```json
// 201 Created
{
  "id": "uuid",
  "user_id": "uuid",
  "type": "active_objectives",
  "content": { "title": "Entregar proyecto", "done": false },
  "updated_at": "2026-08-10T06:36:42Z"
}

// 400 Bad Request
{ "error": "user_id y type son requeridos" }
```

## `GET /api/blocks/user/:userId` — Blocks de un usuario

```json
// 200 OK
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "type": "active_objectives",
    "content": {},
    "updated_at": "2026-08-10T06:36:42Z"
  }
]
```

## `GET /api/blocks/:id` — Obtener block por id

```json
// 200 OK
{ "id": "uuid", "user_id": "uuid", "type": "...", "content": {}, "updated_at": "..." }

// 404 Not Found
{ "error": "Block no encontrado" }
```

## `PUT /api/blocks/:id` — Actualizar block

Actualización parcial de `type` y/o `content`.

**Body:**

```json
{
  "type": "life_archive",
  "content": { "title": "Nuevo título" }
}
```

**Respuestas:** `200 OK` / `404 Not Found`.

## `DELETE /api/blocks/:id` — Eliminar block

**Respuestas:** `204 No Content` / `404 Not Found`.

---

Volver a [Home](Home.md)
