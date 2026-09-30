import re
import uuid
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
        
        # 2. IDENTIFICACIÓN DE CONEXIONES / FLECHAS (Acción Relacional)
        conn_match = re.search(r"\b(?:conecta|conectar|vincula|vincular|asocia|asociar|flecha|relaciona|relacionar)\s+(?:la\s+)?(?:tarjeta|nota|tarea|lista)?\s*(.+?)\s+(?:con|a|hacia|y)\s+(?:la\s+)?(?:tarjeta|nota|tarea|lista)?\s*(.+)", text)
        if conn_match:
            source_q = conn_match.group(1).strip()
            target_q = conn_match.group(2).strip()
            return ClassificationResponse(
                intent="CREATE_CONNECTION",
                targetBlock="canvas",
                action="ADD_CONNECTION",
                extractedData={
                    "sourceQuery": source_q,
                    "targetQuery": target_q
                }
            )

        # 3. IDENTIFICACIÓN DE TIPO (Lista, Tarea, Hábito, Nota)
        is_habit = bool(re.search(r"\b(h[aá]bitos?|rutinas?)\b", text))
        is_list = not is_habit and bool(re.search(r"\b(listas?|checklists?|enumeraci[oó]n|items?|ítems?)\b", text))
        is_task = not is_habit and not is_list and bool(re.search(r"\b(tareas?|recordatorios?|pendientes?|to-?do)\b", text))

        # 4. IDENTIFICACIÓN DE BLOQUE DESTINO (P.A.R.A.)
        target_block = "personal_block" if (is_habit or is_list) else "life_archive"
        block_match = re.search(r"\b(personal|objetivos?\s+activos?|creatividad|inspiraci[oó]n|archivo\s+de\s+vida)\b", text)
        if block_match:
            b = block_match.group(1)
            if "personal" in b: target_block = "personal_block"
            elif "objetivo" in b or "activo" in b: target_block = "active_objectives"
            elif "creativ" in b or "inspirac" in b: target_block = "inspiration_creativity"
            elif "archivo" in b or "vida" in b: target_block = "life_archive"
        else:
            if "objetivo" in text or "activo" in text or "proyecto" in text: target_block = "active_objectives"
            elif "personal" in text: target_block = "personal_block"
            elif "creativ" in text or "inspirac" in text: target_block = "inspiration_creativity"

        # 5. EXTRACCIÓN ESPECIALIZADA POR COMPONENTE
        extracted_data = {}
        text_for_embedding = ""

        if is_habit:
            content = ""
            content_match = re.search(r"(?:que diga(?: que)?|con el texto|de|para)\s+(.+)", text)
            if content_match:
                content = content_match.group(1).strip()
            else:
                clean = re.sub(r"\b(?:foco|crea|crear|agrega|agregar|nuevo|h[aá]bitos?|rutinas?)\b", "", text)
                content = clean.strip()
            content = content.capitalize() if content else "Nuevo hábito"
            text_for_embedding = content
            extracted_data = {
                "name": content,
                "isTask": False,
                "isList": False,
                "type": "habit"
            }

        elif is_list:
            raw_title = ""
            raw_items = ""

            colon_match = re.search(r"(?:lista|checklist)(?:\s+(?:de|para|llamada))?\s*([^:]+?)\s*:\s*(.+)", text)
            if colon_match:
                raw_title = colon_match.group(1).strip()
                raw_items = colon_match.group(2).strip()
            else:
                con_match = re.search(r"(?:lista|checklist)(?:\s+(?:de|para|llamada))?\s*(.+?)\s+(?:con|que contenga|que diga|diciendo)\s+(.+)", text)
                if con_match:
                    raw_title = con_match.group(1).strip()
                    raw_items = con_match.group(2).strip()
                else:
                    clean = text
                    clean = re.sub(r"\b(?:foco|crea|crear|agrega|agregar|nuevo|genera|generar|anota|anotame)\b", "", clean)
                    clean = re.sub(r"\b(?:una?\s+)?(?:listas?|checklists?)\b", "", clean)
                    raw_title = clean.strip()

            raw_title = re.sub(r"\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b", "", raw_title)
            raw_title = re.sub(r"^(?:\s*(?:de|para|un|una|el|la)\b)+", "", raw_title).strip()
            list_title = raw_title.capitalize() if raw_title else "Lista"

            clean_items = []
            if raw_items:
                raw_items = re.sub(r"\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b", "", raw_items, flags=re.I).strip()
                parts = re.split(r"[,;]|\s+(?:y|e)\s+", raw_items)
                for p in parts:
                    item_txt = p.strip().strip(".-*•")
                    item_txt = re.sub(r"^(?:de|un|una|unos|unas|el|la|los|las)\s+", "", item_txt, flags=re.I).strip()
                    if item_txt:
                        clean_items.append({
                            "id": str(uuid.uuid4()),
                            "text": item_txt.capitalize(),
                            "checked": False
                        })

            synth_text = f"{list_title} - " + " - ".join([i["text"] for i in clean_items]) if clean_items else list_title
            text_for_embedding = synth_text
            extracted_data = {
                "title": list_title,
                "text": synth_text,
                "items": clean_items,
                "isList": True,
                "isTask": False,
                "type": "list"
            }

        else:
            content = ""
            content_match = re.search(r"(?:que diga(?: que)?|que dice(?: que)?|con el texto|que he dicho(?: que)?|que tengo que|diciendo(?: que)?)\s+(.+)", text)
            if content_match:
                content = content_match.group(1).strip()
            else:
                clean = text
                clean = re.sub(r"\b(?:foco|crea|crear|agrega|agregar|nuevo|genera|generame|generar|quiero|necesito|anota|anotame)\b", "", clean)
                clean = re.sub(r"\b(?:una?\s+)?(?:tareas?|notas?|ideas?|recordatorios?|pendientes?)\b", "", clean)
                clean = re.sub(r"\b(?:en|para)?\s*(?:el|la)?\s*(?:bloque\s+)?(?:de\s+)?(?:personal|objetivos?\s+activos?|inspiraci[oó]n(?:\s+y\s+creatividad)?|creatividad|archivo\s+de\s+vida)\b", "", clean)
                clean = re.sub(r"^(?:\s*(?:y|que|de|en|para|el|la|los|las|un|una)\b)+", "", clean)
                content = re.sub(r"\s+", " ", clean).strip()

            content = content.capitalize() if content else ("Tarea rápida" if is_task else "Nota rápida")
            text_for_embedding = content
            extracted_data = {
                "text": content,
                "title": None,
                "isTask": is_task,
                "isList": False,
                "type": "task" if is_task else "note"
            }

        # 6. OPTIMIZACIÓN DE RENDIMIENTO: VECTORIZACIÓN INTEGRADA EN UNA SOLA LLAMADA
        if sbert_model is not None and text_for_embedding:
            try:
                extracted_data["embedding"] = sbert_model.encode(text_for_embedding).tolist()
            except Exception as err:
                print(f"Aviso: vectorización inline omitida: {err}")

        # 7. RETORNO ESTRUCTURADO
        return ClassificationResponse(
            intent="CREATE_HABIT" if is_habit else "CREATE_BLOCK_ITEM",
            targetBlock="habit_creation" if is_habit else target_block,
            action="ADD_HABIT" if is_habit else ("ADD_LIST" if is_list else ("ADD_TASK" if is_task else "ADD_NOTE")),
            extractedData=extracted_data
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