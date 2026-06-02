import { supabase } from './supabase.js';
import { numeroOS } from './format.js';

// Histórico de atividade do painel (Tela 12 — Meu Perfil).
//
// LIMITAÇÃO (piloto): o `audit_log` não tem coluna `user_id`. As chamadas via
// painel chegam com JWT (não com API key), então `api_key_id` é nulo e não
// identifica QUEM fez. Usamos a **Opção A**: filtrar `request_payload->>auth =
// 'painel'`, o que traz o histórico GERAL do painel (todas as ações de quem
// usa o Hub), não por usuário. A tela deixa isso explícito ("histórico geral
// do painel"). Ver TODO de `user_id` no audit_log em context.md.

// Mapeia uma linha do audit_log (ação do painel) para { ico, tone, text, sub }.
// `tone` é uma das chaves de TONE no componente (blue/brand/red/green/amber/mute).
export function descreverAtividade(r) {
  const p = (r && r.request_payload) || {};
  const endpoint = (r && r.endpoint) || '';
  const status = r && r.response_status;

  // Recotação (recotar reaproveita a OS existente).
  if (p.acao === 'recotar') {
    return { ico: 'refresh', tone: 'amber', text: `Recotou a ${numeroOS(p.os_id)}`, sub: 'Reprocessou a cotação' };
  }

  // Disparo de cotação nova (tem placa no payload).
  if (endpoint.includes('run-quote') && p.placa) {
    const ramo = p.ramo ? `Ramo: ${p.ramo}` : null;
    return { ico: 'bolt', tone: 'blue', text: `Disparou cotação para a placa ${p.placa}`, sub: ramo };
  }

  // Falha registrada (status >= 400).
  if (status && Number(status) >= 400) {
    return { ico: 'alert', tone: 'red', text: `Falha em ${endpoint || 'ação do painel'}`, sub: `HTTP ${status}` };
  }

  // Fallback genérico.
  return { ico: 'activity', tone: 'mute', text: `${(r && r.method) || ''} ${endpoint}`.trim() || 'Ação no painel', sub: null };
}

// Carrega as últimas ações do painel (histórico geral — ver limitação acima).
export async function carregarHistorico(limit = 20) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id,endpoint,method,response_status,request_payload,created_at')
    .eq('request_payload->>auth', 'painel')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message || 'Falha ao carregar o histórico');

  return (data || []).map(r => ({
    id: r.id,
    created_at: r.created_at,
    status: r.response_status,
    ...descreverAtividade(r),
  }));
}
