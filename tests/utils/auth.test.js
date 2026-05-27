const { internalAuth } = require('../../src/utils/auth');

describe('internalAuth', () => {
  const originalEnv = process.env.RAILWAY_SECRET_TOKEN;

  beforeAll(() => {
    process.env.RAILWAY_SECRET_TOKEN = 'test-secret-123';
  });

  afterAll(() => {
    process.env.RAILWAY_SECRET_TOKEN = originalEnv;
  });

  function mockReqRes(token) {
    const req = { headers: { 'x-secret-token': token } };
    const res = {
      _status: null,
      _body: null,
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; return this; },
    };
    return { req, res };
  }

  test('rejeita token invalido', () => {
    const { req, res } = mockReqRes('wrong');
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejeita sem token', () => {
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
  });

  test('aceita token correto', () => {
    const { req, res } = mockReqRes('test-secret-123');
    const next = jest.fn();
    internalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });
});
