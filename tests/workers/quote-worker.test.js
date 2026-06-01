const path = require('path');

describe('quote-worker', () => {
  test('worker file existe e e valido', () => {
    const workerPath = path.join(__dirname, '..', '..', 'src', 'workers', 'quote-worker.js');
    expect(() => require.resolve(workerPath)).not.toThrow();
  });

  test('worker exporta nada (arquivo executavel)', () => {
    // quote-worker.js usa parentPort e workerData do worker_threads
    // nao pode ser importado diretamente — apenas validamos que existe
    const fs = require('fs');
    const workerPath = path.join(__dirname, '..', '..', 'src', 'workers', 'quote-worker.js');
    const content = fs.readFileSync(workerPath, 'utf8');
    expect(content).toContain('parentPort');
    expect(content).toContain('workerData');
    expect(content).toContain('resolverFipe');
    expect(content).toContain('montarPayload');
    expect(content).toContain('dispararCotacao');
    expect(content).toContain('pollVersoes');
  });

  test('chamada save-cotacoes envia Authorization Bearer com anon key', () => {
    const fs = require('fs');
    const workerPath = path.join(__dirname, '..', '..', 'src', 'workers', 'quote-worker.js');
    const content = fs.readFileSync(workerPath, 'utf8');
    // Gateway do Supabase exige Bearer <SUPABASE_ANON_KEY> alem do x-secret-token
    expect(content).toContain('Authorization');
    expect(content).toContain('Bearer ${process.env.SUPABASE_ANON_KEY}');
    expect(content).toContain('x-secret-token');
  });

  test('worker detecta novo formato e le os blocos estruturados', () => {
    const fs = require('fs');
    const workerPath = path.join(__dirname, '..', '..', 'src', 'workers', 'quote-worker.js');
    const content = fs.readFileSync(workerPath, 'utf8');
    // deteccao por presenca de body.segurado
    expect(content).toContain('body.segurado');
    // le os novos blocos
    expect(content).toContain('body.veiculo');
    expect(content).toContain('body.condutor');
    expect(content).toContain('body.apoliceAnterior');
    // mantem suporte ao formato legado
    expect(content).toContain('dados_risco');
  });
});
