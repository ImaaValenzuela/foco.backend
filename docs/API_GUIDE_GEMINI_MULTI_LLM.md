# 📚 Guía de Instalación y Uso para Aplicar Cualquier API de LLM (Foco Principal: Gemini API)

Esta guía documenta la arquitectura de **Fase 5 de F.O.C.O.**, diseñada bajo el patrón de **proveedores intercambiables en LangChain con Structured Outputs**, permitiendo operar con **Google Gemini**, **OpenAI**, **Anthropic**, o modelos locales vía Ollama.

---

## 🚀 1. Instalación de Dependencias

### En Node.js (`foco-backend`):
Para integrar **Gemini API** con LangChain y Structured Outputs validados por Zod:

```bash
# Dependencias principales para Gemini API
npm install @langchain/core @langchain/google-genai zod

# Si se desea habilitar OpenAI u otros proveedores alternativos:
npm install @langchain/openai @langchain/anthropic
```

### En Python (`foco-ia-service` / Microservicios):
Si se desea ejecutar el orquestador o cadenas en Python:

```bash
pip install langchain langchain-core langchain-google-genai pydantic
```

---

## 🔑 2. Configuración de Variables de Entorno (`.env`)

En el archivo `.env` en la raíz de `foco.backend` (o entorno de despliegue):

```env
# ============================================================================
# CONFIGURACIÓN DEL PROVEEDOR LLM (FASE 5)
# ============================================================================

# Proveedor activo: 'gemini' (predeterminado), 'openai', 'anthropic', etc.
LLM_PROVIDER=gemini

# Clave de API de Google Gemini (Google AI Studio)
GEMINI_API_KEY=AIzaSy...TuClaveRealDeGeminiAqui

# Modelo de Gemini seleccionado:
# - gemini-1.5-flash (Recomendado: ultra rápido, baja latencia, excelente para structured outputs)
# - gemini-1.5-pro (Para razonamiento profundo en prompts extensos)
# - gemini-2.0-flash-exp (Para últimas capacidades experimentales)
GEMINI_MODEL=gemini-1.5-flash

# (Opcional) Si se utiliza OpenAI como fallback o alternativa:
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
```

> [!TIP]
> Si no se configura `GEMINI_API_KEY`, el orquestador de F.O.C.O. activa automáticamente un **motor de inferencia determinista y resiliente** basado en las 24 reglas IF-THEN y el prompt de Fase 4, permitiendo desarrollo local y pruebas unitarias sin depender de conexión a internet o cuotas de API.

---

## 🔄 3. Patrón de Intercambio de Proveedor (Multi-LLM Provider Pattern)

El orquestador utiliza una fábrica desacoplada (`getLlmClient`) que vincula el esquema de validación estricta (`StructuredInferenceSchema`) directamente con la capacidad nativa de `withStructuredOutput` de LangChain.

### Implementación en JavaScript / TypeScript (Node.js)

```javascript
const { z } = require('zod');

// 1. Esquema de Salida Estructurada
const StructuredInferenceSchema = z.object({
  rule_id: z.string().describe('Código rule_id de las 24 reglas IF-THEN'),
  suggested_message: z.string().describe('Mensaje empático libre de culpa'),
  action_taken: z.string().describe('Acción técnica en el lienzo'),
  action_payload: z.object({
    type: z.enum(['add_card', 'start_pomodoro', 'add_habit', 'toggle_habit', 'break_prompt']),
    block_type: z.enum(['active_objectives', 'personal_block', 'inspiration_creativity', 'life_archive']).optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    focusMinutes: z.number().optional()
  }).optional().nullable()
});

// 2. Fábrica de Proveedores
function createStructuredLlm(provider = process.env.LLM_PROVIDER || 'gemini') {
  switch (provider.toLowerCase()) {
    case 'gemini': {
      const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
      const llm = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        temperature: 0.2
      });
      return llm.withStructuredOutput(StructuredInferenceSchema);
    }

    case 'openai': {
      const { ChatOpenAI } = require('@langchain/openai');
      const llm = new ChatOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2
      });
      return llm.withStructuredOutput(StructuredInferenceSchema);
    }

    default:
      throw new Error(`Proveedor no soportado: ${provider}`);
  }
}
```

