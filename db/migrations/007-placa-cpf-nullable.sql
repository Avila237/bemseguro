-- 007-placa-cpf-nullable.sql
-- Permite que placa e cpf sejam null em os_cotacao.
-- Necessário para a feature de integração CRM com IA, onde a OS é criada
-- antes da extração dos documentos (status='extraindo_documentos').
-- Quando a IA termina, placa e cpf são preenchidos via UPDATE.
--
-- APLICACAO MANUAL: rodar no Supabase (SQL Editor). NAO e executado
-- automaticamente por nenhum runner do projeto.

BEGIN;

ALTER TABLE os_cotacao ALTER COLUMN placa DROP NOT NULL;
ALTER TABLE os_cotacao ALTER COLUMN cpf DROP NOT NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (se necessário):
--   Antes de rodar, garanta que não há rows com placa NULL ou cpf NULL.
--   ALTER TABLE os_cotacao ALTER COLUMN placa SET NOT NULL;
--   ALTER TABLE os_cotacao ALTER COLUMN cpf SET NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────
