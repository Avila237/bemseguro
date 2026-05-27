const { internalAuth } = require('../../src/utils/auth');

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
