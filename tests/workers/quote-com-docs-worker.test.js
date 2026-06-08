const { processarComDocs } = require('../../src/workers/quote-com-docs-worker');
const {
  dadosExtraidosCnhSegurado,
  dadosExtraidosCrlv,
  dadosExtraidosCondutor,
} = require('./__fixtures__/documentos-extraidos');

// "hoje" fixo para os testes de validade de CNH.
const HOJE = () => new Date('2026-06-03T12:00:00Z');
// "hoje" em ISO truncado (YYYY-MM-DD), igual ao que o worker calcula internamente
// (agora().toISOString().slice(0,10)) — usado no teste de borda de vencimento.
const HOJE_ISO = '2026-06-03';

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

// Mapa de extração padrão (segurado + CRLV), composto a partir dos fixtures
// reutilizáveis. Cada chamada devolve cópias novas — seguro para mutar nos testes.
function extracaoPadrao() {
  return {
    cnh_segurado: dadosExtraidosCnhSegurado(),
    crlv: dadosExtraidosCrlv(),
  };
}

// Mapa de extração com a CNH do condutor incluída (segurado + CRLV + condutor),
// para exercitar as validações que dependem de dCond — ex.: (d) condutor vencido.
function extracaoComCondutor() {
  const base = extracaoPadrao();
  base.cnh_condutor = dadosExtraidosCondutor();
  return base;
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

// Input padrão + a CNH do condutor anexada (3 documentos). Combine com
// extracaoComCondutor() no makeExtrair para que o worker popule dCond.
function inputComCondutor(over = {}) {
  return inputPadrao({
    ...over,
    documentos: over.documentos || [
      { tipo: 'cnh_segurado', base64: 'AAA', mimeType: 'image/jpeg' },
      { tipo: 'crlv', base64: 'BBB', mimeType: 'image/jpeg' },
      { tipo: 'cnh_condutor', base64: 'CCC', mimeType: 'image/jpeg' },
    ],
  });
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

// Validação (d) — CNH do condutor vencida (worker linhas 228–231). Os testes
// existentes nunca anexavam cnh_condutor (dCond sempre null), então este bloco
// é o que exercita pela 1ª vez o caminho com condutor presente.
describe('processarComDocs — validação (d) CNH do condutor', () => {
  test('condutor com CNH válida (validade futura) → cotando (não bloqueia)', async () => {
    const { getSupabaseFn, updates } = makeSupabase();
    const dispararQuote = jest.fn().mockResolvedValue({});
    const r = await processarComDocs(inputComCondutor(), {
      extrair: makeExtrair(extracaoComCondutor()), buscarFipe: fipeOk(), dispararQuote, getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('cotando');
    expect(dispararQuote).toHaveBeenCalledTimes(1);
    // condutor presente no payload v2 (com CPF normalizado)
    const payload = dispararQuote.mock.calls[0][2];
    expect(payload.condutor).not.toBeNull();
    expect(payload.condutor.cpf).toBe('98765432100');
    // error_message null no UPDATE final = nenhum problema (incl. condutor vencido)
    expect(updates[updates.length - 1].error_message).toBeNull();
  });

  test('condutor com CNH vencida → revisão manual', async () => {
    const ext = extracaoComCondutor();
    ext.cnh_condutor.dados.validade_cnh = '2020-01-01';
    const { getSupabaseFn } = makeSupabase();
    const dispararQuote = jest.fn();
    const r = await processarComDocs(inputComCondutor(), {
      extrair: makeExtrair(ext), buscarFipe: fipeOk(), dispararQuote, getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('revisao_manual');
    expect(r.error_message).toMatch(/CNH do condutor vencida em 01\/01\/2020/);
    expect(dispararQuote).not.toHaveBeenCalled();
  });

  test('condutor com validade EXATAMENTE hoje → não vencida (cotando) [borda: comparação é < estrito]', async () => {
    const ext = extracaoComCondutor();
    ext.cnh_condutor.dados.validade_cnh = HOJE_ISO; // igual a hoje → NÃO vence
    const { getSupabaseFn, updates } = makeSupabase();
    const dispararQuote = jest.fn().mockResolvedValue({});
    const r = await processarComDocs(inputComCondutor(), {
      extrair: makeExtrair(ext), buscarFipe: fipeOk(), dispararQuote, getSupabaseFn, agora: HOJE,
    });
    expect(r.status).toBe('cotando');
    expect(dispararQuote).toHaveBeenCalledTimes(1);
    expect(updates[updates.length - 1].error_message).toBeNull(); // sem "condutor vencida"
  });
});

// Validação (b) — guard `if (dCnh.nome)`: quando a IA não extrai o nome do
// segurado, a comparação de similaridade é PULADA (não vira problema).
describe('processarComDocs — validação (b) guard de nome ausente', () => {
  test('nome do segurado ausente na CNH → validação de similaridade pulada (cotando)', async () => {
    const ext = extracaoPadrao();
    delete ext.cnh_segurado.dados.nome; // dCnh.nome undefined → guard pula (b)
    const { getSupabaseFn, updates } = makeSupabase();
    const dispararQuote = jest.fn().mockResolvedValue({});
    const r = await processarComDocs(inputPadrao(), {
      extrair: makeExtrair(ext), buscarFipe: fipeOk(), dispararQuote, getSupabaseFn, agora: HOJE,
    });
    // todas as outras validações OK → segue para cotando, sem divergência de nome
    expect(r.status).toBe('cotando');
    expect(dispararQuote).toHaveBeenCalledTimes(1);
    expect(updates[updates.length - 1].error_message).toBeNull();
  });
});
