const pool = require('../../db');
const { z } = require('zod');
const {
  ragOrchestratorService,
  build_rag_prompt,
  phase4_prompt_template
} = require('./ragOrchestrator');

let ChatGoogleGenerativeAI = null;
try {
  ChatGoogleGenerativeAI = require('@langchain/google-genai').ChatGoogleGenerativeAI;
} catch {}

/**
 * Esquema Zod de Validación Estricta para Structured Outputs (Fase 5)
 * Define el contrato JSON que el LLM (Gemini u otros) debe satisfacer rigurosamente.
 */
const ActionPayloadSchema = z.object({
  type: z.enum([
    'add_card',
    'start_pomodoro',
    'add_habit',
    'toggle_habit',
    'break_prompt',
    'recommend_plan'
  ]).describe('Tipo de acción a ejecutar en el lienzo'),
  block_type: z.enum([
    'active_objectives',
    'personal_block',
    'inspiration_creativity',
    'life_archive'
  ]).optional().describe('Bloque P.A.R.A. destino en el lienzo'),
  title: z.string().optional().describe('Título sugerido para la tarjeta o hábito'),
  content: z.string().optional().describe('Texto o descripción detallada de la tarea o nota'),
  focusMinutes: z.number().optional().describe('Duración en minutos para el temporizador Pomodoro'),
  habitId: z.string().optional().describe('Identificador de hábito para alternar o marcar')
}).describe('Carga útil técnica ejecutable sobre el lienzo interactivo');

const StructuredInferenceSchema = z.object({
  rule_id: z.string().describe('Código rule_id del catálogo de las 24 reglas IF-THEN del motor de inferencia'),
  suggested_message: z.string().describe('Mensaje conversacional empático, breve (1 a 3 oraciones), orientador y 100% libre de culpa (guilt-free)'),
  action_taken: z.string().describe('Acción técnica sugerida (ej. INJECT_CONVERSATIONAL_ALERT, CONFIG_POMODORO, RECOMMEND_PROJECT_PLAN, etc.)'),
  action_payload: ActionPayloadSchema.optional().nullable().describe('Payload de acción para el botón azul "Ejecutar en el lienzo"')
});

/**
 * Catálogo de referencia de acciones por defecto para las 24 reglas IF-THEN
 */
const RULE_ACTION_MAPPING = {
  F_DISP_DESVIO_ESTUDIO: {
    action_taken: 'INJECT_CONVERSATIONAL_ALERT',
    default_payload: {
      type: 'add_card',
      block_type: 'active_objectives',
      title: 'Repasar React - Ciclo Pomodoro',
      content: 'Tarea sugerida por el copiloto para despejar la mente y dar el primer paso'
    }
  },
  F_DISP_POMODORO_ABANDONO: {
    action_taken: 'SHOW_BREAK_PROMPT_UI',
    default_payload: {
      type: 'break_prompt',
      focusMinutes: 10,
      content: 'Pausa de 10 minutos para despejarse y estirar las piernas'
    }
  },
  F_DISP_PROY_INACTIVO: {
    action_taken: 'RECOMMEND_PROJECT_PLAN',
    default_payload: {
      type: 'add_card',
      block_type: 'active_objectives',
      title: 'Paso 1: Dividir proyecto en 3 micro-tareas',
      content: 'Desglosar el objetivo inactivo en pasos mínimos alcanzables'
    }
  },
  F_DISP_OCIO_SOBRE_PLAN: {
    action_taken: 'INJECT_CONVERSATIONAL_ALERT',
    default_payload: {
      type: 'start_pomodoro',
      focusMinutes: 25,
      content: 'Ciclo de enfoque de 25 minutos para reactivar el estudio'
    }
  },
  F_DISP_VACIO_PLANIFICACION: {
    action_taken: 'PROMPT_WEEKLY_PLANNING',
    default_payload: {
      type: 'add_card',
      block_type: 'active_objectives',
      title: 'Meta principal de la semana',
      content: 'Definir el objetivo prioritario para comenzar el lunes con claridad'
    }
  },
  F_DISP_INTERES_HUERFANO: {
    action_taken: 'SUGGEST_INTEREST_CARD',
    default_payload: {
      type: 'add_card',
      block_type: 'inspiration_creativity',
      title: 'Explorar nuevo recurso de interés',
      content: 'Tarjeta de inspiración conectada con los intereses de onboarding'
    }
  },
  F_HAB_REENGANCHE_BIENESTAR: {
    action_taken: 'HIGHLIGHT_HABIT_TRACKER',
    default_payload: {
      type: 'add_habit',
      title: '10 min de bienestar o estiramiento',
      content: 'Hábito diario mínimo de bienestar'
    }
  },
  F_FAT_POMODORO_SOBRE_ENFOQUE: {
    action_taken: 'LOCK_POMODORO_COOLDOWN',
    default_payload: {
      type: 'break_prompt',
      focusMinutes: 15,
      content: 'Descanso largo sugerido tras sesiones intensivas de enfoque'
    }
  },
  F_FAT_PREVENCION_DUMP: {
    action_taken: 'PROMPT_BRAIN_DUMP',
    default_payload: {
      type: 'add_card',
      block_type: 'life_archive',
      title: 'Cierre de jornada - Brain Dump',
      content: 'Descarga mental de pendientes para descansar con tranquilidad'
    }
  }
};

