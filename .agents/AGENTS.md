# Instrucciones de trabajo

Al completar una tarea, responde también con el contenido completo que debe pegarse en `.github/pull_request_template.md`: título Conventional Commit, resumen, tipo de cambio, archivos modificados, pruebas ejecutadas, riesgos, variables de entorno, dependencias entre repositorios y checklist.

Reglas: crear ramas desde `develop`; usar `main` únicamente para producción; no incluir secretos; indicar explícitamente cualquier tarea no ejecutada y dejar los comandos de verificación reproducibles.

Evita agregar comentarios en el código salvo que expliquen una decisión técnica no evidente. Antes de entregar cualquier tarea, ejecuta `npm run lint` y verifica que todo esté correcto; ejecuta también los demás comandos disponibles, como build y tests, e informa cualquier fallo o verificación no ejecutada.
