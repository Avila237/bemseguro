// Instrumentacao do Sentry — TEM que ser o primeiro require do processo, antes
// de qualquer outro modulo, para instrumentar tudo que e carregado depois.
require('./instrument');

const express = require('express');
const Sentry = require('@sentry/node');
const path = require('path');
const { createLogger } = require('./utils/logger');
const { getSession } = require('./services/session');
const { getSupabase } = require('./services/supabase');
const { carregarSeguradoras } = require('./config/seguradoras');
const workerRegistry = require('./services/workerRegistry');
const healthRouter = require('./routes/health');
const quoteRouter = require('./routes/quote');
const lookupRouter = require('./routes/lookup');
const sessionRouter = require('./routes/session');
const extractRouter = require('./routes/extract');
const cotacaoComDocsRouter = require('./routes/cotacao-com-docs');

const log = createLogger({ scope: 'startup' });
const app = express();
const PORT = process.env.PORT || 8080;

// Tempo maximo aguardando os workers em execucao terminarem no shutdown.
const SHUTDOWN_TIMEOUT_MS = 30000;
// OS em "cotando" sem atualizacao ha mais que isto sao consideradas orfas de um
// container reiniciado (o processamento nao roda entre boots).
const COTANDO_ORFA_MS = 5 * 60 * 1000;

let servidorAtivo = null;
let encerrando = false;

app.use(express.json());

// Raiz (exata): redireciona para o painel admin. Rota EXATA via app.get('/') —
// nao e middleware generico, entao nao interfere com /api, /quote, /health,
// /session, /admin etc. O React Router/ProtectedRoute leva ao /admin/login.
app.get('/', (req, res) => res.redirect(302, '/admin'));

app.use(healthRouter);
app.use(quoteRouter);
app.use(lookupRouter);
app.use(sessionRouter);
app.use(extractRouter);
app.use(cotacaoComDocsRouter);

// Painel admin (React/Vite) — build estatico servido em /admin.
// O fallback para index.html habilita o client-side routing do React Router.
const ADMIN_DIST = path.join(__dirname, '..', 'admin', 'dist');
app.use('/admin', express.static(ADMIN_DIST));
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(ADMIN_DIST, 'index.html'));
});

// Error handler do Sentry: depois de TODAS as rotas e antes de qualquer outro
// middleware de erro. Captura excecoes nao-tratadas das rotas Express.
Sentry.setupExpressErrorHandler(app);

const msSleep = ms => new Promise(r => setTimeout(r, ms));

// Reseta OS presas em "cotando" para "pendente" (comportamento ja existente).
async function resetStuckQuotes() {
  try {
    const supabase = getSupabase();
    const { error, count } = await supabase
      .from('os_cotacao')
      .update({ status: 'pendente' })
      .in('status', ['cotando']);

    if (error) throw error;
    log.info(`OS travadas resetadas (${count ?? 0})`);
  } catch (e) {
    log.error('Erro ao resetar OS travadas:', e.message);
  }
}

// Marca como erro as OS que ficaram em "cotando" por mais de 5 minutos sem
// atualizacao — provavelmente orfas de um shutdown/crash anterior, ja que o
// processamento nao continua entre reinicios do container.
async function resetCotandoAntigas() {
  try {
    const supabase = getSupabase();
    const corte = new Date(Date.now() - COTANDO_ORFA_MS).toISOString();
    const { error, count } = await supabase
      .from('os_cotacao')
      .update({ status: 'erro', error_message: 'Container reiniciado' })
      .eq('status', 'cotando')
      .lt('updated_at', corte);

    if (error) throw error;
    log.info(`OS orfas em cotando (>5min) marcadas como erro (${count ?? 0})`);
  } catch (e) {
    log.error('Erro ao marcar OS orfas como erro:', e.message);
  }
}

