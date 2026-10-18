-- ============================================================================
-- SCRIPT DDL: AGREGAR COLUMNA DE TELEMETRÍA DE FEEDBACK (FASE 5)
-- Objetivo: Persistir el feedback del usuario (thumbs up/down) en ai_inference_logs
-- ============================================================================

ALTER TABLE ai_inference_logs 
ADD COLUMN IF NOT EXISTS user_feedback VARCHAR(30);

-- Índice parcial para consultas de telemetría y ajuste de cooldown por feedback
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_inference_logs_user_feedback
ON ai_inference_logs (user_id, user_feedback)
WHERE user_feedback IS NOT NULL;
