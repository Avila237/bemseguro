import { supabase } from './supabase.js';

const DIA = 86400000;

const URL_HEALTH = 'https://bemseguro-production.up.railway.app/health';

function diasAtrasISO(n) {
  return new Date(Date.now() - n * DIA).toISOString();
}

// Início do dia (local), opcionalmente N dias atrás.
function inicioDoDia(offsetDias = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDias);
  return d;
}

// Health check do Railway: GET público sem auth, direto do browser.
// Retorna true se a resposta for 2xx; false em erro de rede/timeout/status.
export async function checarRailway() {
  try {
    const res = await fetch(URL_HEALTH, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// Carrega todas as métricas do painel técnico via Supabase (anon key, sob RLS do
// usuário autenticado). Lança em caso de erro de query.
export async function carregarMonitoring() {
  const ini7 = diasAtrasISO(7);
  const ini24h = diasAtrasISO(1);
  const ini48h = diasAtrasISO(2);
  const ini14 = diasAtrasISO(14);
  const ini30Dia = inicioDoDia(29); // janela de 30 dias incluindo hoje

  const [autoRes, os7Res, erros48Res, cot30Res] = await Promise.all([
    // duração das chamadas /quote/auto (últimos 14d → 7d atuais + 7d anteriores)
    supabase.from('audit_log').select('duration_ms,created_at').eq('endpoint', '/quote/auto').gte('created_at', ini14),
    // OS dos últimos 7 dias (taxa de sucesso global)
    supabase.from('os_cotacao').select('status,created_at').gte('created_at', ini7),
    // OS com erro nas últimas 48h (24h atuais + 24h anteriores p/ o delta + lista)
    supabase
      .from('os_cotacao')
      .select('id,error_message,dados_risco,updated_at,created_at')
      .eq('status', 'erro')
      .gte('created_at', ini48h)
      .order('updated_at', { ascending: false }),
    // cotações dos últimos 30 dias (gráfico diário + taxa por seguradora)
    supabase.from('cotacoes').select('seguradora,premio,created_at').gte('created_at', ini30Dia.toISOString()),
  ]);

  const erro = autoRes.error || os7Res.error || erros48Res.error || cot30Res.error;
  if (erro) throw new Error(erro.message || 'Falha ao carregar as métricas');

  const auto = autoRes.data || [];
  const os7 = os7Res.data || [];
  const erros48 = erros48Res.data || [];
  const cot30 = cot30Res.data || [];

  // 1. tempo médio de cotação (s): /quote/auto, últimos 7 dias (+ semana anterior).
  const mediaMs = arr => (arr.length ? arr.reduce((s, a) => s + a.duration_ms, 0) / arr.length : 0);
  const auto7 = auto.filter(a => a.created_at >= ini7 && a.duration_ms != null);
  const autoPrev = auto.filter(a => a.created_at < ini7 && a.duration_ms != null);
  const tempoMedioS = Math.round(mediaMs(auto7) / 1000);
  const tempoPrevS = Math.round(mediaMs(autoPrev) / 1000);
  const tempoDelta = tempoPrevS ? Math.round(((tempoMedioS - tempoPrevS) / tempoPrevS) * 100) : null;

  // 2. taxa de sucesso global (%): OS cotado / total, últimos 7 dias.
  const totalOS7 = os7.length;
  const cotado7 = os7.filter(o => o.status === 'cotado').length;
  const taxaSucesso = totalOS7 ? Math.round((cotado7 / totalOS7) * 100) : 0;

  // 4. erros (24h) + delta vs as 24h anteriores.
  const erros24 = erros48.filter(o => o.created_at >= ini24h);
  const errosPrev = erros48.filter(o => o.created_at < ini24h);
  const errosDelta = erros24.length - errosPrev.length;

  // 5. cotações por dia (30 dias): agrupa cotacoes.created_at por dia.
  const serie = Array.from({ length: 30 }, () => 0);
  cot30.forEach(c => {
    const dia = new Date(c.created_at);
    dia.setHours(0, 0, 0, 0);
    const idx = Math.round((dia - ini30Dia) / DIA);
    if (idx >= 0 && idx < 30) serie[idx]++;
  });

  // 6. taxa de sucesso por seguradora (30 dias): premio>0 / total de cotações.
  const porSeg = {};
  cot30.forEach(c => {
    if (!c.seguradora) return;
    const s = (porSeg[c.seguradora] = porSeg[c.seguradora] || { total: 0, ok: 0 });
    s.total++;
    if (c.premio != null && c.premio > 0) s.ok++;
  });
  const taxaPorSeg = Object.entries(porSeg)
    .map(([nome, s]) => ({ nome, taxa: s.total ? Math.round((s.ok / s.total) * 100) : 0, total: s.total }))
    .sort((a, b) => b.taxa - a.taxa || b.total - a.total);

  // 7. erros recentes (24h): mensagem, "Aggilizador" (erros de OS são globais —
  // não há seguradora associada), referência da OS e tempo relativo.
  const errosRecentes = erros24.slice(0, 12).map(o => ({
    id: o.id,
    msg: o.error_message || 'Erro na cotação',
    seg: 'Aggilizador',
    created_at: o.updated_at || o.created_at,
  }));

  return {
    tempoMedioS,
    tempoDelta,
    taxaSucesso,
    totalOS7,
    erros24h: erros24.length,
    errosDelta,
    serie,
    taxaPorSeg,
    errosRecentes,
  };
}
