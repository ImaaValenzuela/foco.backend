# 🛠️ Estrategia Git y Flujo de Trabajo para Desarrolladores

Este documento define la estrategia de control de versiones y el flujo de desarrollo diario que debe seguir el equipo.

---

## 1. Estrategia de Ramas (Git Flow Simplificado)

Para garantizar la estabilidad en producción y facilitar el trabajo simultáneo de los desarrolladores, utilizaremos un **Git Flow Simplificado**.

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

| Rama | Propósito | Reglas de Integración |
|---|---|---|
| `main` | Código en producción. Debe ser 100% estable. | - Requiere Pull Request (PR) aprobada por al menos 1 desarrollador.<br>- Pruebas automáticas (CI) en verde. |
| `develop` | Rama de integración. Aquí se consolidan todas las features antes de ir a producción. | - Requiere PR aprobada.<br>- Integración continua automática. |

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

## 3. Flujo de Trabajo Diario para el Desarrollador

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
