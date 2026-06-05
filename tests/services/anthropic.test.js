const { extrairJSON, extrairDocumento, carregarPrompt } = require('../../src/services/anthropic');

describe('extrairJSON — parse robusto da resposta', () => {
  test('JSON puro', () => {
    expect(extrairJSON('{"dados":{"nome":"X"}}')).toEqual({ dados: { nome: 'X' } });
  });

  test('JSON cercado por markdown ```json', () => {
    const texto = 'Claro! Aqui esta:\n```json\n{"dados":{"cpf":"123"}}\n```';
    expect(extrairJSON(texto)).toEqual({ dados: { cpf: '123' } });
  });

  test('JSON com prosa antes e depois', () => {
    const texto = 'Segue o resultado: {"dados":{"sexo":"M"}} — espero ter ajudado.';
    expect(extrairJSON(texto)).toEqual({ dados: { sexo: 'M' } });
  });

  test('texto sem JSON lanca erro', () => {
    expect(() => extrairJSON('nao consegui ler o documento')).toThrow(/JSON/i);
  });

  test('resposta vazia lanca erro', () => {
    expect(() => extrairJSON('')).toThrow(/vazia/i);
  });
});

describe('carregarPrompt', () => {
  test('le os prompts de cnh e crlv', () => {
    expect(carregarPrompt('cnh')).toMatch(/CNH/);
    expect(carregarPrompt('crlv')).toMatch(/CRLV/);
  });

  test('tipo invalido lanca erro', () => {
    expect(() => carregarPrompt('rg')).toThrow(/invalido/i);
  });
});

describe('extrairDocumento — chamada a Claude API (fetch mockado)', () => {
  const ENV_ORIGINAL = process.env.ANTHROPIC_API_KEY;
  let fetchOriginal;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    fetchOriginal = global.fetch;
  });
  afterEach(() => {
    global.fetch = fetchOriginal;
    if (ENV_ORIGINAL === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ENV_ORIGINAL;
  });

  test('monta a requisicao, parseia e devolve dados/confianca/modelo/tokens', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: '```json\n{"dados":{"nome":"FULANO","cpf":"12345678900"},"confianca":{"nome":0.9},"observacoes":"ok"}\n```' }],
        usage: { input_tokens: 1000, output_tokens: 200 },
      }),
    });

    const out = await extrairDocumento({
      tipoDocumento: 'cnh',
      base64Image: Buffer.from('img').toString('base64'),
      mimeType: 'image/jpeg',
    });

    expect(out.dados).toEqual({ nome: 'FULANO', cpf: '12345678900' });
    expect(out.confianca).toEqual({ nome: 0.9 });
    expect(out.observacoes).toBe('ok');
    expect(out.modelo).toBe('claude-sonnet-4-5');
    expect(out.tokensUsados).toBe(1200);

    // Confere a requisicao enviada.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['x-api-key']).toBe('sk-test');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('claude-sonnet-4-5');
    // Imagem JPEG vira bloco do tipo "image".
    expect(body.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from('img').toString('base64') },
    });
  });

  test('PDF usa bloco do tipo "document"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: '{"dados":{"placa":"ABC1D23"},"confianca":{},"observacoes":""}' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    await extrairDocumento({
      tipoDocumento: 'crlv',
      base64Image: 'cGRm',
      mimeType: 'application/pdf',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0].content[0]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'cGRm' },
    });
  });

  test('sem ANTHROPIC_API_KEY lanca erro', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    global.fetch = jest.fn();
    await expect(
      extrairDocumento({ tipoDocumento: 'cnh', base64Image: 'x', mimeType: 'image/jpeg' }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('IA detecta tipo incorreto -> lanca erro com code=TIPO_INCORRETO (sem retry)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: '{"erro":"tipo_incorreto","tipo_esperado":"cnh","tipo_detectado":"crlv","descricao_documento":"CRLV do veiculo"}' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    let erro;
    try {
      await extrairDocumento({ tipoDocumento: 'cnh', base64Image: 'x', mimeType: 'image/jpeg' });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeDefined();
    expect(erro.code).toBe('TIPO_INCORRETO');
    expect(erro.tipoEsperado).toBe('cnh');
    expect(erro.tipoDetectado).toBe('crlv');
    expect(erro.message).toMatch(/crlv/i);
    // Resposta veio ok da API → fetch chamado uma vez, sem retry.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('erro permanente (HTTP 400) nao e retentado e propaga', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid request',
    });
    await expect(
      extrairDocumento({ tipoDocumento: 'cnh', base64Image: 'x', mimeType: 'image/jpeg' }),
    ).rejects.toThrow(/HTTP 400/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
