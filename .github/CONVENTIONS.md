# Convenciones de Commits y Pull Requests

Convención unificada para el ecosistema **FOCO**. Aplica a commits, ramas y pull requests en todos los repositorios.

## Conventional Commits

Formato:

```
<type>(<scope>): <descripción>
```

Ejemplos:

```
feat(api): agregar endpoint de blocks
fix(auth): corregir validación de token
docs(readme): actualizar instrucciones
chore(ci): simplificar workflow de CI
```

### Tipos permitidos

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de errores |
| `docs` | Cambios en documentación |
| `refactor` | Cambios de código sin cambiar comportamiento |
| `test` | Agregar o modificar tests |
| `chore` | Tareas de mantenimiento (CI, deps, config) |
| `style` | Formato, espacios, estilos (no lógicos) |
| `build` | Cambios de build o dependencias |
| `perf` | Mejoras de rendimiento |

### Reglas

- Escribir el mensaje en **inglés** (o el idioma que acuerde el equipo, pero consistente en el repo).
- Usar **verbos en infinitivo** (agregar, corregir, actualizar).
- Título conciso (ideal < 72 caracteres).
- Descripción opcional tras una línea en blanco.

## Nombres de ramas

```
<type>/<descripción-corta>
```

Ejemplos:

```
feat/crear-login
fix/error-conexion-db
docs/actualizar-readme
chore/configurar-ci
```

Tipos válidos: los mismos de commits (`feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `build`).

## Pull Requests

- **Destino por defecto:** `develop`. Solo `release` y `hotfix` van directo a `main`.
- Título de la PR con el mismo formato de commits: `feat(auth): agregar login`.
- Completar el template de PR (`.github/pull_request_template.md`).
- Incluir resumen, tipo de cambio, pasos de prueba y checklist.

## Flujo sugerido

1. Crear rama desde `develop`: `git checkout develop && git checkout -b feat/mi-cambio`
2. Commits con Conventional Commits.
3. `git push -u origin feat/mi-cambio`
4. Abrir PR hacia `develop`.
5. Esperar que el CI pase (workflow `.github/workflows/ci.yml`).
6. Tras aprobación, merge.

## Rebase en vez de merge commits

Para mantener historia limpia, preferir **squash and merge** al integrar PRs.
