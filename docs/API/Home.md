# API FOCO - Documentación

Bienvenido a la documentación de la API de **FOCO**. Backend RESTful que consulta datos desde **PostgreSQL (Supabase)**.

## Información general

- **Base URL:** `http://localhost:4000` (producción: tu dominio)
- **Formato:** JSON — `Content-Type: application/json`
- **CORS:** el frontend debe estar en `CORS_ORIGINS` del backend, si no las peticiones fallan con `403`.
- Todos los IDs son **UUID**.

## Páginas

- [Health](Health.md)
- [Users](Users.md)
- [Habits](Habits.md)
- [Habit Logs](Habit-Logs.md)
- [Blocks](Blocks.md)
- [Onboarding](Onboarding.md)

## Resumen de rutas

| Recurso | POST (crear) | GET (uno) | GET (lista) | PUT (actualizar) | DELETE (eliminar) |
|---|---|---|---|---|---|
| [Users](Users.md) | `/api/users` | `/api/users/:id` | `/api/users` | `/api/users/:id` | `/api/users/:id` |
| [Habits](Habits.md) | `/api/habits` | `/api/habits/:id` | `/api/habits/user/:userId` | `/api/habits/:id` | `/api/habits/:id` |
| [Habit Logs](Habit-Logs.md) | `/api/habit-logs` | `/api/habit-logs/:id` | `/api/habit-logs/habit/:habitId` | `/api/habit-logs/:id` | `/api/habit-logs/:id` |
| [Blocks](Blocks.md) | `/api/blocks` | `/api/blocks/:id` | `/api/blocks/user/:userId` | `/api/blocks/:id` | `/api/blocks/:id` |
| [Onboarding](Onboarding.md) | `/api/onboarding` | `/api/onboarding/:id` | `/api/onboarding/user/:userId` | `/api/onboarding/:id` | `/api/onboarding/:id` |

## Ejemplo de consumo con fetch

```js
const res = await fetch('http://localhost:4000/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Ana', email: 'ana@foco.com', password: '123' })
});
const data = await res.json(); // 201 → usuario creado
```

## Notas generales

- Todos los errores devuelven `{ "error": "mensaje" }`.
- Los errores de la base de datos (p. ej. `type` inválido en blocks, `subscription_tier` inválido) caen en un `500` genérico `{ "error": "Error interno del servidor" }` o `{ "error": "Error interno al crear..." }`.
