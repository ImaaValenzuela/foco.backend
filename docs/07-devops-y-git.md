# 🛠️ Estrategia Git, Flujo de Trabajo y Configuración de GitHub

Este documento actúa como guía técnica de DevOps para el equipo. Define la estrategia de control de versiones, el flujo de desarrollo y las instrucciones paso a paso para configurar los repositorios en GitHub.

---

## 1. Estrategia de Ramas (Git Flow Simplificado)

Para garantizar la estabilidad en producción y facilitar el trabajo simultáneo de los 8 desarrolladores, utilizaremos un **Git Flow Simplificado**.

```
  main (Producción)     ───────────────────────────────────────► (Despliegue automático)
                                       ▲
                                       │ (Release / PR aprobada)
  develop (Integración) ───────────────┴───┬───────────────────► (Pruebas / QA / Staging)
                                           │
                                ┌──────────┴──────────┐
                                ▼                     ▼
  features              feature/auth          feature/canvas
```

### Ramas Principales

| Rama | Propósito | Reglas de Protección |
|---|---|---|
| `main` | Código en producción. Debe ser 100% estable. | - Bloqueo de push directo.<br>- Requiere Pull Request (PR) aprobada por al menos 1 desarrollador.<br>- Pruebas automáticas (CI) en verde. |
| `develop` | Rama de integración. Aquí se consolidan todas las features antes de ir a producción. | - Bloqueo de push directo.<br>- Requiere PR aprobada.<br>- Integración continua automática. |

### Ramas Temporales

- **`feature/<nombre-de-la-feature>`**: Para el desarrollo de nuevas características (ej: `feature/inbox-sidebar`, `feature/stripe-integration`). Se originan de `develop` y se mezclan de vuelta a `develop` mediante Pull Request.
- **`bugfix/<descripcion>`**: Para corregir errores detectados en la rama `develop`.
- **`hotfix/<descripcion>`**: Correcciones críticas urgentes directo en producción. Se originan de `main` y se mezclan tanto a `main` como a `develop`.

---

## 2. Convención de Commits (Conventional Commits)

Cada commit debe seguir una estructura clara para mantener el historial limpio y legible:

```
<tipo>(<alcance>): <descripción corta en minúsculas>
```

### Tipos permitidos:
- **`feat`**: Una nueva funcionalidad (ej: `feat(canvas): agregar conector de flechas`).
- **`fix`**: Corrección de un error (ej: `fix(auth): corregir expiración de token JWT`).
- **`docs`**: Cambios en la documentación (ej: `docs(readme): actualizar variables de entorno`).
- **`style`**: Cambios estéticos o de formato que no afectan la lógica (ej: `style: formatear con prettier`).
- **`refactor`**: Reestructuración de código sin cambiar funcionalidad (ej: `refactor(db): modularizar consultas`).
- **`test`**: Agregar o corregir pruebas (ej: `test(auth): agregar prueba unitaria de login`).
- **`chore`**: Tareas de mantenimiento, configuración o dependencias (ej: `chore(deps): actualizar stripe sdk`).

---

## 3. Configuración Inicial de Repositorios en GitHub

Dado que trabajamos con **4 repositorios independientes**, debes seguir estos pasos para cada uno de ellos (`mente-landing`, `mente-frontend`, `mente-admin`, `mente-backend`).

### Paso 3.1: Crear los repositorios en GitHub
1. Entra a tu cuenta de GitHub.
2. Haz clic en **New** (Nuevo repositorio).
3. Configura los nombres:
   - `mente-landing`
   - `mente-frontend`
   - `mente-admin`
   - `mente-backend`
4. Selecciónalos como **Públicos** o **Privados** (según políticas del equipo).
5. **IMPORTANTE:** No inicializar con README, `.gitignore` ni Licencia en GitHub (los crearemos localmente).

---

### Paso 3.2: Inicializar y subir localmente

Abre tu terminal y ejecuta los siguientes comandos para subir el esqueleto inicial de cada carpeta:

