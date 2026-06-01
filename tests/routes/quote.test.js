const { internalAuth } = require('../../src/utils/auth');

// Helper: extrai o handler final (apos o middleware internalAuth) da rota POST /quote/auto
function getQuoteHandler() {
  const router = require('../../src/routes/quote');
  const layer = router.stack.find(l => l.route && l.route.path === '/quote/auto');
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  return {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
}

describe('POST /quote/auto — validacao de formato', () => {
  test('formato legado: exige placa e cpf no corpo', async () => {
    const handler = getQuoteHandler();
    const res = mockRes();
    await handler({ body: {} }, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toContain('placa e cpf');
  });

  test('novo formato: extrai placa de veiculo.placa e cpf de segurado.cpf', async () => {
    const handler = getQuoteHandler();
    // Sem placa em veiculo → deve falhar a validacao mesmo com segurado presente
    const res = mockRes();
    await handler({
      body: { segurado: { cpf: '12345678900' }, veiculo: { placa: '' } },
    }, res);
    expect(res._status).toBe(400);
  });

  test('novo formato: cpf ausente em segurado falha validacao', async () => {
    const handler = getQuoteHandler();
    const res = mockRes();
    await handler({
      body: { segurado: { cpf: '' }, veiculo: { placa: 'JCU9D37' } },
    }, res);
    expect(res._status).toBe(400);
  });
});

describe('POST /quote/auto', () => {
  test('requer x-secret-token', () => {
    process.env.RAILWAY_SECRET_TOKEN = 'test-token';
    const req = { headers: {} };
    const res = {
      _status: null,
      _body: null,
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; return this; },
    };
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('aceita token correto no header', () => {
    process.env.RAILWAY_SECRET_TOKEN = 'test-token';
    const req = { headers: { 'x-secret-token': 'test-token' } };
    const res = {
      _status: null,
      _body: null,
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; return this; },
    };
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
