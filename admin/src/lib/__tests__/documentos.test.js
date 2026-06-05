import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Estado configurável do mock do Supabase.
const h = vi.hoisted(() => ({
  docsResult: { data: [], error: null },
  // Resposta da Edge Function `get-doc-url` (service_role gera a signed URL).
  signedResult: { data: { signedUrl: 'https://signed.example/doc' }, error: null },
  invoke: null,
  // Sessão Supabase Auth (JWT do painel) usada pelo anexarDocumento.
  session: { access_token: 'jwt-abc' },
}));

vi.mock('../../lib/supabase.js', () => {
  const builder = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => Promise.resolve(h.docsResult));
  // getSignedUrl agora chama a Edge Function `get-doc-url` (o bucket é privado;
  // a anon key não gera signed URL direto). Outras invocações resolvem vazio.
  h.invoke = vi.fn((name) => (name === 'get-doc-url'
    ? Promise.resolve(h.signedResult)
    : Promise.resolve({ data: null, error: null })));
  return {
    supabase: {
      from: vi.fn(() => builder),
      functions: { invoke: h.invoke },
      auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: h.session } })) },
    },
  };
});

import { listarDocumentos, getSignedUrl, anexarDocumento, confiancaMedia, confiancaCampo } from '../documentos.js';

describe('listarDocumentos', () => {
  beforeEach(() => {
    h.docsResult = { data: [], error: null };
  });

  test('retorna os documentos da OS', async () => {
    h.docsResult = {
      data: [
        { id: 'd1', tipo: 'cnh_segurado', confianca_extracao: 0.64 },
        { id: 'd2', tipo: 'crlv', confianca_extracao: 0.91 },
      ],
      error: null,
    };
    const docs = await listarDocumentos('os-1');
    expect(docs).toHaveLength(2);
    expect(docs[0].tipo).toBe('cnh_segurado');
  });

  test('lança quando o Supabase retorna erro', async () => {
    h.docsResult = { data: null, error: { message: 'permission denied' } };
    await expect(listarDocumentos('os-1')).rejects.toThrow(/permission denied/i);
  });
});

