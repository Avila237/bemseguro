const { retryComBackoff, isRetryable } = require('../../src/utils/retry');

// sleep injetavel que apenas registra os delays (sem esperar de verdade).
function fakeSleep() {
  const delays = [];
  const fn = ms => {
    delays.push(ms);
    return Promise.resolve();
  };
  fn.delays = delays;
  return fn;
}

const erroStatus = status => Object.assign(new Error(`HTTP ${status}`), { status });

describe('retryComBackoff', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  test('sucesso na primeira tentativa: chama fn 1x e nao dorme', async () => {
    const sleep = fakeSleep();
    const fn = jest.fn().mockResolvedValue('ok');

    const r = await retryComBackoff(fn, { sleep });

    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep.delays).toEqual([]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('sucesso na segunda tentativa apos erro retryable', async () => {
    const sleep = fakeSleep();
    const fn = jest.fn()
      .mockRejectedValueOnce(erroStatus(503)) // 1a falha (retryable)
      .mockResolvedValueOnce('ok');           // 2a sucesso

    const r = await retryComBackoff(fn, { sleep, delayInicial: 1000 });

    expect(r).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep.delays).toEqual([1000]); // um unico backoff antes da 2a tentativa
    expect(logSpy).toHaveBeenCalledWith('[retry] tentativa 2/3 apos 1000ms');
  });

  test('falha apos esgotar todas as tentativas (erro retryable persistente)', async () => {
    const sleep = fakeSleep();
    const fn = jest.fn().mockRejectedValue(erroStatus(502));

    await expect(retryComBackoff(fn, { sleep, maxTentativas: 3 })).rejects.toThrow('HTTP 502');
    expect(fn).toHaveBeenCalledTimes(3);
    // dorme entre as tentativas 1->2 e 2->3, nunca apos a ultima
    expect(sleep.delays).toEqual([1000, 2000]);
  });

  test('nao retenta em erro permanente 400', async () => {
    const sleep = fakeSleep();
    const fn = jest.fn().mockRejectedValue(erroStatus(400));

    await expect(retryComBackoff(fn, { sleep })).rejects.toThrow('HTTP 400');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep.delays).toEqual([]);
  });

  test('nao retenta em erro permanente 401', async () => {
    const sleep = fakeSleep();
    const fn = jest.fn().mockRejectedValue(erroStatus(401));

    await expect(retryComBackoff(fn, { sleep })).rejects.toThrow('HTTP 401');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep.delays).toEqual([]);
  });

  test('delay exponencial respeitado, com teto em delayMaximo', async () => {
    const sleep = fakeSleep();
    const fn = jest.fn().mockRejectedValue(erroStatus(503));

    await expect(
      retryComBackoff(fn, { sleep, maxTentativas: 5, delayInicial: 100, fator: 2, delayMaximo: 500 })
    ).rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(5);
    // 100, 200, 400, depois min(800,500)=500 — 4 backoffs (a 5a tentativa nao dorme)
    expect(sleep.delays).toEqual([100, 200, 400, 500]);
  });
});

describe('isRetryable', () => {
  test('status transitorios sao retryable', () => {
    [408, 429, 502, 503, 504].forEach(s => expect(isRetryable(erroStatus(s))).toBe(true));
  });

  test('status permanentes nao sao retryable', () => {
    [400, 401, 403, 404, 422].forEach(s => expect(isRetryable(erroStatus(s))).toBe(false));
  });

  test('erros de rede (ECONNRESET, ETIMEDOUT) sao retryable', () => {
    expect(isRetryable(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isRetryable(Object.assign(new Error('to'), { code: 'ETIMEDOUT' }))).toBe(true);
    // code aninhado em cause (formato do fetch/undici)
    expect(isRetryable(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }))).toBe(true);
  });

  test('AbortError (timeout) e retryable', () => {
    expect(isRetryable(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
  });

  test('erro generico sem status/code nao e retryable', () => {
    expect(isRetryable(new Error('boom'))).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });
});