#### Para la Landing Page:
```bash
cd /home/enltd/Escritorio/Programacion/mente/mente.landing
git init
git checkout -b main
git add .
git commit -m "chore: estructura inicial de landing"
git remote add origin https://github.com/<tu-usuario-o-organizacion>/mente-landing.git
git push -u origin main
```

#### Para el Frontend (App):
```bash
cd /home/enltd/Escritorio/Programacion/mente/mente.frontend
git init
git checkout -b main
git add .
git commit -m "chore: estructura inicial de frontend"
git remote add origin https://github.com/<tu-usuario-o-organizacion>/mente-frontend.git
git push -u origin main
```

#### Para el Admin Dashboard:
```bash
cd /home/enltd/Escritorio/Programacion/mente/mente.admin
git init
git checkout -b main
git add .
git commit -m "chore: estructura inicial de admin"
git remote add origin https://github.com/<tu-usuario-o-organizacion>/mente-admin.git
git push -u origin main
```

#### Para el Backend (API):
```bash
cd /home/enltd/Escritorio/Programacion/mente/mente.backend
git init
git checkout -b main
git add .
git commit -m "chore: estructura inicial de backend"
git remote add origin https://github.com/<tu-usuario-o-organizacion>/mente-backend.git
git push -u origin main
```

---

## 4. Configurar las Reglas de Protección de Ramas (Branch Protection)

Para evitar desastres en producción, configura las siguientes reglas en GitHub para cada uno de los 4 repositorios:

1. Ve a tu repositorio en GitHub → **Settings** (Configuración).
2. En el menú lateral izquierdo, haz clic en **Branches** (Ramas).
3. En la sección **Branch protection rules**, haz clic en **Add branch ruleset** o **Add rule**.
4. En **Branch pattern**, escribe `main`.
5. Activa las siguientes opciones:
   - [x] **Require a pull request before merging** (Requiere una pull request antes de fusionar).
     - Activa: **Require approvals** (Mínimo: `1`).
   - [x] **Require status checks to pass before merging** (Requiere que las pruebas de CI pasen, opcional una vez configurado GitHub Actions).
   - [x] **Block force pushes** (Previene sobreescribir el historial con `push --force`).
6. Haz clic en **Create / Save**.
7. Repite el proceso creando una regla para la rama `develop`.

---

## 5. Configurar Secretos de Entorno (GitHub Secrets)

Para despliegues automáticos (CI/CD) o tests que requieren credenciales, debes agregar las variables sensibles en la sección de secretos de GitHub:

1. Ve al repositorio correspondiente (ej: `mente-backend`) → **Settings** → **Secrets and variables** → **Actions**.
2. Haz clic en **New repository secret**.
3. Añade las siguientes variables según el repositorio:

### En `mente-backend`:
- `DATABASE_URL`: URL de conexión a Supabase PostgreSQL.
- `JWT_SECRET`: Llave secreta para firmar tokens de sesión.
- `STRIPE_SECRET_KEY`: Llave privada del modo sandbox de Stripe.
- `OPENAI_API_KEY` o `GEMINI_API_KEY`: Credenciales para el chatbot interactivo.

---

## 6. Flujo de Trabajo Diario para el Desarrollador

Cuando vayas a trabajar en una nueva tarea (ej: crear el Habit Tracker):

1. **Posicionarse en develop y actualizar:**
   ```bash
   git checkout develop
   git pull origin develop
   ```
2. **Crear rama de feature:**
   ```bash
   git checkout -b feature/habit-tracker
   ```
3. **Desarrollar y commitear cambios:**
   ```bash
   git add .
   git commit -m "feat(habits): crear componente visual tracker semanal"
   ```
4. **Subir rama a GitHub:**
   ```bash
   git push -u origin feature/habit-tracker
   ```
5. **Crear Pull Request (PR):**
   - Ve a GitHub y abre una PR de `feature/habit-tracker` hacia `develop`.
   - Etiqueta a tus compañeros para revisión.
   - Una vez aprobada y con los checks de CI en verde, realiza el merge.
