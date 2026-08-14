## 🚀 Release a Producción (`develop` ➔ `main`)

### 📝 Resumen del Release
<!-- Resumen ejecutivo del valor o grupo de cambios que se van a desplegar en producción -->

---

## ❓ ¿Por qué enviamos a Producción?
<!-- Explica el motivo de este pase a producción (ej. cierre de sprint, entrega del MVP, solución crítica a bug en prod, etc.) -->

---

## 📦 Contenido acumulado en `develop` (Changelog)
<!-- Enumera lo que se incluye en este despliegue acumulado -->

### ✨ Nuevas Funcionalidades (`feat`)
- 

### 🐛 Correcciones de Errores (`fix`)
- 

### ⚙️ Tareas y Refactorizaciones (`chore` / `refactor` / `docs`)
- 

---

## 🎯 Rama Destino
- [x] `main`

---

## 🧪 Estado de QA y Pruebas en `develop`

- [ ] Todo el código acumulado en `develop` fue verificado en entorno de staging / QA.
- [ ] La suite de pruebas pasadas al 100%.
- [ ] Sin bugs bloqueantes abiertos.

---

## ⚠️ Evaluación de Riesgos y Migraciones
- **Requiere migraciones de DB (Prisma):** [ ] Sí  [ ] No
- **Variables de entorno nuevas en producción:** [ ] Sí  [ ] No
- **Plan de Rollback / Contingencia:** 

---

## 📋 Lista de Verificación Pre-Despliegue

- [ ] La PR se origina desde `develop` con destino a `main`.
- [ ] Se revisaron y aprobaron las PRs individuales que integraron `develop`.
- [ ] Se verificó la build de producción (`npm run build` / migraciones).
