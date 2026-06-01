const { Router } = require('express');

const router = Router();

// CORS aberto APENAS no /health: o painel admin (browser) consulta este endpoint
// para o badge de saúde do Railway. Os demais endpoints são internos
// (server-to-server) e NÃO devem expor CORS.
function corsHealth(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
}

// Responde ao preflight (caso o browser envie OPTIONS) sem corpo.
router.options('/health', corsHealth, (req, res) => res.sendStatus(204));

router.get('/health', corsHealth, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
