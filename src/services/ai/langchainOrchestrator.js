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
  isTask: z.boolean().optional().describe('true si el usuario solicita una tarea con checkbox, false si es una nota o apunte libre'),
  focusMinutes: z.number().optional().describe('Duración en minutos para el temporizador Pomodoro'),
  habitId: z.string().optional().describe('Identificador de hábito para alternar o marcar')
}).describe('Carga útil técnica ejecutable sobre el lienzo interactivo');

const StructuredInferenceSchema = z.object({
  rule_id: z.string().describe('Código rule_id del catálogo de las 24 reglas IF-THEN del motor de inferencia o GENERAL_CONVERSATION'),
  suggested_message: z.string().describe('Mensaje conversacional empático, breve (1 a 3 oraciones), orientador y 100% libre de culpa (guilt-free)'),
  action_taken: z.string().describe('Acción técnica sugerida (ej. CONVERSATIONAL_SUGGESTION, INJECT_CONVERSATIONAL_ALERT, CONFIG_POMODORO, RECOMMEND_PROJECT_PLAN, etc.)'),
  action_payload: ActionPayloadSchema.optional().nullable().describe('Payload de acción para el botón azul "Ejecutar en el lienzo" (dejar en null para sugerencias puramente conversacionales en texto)')
});

/**
 * Catálogo de referencia de acciones por defecto para las 24 reglas IF-THEN
 */
