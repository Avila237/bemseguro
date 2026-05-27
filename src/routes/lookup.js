const { Router } = require('express');
const { internalAuth } = require('../utils/auth');
const { getSession, invalidateSession } = require('../services/session');
const { buscarFipePorPlaca } = require('../services/fipe');
const { createLogger } = require('../utils/logger');

const router = Router();
const log = createLogger({ scope: 'lookup' });

router.post('/lookup/placa', internalAuth, async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ error: 'placa e obrigatoria' });

  log.info(`Buscando placa: ${placa}`);

  try {
    const { mcToken } = await getSession();
    const result = await buscarFipePorPlaca(placa, mcToken, log);

    if (!result) {
      return res.json({ success: false, placa: placa.toUpperCase(), message: 'Veiculo nao encontrado' });
    }

    return res.json(result);
  } catch (err) {
    if (err.status === 401) {
      invalidateSession();
      return res.json({ success: false, placa: placa.toUpperCase(), message: 'Veiculo nao encontrado', status: 401 });
    }
    log.error('Erro:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
