const request = require('supertest');

// Evita Worker Thread real e login Aggilizador real ao montar o app de index.js.
jest.mock('worker_threads', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  isMainThread: true,
  workerData: null,
  parentPort: null,
}));
jest.mock('../../src/services/session', () => ({
  getSession: jest.fn().mockResolvedValue({ aggerToken: 'a', mcToken: 'm' }),
  invalidateSession: jest.fn(),
  getSessionStatus: jest.fn(() => ({ ativa: false })),
}));

const app = require('../../src/index');

const TOKEN = 'tok-payload';

beforeAll(() => { process.env.RAILWAY_SECRET_TOKEN = TOKEN; });

// Monta um body com `kb` KB de base64 dentro de documentos[].
function bodyComDocs(kb) {
  return {
    os_id: 'os-1',
    form: {},
    documentos: [{ tipo: 'cnh_segurado', base64: 'A'.repeat(kb * 1024), mimeType: 'image/jpeg' }],
  };
}

describe('Limite de payload do express.json()', () => {
  test('/quote/auto-com-docs aceita body > 100kb (limite 50mb) → 202', async () => {
    const res = await request(app)
      .post('/quote/auto-com-docs')
      .set('x-secret-token', TOKEN)
      .send(bodyComDocs(500)); // ~500kb, bem acima do default de 100kb
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, os_id: 'os-1' });
  });

  test('rota com parser default (/quote/auto) rejeita body > 100kb com 413', async () => {
    const res = await request(app)
      .post('/quote/auto')
      .set('x-secret-token', TOKEN)
      .send({ lixo: 'A'.repeat(200 * 1024) }); // ~200kb
    expect(res.status).toBe(413);
  });
});