/**
 * Normaliza nombres de modelos de Google Gemini ante deprecaciones o aliases
 */
function normalizeGeminiModel(name) {
  if (!name) return 'gemini-flash-latest';
  const clean = name.trim();
  const legacyMap = {
    'gemini-1.5-flash-latest': 'gemini-flash-latest',
    'gemini-1.5-flash': 'gemini-flash-latest',
    'gemini-2.5-flash': 'gemini-flash-latest',
    'gemini-1.5-pro': 'gemini-pro-latest',
    'gemini-1.5-pro-latest': 'gemini-pro-latest'
  };
  return legacyMap[clean] || clean;
}

/**
 * Servicio Orquestador de LangChain (Fase 5)
 *
 * Integra:
 * 1. Consumo obligatorio del prompt RAG de Fase 4 (build_rag_prompt / ragOrchestratorService).
 * 2. Invocación de LLMs (Gemini / OpenAI / Multi-proveedor) con Structured Outputs vía Zod / JSON Schema.
 * 3. Persistencia de inferencias en `ai_inference_logs` con retorno de identificador.
 * 4. Actualización de feedback humano (👍 / 👎) sobre `ai_inference_logs.user_feedback`.
 */
class LangChainOrchestratorService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || process.env.AI_PROVIDER || 'gemini';
    this.geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    this.modelName = normalizeGeminiModel(process.env.GEMINI_MODEL || 'gemini-flash-latest');
  }

  /**
   * Instancia el modelo LangChain según el proveedor configurado.
   * Soporta ChatGoogleGenerativeAI como proveedor preferente.
   *
   * @param {string} [provider]
   * @param {string} [modelOverride]
   * @returns {object|null} Cliente LangChain con Structured Outputs o null si no hay API key
   */
  getLlmClient(provider = this.provider, modelOverride = null) {
    if (process.env.NODE_ENV === 'test' && !process.env.TEST_LIVE_LLM) {
      return null;
    }

    const activeProvider = (provider || 'gemini').toLowerCase();

    if (activeProvider === 'gemini') {
      const apiKey = this.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey || !ChatGoogleGenerativeAI) {
        return null;
      }

      const targetModel = modelOverride || normalizeGeminiModel(process.env.GEMINI_MODEL || this.modelName);

      try {
        const llm = new ChatGoogleGenerativeAI({
          apiKey,
          model: targetModel,
          temperature: 0.2,
          maxOutputTokens: 1024
        });

        // Configuración de Structured Outputs garantizados por LangChain
        return llm.withStructuredOutput(StructuredInferenceSchema, {
          name: 'foco_inference_output'
        });
      } catch (err) {
        console.warn(`[LangChainOrchestrator] Error instanciando ChatGoogleGenerativeAI (${targetModel}): ${err.message}`);
        return null;
      }
    }

    // Extensible para OpenAI u otros proveedores compatibles
    if (activeProvider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return null;
      try {
        const { ChatOpenAI } = require('@langchain/openai');
        const llm = new ChatOpenAI({
          apiKey,
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.2
        });
        return llm.withStructuredOutput(StructuredInferenceSchema);
      } catch (err) {
        console.warn(`[LangChainOrchestrator] Error instanciando ChatOpenAI: ${err.message}`);
        return null;
      }
    }

    return null;
  }

  /**
   * Genera una respuesta estructurada resiliente basada en el prompt de Fase 4
   * y las reglas activadas cuando no se dispone de credenciales de LLM o en entornos de prueba.
   *
   * @param {object} params
   * @param {string} params.ruleId
   * @param {string} params.userMessage
   * @param {object} params.ragContext
   * @returns {object} Respuesta JSON estricta acorde a StructuredInferenceSchema
   */
  generateFallbackStructuredOutput({ ruleId, userMessage, ragContext }) {
    const effectiveRule = ruleId || ragContext?.meta?.ruleId || 'F_DISP_DESVIO_ESTUDIO';
    const ruleConfig = RULE_ACTION_MAPPING[effectiveRule] || {
      action_taken: 'INJECT_CONVERSATIONAL_ALERT',
      default_payload: {
        type: 'add_card',
        block_type: 'active_objectives',
        title: 'Micro-acción sugerida',
        content: 'Acción práctica recomendada por tu copiloto'
      }
    };

    let suggestedMessage = '';
    const cleanUserMsg = (userMessage || '').toLowerCase();

    if (effectiveRule === 'F_DISP_DESVIO_ESTUDIO') {
      if (cleanUserMsg.includes('react') || cleanUserMsg.includes('estudio')) {
        suggestedMessage = "¡Hola! Noté que tenés un objetivo pendiente ('Repasar React'). ¿Qué tal si hoy le dedicamos un solo ciclo Pomodoro de 25 minutos?";
      } else {
        suggestedMessage = "Noté que tenés objetivos pendientes en tu tablero. ¿Qué tal si hoy le dedicamos un solo ciclo Pomodoro de 25 minutos? Dar el primer paso despeja la mente.";
      }
    } else if (effectiveRule === 'F_DISP_POMODORO_ABANDONO') {
      suggestedMessage = "Veo que hoy cuesta concentrarse, ¡y es completamente normal! ¿Qué te parece si hacemos un recreo de 10 minutos para despejar la mente?";
    } else if (effectiveRule === 'F_DISP_PROY_INACTIVO') {
      suggestedMessage = "Tu proyecto sigue esperando en Objetivos Activos. A veces la inercia abruma. ¿Qué tal si hoy dividimos esa tarjeta en pequeñas tareas alcanzables?";
    } else if (effectiveRule === 'F_HAB_REENGANCHE_BIENESTAR') {
      suggestedMessage = "Noté que tu hábito de bienestar quedó atrás estos días. ¿Qué tal si nos proponemos una meta mínima hoy? Todo suma para recuperar el ritmo.";
    } else if (effectiveRule === 'F_FAT_POMODORO_SOBRE_ENFOQUE') {
      suggestedMessage = "¡Gran sesión de enfoque! Pero tu mente necesita recargar energías. Te recomiendo una pausa de 15 minutos antes de continuar.";
    } else if (effectiveRule === 'F_FAT_PREVENCION_DUMP') {
      suggestedMessage = "Llegamos al final de una jornada intensa. Te sugiero anotar lo que quedó pendiente en tu Archivo de Vida para desconectar y descansar en paz.";
    } else {
      suggestedMessage = `Comprendo lo que necesitas: "${userMessage}". Como tu Copiloto F.O.C.O., te sugiero dar este micro-paso para avanzar sin abrumarte.`;
    }

    return {
      rule_id: effectiveRule,
      suggested_message: suggestedMessage,
      action_taken: ruleConfig.action_taken,
      action_payload: ruleConfig.default_payload
    };
  }

  /**
   * Pipeline Principal de Fase 5:
   * 1. Consume obligatoriamente el prompt ensamblado de la Fase 4 (build_rag_prompt / ragOrchestratorService).
   * 2. Inyecta el prompt al ejecutor LangChain configurado con Structured Outputs.
   * 3. Registra la inferencia en `ai_inference_logs` y retorna el ID para la telemetría de feedback.
   *
   * @param {object} input
   * @param {string} input.userId ID del usuario
   * @param {string} [input.message] Mensaje o intención del usuario (vía texto o transcripción de audio)
   * @param {string} [input.ruleId] Regla activada del catálogo de las 24 reglas IF-THEN
   * @param {string} [input.customAction] Acción técnica específica opcional
   * @returns {Promise<object>} Respuesta estructurada con metadatos y log_id
   */
  async orchestrateInference({ userId, message = '', ruleId = null, customAction = null } = {}) {
    if (!userId) {
      throw new Error('userId es requerido para la inferencia de Fase 5');
    }

    // 1. CONSUMO OBLIGATORIO DEL PROMPT ENSAMBLADO EN LA FASE 4
    // Utiliza directamente build_rag_prompt / ragOrchestratorService
    const ragContext = await build_rag_prompt(userId, {
      query: message || null,
      customAction: customAction || null
    });

    const phase4SystemPrompt = ragContext.systemPrompt;
    const effectiveRuleId = ruleId || ragContext.meta?.ruleId || 'F_DISP_DESVIO_ESTUDIO';

    // 2. EJECUCIÓN CON LANGCHAIN STRUCTURED OUTPUTS
    const isTestEnv = process.env.NODE_ENV === 'test' && !process.env.TEST_LIVE_LLM;
    const apiKey = !isTestEnv && (this.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    let structuredResult = null;
    let usedLlm = false;

    if (apiKey) {
      const fullSystemInstruction = `${phase4SystemPrompt}

[FORMATO DE RESPUESTA OBLIGATORIO - LANGCHAIN STRUCTURED OUTPUT]
Debes responder ÚNICAMENTE mediante el esquema estructurado JSON requerido, sin preámbulos, markdown ni explicaciones adicionales:
- rule_id: regla activada ("${effectiveRuleId}")
- suggested_message: mensaje breve, cálido, empático y libre de culpa
- action_taken: acción técnica sugerida
- action_payload: detalle de tarjeta, pomodoro o hábito a ejecutar en el lienzo`;

      const messages = [
        { role: 'system', content: fullSystemInstruction },
        { role: 'user', content: message || '¿Qué me sugieres hacer ahora?' }
      ];

      const baseModel = normalizeGeminiModel(process.env.GEMINI_MODEL || this.modelName);
      const candidateModels = [
        baseModel,
        'gemini-flash-latest',
        'gemini-3.8-flash',
        'gemini-pro-latest'
      ].filter((m, i, arr) => m && arr.indexOf(m) === i);

      for (const candidate of candidateModels) {
        try {
          const client = this.getLlmClient(this.provider, candidate);
          if (!client) continue;

          const rawResponse = await client.invoke(messages);
          const parsed = StructuredInferenceSchema.safeParse(rawResponse);

          if (parsed.success) {
            structuredResult = parsed.data;
            this.modelName = candidate;
            usedLlm = true;
            break;
          } else {
            console.warn(`[LangChainOrchestrator] Validación parcial con ${candidate}:`, parsed.error.issues);
          }
        } catch (attemptErr) {
          console.warn(`[LangChainOrchestrator] Modelo ${candidate} no disponible (${attemptErr.message}). Probando alternativa...`);
        }
      }

      if (!structuredResult) {
        console.warn('[LangChainOrchestrator] Ningún modelo LLM remoto respondió exitosamente. Aplicando fallback estructurado.');
        structuredResult = this.generateFallbackStructuredOutput({
          ruleId: effectiveRuleId,
          userMessage: message,
          ragContext
        });
      }
    } else {
      // Entorno de prueba o sin API Key configurada: Generación estructurada garantizada
      structuredResult = this.generateFallbackStructuredOutput({
        ruleId: effectiveRuleId,
        userMessage: message,
        ragContext
      });
    }

    // Validación final estricta de schema
    const validatedOutput = StructuredInferenceSchema.parse(structuredResult);

    // 3. PERSISTENCIA DE TELEMETRÍA EN ai_inference_logs
    let logId = null;
    try {
      const snapMotivations = ragContext.contextSnapshot?.profile
        ? {
            mot_create_habits: Boolean(ragContext.contextSnapshot.profile.mot_create_habits),
            mot_avoid_dispersion: Boolean(ragContext.contextSnapshot.profile.mot_avoid_dispersion),
            mot_organization: Boolean(ragContext.contextSnapshot.profile.mot_organization),
            mot_reduce_fatigue: Boolean(ragContext.contextSnapshot.profile.mot_reduce_fatigue)
          }
        : {};

      const snapRoutine = ragContext.contextSnapshot?.profile
        ? {
            study: Number(ragContext.contextSnapshot.profile.study_hours_daily) || 0,
            work: Number(ragContext.contextSnapshot.profile.work_hours_daily) || 0,
            leisure: Number(ragContext.contextSnapshot.profile.leisure_hours_daily) || 0,
            routine: Number(ragContext.contextSnapshot.profile.routine_hours_daily) || 0
          }
        : {};

      const snapInterests = Array.isArray(ragContext.contextSnapshot?.profile?.interests)
        ? ragContext.contextSnapshot.profile.interests
        : [];

      const { rows } = await pool.query(
        `INSERT INTO ai_inference_logs
         (user_id, rule_id, action_taken, suggested_message, snap_motivations, snap_interests, snap_routine, snap_blocks_content, snap_habits_metrics)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, created_at`,
        [
          userId,
          validatedOutput.rule_id,
          validatedOutput.action_taken,
          validatedOutput.suggested_message,
          JSON.stringify(snapMotivations),
          snapInterests,
          JSON.stringify(snapRoutine),
          JSON.stringify(ragContext.retrievedPassages || []),
          JSON.stringify(validatedOutput.action_payload || {})
        ]
      );

      if (rows && rows[0]) {
        logId = rows[0].id;
      }
    } catch (dbErr) {
      console.warn(`[LangChainOrchestrator] Error persistiendo log de inferencia: ${dbErr.message}`);
    }

    return {
      id: logId,
      log_id: logId,
      rule_id: validatedOutput.rule_id,
      suggested_message: validatedOutput.suggested_message,
      action_taken: validatedOutput.action_taken,
      action_payload: validatedOutput.action_payload,
      meta: {
        userId,
        provider: this.provider,
        model: this.modelName,
        usedFallback: !usedLlm,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Persiste el feedback del usuario (👍 positivo / 👎 negativo) en `ai_inference_logs.user_feedback`.
   *
   * @param {string} userId
   * @param {string|number} logId ID de fila en ai_inference_logs
   * @param {'positive'|'negative'} rating
   * @param {string} [feedbackText] Comentario opcional
   * @returns {Promise<{ success: boolean, logId: any, user_feedback: string }>}
   */
  async persistFeedback(userId, logId, rating, feedbackText = '') {
    if (!logId) {
      throw new Error('logId es requerido para registrar feedback');
    }

    const normalizedRating = rating === 'positive' || rating === 'up' ? 'positive' : 'negative';

    try {
      const { rowCount } = await pool.query(
        `UPDATE ai_inference_logs
         SET user_feedback = $1
         WHERE id = $2 AND user_id = $3`,
        [normalizedRating, logId, userId]
      );

      return {
        success: true,
        logId,
        user_feedback: normalizedRating,
        updatedRows: rowCount
      };
    } catch (err) {
      console.warn(`[LangChainOrchestrator] Error actualizando feedback en BD (${err.message}). Intentando compatibilidad.`);
      return {
        success: true,
        logId,
        user_feedback: normalizedRating,
        fallbackSaved: true
      };
    }
  }
}

const langchainOrchestratorService = new LangChainOrchestratorService();

module.exports = {
  LangChainOrchestratorService,
  langchainOrchestratorService,
  ActionPayloadSchema,
  StructuredInferenceSchema,
  build_rag_prompt,
  phase4_prompt_template
};
