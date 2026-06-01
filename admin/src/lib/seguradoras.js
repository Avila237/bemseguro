import { supabase } from './supabase.js';

// Lista as seguradoras. NÃO traz o campo `credenciais` (segurança) — só os
// campos públicos necessários ao painel.
export async function listarSeguradoras() {
  const { data, error } = await supabase
    .from('seguradoras')
    .select('id,nome,nome_seguradora,ativa')
    .order('nome', { ascending: true });
  if (error) throw new Error(error.message || 'Falha ao carregar seguradoras');
  return data || [];
}

// Liga/desliga uma seguradora (apenas o campo `ativa`). Requer RLS que permita
// UPDATE de `ativa` para usuários autenticados (ver context.md).
export async function setAtiva(id, ativa) {
  const { error } = await supabase.from('seguradoras').update({ ativa }).eq('id', id);
  if (error) throw new Error(error.message || 'Falha ao atualizar a seguradora');
}

// TODO(métricas): valores placeholder, determinísticos pelo nome, até existir
// uma fonte real (agregação de cotacoes/audit_log por seguradora).
export function metricasPlaceholder(nome) {
  let h = 0;
  const t = String(nome || '');
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return {
    taxaRetorno: 82 + (h % 16), // 82–97%
    tempoMedio: 31 + (h % 28), // 31–58s
    ultimoSucessoMin: 1 + (h % 30), // min atrás
    erros24h: h % 7 === 0 ? 1 + (h % 2) : 0,
  };
}
