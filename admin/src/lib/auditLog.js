import { supabase } from './supabase.js';

// Tamanho de página (paginação server-side via range()).
export const PAGE_SIZE = 20;

// Códigos HTTP oferecidos no dropdown de status.
export const STATUS_OPCOES = [200, 202, 400, 401, 404, 500];

const UMA_HORA = 3600 * 1000;

// Janela de tempo da consulta: por padrão as últimas 24h; se `data`
// (YYYY-MM-DD, vinda do input date) for informada, o dia inteiro daquela data.
function janela({ data } = {}) {
  if (data) return { de: data + 'T00:00:00', ate: data + 'T23:59:59.999' };
  return { de: new Date(Date.now() - 24 * UMA_HORA).toISOString(), ate: null };
}

// Normaliza uma linha do audit_log (+ join api_keys) para o formato da tela.
function normalizar(r) {
  const interno = !r.api_key_id;
  return {
    id: r.id,
    endpoint: r.endpoint,
    metodo: String(r.method || '').toUpperCase(),
    status: r.response_status,
    ms: r.duration_ms,
    interno,
    keyNome: interno ? 'interno' : (r.api_keys?.nome || '—'),
    created_at: r.created_at,
  };
}

// Lista paginada do audit_log (mais recente primeiro) com join em api_keys para
// o nome da chave, filtros dinâmicos e paginação server-side.
export async function carregarAudit(params = {}) {
  const { page = 0, pageSize = PAGE_SIZE, busca, endpoint, status } = params;
  const { de, ate } = janela(params);

  let q = supabase
    .from('audit_log')
    .select(
      'id,endpoint,method,response_status,duration_ms,created_at,api_key_id,api_keys(nome)',
      { count: 'exact' }
    )
    .gte('created_at', de);
  if (ate) q = q.lte('created_at', ate);
  if (endpoint) q = q.eq('endpoint', endpoint);
  if (status) q = q.eq('response_status', Number(status));

  if (busca && busca.trim()) {
    const t = busca.trim();
    const ors = [`endpoint.ilike.%${t}%`];
    // Busca também por nome da API key: resolve os ids correspondentes e
    // filtra `api_key_id in (...)`.
    const { data: keys } = await supabase.from('api_keys').select('id').ilike('nome', `%${t}%`);
    const ids = (keys || []).map(k => k.id);
    if (ids.length) ors.push(`api_key_id.in.(${ids.join(',')})`);
    q = q.or(ors.join(','));
  }

  q = q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message || 'Falha ao carregar o audit log');

  return {
    rows: (data || []).map(normalizar),
    total: count || 0,
    pageSize,
  };
}

// Lista distinta dos endpoints presentes na janela atual (para o dropdown).
export async function listarEndpoints() {
  const { de, ate } = janela({});
  let q = supabase.from('audit_log').select('endpoint').gte('created_at', de);
  if (ate) q = q.lte('created_at', ate);
  const { data, error } = await q.limit(1000);
  if (error) return [];
  return [...new Set((data || []).map(r => r.endpoint).filter(Boolean))].sort();
}
