const request = require('supertest');
const express = require('express');

// Estado configuravel do mock do Supabase (prefixo "mock" exigido pelo hoisting
// do jest.mock). Cada teste ajusta resultados e inspeciona o que foi gravado.
const mockState = {
  rpcResult: { data: [{ id: 'key-1', rate_limit: 60 }], error: null }, // validar_api_key
  idempotencyExisting: null,                                            // OS achada por idempotency_key
  osInsertResult: { data: { id: 'os-novo', status: 'extraindo_documentos' }, error: null },
  insertedOsRow: null,
  auditRows: [],
};

jest.mock('../../src/services/supabase', () => {
  const state = mockState;
  const makeBuilder = (table) => {
    const b = {};
    b.select = jest.fn(() => b);
    b.eq = jest.fn(() => b);
    b.gte = jest.fn(() => b);
    b.order = jest.fn(() => b);
    b.limit = jest.fn(() => b);
    b.maybeSingle = jest.fn(() =>
      Promise.resolve(
        table === 'os_cotacao'
          ? (state.idempotencyExisting || { data: null, error: null })
          : { data: null, error: null },
      ),
    );
    b.single = jest.fn(() => Promise.resolve(state.osInsertResult));
    b.insert = jest.fn((row) => {
      if (table === 'audit_log') {
        state.auditRows.push(row);
        return { then: (resolve) => resolve({ data: null, error: null }) };
      }
      state.insertedOsRow = row; // os_cotacao
      return b; // permite .select().single()
    });
    return b;
  };
  return {
    getSupabase: jest.fn(() => ({
      from: jest.fn((table) => makeBuilder(table)),
      rpc: jest.fn(() => Promise.resolve(state.rpcResult)),
    })),
  };
});

const cotacaoComDocsRouter = require('../../src/routes/cotacao-com-docs');

const APIKEY = 'bsh_live_chave-valida';
const PATH = '/api/v1/cotacoes-com-docs';

function makeApp() {
  const app = express();
  app.use(cotacaoComDocsRouter);
  return app;
}

const JPG = { contentType: 'image/jpeg' };

// Helper: monta um request com os campos validos + arquivos default. Cada teste
// remove/sobrescreve o que precisa.
function reqValido(app) {
  return request(app)
    .post(PATH)
    .set('x-api-key', APIKEY)
    .field('nome', 'Fulano de Tal')
    .field('telefone', '11999998888')
    .field('cep_pernoite', '12345-678')
    .field('estado_civil', 'solteiro')
    .field('uso', 'passeio')
    .field('dono_eh_condutor', 'true')
    .field('renovacao', 'false');
}

beforeAll(() => { process.env.RAILWAY_SECRET_TOKEN = 'tok'; });

beforeEach(() => {
  mockState.rpcResult = { data: [{ id: 'key-1', rate_limit: 60 }], error: null };
  mockState.idempotencyExisting = null;
  mockState.osInsertResult = { data: { id: 'os-novo', status: 'extraindo_documentos' }, error: null };
  mockState.insertedOsRow = null;
  mockState.auditRows = [];
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

describe('POST /api/v1/cotacoes-com-docs — auth e validacao', () => {
  test('sem x-api-key retorna 401', async () => {
    const res = await request(makeApp())
      .post(PATH)
      .field('nome', 'x')
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG });
    expect(res.status).toBe(401);
    expect(mockState.insertedOsRow).toBeNull();
  });

  test('sem campos obrigatorios retorna 400', async () => {
    const res = await request(makeApp())
      .post(PATH)
      .set('x-api-key', APIKEY)
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG })
      .attach('crlv', Buffer.from('b'), { filename: 'crlv.jpg', ...JPG });
    expect(res.status).toBe(400);
    expect(res.body.campos).toEqual(expect.arrayContaining(['nome', 'telefone', 'cep_pernoite']));
    expect(mockState.insertedOsRow).toBeNull();
  });

  test('sem cnh_segurado retorna 400', async () => {
    const res = await reqValido(makeApp())
      .attach('crlv', Buffer.from('b'), { filename: 'crlv.jpg', ...JPG });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cnh_segurado/);
  });

  test('sem crlv retorna 400', async () => {
    const res = await reqValido(makeApp())
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/crlv/);
  });

  test('dono_eh_condutor=false sem cnh_condutor retorna 400', async () => {
    const res = await request(makeApp())
      .post(PATH)
      .set('x-api-key', APIKEY)
      .field('nome', 'Fulano')
      .field('telefone', '11999998888')
      .field('cep_pernoite', '12345678')
      .field('estado_civil', 'solteiro')
      .field('uso', 'passeio')
      .field('dono_eh_condutor', 'false')
      .field('renovacao', 'false')
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG })
      .attach('crlv', Buffer.from('b'), { filename: 'crlv.jpg', ...JPG });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cnh_condutor/);
  });

  test('callback_url HTTP (nao HTTPS) retorna 400', async () => {
    const res = await reqValido(makeApp())
      .field('callback_url', 'http://crm.exemplo.com/webhook')
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG })
      .attach('crlv', Buffer.from('b'), { filename: 'crlv.jpg', ...JPG });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/HTTPS/);
  });

  test('uso invalido retorna 400', async () => {
    const res = await request(makeApp())
      .post(PATH)
      .set('x-api-key', APIKEY)
      .field('nome', 'Fulano')
      .field('telefone', '11999998888')
      .field('cep_pernoite', '12345678')
      .field('estado_civil', 'solteiro')
      .field('uso', 'aviao')
      .field('dono_eh_condutor', 'true')
      .field('renovacao', 'false')
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG })
      .attach('crlv', Buffer.from('b'), { filename: 'crlv.jpg', ...JPG });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/uso/);
  });
});

