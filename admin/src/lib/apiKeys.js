import { supabase } from './supabase.js';

// Lista as API keys, mais recentes primeiro. NUNCA seleciona key_hash — o hash
// bcrypt fica só no servidor. O prefixo visível (key_prefix) basta para
// identificar a chave no painel.
export async function listarApiKeys() {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id,nome,key_prefix,ativa,rate_limit,created_at,last_used_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Falha ao carregar as API keys');
  return data || [];
}

// Cria uma API key via Edge Function create-api-key: a chave é gerada e hasheada
// (bcrypt) no servidor; o plaintext volta UMA ÚNICA VEZ. Retorna { chave, row }.
export async function criarApiKey({ nome, rateLimit }) {
  const { data, error } = await supabase.functions.invoke('create-api-key', {
    body: { nome, rateLimit: Number(rateLimit) || 60 },
  });
  if (error) throw new Error(error.message || 'Falha ao criar a API key');
  if (!data || !data.chave) throw new Error(data?.error || 'Resposta inválida da Edge Function');
  return { chave: data.chave, row: data.key || null };
}

// Revoga uma chave (ativa = false).
export async function revogarApiKey(id) {
  const { error } = await supabase.from('api_keys').update({ ativa: false }).eq('id', id);
  if (error) throw new Error(error.message || 'Falha ao revogar a API key');
}
