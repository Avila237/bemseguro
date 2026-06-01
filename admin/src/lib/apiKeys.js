import { supabase } from './supabase.js';

// Lista as API keys, mais recentes primeiro.
export async function listarApiKeys() {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id,nome,key_hash,ativa,rate_limit,created_at,last_used_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Falha ao carregar as API keys');
  return data || [];
}

// Gera uma chave aleatória: bsh_live_ + 24 chars hex (crypto seguro).
export function gerarChave() {
  const bytes = new Uint8Array(12);
  (globalThis.crypto || crypto).getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return 'bsh_live_' + hex;
}

// Cria uma API key. No piloto, salva a chave em texto plano em key_hash
// (TODO hardening: trocar por bcrypt). Retorna a chave gerada (exibida 1x).
export async function criarApiKey({ nome, rateLimit }) {
  const chave = gerarChave();
  const { data, error } = await supabase
    .from('api_keys')
    .insert({ nome, key_hash: chave, ativa: true, rate_limit: Number(rateLimit) || 60 })
    .select('id,nome,key_hash,ativa,rate_limit,created_at,last_used_at')
    .single();
  if (error) throw new Error(error.message || 'Falha ao criar a API key');
  return { chave, row: data };
}

// Revoga uma chave (ativa = false).
export async function revogarApiKey(id) {
  const { error } = await supabase.from('api_keys').update({ ativa: false }).eq('id', id);
  if (error) throw new Error(error.message || 'Falha ao revogar a API key');
}

// Exibição truncada: bsh_live_a93f…7c21 (13 primeiros + … + 4 últimos).
export function truncarChave(chave) {
  const k = String(chave || '');
  if (k.length <= 17) return k;
  return `${k.slice(0, 13)}…${k.slice(-4)}`;
}
