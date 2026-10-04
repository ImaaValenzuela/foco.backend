// src/services/nluService.js
const crypto = require('crypto');

function parseCalendarDateTime(text) {
  const now = new Date();
  let targetDate = new Date(now);
  let hasDate = false;
  let hasTime = false;

  // Fecha relativa: "pasado mañana", "mañana", "hoy"
  if (/\bpasado\s+mañana\b/i.test(text)) {
    targetDate.setDate(targetDate.getDate() + 2);
    hasDate = true;
  } else if (/\bmañana\b/i.test(text)) {
    targetDate.setDate(targetDate.getDate() + 1);
    hasDate = true;
  } else if (/\bhoy\b/i.test(text)) {
    hasDate = true;
  }

  // Días de la semana
  const daysMap = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6 };
  for (const [dayName, dayIndex] of Object.entries(daysMap)) {
    const regex = new RegExp(`\\b(?:el\\s+)?${dayName}\\b`, 'i');
    if (regex.test(text) && !hasDate) {
      const currentDay = now.getDay();
      let diff = dayIndex - currentDay;
      if (diff <= 0) diff += 7;
      targetDate.setDate(now.getDate() + diff);
      hasDate = true;
      break;
    }
  }

  // Hora: "a las 10am", "a las 10:30", "a las 15hs", "a las 10", "10am", "10:00"
  const timeMatch = text.match(/\b(?:a\s+las?|a\s+la|para\s+las?)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|hs|h|hrs)?\b/i) ||
                    text.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?\b/i) ||
                    text.match(/\b(\d{1,2})\s*(am|pm)\b/i);

  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;

    targetDate.setHours(hours, minutes, 0, 0);
    hasTime = true;
  } else {
    if (hasDate) {
      targetDate.setHours(10, 0, 0, 0);
    } else {
      targetDate.setHours(targetDate.getHours() + 1, 0, 0, 0);
    }
  }

  if (!hasDate && hasTime) {
    if (targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
  }

  const endDate = new Date(targetDate);
  endDate.setHours(endDate.getHours() + 1);

  return {
    startDate: targetDate.toISOString(),
    endDate: endDate.toISOString(),
    timeStr: `${String(targetDate.getHours()).padStart(2, '0')}:${String(targetDate.getMinutes()).padStart(2, '0')}`,
    dateStr: hasDate ? (/\bmañana\b/i.test(text) ? 'mañana' : targetDate.toISOString().split('T')[0]) : 'hoy'
  };
}

/**
 * Clasificador local ultrarrápido (<1ms) basado en reglas y expresiones regulares.
 * Sirve como motor de alto rendimiento y fallback resiliente ante indisponibilidad del microservicio Python.
 */