describe('POST /api/v1/cotacoes-com-docs — fluxo completo', () => {
  test('POST valido cria OS extraindo_documentos, dispara worker e retorna 202', async () => {
    const res = await reqValido(makeApp())
      .field('external_ref', 'lead-12345')
      .field('callback_url', 'https://crm.exemplo.com/webhook')
      .attach('cnh_segurado', Buffer.from('imagem-cnh'), { filename: 'cnh.jpg', ...JPG })
      .attach('crlv', Buffer.from('imagem-crlv'), { filename: 'crlv.jpg', ...JPG });

    expect(res.status).toBe(202);
    expect(res.body.os_id).toBe('os-novo');
    expect(res.body.status).toBe('extraindo_documentos');
    expect(res.body.external_ref).toBe('lead-12345');
    expect(res.body.message).toMatch(/Documentos sendo processados/);

    // OS persistida com os campos corretos.
    expect(mockState.insertedOsRow).toMatchObject({
      status: 'extraindo_documentos',
      nome: 'Fulano de Tal',
      cpf: null,
      placa: null,
      cep: '12345678',
      api_key_id: 'key-1',
    });
    expect(mockState.insertedOsRow.dados_risco).toMatchObject({
      uso: 'passeio',
      estado_civil: 'solteiro',
      dono_eh_condutor: true,
      renovacao: false,
      external_ref: 'lead-12345',
      callback_url: 'https://crm.exemplo.com/webhook',
      telefone: '11999998888',
    });

    // Worker disparado (fire-and-forget) com os_id + form + documentos base64.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/quote\/auto-com-docs$/);
    expect(opts.headers['x-secret-token']).toBe('tok');
    const payload = JSON.parse(opts.body);
    expect(payload.os_id).toBe('os-novo');
    expect(payload.documentos).toHaveLength(2);
    expect(payload.documentos.map((d) => d.tipo)).toEqual(['cnh_segurado', 'crlv']);
    expect(payload.documentos[0].base64).toBe(Buffer.from('imagem-cnh').toString('base64'));

    // Audit log mascarado (sem binarios, telefone oculto).
    expect(mockState.auditRows).toHaveLength(1);
    expect(mockState.auditRows[0]).toMatchObject({
      endpoint: '/api/v1/cotacoes-com-docs',
      method: 'POST',
      response_status: 202,
    });
    expect(mockState.auditRows[0].request_payload.telefone).toBe('***');
    expect(mockState.auditRows[0].request_payload.docs).toBe(2);
  });

  test('dono_eh_condutor=false com cnh_condutor envia 3 documentos', async () => {
    const res = await request(makeApp())
      .post(PATH)
      .set('x-api-key', APIKEY)
      .field('nome', 'Fulano')
      .field('telefone', '11999998888')
      .field('cep_pernoite', '12345678')
      .field('estado_civil', 'solteiro')
      .field('uso', 'comercial')
      .field('dono_eh_condutor', 'false')
      .field('renovacao', 'true')
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG })
      .attach('crlv', Buffer.from('b'), { filename: 'crlv.jpg', ...JPG })
      .attach('cnh_condutor', Buffer.from('c'), { filename: 'cond.jpg', ...JPG });

    expect(res.status).toBe(202);
    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload.documentos.map((d) => d.tipo)).toEqual(['cnh_segurado', 'crlv', 'cnh_condutor']);
    expect(mockState.insertedOsRow.dados_risco.dono_eh_condutor).toBe(false);
    expect(mockState.insertedOsRow.dados_risco.renovacao).toBe(true);
  });
});

describe('POST /api/v1/cotacoes-com-docs — idempotencia', () => {
  test('Idempotency-Key repetida retorna 200 com a OS anterior (sem nova OS)', async () => {
    mockState.idempotencyExisting = {
      data: { id: 'os-anterior', status: 'extraindo_documentos' },
      error: null,
    };
    const res = await reqValido(makeApp())
      .set('idempotency-key', 'lead-12345-abc')
      .field('external_ref', 'lead-12345')
      .attach('cnh_segurado', Buffer.from('a'), { filename: 'cnh.jpg', ...JPG })
      .attach('crlv', Buffer.from('b'), { filename: 'crlv.jpg', ...JPG });

    expect(res.status).toBe(200);
    expect(res.body.os_id).toBe('os-anterior');
    expect(res.body.message).toMatch(/replay/i);
    // Nao criou OS nova nem disparou worker.
    expect(mockState.insertedOsRow).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('rota registrada', () => {
  test('POST /api/v1/cotacoes-com-docs existe no router', () => {
    const rotas = cotacaoComDocsRouter.stack
      .filter((l) => l.route)
      .map((l) => ({ path: l.route.path, method: Object.keys(l.route.methods)[0] }));
    expect(rotas).toContainEqual({ path: PATH, method: 'post' });
  });
});
