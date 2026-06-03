-- 005-status-novos-extracao-callback.sql
-- Novos valores do enum `os_status`, para a feature de integracao CRM + IA.
--
-- Contexto: a integracao com o CRM via IA introduz tres estados intermediarios
-- no ciclo de vida da OS:
--   - extraindo_documentos : a IA esta lendo CNH/CRLV (alguns segundos).
--   - revisao_manual       : a IA terminou, mas ha conflito entre o formulario e
--                            os documentos; um operador precisa revisar/confirmar
--                            antes de cotar.
--   - callback_pendente    : a cotacao terminou, mas o callback para o CRM falhou
--                            e ha um retry pendente.
--
-- ADD VALUE IF NOT EXISTS é idempotente (seguro reexecutar). Os valores sao
-- apenas anexados ao enum — a ordem do enum nao importa (a aplicacao ordena por
-- created_at, nunca pelo enum).
--
-- APLICACAO MANUAL: rodar no Supabase (SQL Editor). NAO e executado
-- automaticamente pelo backend. Obs.: ALTER TYPE ... ADD VALUE nao pode rodar
-- dentro de um bloco de transacao — execute as instrucoes diretamente.

ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'extraindo_documentos';
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'revisao_manual';
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'callback_pendente';