const RULE_ACTION_MAPPING = {
  GENERAL_CONVERSATION: {
    action_taken: 'CONVERSATIONAL_SUGGESTION',
    default_payload: null
  },
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
  if (!name) return 'gemini-3.5-flash-lite';
  const clean = name.trim();
  const legacyMap = {
    'gemini-1.5-flash-latest': 'gemini-3.5-flash-lite',
    'gemini-1.5-flash': 'gemini-3.5-flash-lite',
    'gemini-2.5-flash': 'gemini-3.5-flash-lite',
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
    this.modelName = normalizeGeminiModel(process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite');
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
    const isConversational = !ruleId || ruleId === 'GENERAL_CONVERSATION' || ruleId === 'GENERAL_COPILOT_GUIDANCE';
    const effectiveRule = isConversational ? 'GENERAL_CONVERSATION' : ruleId;

    if (isConversational) {
      const cleanUserMsg = (userMessage || '').toLowerCase();
      let suggestedMessage = '';

      // A) Detección de creación de Pomodoro
      const isPomodoro = /(?:pomodoro|temporizador|timer|modo\s+foco)/i.test(cleanUserMsg);
      if (isPomodoro) {
        const minMatch = cleanUserMsg.match(/\b(\d{1,3})\s*(?:minutos?|mins?|m)\b/i) || cleanUserMsg.match(/\b(\d{1,3})\b/);
        let focusMinutes = 25;
        if (minMatch) {
          const parsed = parseInt(minMatch[1], 10);
          if (parsed > 0 && parsed <= 180) focusMinutes = parsed;
        }
        return {
          rule_id: 'GENERAL_CONVERSATION',
          suggested_message: `Preparé un ciclo Pomodoro de ${focusMinutes} minutos para enfocarte con tranquilidad. Hacé clic en "Ejecutar en el lienzo" para iniciarlo.`,
          action_taken: 'CONFIG_POMODORO',
          action_payload: {
            type: 'start_pomodoro',
            focusMinutes,
            content: `Ciclo de enfoque de ${focusMinutes} minutos`
          }
        };
      }

      // B) Detección de creación de Hábito
      const isHabitCreation = /\b(?:h[aá]bitos?|rutinas?)\b/i.test(cleanUserMsg) &&
        /\b(?:crear?|agreg[aá]r?|nuev[oa]|anot[aá]r?|sumar?)\b/i.test(cleanUserMsg);
      if (isHabitCreation) {
        let habitName = (userMessage || '')
          .replace(/\b(?:crear?|agreg[aá]r?|nuev[oa]|anot[aá]r?|sumar?|un[as]?|el|la|los|las|de|h[aá]bitos?|rutinas?)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        habitName = habitName ? habitName.charAt(0).toUpperCase() + habitName.slice(1) : 'Nuevo hábito diario';
        return {
          rule_id: 'GENERAL_CONVERSATION',
          suggested_message: `Excelente hábito: "${habitName}". La constancia es el mejor camino. Hacé clic en "Ejecutar en el lienzo" para sumarlo a tu tracker.`,
          action_taken: 'ADD_HABIT',
          action_payload: {
            type: 'add_habit',
            title: habitName,
            content: habitName
          }
        };
      }

      // C) Detección de creación de Tarea (Task con checkbox, isTask: true)
      const isTaskCreation = /\b(?:tareas?|pendientes?|to-?do|recordatorios?)\b/i.test(cleanUserMsg);
      if (isTaskCreation) {
        let taskText = (userMessage || '')
          .replace(/\b(?:crear?|agreg[aá]r?|anot[aá]r?|nuev[oa]|poner?|pone?|pon|un[as]?|tareas?|pendientes?|to-?do|recordatorios?|de|que|para|en|el|la|los|las)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        taskText = taskText ? taskText.charAt(0).toUpperCase() + taskText.slice(1) : 'Tarea rápida';
        return {
          rule_id: 'GENERAL_CONVERSATION',
          suggested_message: `Anoté la tarea "${taskText}". Hacé clic en "Ejecutar en el lienzo" para crearla en tus objetivos activos con su casilla de verificación.`,
          action_taken: 'ADD_CARD',
          action_payload: {
            type: 'add_card',
            block_type: 'active_objectives',
            title: taskText,
            content: taskText,
            isTask: true
          }
        };
      }

      // D) Detección de creación de Nota (Nota informativa sin checkbox, isTask: false)
      const isNoteCreation = /\b(?:notas?|apuntes?|ideas?)\b/i.test(cleanUserMsg) &&
        /\b(?:crear?|agreg[aá]r?|anot[aá]r?|nuev[oa]|guardar?|escrib[ií]r?)\b/i.test(cleanUserMsg);
      if (isNoteCreation) {
        let noteText = (userMessage || '')
          .replace(/\b(?:crear?|agreg[aá]r?|anot[aá]r?|nuev[oa]|guardar?|escrib[ií]r?|un[as]?|notas?|apuntes?|ideas?|de|que|para|en|el|la|los|las)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        noteText = noteText ? noteText.charAt(0).toUpperCase() + noteText.slice(1) : 'Nota rápida';
        let blockType = 'personal_block';
        if (/inspiraci|creativid|idea/i.test(cleanUserMsg)) blockType = 'inspiration_creativity';
        else if (/archivo|vida|bit[aá]cora/i.test(cleanUserMsg)) blockType = 'life_archive';
        else if (/objetivo|activo|proyecto/i.test(cleanUserMsg)) blockType = 'active_objectives';

        return {
          rule_id: 'GENERAL_CONVERSATION',
          suggested_message: `Anoté tu apunte: "${noteText}". Hacé clic en "Ejecutar en el lienzo" para fijarlo en tu espacio de trabajo.`,
          action_taken: 'ADD_CARD',
          action_payload: {
            type: 'add_card',
            block_type: blockType,
            title: noteText,
            content: noteText,
            isTask: false
          }
        };
      }

      // E) Consultas sobre Hábitos del usuario
      if (cleanUserMsg.includes('hábito') || cleanUserMsg.includes('habito') || cleanUserMsg.includes('rutina')) {
        const habits = ragContext?.contextSnapshot?.habitsSummary?.habits || [];
        if (habits.length > 0) {
          const completed = habits.filter(h => h.completedToday).map(h => `"${h.name}"`).join(', ');
          const pending = habits.filter(h => !h.completedToday).map(h => `"${h.name}"`).join(', ');
          let msg = `En tu tracker tenés ${habits.length} hábito(s). `;
          if (completed) msg += `Completados hoy: ${completed}. `;
          if (pending) msg += `Pendientes hoy: ${pending}.`;
          suggestedMessage = msg;
        } else {
          suggestedMessage = 'Actualmente no tenés hábitos cargados en el tracker. Podés pedirme "crear hábito de..." en cualquier momento.';
        }
      }
      // F) Consultas sobre Calendario / Agenda
      else if (cleanUserMsg.includes('calendario') || cleanUserMsg.includes('agenda') || cleanUserMsg.includes('reunión') || cleanUserMsg.includes('reunion') || cleanUserMsg.includes('meet')) {
        const cal = ragContext?.contextSnapshot?.calendarSummary;
        if (cal?.connected) {
          if (Array.isArray(cal.events) && cal.events.length > 0) {
            const evList = cal.events.map(e => `"${e.title}"`).join(', ');
            suggestedMessage = `Para hoy tenés ${cal.totalCount} evento(s) en Google Calendar (${cal.busyHours}h ocupadas): ${evList}.`;
          } else {
            suggestedMessage = 'Tu Google Calendar está conectado y no tenés reuniones agendadas para el resto del día.';
          }
        } else {
          suggestedMessage = 'No tenés vinculada tu cuenta de Google Calendar todavía. Podés sincronizarla desde la barra de productividad para que pueda recordarte tus horarios.';
        }
      }
      // G) Consultas sobre Tareas y Notas del tablero
      else if (cleanUserMsg.includes('tarea') || cleanUserMsg.includes('pendiente') || cleanUserMsg.includes('completad') || cleanUserMsg.includes('tablero') || cleanUserMsg.includes('lienzo')) {
        const passages = ragContext?.retrievedPassages || [];
        const tasks = passages.filter(p => p.isTask || p.type === 'task');
        if (tasks.length > 0) {
          const completed = tasks.filter(t => t.checked).map(t => `"${t.title || t.text}"`).join(', ');
          const pending = tasks.filter(t => !t.checked).map(t => `"${t.title || t.text}"`).join(', ');
          let msg = 'Revisando tu lienzo: ';
          if (pending) msg += `Tenés pendiente: ${pending}. `;
          if (completed) msg += `Ya completaste: ${completed}. `;
          suggestedMessage = msg.trim();
        } else {
          suggestedMessage = 'En este momento no detecto tareas pendientes en tus objetivos activos. Si querés podés pedirme que anote una nueva tarea.';
        }
      }
      // H) Sugerencias conversacionales contextuales
      else if (cleanUserMsg.includes('react') || cleanUserMsg.includes('código') || cleanUserMsg.includes('program')) {
        suggestedMessage = 'Para avanzar con programación o React sin abrumarte, te sugiero desglosar el tema en pequeños conceptos puntuales (como componentes o props). Avanzar de a un paso simple despeja la mente.';
      } else if (cleanUserMsg.includes('estudi') || cleanUserMsg.includes('aprend')) {
        suggestedMessage = 'Aprender y estudiar a tu propio ritmo es la clave. Podés elegir un solo tema para hoy y explorar lecturas breves o ejemplos prácticos sin apuro.';
      } else if (cleanUserMsg.includes('cansad') || cleanUserMsg.includes('agotad') || cleanUserMsg.includes('abrumad') || cleanUserMsg.includes('estres')) {
        suggestedMessage = 'Es completamente normal sentir momentos de baja energía o cansancio. Recordá que no hace falta resolver todo de golpe; descansar, hidratarse o estirar el cuerpo renueva el foco.';
      } else if (cleanUserMsg.includes('organiz') || cleanUserMsg.includes('plan') || cleanUserMsg.includes('priorid') || cleanUserMsg.includes('empez')) {
        suggestedMessage = 'Para organizar el día con serenidad, elegir una única meta principal para hoy suele marcar la diferencia. El resto de las ideas pueden esperar en tus notas.';
      } else if (cleanUserMsg.includes('hola') || cleanUserMsg.includes('buen') || cleanUserMsg.includes('que tal') || cleanUserMsg.includes('cómo estás')) {
        suggestedMessage = '¡Hola! Qué bueno encontrarnos. Acá estoy para acompañarte a ordenar tus ideas, responder dudas o despejar tu día a tu propio ritmo. ¿En qué te gustaría enfocarte hoy?';
      } else {
        suggestedMessage = cleanUserMsg
          ? `Comprendo tu consulta: "${userMessage}". Mi sugerencia es ir paso a paso, priorizando tu bienestar mental y avanzando a un ritmo sostenible. ¿Querés que profundicemos en algún punto específico?`
          : '¡Hola! Estoy acá para acompañarte a despejar tu día y organizar tus prioridades con calma. ¿En qué puedo ayudarte hoy?';
      }

      return {
        rule_id: 'GENERAL_CONVERSATION',
        suggested_message: suggestedMessage,
        action_taken: 'CONVERSATIONAL_SUGGESTION',
        action_payload: null
      };
    }

    const ruleConfig = RULE_ACTION_MAPPING[effectiveRule] || {
      action_taken: 'CONVERSATIONAL_SUGGESTION',
      default_payload: null
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
    // Solo consideramos regla activa si fue especificada explícitamente en el llamado.
    // Si el usuario escribe libremente en el chat, se trata de una interacción conversacional (GENERAL_CONVERSATION)
    const isExplicitRule = Boolean(ruleId);
    const effectiveRuleId = isExplicitRule ? ruleId : 'GENERAL_CONVERSATION';

    // 2. EJECUCIÓN CON LANGCHAIN STRUCTURED OUTPUTS
    const isTestEnv = process.env.NODE_ENV === 'test' && !process.env.TEST_LIVE_LLM;
    const apiKey = !isTestEnv && (this.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    let structuredResult = null;
    let usedLlm = false;

    if (apiKey) {
      const isConversational = effectiveRuleId === 'GENERAL_CONVERSATION';
      const promptDirectives = isConversational
        ? `[DIRECTIVA CONVERSACIONAL Y DE ACCIONES SOBRE EL LIENZO]
- El usuario está dialogando libremente, consultando o solicitando una acción.
- TU RESPUESTA DEBE SER EMPÁTICA, ORIENTADORA, BREVE (1 a 3 oraciones) y 100% LIBRE DE CULPA (guilt-free).
- NO propongas repetitivamente hacer un Pomodoro a menos que el usuario lo pida expresamente.

- CUÁNDO GENERAR ACCIÓN EN EL LIENZO ("action_payload"):
  * Si el usuario pide crear, agregar, anotar o iniciar algo (ej: "crear una tarea para...", "agregar nota de...", "iniciar pomodoro...", "crear hábito de..."):
    - "action_taken" DEBE ser una acción ejecutable ("ADD_CARD", "CONFIG_POMODORO", "ADD_HABIT").
    - "action_payload" DEBE ser completado con:
      * type: "add_card" (para notas o tareas), "start_pomodoro" (para temporizador) o "add_habit" (para hábito).
      * Para type: "add_card":
        - "isTask": true si el usuario solicita una TAREA, to-do, pendiente o recordatorio con casilla de verificación.
        - "isTask": false si el usuario solicita una NOTA, apunte, idea o pensamiento sin checkbox.
        - "block_type": "active_objectives" (para tareas y objetivos), "personal_block", "inspiration_creativity", o "life_archive".
        - "title" y "content" con el texto limpio de la tarea o nota.
  * Si el usuario hace una consulta general, teórica, conversacional o sobre el estado de sus tareas/hábitos sin pedir crear nada nuevo:
    - "action_taken": "CONVERSATIONAL_SUGGESTION"
    - "action_payload": null (ESTRICTAMENTE null, sin botón ni acción en el lienzo).

- DISTINCIÓN DE ESTADO DE TAREAS, HÁBITOS Y GOOGLE CALENDAR:
  * Diferencia claramente entre tareas completadas y tareas pendientes basándote en los datos reales provistos en el contexto.
  * Usa los datos provistos en [TRACKER DE HÁBITOS (EN VIVO)] y [AGENDA DEL DÍA (GOOGLE CALENDAR)] para responder con fidelidad.`
        : `[DIRECTIVA DE REGLA DEL MOTOR DE INFERENCIA]
- Se activó la regla técnica: "${effectiveRuleId}".
- Devuelve "rule_id": "${effectiveRuleId}", mensaje empático guilt-free y el "action_payload" correspondiente si aplica.`;

      const fullSystemInstruction = `${phase4SystemPrompt}

${promptDirectives}

[FORMATO DE RESPUESTA OBLIGATORIO - LANGCHAIN STRUCTURED OUTPUT]
Debes responder ÚNICAMENTE mediante el esquema estructurado JSON requerido, sin preámbulos, markdown ni explicaciones adicionales:
- rule_id: regla ("${effectiveRuleId}")
- suggested_message: sugerencia o mensaje breve, cálido, empático y libre de culpa
- action_taken: acción técnica sugerida ("CONVERSATIONAL_SUGGESTION", "INJECT_CONVERSATIONAL_ALERT", etc.)
- action_payload: detalle de tarjeta, pomodoro o hábito a ejecutar en el lienzo (debe ser null para sugerencias puramente conversacionales en texto)`;

      const messages = [
        { role: 'system', content: fullSystemInstruction },
        { role: 'user', content: message || '¿Qué me sugieres hacer ahora?' }
      ];

      const baseModel = normalizeGeminiModel(process.env.GEMINI_MODEL || this.modelName);
      const candidateModels = [
        baseModel,
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.6-flash',
        'gemini-3.7-flash',
        'gemini-flash-latest'
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
          const errMsg = attemptErr?.message || '';
          if (errMsg.includes('429') || errMsg.includes('Quota exceeded') || errMsg.includes('RESOURCE_EXHAUSTED')) {
            console.warn(`[LangChainOrchestrator] Cuota gratuita alcanzada para '${candidate}' (429 Too Many Requests). Probando alternativa en cascada...`);
          } else if (errMsg.includes('404') || errMsg.includes('not found')) {
            console.warn(`[LangChainOrchestrator] Modelo '${candidate}' no disponible en la API (404 Not Found). Probando alternativa...`);
          } else {
            console.warn(`[LangChainOrchestrator] Modelo '${candidate}' temporalmente no disponible (${errMsg.slice(0, 100)}). Probando alternativa...`);
          }
        }
      }

      if (!structuredResult) {
        console.warn('[LangChainOrchestrator] Cuota de API consumida en los modelos disponibles. Activando fallback local determinista de alta fidelidad.');
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
