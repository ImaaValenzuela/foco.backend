# 💳 Modelo de Negocio y Monetización

## 1. Estrategia: Modelo Freemium

Mente adopta el modelo **Freemium con límite de almacenamiento** (no de tiempo), siguiendo el modelo probado de Notion, Evernote y Spotify.

### ¿Por qué Freemium y no Trial de 14 días?

> El límite de almacenamiento es superior al límite de tiempo porque:
> - Al usuario **no le corre un reloj** → usa la app a su ritmo
> - Cuando se da cuenta de que ya tiene **100 notas y toda su vida estructurada**, pagar se vuelve la opción natural para no perder su flujo
> - El **costo de cambio** ("switching cost") crece con el tiempo → la retención es orgánica
> - Elimina la **ansiedad del trial**: el usuario no siente presión artificial

---

## 2. Planes y Precios

### 🟢 Plan Free — "Para captar usuarios"

**Objetivo:** Que sientan el valor del vaciado de cabeza inmediatamente, pero limitar el volumen para empujarlos al plan de pago.

| Característica | Límite |
|---|---|
| **Precio** | $0 — Siempre gratis |
| Tableros / Proyectos activos | Hasta **3** |
| Bloques / Tarjetas totales | Hasta **100** |
| Almacenamiento de archivos (imágenes/PDFs) | Hasta **5 MB** |
| Acceso al Inbox de captura rápida | ✅ Completo |
| Interfaz visual (Canvas) | ✅ Completo |
| Buscador Global (Ctrl + K) | ✅ Completo |
| Habit Tracker básico | ✅ (hasta 3 hábitos) |
| Chatbot IA | ✅ (hasta 50 mensajes) |
| Conectores de flechas | Hasta 10 |
| Tareas recurrentes (automatización) | ❌ No disponible |
| Analíticas avanzadas | ❌ No disponible |

---

### 🔵 Plan Pro — "Para monetizar"

**Target:** Estudiantes avanzados, profesionales y creadores de contenido que ya adoptaron Mente como su centro de control diario.

| Característica | Límite |
|---|---|
| **Precio (Argentina)** | $3.500 a $4.500 ARS + impuestos / mes |
| **Precio (LATAM / Europa)** | $5 a $7 USD o EUR / mes |
| Tableros / Proyectos activos | ♾️ Ilimitados |
| Bloques / Tarjetas | ♾️ Ilimitados |
| Almacenamiento de archivos | ♾️ Ilimitado |
| Habit Tracker gráfico avanzado | ✅ Heatmap + analíticas de racha |
| Automatización de tareas recurrentes | ✅ Sin límite |
| Conectores de flechas | ♾️ Ilimitados |
| Chatbot IA | ♾️ Historial completo + contexto expandido |
| Copias de seguridad automáticas | ✅ Diarias |
| Acceso prioritario a nuevas features | ✅ Early Access |

---

## 3. Análisis de Precio Psicológico

### Argentina 🇦🇷
- **Precio:** ~$3.500 – $4.500 ARS/mes
- **Equivalente:** ~3 – 4 USD al blue (precio accesible para el bolsillo B2C local)
- **Referencia mental:** "Equivale a dos cafés de especialidad al mes"
- **Estrategia:** Precio accesible que no genera fricción de decisión, especialmente en público estudiantil

### Internacional (LATAM / Europa) 🌍
- **Precio:** $5 – $7 USD o EUR / mes
- **Comparativa:** Por debajo del precio de Notion Pro ($10 USD), Evernote Personal ($10.99 USD)
- **Posicionamiento:** Precio diferencial que destaca Mente como la alternativa accesible y visual

---

## 4. Flujo de Conversión Free → Pro

```
Usuario en Plan Free
       │
       │  Acción: Intenta crear el tablero Nº 4
       ▼
┌─────────────────────────────────────────┐
│  Modal de Upgrade                        │
│  "Alcanzaste el límite de 3 tableros"   │
│                                          │
│  [Ver Plan Pro →]  [Quizás luego]        │
└────────────────┬────────────────────────┘
                 │
                 ▼
      Página de Pricing / Checkout
                 │
                 ▼
       Stripe Checkout (Sandbox)
                 │
        Pago exitoso → Webhook
                 │
                 ▼
       Backend: subscription.plan = 'pro'
                 │
                 ▼
    Usuario de vuelta en la app con Plan Pro
    (sin recargar página, actualización en tiempo real)
```

---

## 5. Implementación Técnica del Pago

### Stack de Pagos

| Componente | Tecnología |
|---|---|
| Proveedor de pagos | **Stripe** (modo sandbox para MVP) |
| Integración frontend | `@stripe/react-stripe-js` + `@stripe/stripe-js` |
| Integración backend | `stripe` npm package (Node.js) |
| Webhooks | Endpoint dedicado `/api/payments/webhook` |
| Seguridad webhook | Verificación de firma con `stripe.webhooks.constructEvent()` |

### Endpoints de Pago (Backend)

```
POST /api/payments/create-checkout-session   → Crea sesión de Stripe Checkout
POST /api/payments/webhook                   → Recibe eventos de Stripe
GET  /api/payments/portal                    → Redirige al portal de cliente Stripe (gestionar suscripción)
```

### Eventos de Webhook a Manejar

| Evento Stripe | Acción en DB |
|---|---|
| `checkout.session.completed` | `subscription.plan = 'pro'`, guardar IDs de Stripe |
| `customer.subscription.deleted` | `subscription.plan = 'free'`, `status = 'cancelled'` |
| `invoice.payment_failed` | `subscription.status = 'past_due'`, notificar al usuario |
| `customer.subscription.updated` | Actualizar `current_period_end` |

---

## 6. Métricas de Negocio a Trackear (KPIs)

### Métricas de Adquisición
- Nuevos registros por semana / mes
- Tasa de conversión Landing → Registro
- Fuente de tráfico (orgánico, referido, directo)

### Métricas de Activación
- % de usuarios que completan el onboarding
- % de usuarios que crean su primer bloque en las primeras 24h
- Tiempo hasta la primera acción valiosa (First Value Time)

### Métricas de Retención
- **DAU / MAU** (Daily Active Users / Monthly Active Users)
- Tasa de retención a 7 días, 30 días y 90 días
- Usuarios que abren el Inbox al menos 3 veces por semana

### Métricas de Monetización
- Tasa de conversión Free → Pro
- MRR (Monthly Recurring Revenue)
- Churn Rate mensual
- LTV (Lifetime Value) promedio por usuario Pro

### Métricas de Producto
- Bloques creados por usuario por semana
- Hábitos completados por día
- Uso del Chatbot IA (mensajes enviados por sesión)
- Feature más usada (Canvas vs Inbox vs Hábitos vs Pomodoro)
