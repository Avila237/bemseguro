-- 004-os-idempotency.sql
-- Idempotencia na criacao de OS (Edge Function run-quote).
--
-- Contexto: a criacao de OS passa a aceitar o header opcional `Idempotency-Key`
-- (padrao Stripe/AWS). Quando presente, a run-quote evita criar OS duplicada —
-- util para retries de rede e para o clique duplo no botao "Criar OS" do painel.
--
-- Esta migracao adiciona a coluna `idempotency_key` e um INDICE UNICO PARCIAL
-- (so quando a coluna NAO e nula), que serve tambem de backstop contra corrida
-- entre requisicoes concorrentes com a mesma chave.
--
-- APLICACAO MANUAL: rodar no Supabase (SQL Editor). NAO e executado
-- automaticamente por nenhum runner do projeto.

begin;

-- Chave de idempotencia fornecida pelo cliente (ex.: "painel-<uuid>"). Nullable:
-- chamadas sem o header seguem criando OS normalmente.
alter table os_cotacao add column if not exists idempotency_key text;

-- Unicidade apenas quando a chave existe (indice parcial). Garante que duas
-- requisicoes concorrentes com a mesma chave nao criem duas OS — a segunda
-- falha com 23505 e a run-quote responde com o replay da OS ja criada.
--
-- Obs.: a unicidade e GLOBAL (a chave vira efetivamente de uso unico). A janela
-- de 24h existe apenas na LOGICA da Edge Function (horizonte de replay ativo);
-- reusar exatamente a mesma chave depois de 24h cairia no replay da OS antiga em
-- vez de criar uma nova. Na pratica isso e inocuo: o painel gera um UUID novo por
-- sessao de formulario, entao colisao de chave so acontece em retry/clique duplo.
create unique index if not exists os_cotacao_idempotency_key_uidx
  on os_cotacao (idempotency_key)
  where idempotency_key is not null;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual, se necessario):
--   drop index if exists os_cotacao_idempotency_key_uidx;
--   alter table os_cotacao drop column if exists idempotency_key;
-- ─────────────────────────────────────────────────────────────────────────────
