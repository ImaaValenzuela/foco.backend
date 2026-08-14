# 🗄️ Modelo de Datos (Base de Datos Relacional)

## 1. Motor de Base de Datos

- **Motor:** PostgreSQL
- **Proveedor:** Supabase (capa gratuita, compatible nativo con PostgreSQL)
- **ORM:** Prisma (TypeScript-safe, migraciones automáticas)

---

## 2. Jerarquía de Entidades

```
👤 USERS (Usuarios)
 └── 📄 AREAS (Roles a largo plazo — ej: Académico, Salud)
      └── 🎯 PROJECTS (Metas con fin y countdown)
           ├── 📝 NOTES (Contenido propio, resúmenes)   ◄──┐ (Relación visual
           ├── 🔗 REFERENCES (Links, PDFs, fuentes)     ◄──┘  por flechas)
           └── ✅ TASKS (Checklists con fechas)

 └── 📦 BLOCKS (Entidad genérica para Inbox — inbox: true)
      └── (Al arrastrar → se convierte en NOTE, REFERENCE o TASK con project_id)

 └── 🔁 HABITS (Hábitos con historial diario)
      └── 📊 HABIT_LOGS (Registro de completitud por día)

 └── 💬 CHAT_MESSAGES (Historial del chatbot por usuario)

 └── 💳 SUBSCRIPTIONS (Plan Free / Pro, estado, fecha renovación)
```

---

## 3. Esquema Detallado de Tablas

### 3.1 `users`

```sql
CREATE TABLE users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255)  UNIQUE NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  full_name     VARCHAR(255),
  avatar_url    VARCHAR(500),
  role          VARCHAR(20)   DEFAULT 'user', -- 'user' | 'admin'
  is_active     BOOLEAN       DEFAULT true,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);
```

### 3.2 `onboarding_profiles`

Almacena los datos del formulario de diagnóstico inicial (alimenta la IA).

