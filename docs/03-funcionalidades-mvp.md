# 🚀 Funcionalidades del MVP

## 1. Visión General del Producto

La interfaz de FOCO está organizada en **vistas anidadas** que respetan la jerarquía del método P.A.R.A.:

```
Panel General (Vista de Ojo de Halcón)
└── Áreas de Vida (doble clic)
    └── Sub-tableros (ej: Académico, Salud, Finanzas)
        └── Proyectos Activos (doble clic)
            └── Lienzo de Proyecto (The Workspace)
                ├── Bloques de Tareas
                ├── Bloques de Notas
                ├── Bloques de Referencias
                └── Conectores Visuales (Flechas)
```

---

## 2. Sistema de Login con Onboarding Activo

### Registro / Login
- Formulario de registro estándar (email + contraseña)
- Login con validación JWT
- Opción de login con Google (OAuth 2.0 — nice to have)

### Onboarding Obligatorio (Post-registro)
Al registrarse por primera vez, el usuario completa un formulario de diagnóstico de **3 ejes clave**:

| Eje | Descripción | Ejemplo |
|---|---|---|
| **Rutina** | Tiempo dedicado al estudio, ocio y actividades diarias | "Estudio 4 horas, duermo 7 horas" |
| **Intereses** | Rubros, hobbies y ámbitos de desarrollo | "Tecnología, música, running" |
| **Motivaciones** | Qué impulsa al usuario a organizarse mejor | "Quiero aprobar la facultad sin estrés" |

> **Importante:** Estos datos se persisten en la base de datos y se usan para alimentar al chatbot de IA y generar métricas de engagement.

### ABM de Usuario (Gestión de Cuenta)
- ✅ Crear perfil (registro)
- ✅ Modificar datos de onboarding (desde settings)
- ✅ Eliminar cuenta (con confirmación)

---

## 3. El Panel General — "Vista de Ojo de Halcón"

Pantalla de inicio de la aplicación. Un lienzo limpio que representa la vida entera del usuario dividida en los **4 pilares del método P.A.R.A.**:

### Tarjetas Raíz (Contenedores P.A.R.A.)

| Bloque | Icono | Descripción |
|---|---|---|
| **Proyectos Activos** | 🎯 | Metas con fecha límite y countdown activo |
| **Áreas de Vida** | 🏠 | Roles permanentes (Académico, Salud, Finanzas, etc.) |
| **Recursos / Inspiración** | 💡 | Referencias, links y materiales de apoyo |
| **Archivo** | 🗂️ | Proyectos completados o áreas pausadas |

### Comportamiento
- Doble clic en **Áreas de Vida** → abre un sub-lienzo con las carpetas de roles del usuario
- Doble clic en cualquier proyecto → abre el **Lienzo de Proyecto (Workspace)**
- Los bloques son **arrastrables** dentro del panel para reorganizarlos

---

## 4. Widget Brain Dump & Inbox Lateral

### Propósito
Resolver la fricción de "¿dónde guardo esto rápido para no olvidarlo?".

### Componentes

#### Barra Lateral de Inbox
- Pestaña **colapsable** accesible desde **cualquier vista** de la app (siempre visible en el layout)
- Botón de apertura rápida con atajo de teclado (sugerido: `Alt + I`)

#### El Botón de Vaciado (Brain Dump)
- Input de texto grande sin campos obligatorios
- Acepta: texto libre, links pegados, imágenes, PDFs
- Al guardar → la tarjeta cae como **"tarjeta cruda"** en el Inbox con `inbox: true`
- **No pide** carpeta, etiqueta ni fecha → cero fricción

#### Clasificación por Drag & Drop
- El usuario arrastra una tarjeta del Inbox hacia cualquier tablero del panel central
- La app detecta el destino y actualiza en la base de datos:
  - `inbox: false`
  - `project_id: <id-del-proyecto-destino>`

---

## 5. Lienzo de Proyecto Inteligente (The Workspace)

El corazón de la aplicación. Un **canvas infinito** donde conviven 4 tipos de bloques elementales.

### 5.1 Bloque Tarea (Checklist)

| Propiedad | Descripción |
|---|---|
| Items con checkbox | Tareas individuales marcables |
| Fecha límite | Date picker opcional por tarea |
| Prioridad | Etiqueta visual (Alta / Media / Baja) |
| Widget Countdown | Si el proyecto tiene fecha, muestra "Faltan X días" |

### 5.2 Bloque Nota

