const crypto = require('crypto');
const nluService = require('../services/nluService');
const blockService = require('../services/blockService');
const habitService = require('../services/habitService');
const { googleCalendarService } = require('../services/googleCalendar.service');

async function processIngestion(req, res) {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Texto requerido' });
    }

    const userId = req.user.profileId;

    // 1. Inferencia Semántica (Python API con fallback local <1ms)
    const inferenceResult = await nluService.classifyIntent(text);
    const { intent, targetBlock, action, extractedData = {} } = inferenceResult;

    // 2. RUTA RELACIONAL: Conectar tarjetas mediante Flecha
    if (intent === 'CREATE_CONNECTION' && extractedData.sourceQuery && extractedData.targetQuery) {
      const blocks = await blockService.obtenerBlocksPorUsuario(userId);
      const allNotes = [];
      for (const b of blocks) {
        for (const n of (b.content?.notes || [])) {
          allNotes.push({ ...n, blockId: b.id, blockType: b.type, block: b });
        }
      }

      const q1 = extractedData.sourceQuery.toLowerCase();
      const q2 = extractedData.targetQuery.toLowerCase();

      const sourceNote = allNotes.find(n => 
        (n.title && n.title.toLowerCase().includes(q1)) || 
        (n.text && n.text.toLowerCase().includes(q1))
      );
      const targetNote = allNotes.find(n => 
        (n.id !== sourceNote?.id) && (
          (n.title && n.title.toLowerCase().includes(q2)) || 
          (n.text && n.text.toLowerCase().includes(q2))
        )
      );

      if (sourceNote && targetNote) {
        const parentBlock = sourceNote.block;
        if (!Array.isArray(parentBlock.content.connections)) {
          parentBlock.content.connections = [];
        }

        const yaExiste = parentBlock.content.connections.some(c =>
          (c.sourceId === sourceNote.id && c.targetId === targetNote.id) ||
          (c.sourceId === targetNote.id && c.targetId === sourceNote.id)
        );

        if (!yaExiste) {
          parentBlock.content.connections.push({
            id: crypto.randomUUID(),
            sourceId: sourceNote.id,
            targetId: targetNote.id,
            createdAt: new Date().toISOString()
          });
          await blockService.actualizarBlock(parentBlock.id, userId, { 
            type: parentBlock.type, 
            content: parentBlock.content 
          });
        }

        return res.status(200).json({
          message: 'Tarjetas vinculadas correctamente con flecha',
          type: 'CONNECTION',
          data: { sourceId: sourceNote.id, targetId: targetNote.id }
        });
      }
    }

    // 3. RUTA HÁBITOS: Creación de Hábito
    if (intent === 'CREATE_HABIT') {
      let vectorData = extractedData.embedding || null;

      // Si el microservicio Python no adjuntó el vector directamente, se intenta una vez con timeout
      if (!vectorData && extractedData.name && process.env.NODE_ENV !== 'test' && process.env.IA_SERVICE_URL) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1200);
          const iaResponse = await fetch(`${process.env.IA_SERVICE_URL}/vectorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: extractedData.name }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (iaResponse.ok) {
            const iaJson = await iaResponse.json();
            vectorData = iaJson.embedding;
          }
        } catch (error) {
          console.warn('IA Service no disponible para vectorizar hábito en tiempo real.');
        }
      }

      const habitName = extractedData.name || text.trim();
      const nuevoHabito = await habitService.crearHabit(userId, habitName, vectorData);

      return res.status(200).json({
        message: 'Hábito creado y vectorizado correctamente',
        type: 'HABIT',
        data: nuevoHabito
      });
    }

    // 3.5. RUTA CALENDARIO DUAL: Creación de Evento en Google Calendar + Bloque en Lienzo
    if (intent === 'CREATE_CALENDAR_EVENT') {
      let calendarEvent = null;
      let calendarSynced = false;

      try {
        calendarEvent = await googleCalendarService.createCalendarEvent(userId, {
          summary: extractedData.title || text.trim(),
          description: text.trim(),
          start: extractedData.startDate,
          end: extractedData.endDate
        });
        calendarSynced = true;
      } catch (calError) {
        console.warn('No se pudo sincronizar evento con Google Calendar (modo offline o no conectado):', calError.message);
      }

      // Sincronización en el bloque correspondiente del lienzo (active_objectives o personal_block)
      const calBlockType = targetBlock || 'active_objectives';
      const bloqueActual = await blockService.obtenerBlockPorUsuarioYTipo(userId, calBlockType);

      let nuevoContenido = bloqueActual && bloqueActual.content ? { ...bloqueActual.content } : { notes: [], connections: [] };
      nuevoContenido.notes = Array.isArray(nuevoContenido.notes) ? [...nuevoContenido.notes] : [];
      nuevoContenido.connections = Array.isArray(nuevoContenido.connections) ? [...nuevoContenido.connections] : [];

      const noteTitle = extractedData.title || 'Evento agendado';
      const eventNote = {
        id: crypto.randomUUID(),
        title: noteTitle,
        text: extractedData.text || text.trim(),
        type: 'task',
        isTask: true,
        checked: false,
        calendarEventId: calendarEvent?.id || null,
        calendarLink: calendarEvent?.htmlLink || null,
        calendarSynced,
        scheduledAt: extractedData.startDate || null,
        createdAt: new Date().toISOString()
      };

      nuevoContenido.notes.push(eventNote);
      const savedBlock = await blockService.crearBlock(userId, calBlockType, nuevoContenido);

      return res.status(200).json({
        message: calendarSynced
          ? 'Evento agendado en Google Calendar y guardado en el lienzo correctamente'
          : 'Evento guardado en el lienzo (Google Calendar no sincronizado)',
        type: 'CALENDAR_EVENT',
        calendarSynced,
        calendarEvent,
        data: savedBlock,
        note: eventNote
      });
    }

    // 4. RUTA LIENZO: Creación de Lista, Tarea o Nota (P.A.R.A.)
    // Búsqueda directa optimizada por índice en lugar de escanear todos los bloques
    const bloqueActual = await blockService.obtenerBlockPorUsuarioYTipo(userId, targetBlock);

    let nuevoContenido = bloqueActual && bloqueActual.content ? { ...bloqueActual.content } : { notes: [], connections: [] };
    nuevoContenido.notes = Array.isArray(nuevoContenido.notes) ? [...nuevoContenido.notes] : [];
    nuevoContenido.connections = Array.isArray(nuevoContenido.connections) ? [...nuevoContenido.connections] : [];

    // Vectorización optimizada (reutiliza el vector calculado por NLU en la misma llamada si está disponible)
    let vectorData = extractedData.embedding || null;
    const textToVectorize = extractedData.text || extractedData.title || text;

    if (!vectorData && textToVectorize && process.env.NODE_ENV !== 'test' && process.env.IA_SERVICE_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const iaResponse = await fetch(`${process.env.IA_SERVICE_URL}/vectorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToVectorize }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (iaResponse.ok) {
          const iaJson = await iaResponse.json();
          vectorData = iaJson.embedding;
        }
      } catch (error) {
        console.warn('Vectorización síncrona omitida por latencia. Se procesará en segundo plano.');
      }
    }

    // Discriminación estricta del componente de acción
    const isList = action === 'ADD_LIST' || Boolean(extractedData.isList) || extractedData.type === 'list';
    const isTask = !isList && (action === 'ADD_TASK' || Boolean(extractedData.isTask) || extractedData.type === 'task');

    if (isList) {
      const listTitle = extractedData.title ? String(extractedData.title).trim() : 'Lista';
      const cleanItems = Array.isArray(extractedData.items) ? extractedData.items : [];
      const synthText = extractedData.text || (cleanItems.length > 0 ? `${listTitle} - ` + cleanItems.map(i => i.text).join(' - ') : listTitle);

      nuevoContenido.notes.push({
        id: crypto.randomUUID(),
        title: listTitle,
        text: synthText,
        type: 'list',
        isTask: false,
        checked: false,
        items: cleanItems,
        createdAt: new Date().toISOString(),
        ...(vectorData ? { embedding: vectorData } : {})
      });
    } else if (isTask) {
      const taskText = String(extractedData.text || text).trim();
      nuevoContenido.notes.push({
        id: crypto.randomUUID(),
        title: null,
        text: taskText,
        type: 'task',
        isTask: true,
        checked: false,
        createdAt: new Date().toISOString(),
        ...(vectorData ? { embedding: vectorData } : {})
      });
    } else {
      const noteText = String(extractedData.text || text).trim();
      nuevoContenido.notes.push({
        id: crypto.randomUUID(),
        title: null,
        text: noteText,
        type: 'note',
        isTask: false,
        checked: false,
        createdAt: new Date().toISOString(),
        ...(vectorData ? { embedding: vectorData } : {})
      });
    }

    // UPSERT atómico en PostgreSQL
    const savedBlock = await blockService.crearBlock(userId, targetBlock, nuevoContenido);

    return res.status(200).json({
      message: 'Elemento procesado e integrado al lienzo correctamente',
      type: 'BLOCK',
      data: savedBlock
    });

  } catch (error) {
    console.error('Error en processIngestion:', error);
    res.status(500).json({ error: 'Error procesando la ingesta' });
  }
}

module.exports = { processIngestion };