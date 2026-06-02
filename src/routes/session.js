const { Router } = require('express');
const { getSessionStatus } = require('../services/session');

const router = Router();

// CORS aberto APENAS no /session/status: o painel admin (browser) lê o estado da
// sessão Aggilizador para o widget da Sidebar e o card de Monitoring. É leitura
// pública — não expõe tokens, só TTL/timestamps; qualquer um da equipe (já
// autenticado no Supabase) pode ver. Os demais endpoints continuam internos.
function corsSession(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
}

// Responde ao preflight (caso o browser envie OPTIONS) sem corpo.
router.options('/session/status', corsSession, (req, res) => res.sendStatus(204));

router.get('/session/status', corsSession, (req, res) => {
  res.json(getSessionStatus());
});

module.exports = router;
