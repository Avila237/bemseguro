const request = require('supertest');
const express = require('express');

// Mock do wrapper da Claude API — os testes de rota nao chamam a API real.
jest.mock('../../src/services/anthropic', () => ({
  extrairDocumento: jest.fn(),
}));

// Estado configuravel do mock do Supabase (prefixo "mock" exigido pelo jest.mock
// hoisting). Cada teste ajusta os resultados e inspeciona o que foi chamado.
const mockSupabaseState = {
  osResult: { data: { id: 'os-1' }, error: null },     // os_cotacao.maybeSingle()
  uploadResult: { data: { path: 'p' }, error: null },  // storage.upload()
  insertResult: { data: { id: 'doc-1' }, error: null },// documentos_os insert.single()
  uploadCalls: [],
  insertedRow: null,
};

jest.mock('../../src/services/supabase', () => {
  const state = mockSupabaseState;
  const makeBuilder = () => {
    const b = {};
    b.select = jest.fn(() => b);
    b.eq = jest.fn(() => b);
    b.insert = jest.fn((row) => { state.insertedRow = row; return b; });
    b.maybeSingle = jest.fn(() => Promise.resolve(state.osResult));
    b.single = jest.fn(() => Promise.resolve(state.insertResult));
    return b;
  };
  return {
    getSupabase: jest.fn(() => ({
      from: jest.fn(() => makeBuilder()),
      storage: {
        from: jest.fn((bucket) => ({
          upload: jest.fn((path, buf, opts) => {
            state.uploadCalls.push({ bucket, path, opts, tamanho: buf && buf.length });
            return Promise.resolve(state.uploadResult);
          }),
        })),
      },
    })),
  };
});

const { extrairDocumento } = require('../../src/services/anthropic');
const extractRouter = require('../../src/routes/extract');

const TOKEN = 'test-secret-token';

function makeApp() {
  const app = express();
  app.use(extractRouter);
  return app;
}

const RESULTADO_CNH = {
  dados: { nome: 'FULANO DE TAL', cpf: '12345678900', data_nascimento: '1990-01-01', sexo: 'M', validade_cnh: '2030-01-01' },
  confianca: { nome: 0.97, cpf: 0.99 },
  observacoes: '',
  modelo: 'claude-sonnet-4-5',
  tokensUsados: 1234,
};

beforeAll(() => { process.env.RAILWAY_SECRET_TOKEN = TOKEN; });

beforeEach(() => {
  extrairDocumento.mockReset();
  extrairDocumento.mockResolvedValue(RESULTADO_CNH);
  mockSupabaseState.osResult = { data: { id: 'os-1' }, error: null };
  mockSupabaseState.uploadResult = { data: { path: 'p' }, error: null };
  mockSupabaseState.insertResult = { data: { id: 'doc-1' }, error: null };
  mockSupabaseState.uploadCalls = [];
  mockSupabaseState.insertedRow = null;
});

