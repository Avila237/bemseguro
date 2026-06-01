import { supabase } from './supabase.js';

// Erro tipado para OS inexistente (404).
export class OSNaoEncontrada extends Error {
  constructor() {
    super('Ordem de serviço não encontrada');
    this.notFound = true;
  }
}

// Carrega a OS pelo id + suas cotações (ordenadas por prêmio asc).
export async function carregarOS(id) {
  const { data: os, error } = await supabase.from('os_cotacao').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message || 'Falha ao carregar a OS');
  if (!os) throw new OSNaoEncontrada();

  const { data: cot, error: erroCot } = await supabase
    .from('cotacoes')
    .select('*')
    .eq('os_id', id)
    .order('premio', { ascending: true });
  if (erroCot) throw new Error(erroCot.message || 'Falha ao carregar as cotações');

  return { os, cotacoes: cot || [] };
}

// Dispara uma nova cotação para a OS atual via Edge Function run-quote.
// Reaproveita os dados_risco já persistidos (o backend relê a OS pelo id).
export async function recotarOS(os) {
  const { error } = await supabase.functions.invoke('run-quote', {
    body: { os_id: os.id, dados_risco: os.dados_risco },
  });
  if (error) throw new Error(error.message || 'Falha ao disparar a cotação');
}