### Implementación equivalente en Python

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal
import os

class ActionPayload(BaseModel):
    type: Literal['add_card', 'start_pomodoro', 'add_habit', 'toggle_habit', 'break_prompt']
    block_type: Optional[Literal['active_objectives', 'personal_block', 'inspiration_creativity', 'life_archive']] = None
    title: Optional[str] = None
    content: Optional[str] = None
    focusMinutes: Optional[int] = None

class InferenceOutput(BaseModel):
    rule_id: str = Field(description="Código rule_id activado")
    suggested_message: str = Field(description="Mensaje empático sin culpa")
    action_taken: str = Field(description="Acción técnica en el lienzo")
    action_payload: Optional[ActionPayload] = None

def get_python_llm_chain(provider="gemini"):
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        llm = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
            google_api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0.2
        )
        return llm.with_structured_output(InferenceOutput)
    elif provider == "openai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
        return llm.with_structured_output(InferenceOutput)
```

---

## 🧪 4. Puntos de Verificación y Pruebas

### A. Prueba del Endpoint de Inferencia con cURL
Para verificar que el backend responde con el formato JSON estricto sin preámbulos:

```bash
curl -X POST http://localhost:3000/api/ai/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TU_JWT_TOKEN_DE_SUPABASE>" \
  -d '{
    "message": "Alex quiere repasar React antes del examen",
    "rule_id": "F_DISP_DESVIO_ESTUDIO"
  }'
```

**Respuesta esperada (HTTP 200)**:
```json
{
  "id": "18f8e8a9-4d2c-4903-8d62-1bcf12345678",
  "log_id": "18f8e8a9-4d2c-4903-8d62-1bcf12345678",
  "rule_id": "F_DISP_DESVIO_ESTUDIO",
  "suggested_message": "¡Hola, Alex! Noté que tenés un objetivo pendiente ('Repasar React'). ¿Qué tal si hoy le dedicamos un solo ciclo Pomodoro de 25 minutos?",
  "action_taken": "INJECT_CONVERSATIONAL_ALERT",
  "action_payload": {
    "type": "add_card",
    "block_type": "active_objectives",
    "title": "Repasar React - Ciclo Pomodoro",
    "content": "Tarea sugerida por el copiloto para despejar la mente"
  },
  "meta": {
    "userId": "...",
    "provider": "gemini",
    "model": "gemini-1.5-flash"
  }
}
```

### B. Prueba de Telemetría de Feedback
Para verificar la actualización del pulgar arriba (`positive`) o abajo (`negative`):

```bash
curl -X PATCH http://localhost:3000/api/ai/copilot/feedback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TU_JWT_TOKEN_DE_SUPABASE>" \
  -d '{
    "logId": "18f8e8a9-4d2c-4903-8d62-1bcf12345678",
    "rating": "positive",
    "feedback": "Respuesta muy acertada"
  }'
```

**Respuesta esperada (HTTP 200)**:
```json
{
  "success": true,
  "logId": "18f8e8a9-4d2c-4903-8d62-1bcf12345678",
  "user_feedback": "positive",
  "updatedRows": 1
}
```

### C. Prueba de Ejecución en el Lienzo ("Ejecutar en el lienzo")
1. En el frontend, abrir el Chatbot F.O.C.O.
2. Ingresar una consulta o esperar la sugerencia.
3. Observar la tarjeta destacada con el botón azul `#2563EB` con la leyenda **"Ejecutar en el lienzo"**.
4. Al hacer clic, la tarjeta se inserta en el cuadrante P.A.R.A. correspondiente (o se inicia el Pomodoro/hábito) y el botón cambia dinámicamente a **"✓ Ejecutado en el lienzo"**.
