// src/services/nluService.js
const crypto = require('crypto');

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

  // 2. Detección de tipos de componentes
  const isHabit = /\b(h[aá]bitos?|rutinas?)\b/i.test(text);
  const isList = !isHabit && /\b(listas?|checklists?|enumeraci[oó]n|items?|ítems?)\b/i.test(text);
  const isTask = !isHabit && !isList && /\b(tareas?|recordatorios?|pendientes?|to-?do)\b/i.test(text);

  // 3. Inferencia de cuadrante P.A.R.A.
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

module.exports = { classifyIntent, classifyIntentLocal };