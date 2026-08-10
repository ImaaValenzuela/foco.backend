# Users

Rutas base: `/api/users`

## `POST /api/users` — Crear usuario

**Body:**

```json
{
  "name": "Ana García",
  "email": "ana@foco.com",
  "password": "secret123",
  "role": "user",
  "subscription_tier": "freemium"
}
```

| Campo | Tipo | Requerido | Valores / Default |
|---|---|---|---|
| `name` | string | ✅ | |
| `email` | string | ✅ | |
| `password` | string | ✅ | |
| `role` | string | ❌ | `user` \| `admin` — default `user` |
| `subscription_tier` | string | ❌ | `freemium` \| `pro` — default `freemium` |

**Respuestas:**

```json
// 201 Created
{
  "id": "uuid",
  "name": "Ana García",
  "email": "ana@foco.com",
  "role": "user",
  "subscription_tier": "freemium",
  "created_at": "2026-08-10T06:36:42Z",
  "updated_at": "2026-08-10T06:36:42Z"
}

// 400 Bad Request
{ "error": "name, email y password son requeridos" }

// 409 Conflict (email ya existe)
{ "error": "Ya existe un usuario con ese email" }
```

## `GET /api/users` — Listar todos los usuarios

```json
// 200 OK
[
  {
    "id": "uuid",
    "name": "Ana García",
    "email": "ana@foco.com",
    "role": "user",
    "subscription_tier": "freemium",
    "created_at": "2026-08-10T06:36:42Z",
    "updated_at": "2026-08-10T06:36:42Z"
  }
]
```

## `GET /api/users/:id` — Obtener usuario por id

```json
// 200 OK
{ "id": "uuid", "name": "...", "email": "...", "role": "...", "subscription_tier": "...", "created_at": "...", "updated_at": "..." }

// 404 Not Found
{ "error": "Usuario no encontrado" }
```

## `PUT /api/users/:id` — Actualizar usuario

Actualización parcial (todos los campos opcionales).

**Body:**

```json
{
  "name": "Nuevo nombre",
  "role": "admin",
  "subscription_tier": "pro"
}
```

**Respuestas:** `200 OK` con el usuario actualizado / `404 Not Found`.

## `DELETE /api/users/:id` — Eliminar usuario

**Respuestas:** `204 No Content` (sin body) / `404 Not Found`.

---

Volver a [Home](Home.md)
