import { supabase } from './supabase.js';
import { veiculoDe } from './format.js';

// Início do dia (local), opcionalmente N dias atrás.
function inicioDoDia(offsetDias = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDias);
  return d;
}

const STATUS_BASE = { pendente: 0, extraindo_documentos: 0, revisao_manual: 0, cotando: 0, cotado: 0, callback_pendente: 0, erro: 0, cancelada: 0 };

// Carrega todos os indicadores do Dashboard via Supabase (anon key, sob RLS do
// usuário autenticado). Lança em caso de erro de query.
export async function carregarDashboard() {
  const hojeIni = inicioDoDia(0);
  const ini14 = inicioDoDia(13); // janela de 14 dias incluindo hoje

  const [osHojeRes, osUltimasRes, cotacoes14Res, alertasRes] = await Promise.all([
    // OS criadas hoje (contadores)
    supabase.from('os_cotacao').select('id,status,created_at').gte('created_at', hojeIni.toISOString()),
    // Últimas OS (tabela)
    supabase
      .from('os_cotacao')
      .select('id,placa,nome,status,dados_risco,created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    // Cotações dos últimos 14 dias (gráfico + total de hoje + ranking)
    supabase.from('cotacoes').select('os_id,seguradora,premio,created_at').gte('created_at', ini14.toISOString()),
    // OS para alertas: travadas (cotando) e com erro
    supabase
      .from('os_cotacao')
      .select('id,placa,status,error_message,updated_at,created_at')
      .in('status', ['cotando', 'erro'])
      .order('updated_at', { ascending: false })
      .limit(20),
  ]);

  const erroQuery = osHojeRes.error || osUltimasRes.error || cotacoes14Res.error || alertasRes.error;
  if (erroQuery) throw new Error(erroQuery.message || 'Falha ao carregar os dados do painel');

  const osHoje = osHojeRes.data || [];
  const osUltimas = osUltimasRes.data || [];
  const cotacoes14 = cotacoes14Res.data || [];
  const alertasRaw = alertasRes.data || [];

  // ---- contadores por status (hoje) ----
  const porStatus = { ...STATUS_BASE };
  osHoje.forEach(o => {
    if (porStatus[o.status] != null) porStatus[o.status]++;
  });
  const totalHoje = osHoje.length;
  const conversao = totalHoje ? Math.round((porStatus.cotado / totalHoje) * 100) : 0;

  // ---- cotações recebidas hoje + série de 14 dias ----
  const cotHoje = cotacoes14.filter(c => new Date(c.created_at) >= hojeIni);
  const serie = Array.from({ length: 14 }, () => 0);
  cotacoes14.forEach(c => {
    const dia = new Date(c.created_at);
    dia.setHours(0, 0, 0, 0);
    const idx = Math.round((dia - ini14) / 86400000);
    if (idx >= 0 && idx < 14) serie[idx]++;
  });
  const media = totalHoje ? cotHoje.length / totalHoje : 0;

  // ---- melhor preço por OS (para a tabela de últimas) ----
  const ids = osUltimas.map(o => o.id);
  const melhorPorOS = {};
  if (ids.length) {
    const { data: cotUlt } = await supabase.from('cotacoes').select('os_id,premio').in('os_id', ids);
    (cotUlt || []).forEach(c => {
      if (c.premio == null) return;
      if (melhorPorOS[c.os_id] == null || c.premio < melhorPorOS[c.os_id]) melhorPorOS[c.os_id] = c.premio;
    });
  }
  const ultimas = osUltimas.map(o => ({
    id: o.id,
    placa: o.placa,
    nome: o.nome,
    veiculo: veiculoDe(o.dados_risco),
    status: o.status,
    melhorPreco: melhorPorOS[o.id] ?? null,
  }));

  // ---- alertas (travadas há > 10min + erros recentes) ----
  const limiteTravada = Date.now() - 10 * 60 * 1000;
  const alertas = [];
  alertasRaw.forEach(o => {
    if (o.status === 'cotando') {
      const ref = new Date(o.updated_at || o.created_at).getTime();
      if (ref < limiteTravada) {
        alertas.push({ id: o.id, tipo: 'travada', placa: o.placa, min: Math.round((Date.now() - ref) / 60000) });
      }
    } else if (o.status === 'erro') {
      alertas.push({ id: o.id, tipo: 'erro', placa: o.placa, msg: o.error_message || 'Erro na cotação' });
    }
  });

  // ---- ranking de seguradoras por taxa de retorno (hoje) ----
  const dispatchadas = osHoje.filter(o => ['cotando', 'cotado', 'erro'].includes(o.status)).length || totalHoje;
  const porSeg = {};
  cotHoje.forEach(c => {
    if (c.premio == null || !c.seguradora) return;
    (porSeg[c.seguradora] = porSeg[c.seguradora] || new Set()).add(c.os_id);
  });
  const ranking = Object.entries(porSeg)
    .map(([seguradora, set]) => ({
      seguradora,
      sucesso: set.size,
      taxa: dispatchadas ? Math.min(100, Math.round((set.size / dispatchadas) * 100)) : 0,
    }))
    .sort((a, b) => b.taxa - a.taxa || b.sucesso - a.sucesso)
    .slice(0, 5);

  return {
    counts: { total: totalHoje, ...porStatus, conversao },
    cotacoes: { total: cotHoje.length, osCount: totalHoje, media, serie },
    alertas,
    ultimas,
    ranking,
    vazio: totalHoje === 0 && ultimas.length === 0,
  };
}
