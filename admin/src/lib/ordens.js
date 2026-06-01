import { supabase } from './supabase.js';
import { veiculoDe } from './format.js';

export const PAGE_SIZE = 10;
export const STATUS_LISTA = ['pendente', 'cotando', 'cotado', 'erro', 'cancelada'];

// Aplica os filtros comuns (exceto paginação/ordenação) a uma query de os_cotacao.
function aplicarFiltros(q, { status, busca, ramo, de, ate } = {}) {
  if (status && status !== 'todos') q = q.eq('status', status);
  if (ramo) q = q.eq('dados_risco->>ramo', ramo);
  if (de) q = q.gte('created_at', de);
  if (ate) q = q.lte('created_at', ate);
  if (busca && busca.trim()) {
    const t = busca.trim();
    const digits = t.replace(/\D/g, '');
    const ors = [`nome.ilike.%${t}%`, `placa.ilike.%${t}%`];
    if (digits) ors.push(`cpf.ilike.%${digits}%`);
    // Nº OS (ex.: "OS-F256D8" ou "f256d8") → prefixo do uuid (hyphen-stripped).
    const hex = t.replace(/^os-?/i, '').toLowerCase();
    if (/^[0-9a-f]{2,}$/.test(hex)) ors.push(`id.ilike.${hex}%`);
    q = q.or(ors.join(','));
  }
  return q;
}

// Lista paginada de OS com filtros + ordenação (mais recente primeiro) e o
// melhor preço (menor prêmio em `cotacoes`) por OS.
export async function carregarLista(params = {}) {
  const { page = 0, pageSize = PAGE_SIZE } = params;

  let q = supabase
    .from('os_cotacao')
    .select('id,placa,cpf,nome,status,dados_risco,created_at', { count: 'exact' });
  q = aplicarFiltros(q, params);
  q = q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message || 'Falha ao carregar as ordens de serviço');

  const linhas = data || [];

  // Melhor preço por OS (query separada em cotacoes).
  const ids = linhas.map(o => o.id);
  const melhor = {};
  if (ids.length) {
    const { data: cot } = await supabase.from('cotacoes').select('os_id,premio').in('os_id', ids);
    (cot || []).forEach(c => {
      if (c.premio == null) return;
      if (melhor[c.os_id] == null || c.premio < melhor[c.os_id]) melhor[c.os_id] = c.premio;
    });
  }

  return {
    rows: linhas.map(o => ({
      id: o.id,
      placa: o.placa,
      cpf: o.cpf,
      nome: o.nome,
      veiculo: veiculoDe(o.dados_risco),
      status: o.status,
      created_at: o.created_at,
      melhorPreco: melhor[o.id] ?? null,
    })),
    total: count || 0,
    pageSize,
  };
}

// Contadores por status sob os mesmos filtros (exceto o próprio status), para as tabs.
export async function contarStatus(params = {}) {
  let q = supabase.from('os_cotacao').select('status');
  q = aplicarFiltros(q, { ...params, status: 'todos' });
  const { data, error } = await q;
  if (error) throw new Error(error.message || 'Falha ao contar OS');

  const counts = { todos: 0, pendente: 0, cotando: 0, cotado: 0, erro: 0, cancelada: 0 };
  (data || []).forEach(o => {
    counts.todos++;
    if (counts[o.status] != null) counts[o.status]++;
  });
  return counts;
}

// Cancela uma OS (status → cancelada).
export async function cancelarOS(id) {
  const { error } = await supabase.from('os_cotacao').update({ status: 'cancelada' }).eq('id', id);
  if (error) throw new Error(error.message || 'Falha ao cancelar a OS');
}
