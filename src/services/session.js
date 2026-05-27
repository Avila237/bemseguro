const { createLogger } = require('../utils/logger');

const log = createLogger({ scope: 'session' });
const AGGER_API = 'https://api-prod.aggilizador.com.br';
const SESSION_TTL_MS = 55 * 60 * 1000;

let sessionCache = {
  aggerToken: null,
  mcToken: null,
  expiresAt: 0,
  loginPromise: null,
};

async function loginFresh() {
  const res = await fetch(`${AGGER_API}/usuario/login?device=desktop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.AGGER_LOGIN,
      senha: process.env.AGGER_SENHA,
    }),
  });

  if (!res.ok) throw new Error(`Login falhou: ${res.status}`);
  const data = await res.json();
  const token = data.token || (data.data && data.data.token);

  if (token) {
    log.info('Login OK');
    return token;
  }

  // Sessoes lotadas — desconectar a mais antiga e tentar novamente
  if (data.message && data.message.includes('lotadas') && Array.isArray(data.data) && data.data.length > 0) {
    log.warn('Sessoes lotadas, desconectando sessao antiga...');
    const sessao = data.data[0];
    try {
      await fetch(`${AGGER_API}/usuario/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': sessao.token,
        },
        body: JSON.stringify({ id: sessao.id }),
      });
      log.info(`Sessao antiga desconectada: ${sessao.id}`);
    } catch (e) {
      log.error('Erro ao desconectar sessao:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));

    const res2 = await fetch(`${AGGER_API}/usuario/login?device=desktop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.AGGER_LOGIN,
        senha: process.env.AGGER_SENHA,
      }),
    });

    if (!res2.ok) throw new Error(`Login falhou apos logout: ${res2.status}`);
    const data2 = await res2.json();
    const token2 = data2.token || (data2.data && data2.data.token);
    if (!token2) throw new Error('Token nao encontrado apos logout');
    log.info('Login OK (apos liberar sessao)');
    return token2;
  }

  throw new Error('Token nao encontrado');
}

async function loginPdocs(aggerToken) {
  const res = await fetch(`${AGGER_API}/usuario/login/pdocs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': aggerToken,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) return aggerToken;
  const data = await res.json();
  log.info(`Token multicalculo obtido: ${!!data.token}`);
  return data.token || aggerToken;
}

async function getSession() {
  const now = Date.now();
  if (sessionCache.aggerToken && sessionCache.mcToken && now < sessionCache.expiresAt) {
    return { aggerToken: sessionCache.aggerToken, mcToken: sessionCache.mcToken };
  }

  if (sessionCache.loginPromise) {
    log.info('Aguardando login em andamento...');
    await sessionCache.loginPromise;
    return { aggerToken: sessionCache.aggerToken, mcToken: sessionCache.mcToken };
  }

  log.info('Renovando sessao...');
  sessionCache.loginPromise = (async () => {
    try {
      const aggerToken = await loginFresh();
      const mcToken = await loginPdocs(aggerToken);
      sessionCache.aggerToken = aggerToken;
      sessionCache.mcToken = mcToken;
      sessionCache.expiresAt = Date.now() + SESSION_TTL_MS;
      log.info('Sessao renovada. Valida por 55 minutos.');
    } finally {
      sessionCache.loginPromise = null;
    }
  })();

  await sessionCache.loginPromise;
  return { aggerToken: sessionCache.aggerToken, mcToken: sessionCache.mcToken };
}

function invalidateSession() {
  sessionCache.aggerToken = null;
  sessionCache.mcToken = null;
  sessionCache.expiresAt = 0;
}

function getSessionSync() {
  if (sessionCache.aggerToken && sessionCache.mcToken && Date.now() < sessionCache.expiresAt) {
    return { aggerToken: sessionCache.aggerToken, mcToken: sessionCache.mcToken };
  }
  return null;
}

module.exports = {
  loginFresh,
  loginPdocs,
  getSession,
  invalidateSession,
  getSessionSync,
  SESSION_TTL_MS,
};
