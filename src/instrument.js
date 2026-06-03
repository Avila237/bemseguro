// Inicializacao do Sentry — DEVE ser carregado ANTES de qualquer outro require
// (a 1a linha de src/index.js: require('./instrument')). So assim o Sentry
// consegue instrumentar os modulos importados depois.
require('dotenv').config();
const Sentry = require("@sentry/node");

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    release: process.env.RAILWAY_DEPLOYMENT_ID || "local",
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  console.log("[sentry] Inicializado");
} else {
  console.log("[sentry] SENTRY_DSN não configurado — Sentry desativado");
}

module.exports = Sentry;