```sql
CREATE TABLE onboarding_profiles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Eje Rutina
  study_hours     SMALLINT,                    -- Horas de estudio diarias
  leisure_hours   SMALLINT,                    -- Horas de ocio diarias
  sleep_hours     SMALLINT,                    -- Horas de sueño diarias
  -- Eje Intereses
  interests       TEXT[],                      -- Array de tags: ['tecnología', 'música', 'running']
  -- Eje Motivaciones
  motivation_text TEXT,                        -- Texto libre del usuario
  goals           TEXT[],                      -- Array de objetivos: ['aprobar facultad', 'emprender']
  -- Metadata
  completed_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 `areas`

Los "Roles a Largo Plazo" del método P.A.R.A. (Áreas de Vida).

```sql
CREATE TABLE areas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,   -- 'Académico', 'Salud y Gimnasio', 'Finanzas'
  icon        VARCHAR(50),             -- Emoji o nombre de ícono
  color       VARCHAR(20),             -- Color del bloque en el canvas (#HEX)
  position_x  FLOAT       DEFAULT 0,   -- Posición en el canvas
  position_y  FLOAT       DEFAULT 0,
  is_archived BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 `projects`

Metas con fecha límite. Hijos de un `area`.

```sql
CREATE TABLE projects (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id      UUID        REFERENCES areas(id) ON DELETE SET NULL,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  color        VARCHAR(20),
  icon         VARCHAR(50),
  status       VARCHAR(20)  DEFAULT 'active',  -- 'active' | 'completed' | 'archived'
  due_date     DATE,                           -- Para el widget Countdown
  position_x   FLOAT        DEFAULT 0,
  position_y   FLOAT        DEFAULT 0,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);
```

### 3.5 `blocks` (Entidad Genérica — Inbox)

Cualquier elemento nuevo se crea inicialfoco como un bloque de Inbox.

```sql
CREATE TABLE blocks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES projects(id) ON DELETE SET NULL,
  type        VARCHAR(20) NOT NULL,   -- 'note' | 'task_list' | 'reference' | 'habit_tracker' | 'pomodoro'
  title       VARCHAR(255),
  content     JSONB,                  -- Contenido flexible según el tipo
  inbox       BOOLEAN     DEFAULT true,  -- TRUE = sin clasificar, FALSE = asignado a proyecto
  position_x  FLOAT       DEFAULT 0,
  position_y  FLOAT       DEFAULT 0,
  width       FLOAT       DEFAULT 300,
  height      FLOAT       DEFAULT 200,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

> **Nota:** El campo `content` es JSONB flexible para soportar distintos tipos de bloque sin múltiples tablas. Alternativafoco, se pueden crear tablas separadas `notes`, `task_lists`, `references` con FK a `blocks`.

#### Estructura del campo `content` por tipo de bloque:

```json
// type: 'note'
{
  "markdown": "# Mi nota\nContenido con **negrita** y ==resaltado==",
  "highlights": ["frase clave 1", "frase clave 2"]
}

// type: 'task_list'
{
  "tasks": [
    { "id": "uuid", "text": "Estudiar capítulo 3", "done": false, "due_date": "2026-08-15", "priority": "high" },
    { "id": "uuid", "text": "Entregar TP", "done": true, "due_date": null, "priority": "medium" }
  ],
  "due_date": "2026-09-01"
}

// type: 'reference'
{
  "url": "https://youtube.com/watch?v=...",
  "title": "Cómo tomar notas efectivas",
  "description": "Video de 15 minutos explicando el método Cornell",
  "thumbnail_url": "https://img.youtube.com/vi/.../maxresdefault.jpg",
  "author": "Ali Abdaal",
  "favicon_url": "https://youtube.com/favicon.ico"
}
```

### 3.6 `block_connections`

Relaciones visuales entre bloques (los "conectores de flechas").

```sql
CREATE TABLE block_connections (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_block_id UUID       NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  target_block_id UUID       NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  label          VARCHAR(100),  -- Etiqueta opcional en la flecha
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.7 `habits`

Definición de un hábito del usuario.

```sql
CREATE TABLE habits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES projects(id) ON DELETE SET NULL,  -- Hábito asociado a un proyecto/área
  name        VARCHAR(100) NOT NULL,  -- 'Meditar', 'Ejercicio', 'Leer 30 min'
  icon        VARCHAR(50),
  color       VARCHAR(20),
  frequency   VARCHAR(20) DEFAULT 'daily',   -- 'daily' | 'weekly' | 'custom'
  target_days INTEGER[]  DEFAULT '{1,2,3,4,5,6,7}',  -- Días de la semana (1=Lunes...7=Domingo)
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.8 `habit_logs`

Registro histórico de completitud de hábitos.

```sql
CREATE TABLE habit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id    UUID        NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_on DATE       NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(habit_id, completed_on)
);
```

### 3.9 `recurring_tasks`

Automatización de tareas recurrentes.

```sql
CREATE TABLE recurring_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES projects(id) ON DELETE SET NULL,
  title       VARCHAR(255) NOT NULL,
  frequency   VARCHAR(20) NOT NULL,  -- 'daily' | 'weekly' | 'monthly'
  day_of_week SMALLINT,              -- 0=Dom...6=Sab (para weekly)
  time_of_day TIME,                  -- Hora para la notificación
  is_active   BOOLEAN     DEFAULT true,
  last_run_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.10 `chat_messages`

Historial del chatbot de IA por usuario.

```sql
CREATE TABLE chat_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL,  -- 'user' | 'assistant'
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.11 `subscriptions`

Gestión del modelo Freemium.

```sql
CREATE TABLE subscriptions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan                 VARCHAR(20) DEFAULT 'free',  -- 'free' | 'pro'
  status               VARCHAR(20) DEFAULT 'active', -- 'active' | 'cancelled' | 'past_due'
  stripe_customer_id   VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Diagrama Entidad-Relación (Simplificado)

```
┌─────────┐     1:1      ┌───────────────────┐
│  users  │──────────────│ onboarding_profiles│
└────┬────┘              └───────────────────┘
     │
     │  1:N       ┌──────────┐  1:N  ┌──────────┐
     ├────────────│  areas   │───────│ projects │
     │            └──────────┘       └─────┬────┘
     │                                     │
     │  1:N                           1:N  │
     ├────────────────────────────────┬────┴──────┐
     │                                │           │
     │                           ┌────▼────┐  ┌──▼──────────┐
     │                           │ blocks  │  │    tasks    │
     │                           └────┬────┘  └─────────────┘
     │                                │
     │                           block_connections
     │                          (source_id → target_id)
     │
     │  1:N       ┌──────────┐  1:N  ┌────────────┐
     ├────────────│  habits  │───────│ habit_logs │
     │            └──────────┘       └────────────┘
     │
     │  1:1       ┌───────────────┐
     └────────────│ subscriptions │
                  └───────────────┘
```

---

## 5. Lógica de Negocio Clave: El Estado `inbox`

```
Nuevo elemento creado
        │
        ▼
  block.inbox = true
  block.project_id = NULL
  (aparece en el Inbox lateral)
        │
        │  Usuario arrastra al canvas de un proyecto
        ▼
  block.inbox = false
  block.project_id = <id_del_proyecto>
  block.position_x = <posición_en_canvas>
  block.position_y = <posición_en_canvas>
  (desaparece del Inbox, aparece en el workspace)
```

---

## 6. Límites del Plan Free (Aplicados en Backend)

| Recurso | Límite Free | Límite Pro |
|---|---|---|
| Tableros / Proyectos activos | 3 | Ilimitados |
| Bloques totales | 100 | Ilimitados |
| Almacenamiento de archivos | 5 MB | Ilimitado |
| Conectores de flechas | 10 | Ilimitados |
| Habit Trackers | 3 | Ilimitados |
| Historial del chat IA | 50 mensajes | Ilimitado |

> Estos límites se validan en el backend antes de cada operación de creación. Si el usuario supera el límite, se devuelve un error `402 Payment Required` con información del plan Pro.
