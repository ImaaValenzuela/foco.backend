import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from rules_engine import RuleEngine
from contextlib import asynccontextmanager
from sentence_transformers import SentenceTransformer

# Variables globales para el Modelo SBERT
sbert_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global sbert_model
    # 1. Carga del modelo multilenguaje en memoria al iniciar el servidor
    sbert_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    
    # 2. Warmup inmediato: Precalentamiento de tensores y kernels JIT
    # Elimina el lag de +500ms que sufría la primera petición real de un usuario.
    sbert_model.encode(["warmup"], show_progress_bar=False)
    print("🚀 [F.O.C.O. IA] SBERT y PyTorch precalentados con éxito.")
    yield

app = FastAPI(title="F.O.C.O. NLP & Inference Engine", lifespan=lifespan)

@app.get("/healthz")
def health_check():
    return {
        "status": "ok",
        "model_loaded": sbert_model is not None
    }

class IngestRequest(BaseModel):
    text: str

class ClassificationResponse(BaseModel):
    intent: str
    targetBlock: str
    action: str
    extractedData: dict

class VectorizeRequest(BaseModel):
    text: str

class VectorizeResponse(BaseModel):
    embedding: list[float]

@app.post("/classify", response_model=ClassificationResponse)
async def classify_text(request: IngestRequest):
    try:
        text = request.text.lower().strip()
        text = re.sub(r"(?i)\s+por\s+favor\.?$", "", text)
        
        # 1. PARCHES DE TRANSCRIPCIÓN (WHISPER)
        text = text.replace('"', '').replace("'", "")
        text = text.replace("gratividad", "creatividad")
        text = text.replace("hábitol", "hábito").replace("habitol", "habito")
        text = text.replace("rebar", "regar")
        
        # 2. IDENTIFICACIÓN DE TIPO (Tarea, Nota, Hábito)
        type_match = re.search(r"\b(tareas?|notas?|ideas?|recordatorios?|h[aá]bitos?|rutinas?)\b", text)
        item_type = type_match.group(1) if type_match else "nota"
        
        is_habit = bool(re.match(r"h[aá]bitos?|rutinas?", item_type))
        is_task = bool(re.match(r"tareas?|recordatorios?", item_type))

        # 3. IDENTIFICACIÓN DE BLOQUE DESTINO
        target_block = "life_archive" 
        if not is_habit:
            block_match = re.search(r"\b(personal|objetivos?\s+activos?|creatividad|inspiraci[oó]n|archivo\s+de\s+vida)\b", text)
            if block_match:
                b = block_match.group(1)
                if "personal" in b: target_block = "personal_block"
                elif "objetivo" in b or "activo" in b: target_block = "active_objectives"
                elif "creativ" in b or "inspirac" in b: target_block = "inspiration_creativity"
                elif "archivo" in b or "vida" in b: target_block = "life_archive"
            else:
                if "objetivo" in text or "activo" in text: target_block = "active_objectives"
                elif "personal" in text: target_block = "personal_block"
                elif "creativ" in text or "inspirac" in text: target_block = "inspiration_creativity"

        # 4. EXTRACCIÓN SÚPER PRECISA DEL CONTENIDO
        content = ""
        
        # A. Buscar conectores fuertes primero (ahora sin el traicionero "de")
        content_match = re.search(r"(?:que diga(?: que)?|que dice(?: que)?|con el texto|que he dicho(?: que)?|que tengo que|diciendo(?: que)?)\s+(.+)", text)
        
        if content_match:
            content = content_match.group(1).strip()
        else:
            # B. Si no hay conector, limpieza agresiva de metadatos
            clean = text
            # Borra verbos y palabras de activación
            clean = re.sub(r"\b(?:foco|crea|crear|agrega|agregar|nuevo|genera|generame|generar|quiero|necesito|anota|anotame)\b", "", clean)
            # Borra menciones del tipo
            clean = re.sub(r"\b(?:una?\s+)?(?:tareas?|notas?|ideas?|recordatorios?|h[aá]bitos?|rutinas?)\b", "", clean)
            # Borra menciones del bloque
            clean = re.sub(r"\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b", "", clean)
            # Limpia preposiciones residuales al inicio de la frase
            clean = re.sub(r"^(?:\s*(?:y|que|de|en|para|el|la|los|las|un|una)\b)+", "", clean)
            
            content = re.sub(r"\s+", " ", clean).strip()

        # Asegurar capitalización
        content = content.capitalize() if content else "Nota rápida"

        # 5. ENSAMBLAJE
        return ClassificationResponse(
            intent="CREATE_HABIT" if is_habit else "CREATE_BLOCK_ITEM",
            targetBlock="habit_creation" if is_habit else target_block,
            action="ADD_HABIT" if is_habit else "ADD_NOTE",
            extractedData={
                "name": content if is_habit else None,
                "text": content if not is_habit else None,
                "isTask": is_task
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Endpoint exclusivo de vectorización: Se define como 'def' para delegar el cálculo
# de tensores PyTorch al threadpool de Starlette, previniendo congelamientos del Event Loop.
@app.post("/vectorize", response_model=VectorizeResponse)
def vectorize_text(request: VectorizeRequest):
    if sbert_model is None:
        raise HTTPException(status_code=500, detail="El modelo SBERT no está inicializado.")
    
    try:
        # Codificamos el texto limpio a un vector denso de 384 dimensiones
        vector = sbert_model.encode(request.text).tolist()
        return VectorizeResponse(embedding=vector)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en vectorización: {str(e)}")

# Instanciamos el motor de reglas en memoria
rule_engine = RuleEngine()

# --- ESQUEMAS PARA LA FASE 3 ---
class SnapshotRequest(BaseModel):
    user_id: str
    associated_pomodoro_id: Optional[str] = None
    snap_motivations: Dict[str, bool]
    snap_interests: List[str]
    snap_routine: Dict[str, int]
    snap_blocks_content: List[Dict[str, Any]]
    snap_habits_metrics: Dict[str, Any]

class InferenceResponse(BaseModel):
    triggered: bool
    rule_id: Optional[str] = None
    action_taken: Optional[str] = None
    suggested_message: Optional[str] = None

# --- ENDPOINT FASE 3: EVALUADOR IF-THEN ---
# Se utiliza `def` en lugar de `async def` para que FastAPI delegue automáticamente
# la ejecución CPU-bound al Threadpool de Starlette (anyio.to_thread.run_sync),
# garantizando que el Event Loop de asyncio nunca sufra congelamientos.
@app.post("/evaluate-rules", response_model=InferenceResponse)
def evaluate_rules(request: SnapshotRequest):
    try:
        # El motor procesa los diccionarios estáticos y dinámicos (O(1) / O(N) muy bajo) en el threadpool
        result = rule_engine.evaluate(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en motor de inferencia: {str(e)}")