const { buscarFipeLocal, FIPE_MAP } = require('../../src/services/fipe');

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
