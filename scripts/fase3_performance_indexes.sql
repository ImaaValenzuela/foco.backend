-- ============================================================================
-- SCRIPT DDL: OPTIMIZACIÓN DE ÍNDICES COMPUESTOS Y PARCIALES (FASE 3)
-- Objetivo: Reducir escaneos secuenciales a Index-Only Scans en PostgreSQL/Supabase
-- ============================================================================

-- 1. POMODORO SESSIONS: Índice compuesto para métricas temporales y de estado
-- Permite Index-Only Scan para completed_4h (4 horas) e interrupted_24h (24 horas)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pomodoro_sessions_perf
ON pomodoro_sessions (user_id, is_completed, created_at DESC);

-- Alternativa para tablas con alto volumen histórico (>500k filas):
-- Índices parciales que ocupan hasta 80% menos RAM y buffer cache
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pomo_user_completed_recent 
ON pomodoro_sessions (user_id, created_at DESC) 
WHERE is_completed = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pomo_user_interrupted_recent 
ON pomodoro_sessions (user_id, created_at DESC) 
WHERE is_completed = false;

-- 2. HABIT LOGS: Búsquedas eficientes por usuario y estado de completitud
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_habit_logs_user_date 
ON habit_logs (user_id, logged_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_habit_logs_habit_completed
ON habit_logs (habit_id, logged_date DESC, is_completed);

-- 3. BLOCKS: Lectura instantánea de lienzos del usuario
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blocks_user_id 
ON blocks (user_id);

-- 4. ONBOARDING PROFILING: Búsqueda O(1) de línea base del usuario
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_profiling_user_id 
ON onboarding_profiling (user_id);

-- 5. AI INFERENCE LOGS: Telemetría, métricas y auditoría
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_inference_logs_user_created 
ON ai_inference_logs (user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_inference_logs_rule_id 
ON ai_inference_logs (rule_id);
