// Mocks para importar o app (src/index.js) sem efeitos colaterais de boot
// (Supabase real, pre-carga de sessao/seguradoras). Mesmo padrao do shutdown.test.
jest.mock('../../src/services/supabase', () => ({
  getSupabase: () => ({}),
}));
jest.mock('../../src/services/session', () => ({
  getSession: jest.fn().mockResolvedValue({ token: 'fake' }),
  invalidateSession: jest.fn(),
}));
jest.mock('../../src/config/seguradoras', () => ({
  carregarSeguradoras: jest.fn().mockResolvedValue([]),
  getCalculos: jest.fn(() => []),
}));

const { createServer } = require('http');
const app = require('../../src/index');

async function withServer(fn) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

describe('GET / (redirect para o painel admin)', () => {
  test('responde 302 com Location: /admin', async () => {
    await withServer(async port => {
      // redirect: 'manual' impede o fetch de seguir o 302 — assim inspecionamos.
      const res = await fetch(`http://localhost:${port}/`, { redirect: 'manual' });
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/admin');
    });
  });

  test('nao afeta /health (continua 200 ok)', async () => {
    await withServer(async port => {
      const res = await fetch(`http://localhost:${port}/health`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
    });
  });
});
