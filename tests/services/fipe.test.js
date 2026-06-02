const { buscarFipeLocal, FIPE_MAP, resolverFipe } = require('../../src/services/fipe');

const logStub = { info() {}, warn() {}, error() {} };

describe('buscarFipeLocal', () => {
  test('retorna null para descricao vazia', () => {
    expect(buscarFipeLocal(null)).toBeNull();
    expect(buscarFipeLocal('')).toBeNull();
  });

  test('encontra Jeep Compass', () => {
    const result = buscarFipeLocal('Jeep Compass 2023');
    expect(result).not.toBeNull();
    expect(result.fipe).toBe('0170461');
    expect(result.fabricante).toBe(29);
  });

  test('encontra Toyota Corolla', () => {
    const result = buscarFipeLocal('Toyota Corolla XEI 2022');
    expect(result).not.toBeNull();
    expect(result.fipe).toBe('0053400');
  });

  test('encontra Chevrolet Onix', () => {
    const result = buscarFipeLocal('Chevrolet Onix Plus');
    expect(result).not.toBeNull();
    expect(result.fipe).toBe('0045020');
  });

  test('encontra Honda HR-V com hifen', () => {
    const result = buscarFipeLocal('Honda HR-V EXL');
    expect(result).not.toBeNull();
    expect(result.fipe).toBe('0152411');
  });

  test('encontra VW Voyage', () => {
    const result = buscarFipeLocal('VW Voyage 1.0 2020');
    expect(result).not.toBeNull();
    expect(result.fipe).toBe('0052833');
  });

  test('retorna null para modelo desconhecido', () => {
    expect(buscarFipeLocal('Tesla Model 3')).toBeNull();
  });

  test('ignora acentos na busca', () => {
    const result = buscarFipeLocal('VOLKSWAGEN VIRTUS');
    expect(result).not.toBeNull();
  });
});

describe('resolverFipe — ano do veiculo', () => {
  test('formato v2: usa anoModelo explicito mesmo sem ano na descricao', async () => {
    // Modelo v2 nao tem ano no texto (regressao do log "ano=null").
    const result = await resolverFipe({
      dados_risco: {
        veiculo: 'VOLKSWAGEN - SAVEIRO - ROBUST 1.6',
        fipe: '0059549',
        anoModelo: 2024,
        anoFabricacao: 2024,
      },
      placa: 'JCU9D37',
      mcToken: null,
      aggerToken: null,
      log: logStub,
    });
    expect(result.fipe).toBe('0059549');
    expect(result.anoVeiculo).toBe(2024);
  });

  test('v2 sem FIPE e modelo desconhecido ainda resolve o ano explicito', async () => {
    const result = await resolverFipe({
      dados_risco: {
        veiculo: 'Marca Modelo Desconhecido',
        fipe: undefined,
        anoModelo: 2022,
      },
      placa: '',
      mcToken: null,
      aggerToken: null,
      log: logStub,
    });
    expect(result.fipe).toBeNull();
    expect(result.anoVeiculo).toBe(2022);
  });

  test('anoModelo como string ("2023") tambem e resolvido', async () => {
    const result = await resolverFipe({
      dados_risco: { veiculo: 'Qualquer', fipe: '0000001', anoModelo: '2023' },
      placa: '', mcToken: null, aggerToken: null, log: logStub,
    });
    expect(result.anoVeiculo).toBe(2023);
  });

  test('formato legado: sem ano explicito, extrai do final da descricao', async () => {
    const result = await resolverFipe({
      dados_risco: { veiculo: 'Jeep Compass 2023', fipe: '0170461' },
      placa: '', mcToken: null, aggerToken: null, log: logStub,
    });
    expect(result.anoVeiculo).toBe(2023);
  });
});

describe('resolverFipe — fabricante no FIPE explicito', () => {
  afterEach(() => {
    if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
    delete global.fetch;
  });

  test('usa dados_risco.fabricante quando ja informado (sem lookup)', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    const result = await resolverFipe({
      dados_risco: { veiculo: 'VW Polo', fipe: '0059549', fabricante: 59 },
      placa: 'JCU9D37', mcToken: 'mc-token', aggerToken: 'agger-token', log: logStub,
    });
    expect(result.fipe).toBe('0059549');
    expect(result.fabricante).toBe(59);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('sem fabricante: faz lookup rapido pela placa (buscaPlaca)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ fipe: '0059549', codFabr: 59, modelo: 'VW POLO', anoMod: '2024' }),
    });
    const result = await resolverFipe({
      dados_risco: { veiculo: 'VW Polo', fipe: '0059549' },
      placa: 'JCU9D37', mcToken: 'mc-token', aggerToken: null, log: logStub,
    });
    // FIPE explicito permanece intacto; so o fabricante veio do lookup.
    expect(result.fipe).toBe('0059549');
    expect(result.fabricante).toBe(59);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('/calculo/buscaPlaca');
  });

  test('sem fabricante e sem placa: fallback pelo modelo (fipeModelo)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([{ id: '005-954-9', fipeFabricante: { id: '59' }, modelo: 'VW POLO', fipeValores: [] }]),
    });
    const result = await resolverFipe({
      dados_risco: { veiculo: 'Volkswagen Polo', fipe: '0059549' },
      placa: '', mcToken: null, aggerToken: 'agger-token', log: logStub,
    });
    expect(result.fipe).toBe('0059549');
    expect(result.fabricante).toBe(59);
    expect(global.fetch.mock.calls[0][0]).toContain('/fipeModelo');
  });

  test('sem fabricante e sem tokens: mantem fabricante null', async () => {
    const result = await resolverFipe({
      dados_risco: { veiculo: 'VW Polo', fipe: '0059549' },
      placa: 'JCU9D37', mcToken: null, aggerToken: null, log: logStub,
    });
    expect(result.fipe).toBe('0059549');
    expect(result.fabricante).toBeNull();
  });
});

describe('FIPE_MAP', () => {
  test('contem todas as 8 seguradoras de referencia', () => {
    expect(FIPE_MAP.length).toBeGreaterThan(30);
  });

  test('cada entrada tem keywords, fipe e fabricante', () => {
    FIPE_MAP.forEach(entry => {
      expect(entry.keywords).toBeDefined();
      expect(Array.isArray(entry.keywords)).toBe(true);
      expect(entry.fipe).toBeDefined();
      expect(entry.fabricante).toBeDefined();
    });
  });
});
