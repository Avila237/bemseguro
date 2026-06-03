-- 006-documentos-os.sql
-- Infraestrutura de armazenamento de documentos (CNH e CRLV) extraidos por IA.
--
-- Contexto: a integracao CRM + IA recebe documentos do cliente (CNH do segurado,
-- CNH do condutor e CRLV do veiculo), guarda os arquivos no Storage do Supabase
-- (bucket privado `documentos-clientes`) e a IA extrai os dados estruturados.
-- Esta tabela guarda a REFERENCIA ao arquivo + o resultado da extracao e o
-- estado de revisao. O arquivo binario em si NAO fica no Postgres — fica no
-- Storage; aqui guardamos apenas `storage_bucket` + `storage_path`.
--
-- Liga-se ao ciclo de vida da OS (ver migration 005): durante
-- `extraindo_documentos` a IA preenche `dados_extraidos`/`confianca_extracao`;
-- baixa confianca ou conflito leva a OS para `revisao_manual`, quando um operador
-- revisa e marca `revisado = true`.
--
-- O bucket `documentos-clientes` e PRIVADO e criado MANUALMENTE no Supabase
-- Dashboard (ver docs/storage-documentos.md) — esta migration nao cria o bucket.
--
-- APLICACAO MANUAL: rodar no Supabase (SQL Editor). NAO e executado
-- automaticamente por nenhum runner do projeto.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Funcao de updated_at
-- O schema inicial (001/002) foi aplicado direto no Supabase e nao esta
-- versionado aqui, entao nao podemos assumir que `update_updated_at_column()` ja
-- existe. `create or replace` e idempotente: se a funcao ja existir (usada por
-- outras tabelas), apenas a mantem; senao, a cria. Padrao classico do Supabase.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela documentos_os — referencias aos documentos enviados via CRM
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists documentos_os (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_id UUID NOT NULL REFERENCES os_cotacao(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('cnh_segurado', 'cnh_condutor', 'crlv')),
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'documentos-clientes',
  mime_type TEXT,
  tamanho_bytes INTEGER,
  dados_extraidos JSONB,
  confianca_extracao NUMERIC(3,2),
  revisado BOOLEAN DEFAULT false,
  revisado_por UUID REFERENCES auth.users(id),
  revisado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

create index if not exists idx_documentos_os_os_id on documentos_os(os_id);
create index if not exists idx_documentos_os_tipo on documentos_os(tipo);

-- Trigger de updated_at (CREATE TRIGGER nao tem "if not exists" — drop antes).
drop trigger if exists documentos_os_updated_at on documentos_os;
create trigger documentos_os_updated_at
  before update on documentos_os
  for each row execute function public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- Mesma postura das demais tabelas do painel: o usuario autenticado pode
-- ler/gravar metadados; a escrita do arquivo em si no Storage continua exclusiva
-- do service_role (ver docs/storage-documentos.md). CREATE POLICY nao e
-- idempotente — drop antes para a migration poder ser reexecutada.
-- ─────────────────────────────────────────────────────────────────────────────
alter table documentos_os enable row level security;

drop policy if exists "documentos_os_select_auth" on documentos_os;
create policy "documentos_os_select_auth" on documentos_os
  for select to authenticated using (true);

drop policy if exists "documentos_os_insert_auth" on documentos_os;
create policy "documentos_os_insert_auth" on documentos_os
  for insert to authenticated with check (true);

drop policy if exists "documentos_os_update_auth" on documentos_os;
create policy "documentos_os_update_auth" on documentos_os
  for update to authenticated using (true) with check (true);

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual, se necessario):
--   drop table if exists documentos_os;          -- remove tabela, indices,
--                                                 -- trigger e policies juntos.
--   -- update_updated_at_column() NAO e dropada no rollback: pode estar em uso
--   -- por outras tabelas. Remova manualmente so se tiver certeza que e exclusiva.
-- ─────────────────────────────────────────────────────────────────────────────
