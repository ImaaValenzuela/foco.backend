// src/services/nluService.js

/**
 * Llama al microservicio de Python (BERT/SBERT) para clasificar la intención
 * y extraer entidades del texto ingresado.
 */
async function classifyIntent(text) {
  try {
    // URL de tu microservicio Python (ej. Flask/FastAPI)
    const NLU_API_URL = process.env.NLU_API_URL || 'http://localhost:5000/classify';
    
    const response = await fetch(NLU_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error('Fallo en la inferencia del modelo NLU');
    }

    const data = await response.json();
    // Estructura esperada de Python: { targetBlock: "active_objectives", action: "ADD_TASK", extractedData: {...} }
    return data;
  } catch (error) {
    console.error('Error en nluService:', error);
    // Fallback de seguridad: si el NLU falla, mandamos todo al "life_archive"
    return {
      targetBlock: 'life_archive',
      action: 'ADD_NOTE',
      extractedData: { content: text, raw: true }
    };
  }
}

module.exports = { classifyIntent };