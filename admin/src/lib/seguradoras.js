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

// ── Métricas reais agregadas da tabela `cotacoes` ──────────────────────────
// Fonte: `cotacoes` (uma linha por seguradora que RETORNOU prêmio numa OS) +
// `os_cotacao` (status/created_at da OS). Janela de tempo configurável (dias).

const DIA_MS = 24 * 60 * 60 * 1000;

function janelaInicioMs(janelaDias) {
  return Date.now() - janelaDias * DIA_MS;
}

// Agrega as métricas de UMA seguradora a partir de conjuntos já carregados.
// Função pura (sem I/O) — reusada por getMetricas e getMetricasTodas e fácil de testar.
//   nome          nome da seguradora
//   osCotadas     OSs com status='cotado' no período (objetos { id, created_at })
//   osMap         Map os_id -> created_at(ms) de TODAS as OSs do período (p/ tempo)
//   cotacoesDaSeg cotações DESSA seguradora no período ({ os_id, premio, created_at })
//   errosGlobais  contagem de OSs em erro nas últimas 24h (mesmo nº p/ todas — ver nota)
function agregarMetricas(nome, osCotadas, osMap, cotacoesDaSeg, errosGlobais) {
  const denom = osCotadas.length;

  // "Sem dados suficientes": nenhuma OS concluída no período, OU a seguradora não
  // registrou nenhuma cotação no período (ex.: ativada recentemente).
  if (denom === 0 || cotacoesDaSeg.length === 0) {
    return { taxaRetorno: null, tempoMedio: null, ultimoSucesso: null, erros24h: errosGlobais, semDados: true, amostra: denom };
  }

  const osCotadasIds = new Set(osCotadas.map(o => o.id));

  // TAXA DE RETORNO (APROXIMAÇÃO): numerador = OSs concluídas no período em que a
  // seguradora devolveu prêmio (premio>0); denominador = total de OSs concluídas
  // no período. Como o sistema só persiste cotações que RETORNARAM (não há
  // registro de "não respondeu"), assume-se que toda seguradora ativa participou
  // de todas as OSs concluídas no período — por isso é uma aproximação, que
  // varia conforme a amostra (e penaliza seguradoras ativadas recentemente).
  const osComPremio = new Set(
    cotacoesDaSeg.filter(c => c.premio != null && c.premio > 0 && osCotadasIds.has(c.os_id)).map(c => c.os_id)
  );
  const taxaRetorno = Math.round((osComPremio.size / denom) * 100);

  // TEMPO MÉDIO (s): média de (cotacao.created_at − os.created_at) para as
  // cotações da seguradora cujo OS está no período.
  const deltas = [];
  for (const c of cotacoesDaSeg) {
    const osCriadaMs = osMap.get(c.os_id);
    if (osCriadaMs == null) continue;
    const d = (new Date(c.created_at).getTime() - osCriadaMs) / 1000;
    if (d >= 0) deltas.push(d);
  }
  const tempoMedio = deltas.length ? Math.round(deltas.reduce((s, d) => s + d, 0) / deltas.length) : null;

  // ÚLTIMO SUCESSO: cotação mais recente com premio>0 (dentro do período). ISO em
  // UTC ('…Z') compara cronologicamente por ordem lexicográfica.
  let ultimoSucesso = null;
  for (const c of cotacoesDaSeg) {
    if (c.premio != null && c.premio > 0 && (!ultimoSucesso || c.created_at > ultimoSucesso)) {
      ultimoSucesso = c.created_at;
    }
  }

  return { taxaRetorno, tempoMedio, ultimoSucesso, erros24h: errosGlobais, semDados: false, amostra: denom };
}

// Calcula, em memória, os conjuntos derivados das OSs do período.
function derivarOS(osData, winMs, ini24hMs) {
  const osAll = (osData || []).filter(o => new Date(o.created_at).getTime() >= winMs);
  const osCotadas = osAll.filter(o => o.status === 'cotado');
  const osMap = new Map(osAll.map(o => [o.id, new Date(o.created_at).getTime()]));
  const erros24h = osAll.filter(o => o.status === 'erro' && new Date(o.created_at).getTime() >= ini24hMs).length;
  return { osCotadas, osMap, erros24h };
}

// Métricas de UMA seguradora no período (`janelaDias`). Duas queries (OSs do
// período + cotações dessa seguradora no período).
export async function getMetricas(seguradora, janelaDias = 7) {
  const winMs = janelaInicioMs(janelaDias);
  const winISO = new Date(winMs).toISOString();
  const ini24hMs = Date.now() - DIA_MS;

  const [osRes, cotRes] = await Promise.all([
    supabase.from('os_cotacao').select('id,created_at,status').gte('created_at', winISO),
    supabase.from('cotacoes').select('os_id,premio,created_at').eq('seguradora', seguradora).gte('created_at', winISO),
  ]);
  if (osRes.error) throw new Error(osRes.error.message || 'Falha ao carregar OSs');
  if (cotRes.error) throw new Error(cotRes.error.message || 'Falha ao carregar cotações');

  const { osCotadas, osMap, erros24h } = derivarOS(osRes.data, winMs, ini24hMs);
  const cotacoesDaSeg = (cotRes.data || []).filter(c => new Date(c.created_at).getTime() >= winMs);
  return agregarMetricas(seguradora, osCotadas, osMap, cotacoesDaSeg, erros24h);
}

// Métricas de VÁRIAS seguradoras de uma vez (queries em batch — uma para as OSs
// do período e uma para todas as cotações do período via `.in(seguradora)`).
// Retorna um dicionário { [nome]: metricas }.
export async function getMetricasTodas(seguradoras, janelaDias = 7) {
  const nomes = (seguradoras || []).map(s => (typeof s === 'string' ? s : s.nome));
  const winMs = janelaInicioMs(janelaDias);
  const winISO = new Date(winMs).toISOString();
  const ini24hMs = Date.now() - DIA_MS;

  const [osRes, cotRes] = await Promise.all([
    supabase.from('os_cotacao').select('id,created_at,status').gte('created_at', winISO),
    supabase.from('cotacoes').select('os_id,seguradora,premio,created_at').in('seguradora', nomes).gte('created_at', winISO),
  ]);
  if (osRes.error) throw new Error(osRes.error.message || 'Falha ao carregar OSs');
  if (cotRes.error) throw new Error(cotRes.error.message || 'Falha ao carregar cotações');

  const { osCotadas, osMap, erros24h } = derivarOS(osRes.data, winMs, ini24hMs);

  // Agrupa as cotações do período por seguradora.
  const porSeg = {};
  for (const c of (cotRes.data || [])) {
    if (new Date(c.created_at).getTime() < winMs) continue;
    (porSeg[c.seguradora] = porSeg[c.seguradora] || []).push(c);
  }

  const out = {};
  for (const nome of nomes) {
    out[nome] = agregarMetricas(nome, osCotadas, osMap, porSeg[nome] || [], erros24h);
  }
  return out;
}
