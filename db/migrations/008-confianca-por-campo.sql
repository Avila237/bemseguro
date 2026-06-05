-- 008-confianca-por-campo.sql
-- Confiança individual por campo extraído pela IA, em documentos_os.
--
-- Hoje só persistimos a média (confianca_extracao NUMERIC), mas a IA retorna a
-- confiança POR CAMPO (ex.: {nome: 0.95, cpf: 0.98, ...}). Persistir tudo permite
-- ao painel mostrar badges fiéis por campo na tela de revisão manual.
--
-- APLICACAO MANUAL: rodar no Supabase (SQL Editor). NAO e executado
-- automaticamente por nenhum runner do projeto.

BEGIN;

ALTER TABLE documentos_os
  ADD COLUMN IF NOT EXISTS confianca_por_campo JSONB;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual, se necessario):
--   ALTER TABLE documentos_os DROP COLUMN IF EXISTS confianca_por_campo;
-- ─────────────────────────────────────────────────────────────────────────────
