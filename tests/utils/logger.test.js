const { createLogger } = require('../../src/utils/logger');

describe('createLogger', () => {
  let originalLog, originalWarn, originalError;
  let captured;

  beforeEach(() => {
    captured = { log: [], warn: [], error: [] };
    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;
    console.log = (...args) => captured.log.push(args.join(' '));
    console.warn = (...args) => captured.warn.push(args.join(' '));
    console.error = (...args) => captured.error.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    delete process.env.LOG_LEVEL;
  });

  test('loga com prefixo de scope e placa', () => {
    const log = createLogger({ scope: 'worker', placa: 'ABC1D23' });
    log.info('teste');
    expect(captured.log[0]).toContain('[worker|ABC1D23]');
    expect(captured.log[0]).toContain('teste');
  });

  test('inclui os_id no prefixo', () => {
    const log = createLogger({ scope: 'worker', os_id: 'uuid-123' });
    log.info('msg');
    expect(captured.log[0]).toContain('OS=uuid-123');
  });

  test('error sempre loga', () => {
    process.env.LOG_LEVEL = 'error';
    const log = createLogger({ scope: 'test' });
    log.error('falhou');
    log.info('ignorado');
    expect(captured.error.length).toBe(1);
    expect(captured.log.length).toBe(0);
  });

  test('child herda contexto', () => {
    const parent = createLogger({ scope: 'parent' });
    const child = parent.child({ placa: 'XYZ' });
    child.info('child msg');
    expect(captured.log[0]).toContain('[parent|XYZ]');
  });
});