// Marca todas as OS ainda em "cotando" como erro. Usado no shutdown, quando os
// workers nao terminaram a tempo (ou o container esta sendo reiniciado).
async function marcarCotandoComoErro(mensagem) {
  try {
    const supabase = getSupabase();
    const { error, count } = await supabase
      .from('os_cotacao')
      .update({ status: 'erro', error_message: mensagem })
      .eq('status', 'cotando');

    if (error) throw error;
    log.info(`[shutdown] OS em cotando marcadas como erro (${count ?? 0})`);
  } catch (e) {
    log.error('[shutdown] Erro ao marcar OS cotando como erro:', e.message);
  }
}

// Aguarda os workers ativos terminarem, ate o timeout. Retorna { timedOut, restantes }.
// `sleep` e `now` sao injetaveis para testes.
async function aguardarWorkers(timeoutMs = SHUTDOWN_TIMEOUT_MS, opts = {}) {
  const { sleep = msSleep, now = Date.now, intervalo = 500 } = opts;
  const inicio = now();
  while (workerRegistry.contar() > 0) {
    if (now() - inicio >= timeoutMs) {
      return { timedOut: true, restantes: workerRegistry.contar() };
    }
    await sleep(intervalo);
  }
  return { timedOut: false, restantes: 0 };
}

// Encerramento gracioso: para de aceitar requisicoes, aguarda os workers
// (ate o timeout) e marca como erro qualquer OS que tenha sobrado em "cotando".
async function gracefulShutdown(opts = {}) {
  const {
    signal = 'SIGTERM',
    server = servidorAtivo,
    timeoutMs = SHUTDOWN_TIMEOUT_MS,
    exit = code => process.exit(code),
    sleep,
    now,
  } = opts;

  if (encerrando) return;
  encerrando = true;

  log.info(`[shutdown] Sinal recebido (${signal})`);

  // 1) Para de aceitar novas requisicoes HTTP.
  if (server && typeof server.close === 'function') {
    await new Promise(resolve => server.close(() => resolve()));
    log.info('[shutdown] Servidor HTTP fechado — sem novas requisicoes');
  }

  // 2) Aguarda os workers em execucao terminarem (timeout maximo).
  log.info(`[shutdown] Aguardando ${workerRegistry.contar()} workers...`);
  const { timedOut, restantes } = await aguardarWorkers(timeoutMs, { sleep, now });
  if (timedOut) {
    log.warn(`[shutdown] Timeout (${timeoutMs}ms) — ${restantes} worker(s) ainda em execucao`);
  } else {
    log.info('[shutdown] Workers concluidos');
  }

  // 3) Apos timeout ou termino, marca OS ainda em cotando como erro.
  await marcarCotandoComoErro('Container reiniciado durante processamento');

  log.info('[shutdown] Encerrado');
  exit(0);
}

async function boot() {
  try {
    const supabase = getSupabase();
    await carregarSeguradoras(supabase);
    log.info('Seguradoras carregadas do Supabase');
  } catch (e) {
    log.error('Falha ao carregar seguradoras:', e.message);
  }

  getSession()
    .then(() => log.info('Sessao pre-carregada com sucesso.'))
    .catch(e => log.error('Falha no pre-carregamento de sessao:', e.message));

  // OS orfas (cotando > 5min) viram erro; o restante das cotando volta a pendente.
  // A ordem importa: marcar as antigas como erro ANTES do reset evita que elas
  // sejam apenas resetadas para pendente.
  await resetCotandoAntigas();
  await resetStuckQuotes();
}

if (require.main === module) {
  boot().then(() => {
    servidorAtivo = app.listen(PORT, () => {
      log.info(`Bem Seguro API rodando na porta ${PORT} (Worker Threads ativo)`);
    });

    process.on('SIGTERM', () => gracefulShutdown({ signal: 'SIGTERM', server: servidorAtivo }));
    process.on('SIGINT', () => gracefulShutdown({ signal: 'SIGINT', server: servidorAtivo }));
  });
}

module.exports = app;
module.exports.gracefulShutdown = gracefulShutdown;
module.exports.aguardarWorkers = aguardarWorkers;
module.exports.marcarCotandoComoErro = marcarCotandoComoErro;
module.exports.resetCotandoAntigas = resetCotandoAntigas;
module.exports.resetStuckQuotes = resetStuckQuotes;
