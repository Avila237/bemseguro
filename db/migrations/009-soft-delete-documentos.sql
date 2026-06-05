-- 009-soft-delete-documentos.sql
--
-- Soft delete de documentos anexados a uma OS (tela de revisão manual).
-- Em vez de apagar a row (e o arquivo no Storage), marca-se removido_em/removido_por:
-- o arquivo é PRESERVADO no bucket para auditoria, e o painel mostra um histórico
-- dos documentos removidos. As leituras "ativas" filtram `removido_em IS NULL`.
--
-- Depende da feature de integração CRM + IA (tabela documentos_os, migração 006).
--
-- APLICACAO MANUAL: rodar no Supabase (SQL editor) — o Claude Code não tem acesso
-- ao banco. Idempotente (IF NOT EXISTS).

BEGIN;

ALTER TABLE documentos_os
  ADD COLUMN IF NOT EXISTS removido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removido_por UUID REFERENCES auth.users(id);

-- Índice parcial p/ acelerar a listagem dos documentos ATIVOS de uma OS.
CREATE INDEX IF NOT EXISTS idx_documentos_os_ativos
  ON documentos_os(os_id)
  WHERE removido_em IS NULL;

COMMIT;

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS idx_documentos_os_ativos;
--   ALTER TABLE documentos_os DROP COLUMN IF EXISTS removido_por;
--   ALTER TABLE documentos_os DROP COLUMN IF EXISTS removido_em;
