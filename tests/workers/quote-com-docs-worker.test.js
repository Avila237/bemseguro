const { processarComDocs } = require('../../src/workers/quote-com-docs-worker');

// "hoje" fixo para os testes de validade de CNH.
const HOJE = () => new Date('2026-06-03T12:00:00Z');

// Mock do client Supabase que apenas registra os patches de UPDATE.
function makeSupabase() {
  const updates = [];
  const getSupabaseFn = () => ({
    from: () => ({
      update: (patch) => ({
        eq: () => {
          updates.push(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  });
  return { getSupabaseFn, updates };
}

// extrair(baseUrl, token, osId, doc) resolvido a partir de um mapa por tipo.
// Valor pode ser um objeto de extração ou um Error (para simular falha).
function makeExtrair(mapaPorTipo) {
  return jest.fn(async (_baseUrl, _token, _osId, doc) => {
    const r = mapaPorTipo[doc.tipo];
    if (r instanceof Error) throw r;
    return r;
  });
}

function extracaoPadrao() {
  return {
    cnh_segurado: {
      tipo: 'cnh_segurado',
      dados: { nome: 'JOAO SILVA', cpf: '123.456.789-00', data_nascimento: '1990-01-01', sexo: 'M', validade_cnh: '2030-01-01' },
      confianca: { nome: 0.95, cpf: 0.98, data_nascimento: 0.9 },
    },
    crlv: {
      tipo: 'crlv',
      dados: { placa: 'ABC1D23', chassi: '9BWZZZ377VT004251', marca: 'VW', modelo: 'GOL 1.0', ano_fabricacao: '2020', ano_modelo: '2021', cpf_proprietario: '123.456.789-00' },
      confianca: { placa: 0.97, chassi: 0.85 },
    },
  };
}

function formPadrao() {
  return {
    nome: 'João Silva',
    telefone: '11999998888',
    cep_pernoite: '12345678',
    estado_civil: 'solteiro',
    uso: 'passeio',
    dono_eh_condutor: true,
    renovacao: false,
  };
}

function inputPadrao(over = {}) {
  return {
    os_id: 'os-1',
    form: { ...formPadrao(), ...(over.form || {}) },
    documentos: over.documentos || [
      { tipo: 'cnh_segurado', base64: 'AAA', mimeType: 'image/jpeg' },
      { tipo: 'crlv', base64: 'BBB', mimeType: 'image/jpeg' },
    ],
    session: { mcToken: 'm' },
    baseUrl: 'http://x',
    railwayToken: 'tok',
  };
}

const fipeOk = () => jest.fn().mockResolvedValue({ fipe: '0059549', anoModelo: 2021, anoFabricacao: 2020, chassi: '9BWZZZ' });

describe('processarComDocs — fluxo feliz', () => {
  test('extração OK → validações OK → cotação disparada (status cotando)', async () => {
    const { getSupabaseFn, updates } = makeSupabase();
    const dispararQuote = jest.fn().mockResolvedValue({});
    const r = await processarComDocs(inputPadrao(), {
      extrair: makeExtrair(extracaoPadrao()),
      buscarFipe: fipeOk(),
      dispararQuote,
      getSupabaseFn,
      agora: HOJE,
    });

    expect(r.status).toBe('cotando');
    expect(dispararQuote).toHaveBeenCalledTimes(1);
    const payload = dispararQuote.mock.calls[0][2];
    expect(payload.os_id).toBe('os-1');
    expect(payload.segurado.cpf).toBe('12345678900'); // normalizado
    expect(payload.veiculo.placa).toBe('ABC1D23');
    expect(payload.veiculo.fipe).toBe('0059549'); // enriquecido pelo lookup

    const ultima = updates[updates.length - 1];
    expect(ultima.status).toBe('cotando');
    expect(ultima.placa).toBe('ABC1D23');
    expect(ultima.cpf).toBe('12345678900');
    expect(ultima.error_message).toBeNull();
  });
});

describe('processarComDocs — falha na extração', () => {
  test('extração falha → OS marcada como erro (sem cotação)', async () => {
    const { getSupabaseFn, updates } = makeSupabase();
    const dispararQuote = jest.fn();
    const ext = extracaoPadrao();
    const r = await processarComDocs(inputPadrao(), {
      extrair: makeExtrair({ cnh_segurado: ext.cnh_segurado, crlv: Object.assign(new Error('IA timeout'), { tipo: 'crlv' }) }),
      buscarFipe: fipeOk(),
      dispararQuote,
      getSupabaseFn,
      agora: HOJE,
    });

    expect(r.status).toBe('erro');
    expect(r.error_message).toMatch(/Falha na extração do documento: crlv/);
    expect(r.error_message).toMatch(/IA timeout/);
    expect(dispararQuote).not.toHaveBeenCalled();
    expect(updates[updates.length - 1].status).toBe('erro');
  });
});

describe('processarComDocs — validações cruzadas → revisão manual', () => {
  test('confiança baixa em campo crítico → revisão manual', async () => {
    const ext = extracaoPadrao();
    ext.crlv.confianca.placa = 0.5;
    const { getSupabaseFn, updates } = makeSupabase();
    const dispararQuote = jest.fn();
    const r = await processarComDocs(inputPadrao(), {
      extrair: makeExtrair(ext), buscarFipe: fipeOk(), dispararQuote, getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('revisao_manual');
    expect(r.error_message).toMatch(/Baixa confiança na extração do campo placa/);
    expect(dispararQuote).not.toHaveBeenCalled();
    expect(updates[updates.length - 1].status).toBe('revisao_manual');
  });

  test('CNH do segurado vencida → revisão manual', async () => {
    const ext = extracaoPadrao();
    ext.cnh_segurado.dados.validade_cnh = '2020-01-01';
    const { getSupabaseFn } = makeSupabase();
    const r = await processarComDocs(inputPadrao(), {
      extrair: makeExtrair(ext), buscarFipe: fipeOk(), dispararQuote: jest.fn(), getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('revisao_manual');
    expect(r.error_message).toMatch(/CNH do segurado vencida em 01\/01\/2020/);
  });

  test('nome do formulário divergente da CNH → revisão manual', async () => {
    const { getSupabaseFn } = makeSupabase();
    const r = await processarComDocs(inputPadrao({ form: { nome: 'Carlos Pereira' } }), {
      extrair: makeExtrair(extracaoPadrao()), buscarFipe: fipeOk(), dispararQuote: jest.fn(), getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('revisao_manual');
    expect(r.error_message).toMatch(/Nome no formulário \('Carlos Pereira'\) diferente do nome na CNH \('JOAO SILVA'\)/);
  });

  test('lookup FIPE não encontra → revisão manual', async () => {
    const { getSupabaseFn } = makeSupabase();
    const r = await processarComDocs(inputPadrao(), {
      extrair: makeExtrair(extracaoPadrao()),
      buscarFipe: jest.fn().mockResolvedValue(null),
      dispararQuote: jest.fn(),
      getSupabaseFn,
      agora: HOJE,
    });
    expect(r.status).toBe('revisao_manual');
    expect(r.error_message).toMatch(/Não foi possível identificar o veículo via lookup FIPE pela placa ABC1D23/);
  });

  test('CPF do proprietário ≠ CPF do segurado com dono_eh_condutor=true → revisão manual', async () => {
    const ext = extracaoPadrao();
    ext.crlv.dados.cpf_proprietario = '999.999.999-99';
    const { getSupabaseFn } = makeSupabase();
    const r = await processarComDocs(inputPadrao(), {
      extrair: makeExtrair(ext), buscarFipe: fipeOk(), dispararQuote: jest.fn(), getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('revisao_manual');
    expect(r.error_message).toMatch(/CPF do proprietário no CRLV \(99999999999\) diferente do CPF do segurado na CNH \(12345678900\)/);
  });

  test('múltiplos problemas → todos listados no error_message (separados por \\n)', async () => {
    const ext = extracaoPadrao();
    ext.crlv.confianca.placa = 0.4;            // a) confiança baixa
    ext.cnh_segurado.dados.validade_cnh = '2019-05-10'; // c) CNH vencida
    const { getSupabaseFn } = makeSupabase();
    const r = await processarComDocs(inputPadrao({ form: { nome: 'Pessoa Totalmente Diferente' } }), {
      extrair: makeExtrair(ext), buscarFipe: fipeOk(), dispararQuote: jest.fn(), getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('revisao_manual');
    const linhas = r.error_message.split('\n');
    expect(linhas.length).toBeGreaterThanOrEqual(3);
    expect(r.error_message).toMatch(/Baixa confiança na extração do campo placa/);
    expect(r.error_message).toMatch(/CNH do segurado vencida em 10\/05\/2019/);
    expect(r.error_message).toMatch(/Nome no formulário/);
  });
});