describe('getSignedUrl', () => {
  beforeEach(() => {
    h.signedResult = { data: { signedUrl: 'https://signed.example/doc' }, error: null };
    if (h.invoke) h.invoke.mockClear();
  });

  test('gera a signed URL via Edge Function get-doc-url (service_role)', async () => {
    const url = await getSignedUrl('os-1/crlv-123.pdf');
    expect(url).toBe('https://signed.example/doc');
    // Vai pela Edge Function (não pelo Storage direto, que o anon não acessa).
    expect(h.invoke).toHaveBeenCalledWith('get-doc-url', {
      body: { storage_path: 'os-1/crlv-123.pdf' },
    });
  });

  test('não envia bucket controlado pelo cliente (o servidor o fixa)', async () => {
    await getSignedUrl('os-1/crlv-123.pdf', 'outro-bucket');
    const [, opts] = h.invoke.mock.calls[0];
    expect(opts.body).toEqual({ storage_path: 'os-1/crlv-123.pdf' });
    expect(opts.body).not.toHaveProperty('bucket');
  });

  test('retorna null quando o path é vazio (sem chamar a Edge Function)', async () => {
    expect(await getSignedUrl('')).toBeNull();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  test('lança quando a Edge Function retorna erro', async () => {
    h.signedResult = { data: null, error: { message: 'Documento não encontrado' } };
    await expect(getSignedUrl('os-1/crlv-123.pdf')).rejects.toThrow(/não encontrado/i);
  });
});

describe('anexarDocumento', () => {
  beforeEach(() => {
    h.session = { access_token: 'jwt-abc' };
    // import.meta.env do Vite (mesmas vars usadas pelo client supabase.js).
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-123');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('envia multipart/form-data (FormData) para a extract-doc com Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, tipo: 'cnh_condutor', dados: { nome: 'Marina' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['conteudo'], 'cnh.jpg', { type: 'image/jpeg' });
    const out = await anexarDocumento('os-9', 'cnh_condutor', file);

    expect(out).toMatchObject({ success: true, dados: { nome: 'Marina' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchMock.mock.calls[0];
    // Chama a Edge Function pelo endpoint /functions/v1/ do Supabase.
    expect(url).toBe('https://proj.supabase.co/functions/v1/extract-doc');
    expect(opts.method).toBe('POST');
    // JWT da sessão + apikey anon; SEM Content-Type manual (boundary automático).
    expect(opts.headers.Authorization).toBe('Bearer jwt-abc');
    expect(opts.headers.apikey).toBe('anon-key-123');
    expect(opts.headers['Content-Type']).toBeUndefined();
    // Corpo é FormData com os campos esperados pela extract-doc.
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get('os_id')).toBe('os-9');
    expect(opts.body.get('tipo')).toBe('cnh_condutor');
    const enviado = opts.body.get('arquivo');
    expect(enviado).toBeInstanceOf(File);
    expect(enviado.name).toBe('cnh.jpg');
  });

  test('lança "Não autenticado" sem sessão (não chama fetch)', async () => {
    h.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'cnh.jpg', { type: 'image/jpeg' });
    await expect(anexarDocumento('os-9', 'cnh_condutor', file)).rejects.toThrow(/não autenticado/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('propaga o erro da Edge Function quando a resposta não é ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Esperado multipart/form-data' }),
    }));
    const file = new File(['x'], 'cnh.jpg', { type: 'image/jpeg' });
    await expect(anexarDocumento('os-9', 'cnh_condutor', file)).rejects.toThrow(/multipart/i);
  });

  test('422 (tipo incorreto) propaga erro estruturado com tipoIncorreto=true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'Documento de tipo incorreto',
        tipo_esperado: 'cnh',
        tipo_detectado: 'crlv',
        mensagem: 'Documento incorreto. Esperado: cnh, Detectado: crlv.',
      }),
    }));
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });

    let erro;
    try {
      await anexarDocumento('os-9', 'cnh_condutor', file);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeDefined();
    expect(erro.tipoIncorreto).toBe(true);
    expect(erro.tipoDetectado).toBe('crlv');
    expect(erro.tipoEsperado).toBe('cnh');
    expect(erro.message).toMatch(/incorreto/i);
  });
});

describe('confiancaMedia', () => {
  test('média das confianças individuais (ignora nulos)', () => {
    const docs = [
      { confianca_extracao: 0.64 },
      { confianca_extracao: 0.91 },
      { confianca_extracao: null },
    ];
    expect(confiancaMedia(docs)).toBeCloseTo(0.775, 5);
  });

  test('null quando não há confiança numérica', () => {
    expect(confiancaMedia([])).toBeNull();
    expect(confiancaMedia([{ confianca_extracao: null }])).toBeNull();
  });
});

describe('confiancaCampo', () => {
  const docs = [
    { tipo: 'cnh_segurado', confianca_por_campo: { nome: 0.96, cpf: 0.58 } },
    { tipo: 'crlv', confianca_por_campo: { placa: 0.99 } },
  ];

  test('retorna a confiança do campo no documento certo', () => {
    expect(confiancaCampo(docs, 'cnh_segurado', 'cpf')).toBe(0.58);
    expect(confiancaCampo(docs, 'crlv', 'placa')).toBe(0.99);
  });

  test('null quando o campo, o documento ou o mapa não existem', () => {
    expect(confiancaCampo(docs, 'cnh_segurado', 'inexistente')).toBeNull();
    expect(confiancaCampo(docs, 'cnh_condutor', 'nome')).toBeNull();
    expect(confiancaCampo([{ tipo: 'cnh_segurado' }], 'cnh_segurado', 'nome')).toBeNull();
  });
});
