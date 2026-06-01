const { Router } = require('express');
const path = require('path');
const { Worker } = require('worker_threads');
const { internalAuth } = require('../utils/auth');
const { getSession, invalidateSession } = require('../services/session');
const { getCalculos } = require('../config/seguradoras');
const { createLogger } = require('../utils/logger');

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

  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        body,
        session,
        calculos,
        saveCotacoesUrl: SAVE_COTACOES_URL,
        railwayToken: process.env.RAILWAY_SECRET_TOKEN,
      },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Worker encerrou com codigo ${code}`));
    });
  });

  if (result.invalidateSession) invalidateSession();
  return res.json(result);
});

module.exports = router;
