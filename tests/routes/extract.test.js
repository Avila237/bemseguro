const request = require('supertest');
const express = require('express');

// Mock do wrapper da Claude API — os testes de rota nao chamam a API real.
jest.mock('../../src/services/anthropic', () => ({
  extrairDocumento: jest.fn(),
}));
const { extrairDocumento } = require('../../src/services/anthropic');

const extractRouter = require('../../src/routes/extract');

const TOKEN = 'test-secret-token';

function makeApp() {
  const app = express();
  app.use(extractRouter);
  return app;
}

const RESULTADO_CNH = {
  dados: { nome: 'FULANO DE TAL', cpf: '12345678900', data_nascimento: '1990-01-01', sexo: 'M', validade_cnh: '2030-01-01' },
  confianca: { nome: 0.97, cpf: 0.99 },
  observacoes: '',
  modelo: 'claude-sonnet-4-5',
  tokensUsados: 1234,
};

beforeAll(() => { process.env.RAILWAY_SECRET_TOKEN = TOKEN; });

beforeEach(() => {
  extrairDocumento.mockReset();
  extrairDocumento.mockResolvedValue(RESULTADO_CNH);
});

describe('POST /extract/cnh', () => {
  test('sem token retorna 401 (e nao chama a Claude API)', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .attach('arquivo', Buffer.from('fake'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('sem arquivo retorna 400', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN);
    expect(res.status).toBe(400);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('MIME invalido (tipo nao suportado) retorna 400', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .attach('arquivo', Buffer.from('texto qualquer'), { filename: 'doc.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('arquivo grande demais (>10MB) retorna 413', async () => {
    const grande = Buffer.alloc(11 * 1024 * 1024, 0x61); // 11MB
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .attach('arquivo', grande, { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('POST valido retorna os dados extraidos', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .attach('arquivo', Buffer.from('imagem-fake-jpeg'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tipo).toBe('cnh');
    expect(res.body.dados.cpf).toBe('12345678900');
    expect(res.body.modelo).toBe('claude-sonnet-4-5');
    expect(extrairDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoDocumento: 'cnh', mimeType: 'image/jpeg' }),
    );
    // O arquivo foi convertido para base64 antes de chamar o wrapper.
    const arg = extrairDocumento.mock.calls[0][0];
    expect(arg.base64Image).toBe(Buffer.from('imagem-fake-jpeg').toString('base64'));
  });

  test('falha da Claude API retorna 502', async () => {
    extrairDocumento.mockRejectedValue(new Error('Anthropic HTTP 500'));
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .attach('arquivo', Buffer.from('imagem-fake'), { filename: 'cnh.png', contentType: 'image/png' });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /extract/crlv', () => {
  test('aceita PDF e retorna os dados extraidos', async () => {
    extrairDocumento.mockResolvedValue({
      dados: { placa: 'ABC1D23', chassi: '9BWZZZ377VT004251' },
      confianca: { placa: 0.95 },
      observacoes: '',
      modelo: 'claude-sonnet-4-5',
      tokensUsados: 800,
    });
    const res = await request(makeApp())
      .post('/extract/crlv')
      .set('x-secret-token', TOKEN)
      .attach('arquivo', Buffer.from('%PDF-1.4 fake'), { filename: 'crlv.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('crlv');
    expect(res.body.dados.placa).toBe('ABC1D23');
    expect(extrairDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoDocumento: 'crlv', mimeType: 'application/pdf' }),
    );
  });
});

describe('rotas registradas', () => {
  test('POST /extract/cnh e /extract/crlv existem no router', () => {
    const rotas = extractRouter.stack
      .filter(l => l.route)
      .map(l => ({ path: l.route.path, method: Object.keys(l.route.methods)[0] }));
    expect(rotas).toContainEqual({ path: '/extract/cnh', method: 'post' });
    expect(rotas).toContainEqual({ path: '/extract/crlv', method: 'post' });
  });
});
