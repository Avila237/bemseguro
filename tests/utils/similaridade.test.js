const { compararNomes, normalizar, levenshtein } = require('../../src/utils/similaridade');

describe('compararNomes', () => {
  test('nomes idênticos → 1.0 e igual', () => {
    const r = compararNomes('Maria Souza', 'Maria Souza');
    expect(r.similaridade).toBe(1);
    expect(r.igual).toBe(true);
  });

  test('nomes muito diferentes → < 0.5 e não igual', () => {
    const r = compararNomes('Maria Souza', 'Carlos Pereira');
    expect(r.similaridade).toBeLessThan(0.5);
    expect(r.igual).toBe(false);
  });

  test('variações de acento → similaridade alta (igual)', () => {
    const r = compararNomes('José António', 'Jose Antonio');
    expect(r.similaridade).toBeGreaterThanOrEqual(0.9);
    expect(r.igual).toBe(true);
  });

  test('"João Silva" vs "Joao da Silva" → similaridade alta (≥0.8)', () => {
    const r = compararNomes('João Silva', 'Joao da Silva');
    expect(r.similaridade).toBeGreaterThanOrEqual(0.8);
    expect(r.igual).toBe(true);
  });

  test('caixa diferente não afeta', () => {
    expect(compararNomes('FULANO DE TAL', 'fulano de tal').igual).toBe(true);
  });

  test('um nome vazio → não igual', () => {
    expect(compararNomes('', 'Maria').igual).toBe(false);
    expect(compararNomes('Maria', '').similaridade).toBe(0);
  });
});

describe('normalizar', () => {
  test('remove acentos, caixa, pontuação e conectivos', () => {
    expect(normalizar('  João   da   Silva!! ')).toBe('joao silva');
  });
});

describe('levenshtein', () => {
  test('strings iguais → 0', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  test('distância simples', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});
