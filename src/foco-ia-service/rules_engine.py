from datetime import datetime

class RuleEngine:
    def __init__(self):
        # El motor evalúa secuencialmente. Retorna la primera regla que coincida 
        # para evitar sobrecargar la UI con múltiples alertas simultáneas.
        pass

    def evaluate(self, snapshot) -> dict:
        motivations = snapshot.snap_motivations
        interests = snapshot.snap_interests
        routine = snapshot.snap_routine
        metrics = snapshot.snap_habits_metrics
        
        # Para facilitar la lectura de reglas complejas:
        now = datetime.now()
        current_hour = now.hour
        current_minute = now.minute
        is_monday = now.weekday() == 0
        is_weekend = now.weekday() in [5, 6]
        time_float = current_hour + (current_minute / 60)

        # ---------------------------------------------------------
        # CATEGORÍA A: Evitar Dispersión (mot_avoid_dispersion = TRUE)
        # ---------------------------------------------------------
        if motivations.get("mot_avoid_dispersion", False):
            
            # Regla A.1: Alerta por Desvío Crítico de Rutina de Estudio
            if routine.get("study", 0) >= 2 and metrics.get("pomodoro_completed_last_48h", 0) == 0:
                if metrics.get("active_objectives_pending_older_48h", 0) >= 1:
                    return {
                        "triggered": True,
                        "rule_id": "F_DISP_DESVIO_ESTUDIO",
                        "action_taken": "INJECT_CONVERSATIONAL_ALERT",
                        "suggested_message": "Noté que tenés objetivos pendientes en tu tablero. ¿Qué tal si hoy le dedicamos un solo ciclo Pomodoro de 25 minutos? Dar el primer paso despeja la mente."
                    }

            # Regla A.2: Fatiga e Interrupción Repetida de Pomodoro
            if metrics.get("pomodoro_interrupted_last_24h", 0) >= 2 and metrics.get("pomodoro_completed_last_24h", 0) == 0:
                return {
                    "triggered": True,
                    "rule_id": "F_DISP_POMODORO_ABANDONO",
                    "action_taken": "SHOW_BREAK_PROMPT_UI",
                    "suggested_message": "Veo que hoy cuesta concentrarse, ¡y es normal! ¿Qué te parece si hacemos un recreo de 10 minutos para estirar las piernas?"
                }

            # Regla A.3: Procrastinación en Proyectos Personales / Emprendimientos
            has_project_interest = any(i in interests for i in ['entrepreneurship', 'career_planning'])
            if has_project_interest and metrics.get("active_objectives_pending_items", 0) >= 1:
                if metrics.get("active_objectives_inactive_hours", 0) >= 72 and metrics.get("pomodoro_completed_last_72h", 0) == 0:
                    return {
                        "triggered": True,
                        "rule_id": "F_DISP_PROY_INACTIVO",
                        "action_taken": "RECOMMEND_PROJECT_PLAN",
                        "suggested_message": "Tu proyecto sigue esperando en Objetivos Activos. A veces abruma. ¿Qué tal si hoy dividimos esa tarjeta en 3 tareas ultra pequeñas?"
                    }

            # Regla A.4: Alerta de Desvío de Rutina (Ocio vs Estudio)
            study_hours = routine.get("study", 0)
            if study_hours >= 2 and metrics.get("pomodoro_completed_last_7d", 0) < (study_hours * 2):
                return {
                    "triggered": True,
                    "rule_id": "F_DISP_OCIO_SOBRE_PLAN",
                    "action_taken": "INJECT_CONVERSATIONAL_ALERT",
                    "suggested_message": "Lograste espacio para tu esparcimiento, lo cual es excelente. Pero noté que tus metas de estudio quedaron de lado. ¿Equilibramos la balanza con un ciclo de enfoque?"
                }

            # Regla A.5: Falta de Planificación Semanal (Estudiante sin Agenda)
            if is_monday and study_hours >= 1 and metrics.get("active_objectives_pending_items", 0) == 0:
                return {
                    "triggered": True,
                    "rule_id": "F_DISP_VACIO_PLANIFICACION",
                    "action_taken": "PROMPT_WEEKLY_PLANNING",
                    "suggested_message": "¡Buen lunes! Arrancamos con el lienzo limpio. ¿Qué te parece si anotamos las 2 metas académicas más importantes de esta semana en 'Objetivos Activos'?"
                }

            # Regla A.6: Tags de Intereses Activos sin Proyectos Asociados
            if len(interests) >= 1 and metrics.get("active_objectives_inactive_hours", 0) >= 120:
                if not metrics.get("has_notes_matching_interests", True):
                    return {
                        "triggered": True,
                        "rule_id": "F_DISP_INTERES_HUERFANO",
                        "action_taken": "SUGGEST_INTEREST_CARD",
                        "suggested_message": "Al registrarte mencionaste intereses que no veo en tus proyectos. ¿Querés que arrastremos una nota con un recurso recomendado para reactivarlo?"
                    }

        # ---------------------------------------------------------
        # CATEGORÍA B: Creación de Hábitos Estables (mot_create_habits = TRUE)
        # ---------------------------------------------------------
        if motivations.get("mot_create_habits", False):
            
            # Regla B.1: Reenganche en Hábitos de Bienestar
            has_wellness_interest = any(i in interests for i in ['strength_training', 'running', 'yoga_mindfulness'])
            if has_wellness_interest and metrics.get("has_wellness_habit", False):
                if metrics.get("wellness_completion_rate_7d", 1.0) < 0.40:
                    return {
                        "triggered": True,
                        "rule_id": "F_HAB_REENGANCHE_BIENESTAR",
                        "action_taken": "HIGHLIGHT_HABIT_TRACKER",
                        "suggested_message": "Noté que tu hábito de bienestar quedó atrás. ¿Qué tal si nos proponemos una meta mínima hoy? 10 minutos de estiramientos o caminar. ¡Todo suma!"
                    }

            # Regla B.2: Refuerzo Positivo por Racha (Gamificación)
            if metrics.get("max_current_streak", 0) >= 5 and not metrics.get("reward_given_last_7d", False):
                return {
                    "triggered": True,
                    "rule_id": "F_HAB_RECOMPENSA_RACHA",
                    "action_taken": "CELEBRATION_CONFETTI_EFFECT",
                    "suggested_message": "¡Impresionante! Llevás una racha de 5+ días. Estás construyendo disciplina real. Hoy asegurate de reservar un ratito de ocio como premio."
                }

            # Regla B.3: Vinculación de Hábito Técnico a Interés Profesional
            has_tech_interest = any(i in interests for i in ['software_development', 'ux_ui_design', 'data_science'])
            if has_tech_interest and not metrics.get("has_technical_habit", False):
                return {
                    "triggered": True,
                    "rule_id": "F_HAB_TECNICO_INTERES",
                    "action_taken": "SUGGEST_TECHNICAL_HABIT",
                    "suggested_message": "En tecnología, la constancia es clave. ¿Qué te parece si sumamos al tracker un hábito diario de 20 minutos de práctica profesional?"
                }

            # Regla B.4: Alerta de Consistencia en Declinación
            if metrics.get("completion_rate_prev_week", 0) >= 0.75 and metrics.get("consecutive_failed_current_week", 0) == 2:
                return {
                    "triggered": True,
                    "rule_id": "F_HAB_PREVENCION_QUIEBRE",
                    "action_taken": "SOFT_GENTLE_RECONECT",
                    "suggested_message": "Venías con un ritmo espectacular la semana pasada. Pasaron dos días sin registro, pero hoy es un excelente día para reconectar. ¡Sólo un poquito hoy!"
                }

            # Regla B.5: Hábitos de Pausa Activa tras múltiples Pomodoros
            has_health_interest = any(i in interests for i in ['yoga_mindfulness', 'healthy_nutrition'])
            if has_health_interest and metrics.get("pomodoro_completed_today", 0) >= 3 and not metrics.get("has_stretch_habit", False):
                return {
                    "triggered": True,
                    "rule_id": "F_HAB_POMODORO_BIENESTAR",
                    "action_taken": "SUGGEST_STRETCH_HABIT",
                    "suggested_message": "¡Llevás 3 sesiones de enfoque impecables! ¿Agregamos un micro-hábito al tracker como 'Tomar agua' o 'Estirar 5 min' en tus pausas?"
                }

            # Regla B.6: Alerta de Abandono Total
            if metrics.get("total_habits_count", 0) >= 1 and metrics.get("total_entries_last_5d", 1) == 0:
                return {
                    "triggered": True,
                    "rule_id": "F_HAB_ABANDONO_TOTAL",
                    "action_taken": "HIGHLIGHT_HABIT_TRACKER",
                    "suggested_message": "¿Qué pasó con el tracker? Tus hábitos te extrañan. No te preocupes por el tiempo perdido; hoy marcá un solo checklist y reiniciá sin presiones."
                }

        # ---------------------------------------------------------
        # CATEGORÍA C: Organización y Planificación (mot_organization = TRUE)
        # ---------------------------------------------------------
        if motivations.get("mot_organization", False):
            
            # Regla C.1: Sobrecarga en Bloque Personal
            if metrics.get("personal_block_pending_items", 0) >= 10:
                return {
                    "triggered": True,
                    "rule_id": "F_ORG_SOBRECARGA_PERSONAL",
                    "action_taken": "HIGHLIGHT_LIFE_ARCHIVE_BOX",
                    "suggested_message": "¡Tu bloque Personal está repleto! Para evitar que se pierdan en el caos, probá arrastrar notas urgentes a 'Objetivos Activos' y archivar el resto."
                }

            # Regla C.2: Inactividad del Lienzo Completo
            if metrics.get("all_blocks_inactive_hours", 0) >= 144: # 6 días
                return {
                    "triggered": True,
                    "rule_id": "F_ORG_BOARD_INACTIVO",
                    "action_taken": "SHAKE_BOARD_DRAFT_TEMPLATE",
                    "suggested_message": "¿Empezando un nuevo proyecto? Preparé una plantilla en tu lienzo de 'Objetivos Activos' con los pasos clave para que sueltes tus notas de inmediato."
                }

            # Regla C.3: Conexión de Ideas Huérfanas
            if metrics.get("inspiration_notes_count", 0) >= 5 and metrics.get("inspiration_connections_count", 1) == 0:
                return {
                    "triggered": True,
                    "rule_id": "F_ORG_NOTAS_HUERFANAS",
                    "action_taken": "SUGGEST_ARROW_CONNECTIONS",
                    "suggested_message": "¡Tenés muchas ideas sueltas! ¿Sabías que podés conectarlas visualmente? Arrastrá una flecha entre ellas para encontrar patrones."
                }

            # Regla C.4: Inspiración Estancada
            if metrics.get("inspiration_items_older_7d", 0) >= 6 and metrics.get("active_objectives_pending_items", 0) <= 1:
                return {
                    "triggered": True,
                    "rule_id": "F_ORG_INSPIRACION_ESTANCADA",
                    "action_taken": "INJECT_INSPIRATION_PROMPT",
                    "suggested_message": "Tus ideas llevan días inspirándote. Para que no queden en el tintero, ¿qué tal si arrastrás una hoy al bloque de 'Objetivos Activos'?"
                }

            # Regla C.5: Archivo de Vida Inactivo
            if metrics.get("active_objectives_completed_items", 0) >= 5:
                return {
                    "triggered": True,
                    "rule_id": "F_ORG_ARCHIVO_INACTIVO",
                    "action_taken": "HIGHLIGHT_LIFE_ARCHIVE_BOX",
                    "suggested_message": "¡Genial! Completaste varios objetivos. Para mantener tu lienzo despejado, arrastrá esas tareas hacia tu 'Archivo de Vida' y guardalas con orgullo."
                }

            # Regla C.6: Saturación Visual Crítica
            if metrics.get("all_blocks_total_items", 0) >= 30 and metrics.get("life_archive_items", 10) <= 2:
                return {
                    "triggered": True,
                    "rule_id": "F_ORG_SOBRECARGA_VISUAL",
                    "action_taken": "SUGGEST_CLEAN_UP_ROUTINE",
                    "suggested_message": "Tu lienzo tiene más de 30 elementos en pantalla. Demasiada estimulación genera fatiga. Hagamos una rutina de limpieza moviendo notas al 'Archivo de Vida'."
                }

        # ---------------------------------------------------------
        # CATEGORÍA D: Reducir Fatiga Cognitiva (mot_reduce_fatigue = TRUE)
        # ---------------------------------------------------------
        if motivations.get("mot_reduce_fatigue", False):
            
            # Regla D.1: Descarga Cognitiva Nocturna Preventiva
            work_hours = routine.get("work", 0)
            if work_hours >= 8 and time_float > 18.0 and not metrics.get("personal_block_updated_today", True):
                return {
                    "triggered": True,
                    "rule_id": "F_FAT_PREVENCION_DUMP",
                    "action_taken": "OPEN_QUICK_CAPTURE_DRAWER",
                    "suggested_message": "Terminó una jornada larga. Para descansar de verdad, hacé una 'descarga cognitiva' rápida acá. Escribí todo lo que te dé vueltas en la cabeza y dejalo."
                }

            # Regla D.2: Prevención de Sobre-enfoque
            if metrics.get("pomodoro_completed_last_4h", 0) >= 4:
                return {
                    "triggered": True,
                    "rule_id": "F_FAT_POMODORO_SOBRE_ENFOQUE",
                    "action_taken": "LOCK_POMODORO_COOLDOWN",
                    "suggested_message": "¡Qué nivel de enfoque! Pero completaste 4 ciclos seguidos. Para cuidar tu salud mental, bloqueé el temporizador por 15 minutos. ¡El descanso es productivo!"
                }

            # Regla D.3: Bloqueo de Fin de Semana
            if is_weekend and metrics.get("pomodoro_completed_today", 0) >= 3 and work_hours >= 6:
                return {
                    "triggered": True,
                    "rule_id": "F_FAT_DESCONEXION_FINDE",
                    "action_taken": "SHOW_WEEKEND_REST_PROMPT",
                    "suggested_message": "Es fin de semana y ya le metiste un enfoque excelente. Tu objetivo es reducir la fatiga, así que dejemos las tareas acá y salgamos a disfrutar de un ratito de ocio."
                }

            # Regla D.4: Agotamiento por Falta de Ocio
            if routine.get("leisure", 2) <= 1 and metrics.get("pomodoro_completed_last_7d", 0) >= 15:
                if metrics.get("wellness_habits_completed_7d", 1) == 0:
                    return {
                        "triggered": True,
                        "rule_id": "F_FAT_OCIO_INSUFICIENTE",
                        "action_taken": "INJECT_WELLNESS_ALERT",
                        "suggested_message": "Advertencia de bienestar: completaste más de 15 sesiones de enfoque esta semana y declaraste poco tiempo para vos. Hoy cerrá la pestaña y dedicá 30 minutos a tu hobby."
                    }

            # Regla D.5: Captura Rápida post Pomodoro Extendido
            if metrics.get("last_session_duration", 0) >= 50 and metrics.get("last_session_completed", False):
                if not metrics.get("personal_block_updated_today", True):
                    return {
                        "triggered": True,
                        "rule_id": "F_FAT_POST_POMODORO_DUMP",
                        "action_taken": "PROMPT_POST_FOCUS_DUMP",
                        "suggested_message": "¡Excelente sesión larga! Tu memoria de trabajo suele quedar sobrecargada tras un enfoque profundo. Escribí las ideas residuales en tus Notas y dejá tu mente libre."
                    }

            # Regla D.6: Fatiga Nocturna
            # time_float > 23.5 es 23:30, time_float < 4.0 es 04:00
            if (time_float >= 23.5 or time_float <= 4.0) and metrics.get("pomodoro_completed_tonight", 0) >= 2:
                return {
                    "triggered": True,
                    "rule_id": "F_FAT_NOCTURNO_EXTREMO",
                    "action_taken": "INJECT_SLEEP_PREP_UI",
                    "suggested_message": "Ya es de madrugada y seguir forzando la concentración reduce tu retención y duplica la fatiga de mañana. Guardá los cambios, andá a dormir y mañana seguimos."
                }

        # Si ninguna regla aplica
        return {"triggered": False}