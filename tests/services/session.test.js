describe('session service', () => {
  let session;

  beforeEach(() => {
    jest.resetModules();
    process.env.AGGER_LOGIN = 'test@test.com';
    process.env.AGGER_SENHA = 'pass123';
    session = require('../../src/services/session');
  });

  test('invalidateSession limpa cache', async () => {
    session.invalidateSession();
    const sync = session.getSessionSync();
    expect(sync).toBeNull();
  });

  test('getSessionSync retorna null sem sessao ativa', () => {
    session.invalidateSession();
    expect(session.getSessionSync()).toBeNull();
  });

  test('SESSION_TTL_MS e 55 minutos', () => {
    expect(session.SESSION_TTL_MS).toBe(55 * 60 * 1000);
  });

  test('loginFresh faz POST para /usuario/login', async () => {
    const mockResponse = { token: 'agger-token-123' };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const token = await session.loginFresh();
    expect(token).toBe('agger-token-123');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/usuario/login'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('loginFresh trata token em data.token', async () => {
    const mockResponse = { data: { token: 'nested-token' } };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const token = await session.loginFresh();
    expect(token).toBe('nested-token');
  });

  test('loginFresh lanca erro se status nao ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(session.loginFresh()).rejects.toThrow('Login falhou: 500');
  });

  test('loginPdocs retorna token multicalculo', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'mc-token-456' }),
    });

    const token = await session.loginPdocs('agger-token');
    expect(token).toBe('mc-token-456');
  });

  test('loginPdocs retorna aggerToken se falhar', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    const token = await session.loginPdocs('agger-token');
    expect(token).toBe('agger-token');
  });

  afterEach(() => {
    delete global.fetch;
  });
});
