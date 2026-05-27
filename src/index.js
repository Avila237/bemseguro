const express = require('express');
const { createLogger } = require('./utils/logger');
const { getSession } = require('./services/session');
const { getSupabase } = require('./services/supabase');
const { carregarSeguradoras } = require('./config/seguradoras');
const healthRouter = require('./routes/health');
const quoteRouter = require('./routes/quote');
const lookupRouter = require('./routes/lookup');

const log = createLogger({ scope: 'startup' });
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.use(healthRouter);
app.use(quoteRouter);
app.use(lookupRouter);

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

  resetStuckQuotes();
}

if (require.main === module) {
  boot().then(() => {
    app.listen(PORT, () => {
      log.info(`Bem Seguro API rodando na porta ${PORT} (Worker Threads ativo)`);
    });
  });
}

module.exports = app;
