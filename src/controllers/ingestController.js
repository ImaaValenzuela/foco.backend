const nluService = require('../services/nluService');
const blockService = require('../services/blockService');
const habitService = require('../services/habitService'); // Inyectamos tu nuevo servicio

async function processIngestion(req, res) {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Texto requerido' });

    // 1. Inferencia Semántica (Python API)
    const inferenceResult = await nluService.classifyIntent(text);
    const { intent, targetBlock, extractedData } = inferenceResult;

    const userId = req.user.profileId;

    // 2. BIFURCACIÓN SEMÁNTICA
    if (intent === 'CREATE_HABIT') {
      // Ruta A: Creación de Hábito
      const nuevoHabito = await habitService.crearHabit(userId, extractedData.name);
      
      return res.status(200).json({
        message: 'Hábito creado correctamente',
        type: 'HABIT',
        data: nuevoHabito
      });
      
  } else {
      // Ruta B: Creación de Nota/Tarea en el Lienzo (JSONB)
      const blocksExistentes = await blockService.obtenerBlocksPorUsuario(userId);
      const bloqueActual = blocksExistentes.find(b => b.type === targetBlock);
      
      // 1. Clonación segura del estado actual
      let nuevoContenido = bloqueActual && bloqueActual.content ? { ...bloqueActual.content } : { notes: [] };
      nuevoContenido.notes = nuevoContenido.notes ? [...nuevoContenido.notes] : [];

      // 2. MIGRACIÓN GENERACIÓN 1: El string suelto en la raíz
      const oldText = nuevoContenido.text || nuevoContenido.texto;
      if (oldText) {
          nuevoContenido.notes.unshift({
              id: crypto.randomUUID(),
              text: oldText,
              title: null,
              isTask: false,
              checked: false,
              createdAt: new Date().toISOString()
          });
          delete nuevoContenido.text;
          delete nuevoContenido.texto;
      }

      // 3. MIGRACIÓN GENERACIÓN 2: El antiguo array "items"
      if (nuevoContenido.items && Array.isArray(nuevoContenido.items)) {
          nuevoContenido.items.forEach(item => {
              nuevoContenido.notes.push({
                  id: item.id || crypto.randomUUID(),
                  text: item.content || item.text || "", // En "items" el texto se llamaba "content"
                  title: null,
                  isTask: false,
                  checked: false,
                  createdAt: item.createdAt || new Date().toISOString()
              });
          });
          // Destruimos el array viejo para mantener la base de datos limpia
          delete nuevoContenido.items; 
      }

      // 4. Inserción del nuevo input de la IA (Generación 3)
      nuevoContenido.notes.push({
        id: crypto.randomUUID(),
        text: extractedData.text,
        title: null,
        isTask: extractedData.isTask,
        checked: false,
        createdAt: new Date().toISOString()
      });

      // 5. UPSERT en PostgreSQL: Actualiza la fila existente sin crear una nueva
      const savedBlock = await blockService.crearBlock(userId, targetBlock, nuevoContenido);
      
      return res.status(200).json({
        message: 'Nota procesada y bloque migrado correctamente',
        type: 'BLOCK',
        data: savedBlock
      });
    }

  } catch (error) {
    console.error('Error en processIngestion:', error);
    res.status(500).json({ error: 'Error procesando la ingesta' });
  }
}

module.exports = { processIngestion };