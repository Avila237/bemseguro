const express = require('express');
const { createServer } = require('http');

// Captura o fetch nativo ANTES de qualquer mock — usado para chamar o servidor
// de teste (o mock de fetch serve só para popular a sessao via getSession).
const realFetch = global.fetch;

function createTestApp(sessionRouter) {
  const app = express();
  app.use(sessionRouter);
  return app;
}

async function withServer(app, fn) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

describe('GET /session/status', () => {
  let session, sessionRouter;

  beforeEach(() => {
    jest.resetModules();
    process.env.AGGER_LOGIN = 'test@test.com';
    process.env.AGGER_SENHA = 'pass123';
    // Mesmo singleton para o service e o router (resolvidos do cache do require).
    session = require('../../src/services/session');
    sessionRouter = require('../../src/routes/session');
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('sessao ativa retorna ttl positivo', async () => {
    // Popula o cache via getSession com o login mockado → sessao valida por 55min.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'tok-123' }),
    });
    await session.getSession();
    global.fetch = realFetch; // restaura p/ a chamada HTTP real ao servidor de teste

    const app = createTestApp(sessionRouter);
    await withServer(app, async port => {
      const res = await fetch(`http://localhost:${port}/session/status`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ativa).toBe(true);
      expect(body.ttl_segundos).toBeGreaterThan(0);
      expect(body.expira_em).toBeTruthy();
      expect(body.ultima_renovacao).toBeTruthy();
    });
  });

  test('sessao expirada retorna ativa=false', async () => {
    session.invalidateSession();

    const app = createTestApp(sessionRouter);
    await withServer(app, async port => {
      const res = await fetch(`http://localhost:${port}/session/status`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ativa).toBe(false);
      expect(body.ttl_segundos).toBe(0);
      expect(body.expira_em).toBeNull();
    });
  });

  test('CORS header presente', async () => {
    const app = createTestApp(sessionRouter);
    await withServer(app, async port => {
      const res = await fetch(`http://localhost:${port}/session/status`);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });
});
