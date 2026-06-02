-- 003-api-keys-prefix.sql
-- Hardening de seguranca das API keys (ver context.md > "Queries Supabase + RLS
-- (API Keys)" > TODOs > "bcrypt no hardening").
--
-- Contexto: no piloto, api_keys.key_hash guardava a chave em TEXTO PLANO e o
-- painel selecionava key_hash para exibir uma versao truncada. Qualquer admin
-- autenticado conseguia ler a chave inteira. Este hardening:
--   1. Passa a guardar apenas o HASH bcrypt da chave em key_hash (via pgcrypto).
--   2. Guarda o PREFIXO visivel (ex: bsh_live_a93f) em uma coluna separada
--      key_prefix, usada pelo painel para identificar a chave sem expor o segredo
--      e usada na validacao para localizar a linha candidata por igualdade
--      (indexavel) antes de comparar o hash.
--
-- APLICACAO MANUAL: rodar no Supabase (SQL Editor). NAO e executado
-- automaticamente por nenhum runner do projeto.

begin;

-- pgcrypto fornece crypt() e gen_salt() (bcrypt). No Supabase a extensao mora no
-- schema "extensions".
create extension if not exists pgcrypto with schema extensions;

-- Prefixo visivel da chave: bsh_live_ (9) + 4 hex = 13 chars. NAO e segredo.
alter table api_keys add column if not exists key_prefix text;

-- Índice para a busca por prefixo na validacao (run-quote / get-cotacoes).
create index if not exists api_keys_key_prefix_idx on api_keys (key_prefix);

-- Backfill best-effort: linhas legadas cujo key_hash ainda esta em texto plano
-- (formato bsh_live_...) tem o prefixo derivado dos 13 primeiros chars. Linhas ja
-- hasheadas (key_hash comeca com "$2") nao tem como recuperar o prefixo aqui —
-- precisarao ser recriadas. Idempotente (so preenche key_prefix nulo).
update api_keys
   set key_prefix = left(key_hash, 13)
 where key_prefix is null
   and key_hash like 'bsh_live_%';

-- ─────────────────────────────────────────────────────────────────────────────
-- Funcao: criar_api_key
-- Gera o registro de uma nova chave. Recebe o PLAINTEXT (gerado na Edge Function
-- create-api-key), persiste APENAS o hash bcrypt (crypt + gen_salt('bf', 12)) e o
-- prefixo. Retorna a linha SEM o hash. SECURITY DEFINER porque a tabela api_keys
-- so e acessivel pelo service_role.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.criar_api_key(
  p_nome   text,
  p_chave  text,
  p_prefix text,
  p_rate   integer default 60
)
returns table (
  id           uuid,
  nome         text,
  key_prefix   text,
  ativa        boolean,
  rate_limit   integer,
  created_at   timestamptz,
  last_used_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  insert into api_keys (nome, key_hash, key_prefix, ativa, rate_limit)
  values (p_nome, crypt(p_chave, gen_salt('bf', 12)), p_prefix, true, coalesce(p_rate, 60))
  returning id, nome, key_prefix, ativa, rate_limit, created_at, last_used_at;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Funcao: validar_api_key
-- Valida a chave recebida no header x-api-key. Localiza a linha candidata pelo
-- PREFIXO (key_prefix, indexado) e compara o hash bcrypt com
--   crypt(p_chave, key_hash) = key_hash
-- Em caso de match, atualiza last_used_at e devolve id/rate_limit. Retorna 0
-- linhas quando invalida. SECURITY DEFINER pelo mesmo motivo acima.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.validar_api_key(p_chave text)
returns table (id uuid, rate_limit integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_rate integer;
begin
  select k.id, k.rate_limit
    into v_id, v_rate
    from api_keys k
   where k.ativa = true
     and k.key_prefix = left(p_chave, 13)
     and k.key_hash = crypt(p_chave, k.key_hash)
   limit 1;

  if v_id is null then
    return;  -- nenhuma linha => chave invalida
  end if;

  update api_keys set last_used_at = now() where api_keys.id = v_id;

  id := v_id;
  rate_limit := v_rate;
  return next;
end;
$$;

-- Execucao restrita ao service_role (as Edge Functions chamam com a service key).
revoke all on function public.criar_api_key(text, text, text, integer) from public;
revoke all on function public.validar_api_key(text) from public;
grant execute on function public.criar_api_key(text, text, text, integer) to service_role;
grant execute on function public.validar_api_key(text) to service_role;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual, se necessario):
--   drop function if exists public.validar_api_key(text);
--   drop function if exists public.criar_api_key(text, text, text, integer);
--   drop index if exists api_keys_key_prefix_idx;
--   alter table api_keys drop column if exists key_prefix;
-- ─────────────────────────────────────────────────────────────────────────────
