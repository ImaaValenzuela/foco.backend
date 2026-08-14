# 🏗️ Arquitectura Técnica

## 1. Visión General de la Arquitectura

El proyecto sigue una **arquitectura desacoplada en 3 repositorios independientes**, cada uno con su propio ciclo de vida, dominio de deployment y responsabilidad técnica.

```
foco/
├── foco.landing/        # Sitio comercial estático (foco.com)
├── foco.frontend/       # Aplicación web interactiva (app.foco.com)
├── foco.admin/          # Panel administrativo (admin.foco.com)
└── foco.backend/        # API RESTful + IA + Pasarela de Pago
```

---

## 2. Repositorios y Responsabilidades

### 2.1 `foco.landing` — Sitio Comercial
- **URL objetivo:** `foco.com`
- **Propósito:** Conversión y SEO. Landing page estática enfocada en captar usuarios nuevos.
- **Stack:** HTML/CSS/JS estático o Next.js (SSG/SSR para SEO)
- **Contenido:** Hero, Features, Precios, FAQ, CTA de registro
- **KPIs:** Tasa de conversión a registro, bounce rate, posicionamiento SEO

### 2.2 `foco.frontend` — Aplicación Web
- **URL objetivo:** `app.foco.com`
- **Propósito:** La experiencia principal del usuario. Canvas interactivo, gestión de bloques, habits.
- **Stack:** **React / Next.js** (App Router recomendado)
- **Características clave:**
  - Lógica de estado compleja para el Canvas (posicionamiento de bloques, drag & drop)
  - Componentes de tiempo (Pomodoro, Habit Tracker)
  - Routing entre vistas (Panel General → Áreas → Proyectos)
  - Integración con el backend vía API REST
- **Librerías sugeridas:**
  - `@atlaskit/pragmatic-drag-and-drop` (Pragmatic Drag and Drop de Atlassian) — El motor ultra performante utilizado en Trello y Jira.
  - `zustand` o `jotai` — Gestión de estado ligera
  - `framer-motion` — Animaciones del canvas y transiciones
  - `react-query` o `SWR` — Fetching y caché de datos del servidor

### 2.3 `foco.admin` — Panel Administrativo
- **URL objetivo:** `admin.foco.com`
- **Propósito:** Panel de control centralizado para los administradores, enfocado en auditoría de usuarios y KPIs del negocio.
- **Stack:** React / Vite (o Next.js) para una SPA administrativa rápida.
- **Características clave:**
  - Consume endpoints `/api/admin/*` protegidos por rol de administrador.
  - Gráficos de analíticas (DAU/MAU, bloques creados, etc.).
  - Búsqueda y gestión de usuarios (bajas, auditoría).

### 2.4 `foco.backend` — API RESTful
- **Propósito:** Validaciones de negocio, seguridad, encriptación, orquestación con IA y pasarela de pago.
- **Stack:** **Node.js con NestJS** (recomendado por su estructura modular y escalabilidad) o Express
- **Responsabilidades:**
  - Autenticación (JWT + refresh tokens)
  - CRUD de entidades (Users, Areas, Projects, Blocks, Habits)
  - Lógica del Canvas (relaciones entre bloques, estado `inbox`)
  - Integración con AI (perfil de usuario → recomendaciones)
  - Integración con pasarela de pago (Stripe o sandbox local)
  - Panel Admin (métricas, auditoría de usuarios)

---

## 3. Stack Tecnológico Consolidado

