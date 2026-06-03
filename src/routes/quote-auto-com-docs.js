const { Router } = require('express');
const path = require('path');
const { Worker } = require('worker_threads');
const { internalAuth } = require('../utils/auth');
const { getSession } = require('../services/session');
const { createLogger } = require('../utils/logger');
const workerRegistry = require('../services/workerRegistry');
const Sentry = require('../instrument');

const router = Router();
const log = createLogger({ scope: 'quote-com-docs' });

// POST /quote/auto-com-docs — recebe os documentos (base64) + dados do form,
// dispara um Worker Thread que extrai por IA, valida cruzado e decide entre
// cotar ou marcar revisao manual. Responde 202 imediato (fire-and-forget).
router.post('/quote/auto-com-docs', internalAuth, async (req, res) => {
  const body = req.body || {};
  const { os_id, form, documentos } = body;

  if (!os_id) {
    return res.status(400).json({ error: 'os_id obrigatorio' });
  }
  if (!Array.isArray(documentos) || documentos.length === 0) {
    return res.status(400).json({ error: 'documentos obrigatorio (array nao vazio)' });
  }

  // Sessao (mcToken) para o lookup FIPE de validacao. Best-effort: se o login
  // falhar, segue sem token — o worker marcara revisao manual ao nao validar a
  // placa (em vez de travar a OS em extraindo_documentos).
  let session = {};
  try {
    session = await getSession();
  } catch (e) {
    log.warn(`getSession falhou (segue sem mcToken) | OS=${os_id} | ${e.message}`);
    session = {};
  }

  const workerPath = path.join(__dirname, '..', 'workers', 'quote-com-docs-worker.js');
  const worker = new Worker(workerPath, {
    workerData: {
      __runComDocs: true,
      os_id,
      form: form || {},
      documentos,
      session,
      baseUrl: process.env.RAILWAY_URL || `http://127.0.0.1:${process.env.PORT || 8080}`,
      railwayToken: process.env.RAILWAY_SECRET_TOKEN,
    },
  });

  workerRegistry.registrar(worker);

  worker.on('message', (m) => {
    log.info(`Worker concluido | OS=${os_id} | status=${m && m.status}`);
  });
  worker.on('error', (err) => {
    log.error(`Erro no worker | OS=${os_id} | ${err.message}`);
    Sentry.captureException(err, {
      tags: { component: 'quote-com-docs-worker' },
      extra: { os_id },
    });
    Sentry.flush(2000).catch(() => {});
  });
  worker.on('exit', (code) => {
    workerRegistry.remover(worker);
    if (code !== 0) log.error(`Worker encerrou com codigo ${code} | OS=${os_id}`);
  });

  log.info(`Worker disparado | OS=${os_id} | docs=${documentos.length}`);
  return res.status(202).json({ accepted: true, os_id });
});

module.exports = router;