describe('POST /extract/cnh — auth e validacao', () => {
  test('sem token retorna 401 (e nao chama a Claude API)', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .field('os_id', 'os-1')
      .attach('arquivo', Buffer.from('fake'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('sem arquivo retorna 400', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1');
    expect(res.status).toBe(400);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('sem os_id retorna 400 (e nao sobe arquivo nem chama a IA)', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .attach('arquivo', Buffer.from('fake'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/os_id/);
    expect(mockSupabaseState.uploadCalls).toHaveLength(0);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('os_id inexistente retorna 404 (sem upload nem IA)', async () => {
    mockSupabaseState.osResult = { data: null, error: null };
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-inexistente')
      .attach('arquivo', Buffer.from('fake'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(404);
    expect(mockSupabaseState.uploadCalls).toHaveLength(0);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('MIME invalido (tipo nao suportado) retorna 400', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .attach('arquivo', Buffer.from('texto qualquer'), { filename: 'doc.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('arquivo grande demais (>10MB) retorna 413', async () => {
    const grande = Buffer.alloc(11 * 1024 * 1024, 0x61); // 11MB
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .attach('arquivo', grande, { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });

  test('tipo invalido para CNH retorna 400', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .field('tipo', 'cnh_motorista')
      .attach('arquivo', Buffer.from('fake'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tipo invalido/i);
    expect(extrairDocumento).not.toHaveBeenCalled();
  });
});

describe('POST /extract/cnh — fluxo completo', () => {
  test('faz upload, chama IA, insere em documentos_os e retorna 200 com documento_id', async () => {
    const conteudo = Buffer.from('imagem-fake-jpeg');
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .attach('arquivo', conteudo, { filename: 'cnh.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tipo).toBe('cnh_segurado'); // default
    expect(res.body.documento_id).toBe('doc-1');
    expect(res.body.storage_path).toMatch(/^os-1\/cnh_segurado-\d+\.jpg$/);
    expect(res.body.dados.cpf).toBe('12345678900');
    expect(res.body.modelo).toBe('claude-sonnet-4-5');

    // Upload aconteceu no bucket correto, com contentType e base64 corretos.
    expect(mockSupabaseState.uploadCalls).toHaveLength(1);
    expect(mockSupabaseState.uploadCalls[0].bucket).toBe('documentos-clientes');
    expect(mockSupabaseState.uploadCalls[0].opts).toEqual({ contentType: 'image/jpeg', upsert: false });

    // IA chamada com o tipo-base 'cnh' e o base64 do arquivo.
    expect(extrairDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoDocumento: 'cnh', mimeType: 'image/jpeg', base64Image: conteudo.toString('base64') }),
    );

    // Row inserida em documentos_os com a media de confianca ((0.97+0.99)/2 = 0.98).
    expect(mockSupabaseState.insertedRow).toMatchObject({
      os_id: 'os-1',
      tipo: 'cnh_segurado',
      storage_bucket: 'documentos-clientes',
      mime_type: 'image/jpeg',
      tamanho_bytes: conteudo.length,
      dados_extraidos: RESULTADO_CNH.dados,
      confianca_extracao: 0.98,
      revisado: false,
    });
  });

  test('aceita tipo=cnh_condutor e persiste esse tipo', async () => {
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .field('tipo', 'cnh_condutor')
      .attach('arquivo', Buffer.from('img'), { filename: 'cnh.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('cnh_condutor');
    expect(res.body.storage_path).toMatch(/^os-1\/cnh_condutor-\d+\.png$/);
    expect(mockSupabaseState.insertedRow.tipo).toBe('cnh_condutor');
  });

  test('confianca vazia resulta em confianca_extracao null', async () => {
    extrairDocumento.mockResolvedValue({ ...RESULTADO_CNH, confianca: {} });
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .attach('arquivo', Buffer.from('img'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(mockSupabaseState.insertedRow.confianca_extracao).toBeNull();
  });
});

describe('POST /extract/cnh — falhas de infraestrutura', () => {
  test('falha no upload do Storage retorna 500 e nao chama a IA', async () => {
    mockSupabaseState.uploadResult = { data: null, error: { message: 'storage indisponivel' } };
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .attach('arquivo', Buffer.from('img'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(500);
    expect(extrairDocumento).not.toHaveBeenCalled();
    expect(mockSupabaseState.insertedRow).toBeNull();
  });

  test('falha no insert retorna 500 e emite warning (arquivo ja no Storage)', async () => {
    mockSupabaseState.insertResult = { data: null, error: { message: 'duplicate key' } };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await request(makeApp())
        .post('/extract/cnh')
        .set('x-secret-token', TOKEN)
        .field('os_id', 'os-1')
        .attach('arquivo', Buffer.from('img'), { filename: 'cnh.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(500);
      // O upload e a IA aconteceram; so o insert falhou.
      expect(mockSupabaseState.uploadCalls).toHaveLength(1);
      expect(extrairDocumento).toHaveBeenCalled();
      // Warning registrado mencionando documentos_os e o Storage.
      expect(warnSpy).toHaveBeenCalled();
      const msg = warnSpy.mock.calls.map(c => c[0]).join(' ');
      expect(msg).toMatch(/documentos_os/);
      expect(msg).toMatch(/Storage/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('falha da Claude API retorna 502 (arquivo ja subiu, sem insert)', async () => {
    extrairDocumento.mockRejectedValue(new Error('Anthropic HTTP 500'));
    const res = await request(makeApp())
      .post('/extract/cnh')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .attach('arquivo', Buffer.from('img'), { filename: 'cnh.png', contentType: 'image/png' });
    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(mockSupabaseState.uploadCalls).toHaveLength(1);
    expect(mockSupabaseState.insertedRow).toBeNull();
  });
});

describe('POST /extract/crlv', () => {
  test('aceita PDF, tipo sempre crlv, e retorna os dados extraidos', async () => {
    extrairDocumento.mockResolvedValue({
      dados: { placa: 'ABC1D23', chassi: '9BWZZZ377VT004251' },
      confianca: { placa: 0.95, chassi: 0.85 },
      observacoes: '',
      modelo: 'claude-sonnet-4-5',
      tokensUsados: 800,
    });
    const res = await request(makeApp())
      .post('/extract/crlv')
      .set('x-secret-token', TOKEN)
      .field('os_id', 'os-1')
      .field('tipo', 'cnh_segurado') // ignorado: CRLV e sempre crlv
      .attach('arquivo', Buffer.from('%PDF-1.4 fake'), { filename: 'crlv.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('crlv');
    expect(res.body.storage_path).toMatch(/^os-1\/crlv-\d+\.pdf$/);
    expect(res.body.dados.placa).toBe('ABC1D23');
    expect(extrairDocumento).toHaveBeenCalledWith(
      expect.objectContaining({ tipoDocumento: 'crlv', mimeType: 'application/pdf' }),
    );
    expect(mockSupabaseState.insertedRow.tipo).toBe('crlv');
    expect(mockSupabaseState.insertedRow.confianca_extracao).toBe(0.9); // (0.95+0.85)/2
  });
});

describe('rotas registradas', () => {
  test('POST /extract/cnh e /extract/crlv existem no router', () => {
    const rotas = extractRouter.stack
      .filter(l => l.route)
      .map(l => ({ path: l.route.path, method: Object.keys(l.route.methods)[0] }));
    expect(rotas).toContainEqual({ path: '/extract/cnh', method: 'post' });
    expect(rotas).toContainEqual({ path: '/extract/crlv', method: 'post' });
  });
});
