const { Router } = require('express');
const path = require('path');
const { Worker } = require('worker_threads');
const { internalAuth } = require('../utils/auth');
const { getSession, invalidateSession } = require('../services/session');
const { getCalculos } = require('../config/seguradoras');
const { createLogger } = require('../utils/logger');
const workerRegistry = require('../services/workerRegistry');

const router = Router();
const log = createLogger({ scope: 'quote' });

const SAVE_COTACOES_URL = `${process.env.SUPABASE_URL}/functions/v1/save-cotacoes`;

router.post('/quote/auto', internalAuth, async (req, res) => {
  const body = req.body;

  // Detecta formato: novo contrato CRM (blocos estruturados) vs legado (flat).
  const novoFormato = !!body.segurado;
  const placa = novoFormato ? (body.veiculo && body.veiculo.placa) : body.placa;
  const cpf = novoFormato ? body.segurado.cpf : body.cpf;

  if (!placa || !cpf) {
    return res.status(400).json({ error: 'placa e cpf sao obrigatorios' });
  }

  let session;
  try {
    session = await getSession();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Falha no login: ' + e.message });
  }

  const calculos = getCalculos();
  if (calculos.length === 0) {
    return res.status(500).json({ success: false, error: 'Nenhuma seguradora configurada' });
  }

  log.info(`Iniciando worker | OS=${body.os_id} | Placa=${placa}`);

  const workerPath = path.join(__dirname, '..', 'workers', 'quote-worker.js');

  // Dispara o worker em background (fire-and-forget). A cotação roda em paralelo
  // e o resultado final é persistido pela Edge Function save-cotacoes; o chamador
  // acompanha o status via get-cotacoes. Por isso respondemos 202 de imediato,
  // sem aguardar a conclusão.
  const worker = new Worker(workerPath, {
    workerData: {
      body,
      session,
      calculos,
      saveCotacoesUrl: SAVE_COTACOES_URL,
      railwayToken: process.env.RAILWAY_SECRET_TOKEN,
    },
  });

  // Registra o worker como ativo para o graceful shutdown saber quantas cotacoes
  // ainda estao em andamento. Removido no 'exit' (que sempre dispara, inclusive
  // apos 'error').
  workerRegistry.registrar(worker);

  worker.on('message', result => {
    if (result && result.invalidateSession) invalidateSession();
    log.info(`Worker concluido | OS=${body.os_id} | Placa=${placa}`);
  });
  worker.on('error', err => {
    log.error(`Erro no worker | OS=${body.os_id} | Placa=${placa} | ${err.message}`);
  });
  worker.on('exit', code => {
    workerRegistry.remover(worker);
    if (code !== 0) log.error(`Worker encerrou com codigo ${code} | OS=${body.os_id} | Placa=${placa}`);
  });

  return res.status(202).json({ success: true, message: 'Cotação em processamento' });
});

module.exports = router;
