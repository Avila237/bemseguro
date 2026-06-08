-- 010-unique-active-documento.sql
--
-- Reforça NO BANCO a invariante "no máximo 1 documento ATIVO por (os_id, tipo)",
-- que já é aplicada em código no /extract (passo 3.5, substituição). Esta migração
-- é a rede de segurança no schema e fecha a janela de RACE CONDITION entre
-- chamadas /extract concorrentes para o mesmo (os_id, tipo).
--
-- Duas partes, NESTA ORDEM (a Parte 1 PRECISA rodar antes da Parte 2, senão o
-- CREATE UNIQUE INDEX falha por causa dos duplicados já existentes). O BEGIN/COMMIT
-- garante que cleanup + índice sejam atômicos.
--
-- APLICACAO MANUAL no Supabase. ANTES de aplicar, rode a query de verificação para
-- saber quantas OSs estão com estado sujo:
--   SELECT os_id, tipo, COUNT(*) FROM documentos_os
--   WHERE removido_em IS NULL
--   GROUP BY os_id, tipo HAVING COUNT(*) > 1;

BEGIN;

-- Parte 1 — Cleanup retroativo do estado sujo: para cada (os_id, tipo) com mais de
-- uma row ativa, mantém a de created_at MAIS RECENTE (id DESC como tiebreaker
-- determinístico) e soft-deleta as demais. `removido_por = NULL` sinaliza
-- substituição AUTOMÁTICA pelo sistema (mesma convenção do /extract passo 3.5).
WITH duplicados AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY os_id, tipo
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM documentos_os
  WHERE removido_em IS NULL
)
UPDATE documentos_os
SET removido_em = now(), removido_por = NULL
WHERE id IN (SELECT id FROM duplicados WHERE rn > 1);

-- Parte 2 — Índice único parcial: garante 1 ativa por (os_id, tipo) daqui pra
-- frente e rejeita o 2º INSERT concorrente com 23505 (a rota /extract trata como
-- 409). É DISTINTO do idx_documentos_os_ativos (migração 009), que NÃO é único e
-- existe só para performance de leitura dos documentos ativos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_os_unico_ativo
  ON documentos_os (os_id, tipo)
  WHERE removido_em IS NULL;

COMMIT;

-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS idx_documentos_os_unico_ativo;
--   (a Parte 1 — soft-deletes retroativos — não é revertível.)
