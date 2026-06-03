const request = require('supertest');
const express = require('express');

// Evita spawnar Worker Thread real e login Aggilizador real.
jest.mock('worker_threads', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  isMainThread: true,
  workerData: null,
  parentPort: null,
}));
jest.mock('../../src/services/session', () => ({
  getSession: jest.fn().mockResolvedValue({ aggerToken: 'a', mcToken: 'm' }),
}));

const { Worker } = require('worker_threads');
const quoteComDocsRouter = require('../../src/routes/quote-auto-com-docs');

const TOKEN = 'tok-secreto';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(quoteComDocsRouter);
  return app;
}

function bodyValido() {
  return {
    os_id: 'os-1',
    form: { nome: 'Fulano', telefone: '1199', cep_pernoite: '12345678', estado_civil: 'solteiro', uso: 'passeio', dono_eh_condutor: true, renovacao: false },
    documentos: [
      { tipo: 'cnh_segurado', base64: 'AAA', mimeType: 'image/jpeg' },
      { tipo: 'crlv', base64: 'BBB', mimeType: 'image/jpeg' },
    ],
  };
}

beforeAll(() => { process.env.RAILWAY_SECRET_TOKEN = TOKEN; });
beforeEach(() => { Worker.mockClear(); });

describe('POST /quote/auto-com-docs', () => {
  test('sem x-secret-token retorna 401', async () => {
    const res = await request(makeApp()).post('/quote/auto-com-docs').send(bodyValido());
    expect(res.status).toBe(401);
    expect(Worker).not.toHaveBeenCalled();
  });

  test('sem os_id retorna 400', async () => {
    const body = bodyValido();
    delete body.os_id;
    const res = await request(makeApp())
      .post('/quote/auto-com-docs')
      .set('x-secret-token', TOKEN)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/os_id/);
    expect(Worker).not.toHaveBeenCalled();
  });

  test('POST válido retorna 202 imediato { accepted, os_id }', async () => {
    const res = await request(makeApp())
      .post('/quote/auto-com-docs')
      .set('x-secret-token', TOKEN)
      .send(bodyValido());
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, os_id: 'os-1' });
  });

  test('Worker thread é disparado no POST válido', async () => {
    await request(makeApp())
      .post('/quote/auto-com-docs')
      .set('x-secret-token', TOKEN)
      .send(bodyValido());
    expect(Worker).toHaveBeenCalledTimes(1);
    // workerData carrega o flag, os_id, documentos e a sessão.
    const workerData = Worker.mock.calls[0][1].workerData;
    expect(workerData.__runComDocs).toBe(true);
    expect(workerData.os_id).toBe('os-1');
    expect(workerData.documentos).toHaveLength(2);
    expect(workerData.session).toEqual({ aggerToken: 'a', mcToken: 'm' });
  });

  test('rota registrada como POST /quote/auto-com-docs', () => {
    const rotas = quoteComDocsRouter.stack
      .filter((l) => l.route)
      .map((l) => ({ path: l.route.path, method: Object.keys(l.route.methods)[0] }));
    expect(rotas).toContainEqual({ path: '/quote/auto-com-docs', method: 'post' });
  });
});
