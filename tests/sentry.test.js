// Testa a inicializacao do Sentry em src/instrument.js. Mocka @sentry/node e
// controla process.env / o cache de modulos para cada cenario.

describe('instrument (Sentry)', () => {
  const ENV_ORIGINAL = process.env;
  let initMock;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ENV_ORIGINAL };
    delete process.env.SENTRY_DSN;
    initMock = jest.fn();
    jest.doMock('@sentry/node', () => ({ init: initMock }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ENV_ORIGINAL;
    jest.dontMock('@sentry/node');
    jest.restoreAllMocks();
  });

  test('nao inicializa o Sentry quando SENTRY_DSN nao esta setado', () => {
    require('../src/instrument');
    expect(initMock).not.toHaveBeenCalled();
  });

  test('inicializa com os parametros corretos quando SENTRY_DSN esta presente', () => {
    process.env.SENTRY_DSN = 'https://abc123@o0.ingest.sentry.io/42';
    process.env.NODE_ENV = 'production';
    process.env.RAILWAY_DEPLOYMENT_ID = 'deploy-xyz';

    require('../src/instrument');

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith({
      dsn: 'https://abc123@o0.ingest.sentry.io/42',
      environment: 'production',
      release: 'deploy-xyz',
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  });

  test('usa defaults de environment e release quando as envs faltam', () => {
    process.env.SENTRY_DSN = 'https://abc123@o0.ingest.sentry.io/42';
    delete process.env.NODE_ENV;
    delete process.env.RAILWAY_DEPLOYMENT_ID;

    require('../src/instrument');

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'production', release: 'local' })
    );
  });
});
