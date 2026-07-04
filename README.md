# ⚙️ Mente — Backend API (`mente-backend`)

Este repositorio contiene el servidor de la API RESTful de **Mente**, encargado de las reglas de negocio, seguridad, persistencia de datos, integraciones con IA y la pasarela de pagos.

---

## 🎯 Propósito del Repositorio

- **Seguridad y Auth:** Encriptar credenciales, gestionar tokens de sesión (JWT) y validar roles (User / Admin).
- **Consolidación de Datos:** Persistir la jerarquía P.A.R.A. (Áreas, Proyectos, Bloques, Conexiones) y el Inbox.
- **Servicios Externos:** Integrar el motor de Inteligencia Artificial (OpenAI/Gemini) y procesar pagos vía webhooks (Stripe Sandbox).
- **Panel Administrativo:** Exponer endpoints protegidos para auditoría de usuarios y analíticas globales.

---

## 🛠️ Stack Tecnológico Recomendado (Propuesta)

- **Framework:** **Node.js** con **NestJS** (o Express).
- **Base de Datos:** **PostgreSQL** (alojado en Supabase).
- **ORM:** **Prisma** (migraciones automáticas, tipado estático seguro).
- **Autenticación:** Passport.js + JWT (Access & Refresh tokens).
- **Integraciones:**
  - `stripe` SDK para suscripciones freemium.
  - `@google/generative-ai` o `openai` SDK para el chatbot.

---

## 📂 Estructura del Proyecto (NestJS)

```
mente-backend/
├── prisma/              # Esquema de base de datos (schema.prisma) y migraciones
├── src/
│   ├── auth/            # Módulo de Autenticación y Onboarding
│   ├── users/           # ABM de usuarios y perfiles
│   ├── blocks/          # Lógica de bloques del Canvas, Inbox y Conexiones
│   ├── habits/          # Habit Tracker e historial logs
│   ├── ai/              # Integración con el chatbot personalizado
│   ├── payments/        # Integración con Stripe (checkout y webhooks)
│   ├── admin/           # Dashboard administrativo y KPIs
│   └── app.module.ts    # Módulo raíz de la aplicación
├── docs/                # Enlace a documentación del sub-proyecto
└── README.md            # Este archivo
```

---

## ⚙️ Variables de Envío (.env)

Crea un archivo `.env` en la raíz del backend:

```env
PORT=4000
DATABASE_URL="postgresql://user:password@localhost:5432/mente?schema=public"

# Auth
JWT_SECRET="tu_firma_jwt_secreta_super_segura"
JWT_EXPIRATION="15m"
JWT_REFRESH_SECRET="otra_firma_secreta_para_refresh"
JWT_REFRESH_EXPIRATION="7d"

# Stripe Sandbox
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Chatbot AI
AI_PROVIDER="openai" # "openai" o "gemini"
OPENAI_API_KEY="sk-proj-..."
GEMINI_API_KEY="AIzaSy..."
```

---

## 🚀 Inicio Rápido (Local)

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   # Llena los campos correspondientes
   ```

3. **Ejecutar migraciones de base de datos (Prisma):**
   ```bash
   npx prisma migrate dev --name init
   ```

4. **Correr en modo desarrollo:**
   ```bash
   npm run start:dev
   ```
   La API estará activa en `http://localhost:4000/api`.

5. **Pruebas unitarias e integración:**
   ```bash
   npm run test
   npm run test:e2e
   ```

---

## 📑 Documentación Relacionada

Para entender el modelo relacional, las validaciones de negocio y el backend:
- [Modelo de Datos y Tablas SQL](./docs/04-modelo-de-datos.md)
- [Arquitectura Técnica Completa](./docs/02-arquitectura-tecnica.md)
- [Requisitos del Proyecto y Endpoints](./docs/06-requisitos-del-proyecto.md)
- [Estrategia Git y Configuración de GitHub](./docs/07-devops-y-git.md)
