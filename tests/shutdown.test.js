// Captura as chamadas de UPDATE feitas ao Supabase para inspecionar nos testes.
const updateCalls = [];

jest.mock('../src/services/supabase', () => ({
  getSupabase: () => ({
    from: tabela => ({
      update: vals => {
        const filtros = {};
        const chain = {
          eq: (col, v) => { filtros[col] = v; return chain; },
          in: (col, v) => { filtros[col] = v; return chain; },
          lt: (col, v) => { filtros['lt_' + col] = v; return chain; },
          // thenable: ao dar await, registra a chamada e resolve.
          then: resolve => {
            updateCalls.push({ tabela, vals, filtros });
            return resolve({ error: null, count: 1 });
          },
        };
        return chain;
      },
    }),
  }),
}));

// Evita pre-carga de sessao/seguradoras ao importar o index.
jest.mock('../src/services/session', () => ({
  getSession: jest.fn().mockResolvedValue({ token: 'fake' }),
  invalidateSession: jest.fn(),
}));
jest.mock('../src/config/seguradoras', () => ({
  carregarSeguradoras: jest.fn().mockResolvedValue([]),
  getCalculos: jest.fn(() => []),
}));

describe('graceful shutdown', () => {
  let app, registry;

  beforeEach(() => {
    jest.resetModules();
    updateCalls.length = 0;
    // index e registry compartilham a mesma instancia do modulo apos o reset.
    registry = require('../src/services/workerRegistry');
    registry.limpar();
    app = require('../src/index');
  });

  test('recebe SIGTERM e fecha o servidor HTTP', async () => {
    const close = jest.fn(cb => cb());
    const exit = jest.fn();

    await app.gracefulShutdown({ signal: 'SIGTERM', server: { close }, exit, timeoutMs: 1000 });

    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('aguarda os workers em execucao terminarem antes de encerrar', async () => {
    const fakeWorker = { id: 'w1' };
    registry.registrar(fakeWorker);
    expect(registry.contar()).toBe(1);

    // sleep injetado: simula o worker terminando durante a espera.
    const sleep = jest.fn(() => {
      registry.remover(fakeWorker);
      return Promise.resolve();
    });

    const r = await app.aguardarWorkers(5000, { sleep, now: () => Date.now() });

    expect(sleep).toHaveBeenCalledTimes(1); // esperou ao menos um ciclo
    expect(r).toEqual({ timedOut: false, restantes: 0 });
    expect(registry.contar()).toBe(0);
  });

  test('timeout marca OS ainda em cotando como erro', async () => {
    // Worker que nunca sai do registro => forca o timeout.
    registry.registrar({ id: 'preso' });

    const exit = jest.fn();
    const close = jest.fn(cb => cb());
    // now() avanca alem do timeout ja na 1a verificacao do loop.
    let chamada = 0;
    const now = () => (chamada++ === 0 ? 0 : 1_000_000);
    const sleep = jest.fn().mockResolvedValue();

    await app.gracefulShutdown({
      signal: 'SIGTERM',
      server: { close },
      exit,
      timeoutMs: 1000,
      now,
      sleep,
    });

    const erroCall = updateCalls.find(
      c => c.vals.status === 'erro' && c.vals.error_message === 'Container reiniciado durante processamento'
    );
    expect(erroCall).toBeTruthy();
    expect(erroCall.filtros.status).toBe('cotando'); // escopado as OS em cotando
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('shutdown nao reentra se ja estiver encerrando', async () => {
    const exit = jest.fn();
    const close = jest.fn(cb => cb());

    await app.gracefulShutdown({ signal: 'SIGTERM', server: { close }, exit, timeoutMs: 1000 });
    await app.gracefulShutdown({ signal: 'SIGINT', server: { close }, exit, timeoutMs: 1000 });

    // segunda chamada e ignorada (guard de reentrancia)
    expect(exit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('startup — limpeza de OS orfas', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    updateCalls.length = 0;
    require('../src/services/workerRegistry').limpar();
    app = require('../src/index');
  });

  test('resetCotandoAntigas marca cotando > 5min como erro "Container reiniciado"', async () => {
    await app.resetCotandoAntigas();

    const call = updateCalls.find(c => c.vals.status === 'erro');
    expect(call).toBeTruthy();
    expect(call.vals.error_message).toBe('Container reiniciado');
    expect(call.filtros.status).toBe('cotando');
    // filtra por updated_at antigo (corte de 5 min)
    expect(call.filtros['lt_updated_at']).toBeDefined();
    const corte = new Date(call.filtros['lt_updated_at']).getTime();
    expect(Date.now() - corte).toBeGreaterThanOrEqual(5 * 60 * 1000 - 1000);
  });
});