function classifyIntentLocal(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return {
      intent: 'CREATE_BLOCK_ITEM',
      targetBlock: 'life_archive',
      action: 'ADD_NOTE',
      extractedData: { text: 'Nota rápida', title: null, isTask: false, isList: false, type: 'note' }
    };
  }

  // 1. Detección de intención relacional (Conexión con Flecha)
  const connMatch = text.match(/\b(?:conecta|conectar|vincula|vincular|asocia|asociar|flecha|relaciona|relacionar)\s+(?:la\s+)?(?:tarjeta|nota|tarea|lista)?\s*(.+?)\s+(?:con|a|hacia|y)\s+(?:la\s+)?(?:tarjeta|nota|tarea|lista)?\s*(.+)/i);
  if (connMatch) {
    return {
      intent: 'CREATE_CONNECTION',
      targetBlock: 'canvas',
      action: 'ADD_CONNECTION',
      extractedData: {
        sourceQuery: connMatch[1].trim(),
        targetQuery: connMatch[2].trim()
      }
    };
  }

  // 2. Detección de intención de Google Calendar (Eventos / Reuniones)
  const isCalendarEvent = /\b(reuni[oó]n|reuniones|junta|citas?|meets?|meetings?|agendar?|agendame|agenda\b|llamadas?|entrevistas?|evento|eventos)\b/i.test(text);
  if (isCalendarEvent) {
    const { startDate, endDate, timeStr, dateStr } = parseCalendarDateTime(text);
    let title = text
      .replace(/\b(?:foco|agenda|agendar|agendame|crea|crear|agrega|agregar|anota|anotame|nuevo|nueva)\b/gi, '')
      .replace(/\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b/gi, '')
      .replace(/\b(?:pasado\s+mañana|mañana|hoy|el\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo))\b/gi, '')
      .replace(/\b(?:a\s+las?|a\s+la|para\s+las?)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|hs|h|hrs)?\b/gi, '')
      .replace(/\b\d{1,2}(?::\d{2})\s*(?:am|pm)?\b/gi, '')
      .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, '')
      .replace(/^(?:\s*(?:un|una|el|la|los|las|de|para)\b)+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    title = title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Reunión agendada';

    const targetBlock = /\bpersonal\b/i.test(text) ? 'personal_block' : 'active_objectives';

    return {
      intent: 'CREATE_CALENDAR_EVENT',
      targetBlock,
      action: 'ADD_CALENDAR_EVENT',
      extractedData: {
        title,
        text: text.trim(),
        startDate,
        endDate,
        timeStr,
        dateStr,
        isTask: true,
        isList: false,
        type: 'task'
      }
    };
  }

  // 3. Detección de tipos de componentes
  const isHabit = /\b(h[aá]bitos?|rutinas?)\b/i.test(text);
  const isList = !isHabit && /\b(listas?|checklists?|enumeraci[oó]n|items?|ítems?)\b/i.test(text);
  const isTask = !isHabit && !isList && /\b(tareas?|recordatorios?|pendientes?|to-?do)\b/i.test(text);

  // 4. Inferencia de cuadrante P.A.R.A.
  let targetBlock = isHabit ? 'habit_creation' : (isList ? 'personal_block' : 'life_archive');
  if (!isHabit) {
    if (/\b(personal)\b/i.test(text)) targetBlock = 'personal_block';
    else if (/\b(objetivos?\s+activos?|objetivo|activo|proyecto)\b/i.test(text)) targetBlock = 'active_objectives';
    else if (/\b(inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|ideas?)\b/i.test(text)) targetBlock = 'inspiration_creativity';
    else if (/\b(archivo\s+de\s+vida|archivo|vida)\b/i.test(text)) targetBlock = 'life_archive';
    else if (isTask) targetBlock = 'active_objectives';
  }

  // 4. Extracción según el componente
  if (isHabit) {
    let name = text
      .replace(/\b(?:foco|crea|crear|agrega|agregar|nuevo|h[aá]bitos?|rutinas?)\b/gi, '')
      .replace(/^(?:\s*(?:de|para|un|una|el|la)\b)+/gi, '')
      .trim();
    name = name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Nuevo hábito';
    return {
      intent: 'CREATE_HABIT',
      targetBlock: 'habit_creation',
      action: 'ADD_HABIT',
      extractedData: { name, isTask: false, isList: false, type: 'habit' }
    };
  }

  if (isList) {
    let rawTitle = '';
    let rawItems = '';

    const colonMatch = text.match(/(?:lista|checklist)(?:\s+(?:de|para|llamada))?\s*([^:]+?)\s*:\s*(.+)/i);
    const conMatch = text.match(/(?:lista|checklist)(?:\s+(?:de|para|llamada))?\s*(.+?)\s+(?:con|que contenga|que diga|diciendo)\s+(.+)/i);

    if (colonMatch) {
      rawTitle = colonMatch[1].trim();
      rawItems = colonMatch[2].trim();
    } else if (conMatch) {
      rawTitle = conMatch[1].trim();
      rawItems = conMatch[2].trim();
    } else {
      rawTitle = text
        .replace(/\b(?:foco|crea|crear|agrega|agregar|nuevo|genera|generar|anota|anotame)\b/gi, '')
        .replace(/\b(?:una?\s+)?(?:listas?|checklists?)\b/gi, '')
        .trim();
    }

    rawTitle = rawTitle
      .replace(/\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b/gi, '')
      .replace(/^(?:\s*(?:de|para|un|una|el|la)\b)+/gi, '')
      .trim();

    const title = rawTitle ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1) : 'Lista';

    const cleanItems = [];
    if (rawItems) {
      // Eliminar menciones del bloque al final si existieran en la lista de ítems
      rawItems = rawItems
        .replace(/\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b/gi, '')
        .trim();

      const parts = rawItems.split(/[,;]|\s+(?:y|e)\s+/i);
      parts.forEach(p => {
        let it = p.trim().replace(/^[-*•\s]+/, '').replace(/^(?:de|un|una|unos|unas|el|la|los|las)\s+/i, '').trim();
        if (it) {
          cleanItems.push({
            id: crypto.randomUUID(),
            text: it.charAt(0).toUpperCase() + it.slice(1),
            checked: false
          });
        }
      });
    }

    const synthText = cleanItems.length > 0
      ? `${title} - ` + cleanItems.map(i => i.text).join(' - ')
      : title;

    return {
      intent: 'CREATE_BLOCK_ITEM',
      targetBlock,
      action: 'ADD_LIST',
      extractedData: {
        title,
        text: synthText,
        items: cleanItems,
        isList: true,
        isTask: false,
        type: 'list'
      }
    };
  }

  // Tarea o Nota
  let cleanContent = text;
  const contentMatch = text.match(/(?:que diga(?: que)?|que dice(?: que)?|con el texto|que he dicho(?: que)?|que tengo que|diciendo(?: que)?)\s+(.+)/i);
  if (contentMatch) {
    cleanContent = contentMatch[1].trim();
  } else {
    cleanContent = cleanContent
      .replace(/\b(?:foco|crea|crear|agrega|agregar|nuevo|genera|generame|generar|quiero|necesito|anota|anotame)\b/gi, '')
      .replace(/\b(?:una?\s+)?(?:tareas?|notas?|ideas?|recordatorios?|pendientes?)\b/gi, '')
      .replace(/\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b/gi, '')
      .replace(/^(?:\s*(?:y|que|de|en|para|el|la|los|las|un|una)\b)+/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  cleanContent = cleanContent ? cleanContent.charAt(0).toUpperCase() + cleanContent.slice(1) : (isTask ? 'Tarea rápida' : 'Nota rápida');

  return {
    intent: 'CREATE_BLOCK_ITEM',
    targetBlock,
    action: isTask ? 'ADD_TASK' : 'ADD_NOTE',
    extractedData: {
      text: cleanContent,
      title: null,
      isTask: Boolean(isTask),
      isList: false,
      type: isTask ? 'task' : 'note'
    }
  };
}

/**
 * Orquesta la clasificación NLU: consulta con timeout optimizado al microservicio Python
 * y conmuta transparentemente al clasificador local ante fallos de red o latencia.
 */
async function classifyIntent(text) {
  if (!text || typeof text !== 'string') {
    return classifyIntentLocal('');
  }

  const NLU_API_URL = process.env.NLU_API_URL || 'http://localhost:5000/classify';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200); // 1.2s timeout estricto

    const response = await fetch(NLU_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.intent && data.extractedData) {
        return data;
      }
    }
    throw new Error(`Fallo o respuesta no válida de NLU (${response.status})`);
  } catch (error) {
    // Si Python no está disponible o supera el timeout, el procesador local resuelve
    // la declaración instantáneamente con alta fidelidad.
    return classifyIntentLocal(text);
  }
}

module.exports = { classifyIntent, classifyIntentLocal, parseCalendarDateTime };