| Propiedad | Descripción |
|---|---|
| Editor de texto enriquecido | Markdown básico (negrita, cursiva, listas, encabezados) |
| Resumen Progresivo | Resaltar texto en negrita o color amarillo para lectura rápida futura |
| Expansible | El bloque crece con el contenido o tiene scroll interno |

### 5.3 Bloque Referencia (Web Embed)

| Propiedad | Descripción |
|---|---|
| Input de URL | El usuario pega un link |
| Preview automático | La app genera una tarjeta con título, miniatura y autor (Open Graph) |
| Tipos soportados | YouTube, hilos de X, artículos, apuntes de facultad (PDF) |
| Fallback | Si no hay preview, muestra el link con ícono de enlace |

### 5.4 Conectores Visuales (Flechas)

- El usuario hace **clic en el borde** de un bloque y **estira una flecha** hasta otro bloque
- Vincula visualfoco reflexiones con sus fuentes de origen
- Las relaciones se persisten en la base de datos como vínculos entre entidades

---

## 6. Bloques Especializados

### 6.1 Habit Tracker (Widget de Hábitos)

- Bloque **arrastrable** que el usuario puede colocar en cualquier lienzo (ej: lienzo de Salud)
- Cuadrícula **semanal** con mini-botones de check por día
- Al completar hábitos → la tarjeta se pinta con un **gradiente de color según la racha (streak)**
- Visualización: vista semanal y vista mensual (heatmap)
- Hábitos configurables por el usuario (nombre, frecuencia, ícono)

### 6.2 Automatización de Rutinas (Tareas Recurrentes)

- Configuración para que ciertas tareas del checklist vuelvan a aparecer automáticafoco
- Ejemplos:
  - "Revisar y vaciar el Inbox" — todos los días a las 20:00
  - "Planificar la semana" — cada domingo
- Parámetros: frecuencia (diaria / semanal / mensual), día y hora

---

## 7. Reloj Pomodoro

- Widget **arrastrable** integreable en cualquier lienzo de proyecto
- Funcionalidad:
  - Timer configurable (default: 25 min trabajo / 5 min descanso)
  - Notificación visual y sonora al finalizar cada intervalo
  - Contador de sesiones completadas
- Modo pantalla completa opcional para bloquear distracciones

---

## 8. Buscador Global "Buscador de Consciencia"

### Atajo Global: `Ctrl + K`

- Abre un **modal flotante** ultra rápido (estilo Spotlight / Command Palette)
- Busca en tiempo real dentro de:
  - Títulos de bloques y tarjetas
  - Contenido de notas
  - URLs de referencias
  - Nombres de proyectos y áreas
- Resultados agrupados por tipo de entidad
- Al hacer clic → navega directafoco a la vista correspondiente

### Módulo de Archivo

- Las tarjetas de proyectos terminados o áreas en desuso se **arrastran al contenedor Archivo**
- Salen de la vista diaria → no generan fatiga mental
- Siguen **indexadas por el buscador global** → recuperables en cualquier momento

---

## 9. Chatbot de IA Personalizado

### Personalización Basada en Perfil
El chatbot consume:
- Datos del **onboarding** (rutina, intereses, motivaciones)
- **Historial de hábitos** (racha, consistencia, caídas)
- **Proyectos activos** (nombre, fecha límite, tareas pendientes)

### Capacidades

| Feature | Descripción |
|---|---|
| **Recomendaciones** | Sugerencias personalizadas de organización según el perfil |
| **Resúmenes semanales** | Informe de rendimiento y productividad de la semana |
| **Mensajes motivacionales** | Basados en objetivos y racha de hábitos |
| **Asistencia en canvas** | Ayuda a priorizar tareas o reorganizar proyectos |

### Integración Técnica
- Panel lateral o modal flotante en la app
- API calls al backend → backend orquesta con OpenAI/Gemini API
- Historial de conversación por usuario persistido en DB

---

## 10. Dashboard Admin

Panel de control centralizado para administradores del sistema.

### Funcionalidades

| Sección | Descripción |
|---|---|
| **Gestión de Usuarios** | Listar, buscar, auditar y dar de baja cuentas |
| **Métricas Globales** | KPIs de uso: DAU/MAU, retención, bloques creados, hábitos registrados |
| **Planes y Suscripciones** | Ver estado de plan por usuario (Free / Pro) |
| **Logs de Actividad** | Registro de acciones clave para auditoría |

---

## 11. Pasarela de Pago (Modelo Freemium)

- **Simulación en sandbox** con Stripe (modo test)
- Flujo de upgrade: usuario alcanza límite Free → modal de upgrade → checkout Stripe → activación de plan Pro
- Webhooks de Stripe para actualizar el plan en la DB de forma automática