| Capa | Tecnología | Justificación |
|---|---|---|
| **Frontend** | React + Next.js | Ecosistema maduro, SSR/SSG para SEO en landing, App Router para la app |
| **Backend** | Node.js + NestJS | Modular, TypeScript nativo, fácil testing, ideal para APIs REST escalables |
| **Base de Datos** | PostgreSQL vía **Supabase** | Compatibilidad nativa PostgreSQL, capa gratuita generosa, Auth integrado, realtime opcional |
| **ORM** | Prisma | Type-safe, migraciones automáticas, excelente DX con TypeScript |
| **Autenticación** | JWT (access + refresh) / Supabase Auth | Flexible, seguro, compatible con el modelo de roles |
| **Pasarela de Pago** | Stripe (modo sandbox) | Estándar de la industria, bien documentado, fácil de integrar |
| **IA / Chatbot** | OpenAI API (GPT-4o-mini) o Google Gemini API | Bajo costo por token, fácil de integrar con el perfil de usuario |
| **Hosting** | Vercel (frontend + landing) + Railway/Render (backend) | Capa gratuita suficiente para MVP, CI/CD automático desde GitHub |
| **Control de Versiones** | Git + GitHub (3 repos separados) | Equipos independientes por repositorio |
| **Estilos** | CSS Modules + Tailwind CSS | Velocidad de desarrollo en el frontend |

---

## 4. Diagrama de Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     CLIENTE (Browser)                                       │
│                                                                                             │
│  ┌──────────────────┐      ┌──────────────────────────┐      ┌──────────────────────────┐   │
│  │  foco.landing   │      │     foco.frontend       │      │      foco.admin         │   │
│  │  (foco.com)     │      │    (app.foco.com)       │      │    (admin.foco.com)     │   │
│  │  Next.js SSG     │      │    React + Next.js       │      │       React / Vite       │   │
│  └────────┬─────────┘      └───────────┬──────────────┘      └───────────┬──────────────┘   │
└───────────┼────────────────────────────┼─────────────────────────────────┼──────────────────┘
            │                            │                                 │
            │ (Redirect a registro)      │ (Llamadas REST / JSON)          │ (Llamadas REST Admin)
            │                            ▼                                 ▼
┌───────────┼──────────────────────────────────────────────────┐
│           │              BACKEND (foco.backend)              │
│           │              Node.js + NestJS API                 │
│           │                                                   │
│           │   ┌──────────┐  ┌─────────┐  ┌──────────────┐   │
│           │   │  Auth    │  │  Core   │  │   Admin      │   │
│           └──►│  Module  │  │  API    │  │   Dashboard  │   │
│               └──────────┘  └────┬────┘  └──────────────┘   │
│                                  │                           │
│           ┌──────────────────────┼──────────────────────┐   │
│           │                      │                       │   │
│    ┌──────▼──────┐    ┌──────────▼──────┐   ┌──────────┐│   │
│    │  Supabase   │    │  OpenAI / Gemini │   │  Stripe  ││   │
│    │  PostgreSQL │    │  API (Chatbot)   │   │ (Pagos)  ││   │
│    └─────────────┘    └─────────────────┘   └──────────┘│   │
│                                                          │   │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Flujo de Autenticación

```
Usuario → Registro → Formulario Onboarding (Rutina/Intereses/Motivaciones)
       → Datos persisten en DB → JWT emitido
       → Redirigido a app.foco.com/dashboard

Usuario → Login → Validación → JWT refresh → App
```

---

## 6. Límites del MVP (Out of Scope)

Estas funcionalidades están **explícitafoco fuera del alcance** del MVP v1.0:

- ❌ Sincronización multiusuario en tiempo real simultánea (estilo Figma cooperativo)
- ❌ Aplicaciones móviles nativas (iOS / Android) — se suple con diseño web responsive
- ❌ Exportación a PDF/Markdown del canvas
- ❌ Colaboración entre cuentas (tableros compartidos)

---

## 7. Consideraciones de Seguridad

- Todas las contraseñas hasheadas con **bcrypt** (salt rounds ≥ 12)
- Tokens JWT con **expiración corta** (15 min access / 7 días refresh)
- Variables de entorno gestionadas vía `.env` con validación en arranque (NestJS `@nestjs/config`)
- CORS restringido a los dominios `foco.com` y `app.foco.com`
- Rate limiting en endpoints de autenticación (`@nestjs/throttler`)
- Validación de inputs con `class-validator` en todos los DTOs
