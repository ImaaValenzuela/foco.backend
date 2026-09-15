from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="F.O.C.O. Fast NLU Engine")

class IngestRequest(BaseModel):
    text: str

class ClassificationResponse(BaseModel):
    intent: str
    targetBlock: str
    action: str
    extractedData: dict

@app.post("/classify", response_model=ClassificationResponse)
async def classify_text(request: IngestRequest):
    try:
        user_text = request.text.lower()
        
        # 1. ENRUTAMIENTO ULTRARRÁPIDO POR PALABRAS CLAVE
        best_match = "life_archive" # Fallback por defecto
        
        if any(word in user_text for word in ["hábito", "rutina", "todos los días"]):
            best_match = "habit_creation"
        elif any(word in user_text for word in ["objetivo", "activos", "proyecto"]):
            best_match = "active_objectives"
        elif any(word in user_text for word in ["personal", "diario", "recordatorio"]):
            best_match = "personal_block"
        elif any(word in user_text for word in ["creatividad", "inspiración", "idea"]):
            best_match = "inspiration_creativity"

        # 2. DETECCIÓN DE TIPO (¿Es una tarea con checkbox?)
        task_keywords = ["tarea", "comprar", "hacer", "estudiar", "completar", "acordarme"]
        is_task = any(word in user_text for word in task_keywords)
        
        if best_match == "active_objectives":
            is_task = True
            
        is_habit = (best_match == "habit_creation")

        # 3. ENSAMBLAJE DE RESPUESTA
        # Dejamos el texto crudo por ahora, tal como pediste, pero capitalizado
        raw_text = request.text.strip()
        if len(raw_text) > 0:
            raw_text = raw_text[0].upper() + raw_text[1:]

        return ClassificationResponse(
            intent="CREATE_HABIT" if is_habit else "CREATE_BLOCK_ITEM",
            targetBlock=best_match,
            action="ADD_HABIT" if is_habit else "ADD_NOTE",
            extractedData={
                "name": raw_text if is_habit else None,
                "text": raw_text if not is_habit else None,
                "isTask": is_task
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))