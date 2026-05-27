const {
  parseDataNasc,
  parseEstadoCivil,
  parseSexo,
  extrairAnoVeiculo,
  extrairNomeCondutor,
  extrairDataNascCondutor,
} = require('../../src/utils/parsers');

describe('parseDataNasc', () => {
  test('retorna null para valor vazio', () => {
    expect(parseDataNasc(null)).toBeNull();
    expect(parseDataNasc(undefined)).toBeNull();
    expect(parseDataNasc('')).toBeNull();
  });

  test('converte formato DD/MM/YYYY', () => {
    const result = parseDataNasc('15/03/1990');
    expect(result).toBe('1990-03-15T00:00:00.000Z');
  });

  test('converte formato ISO', () => {
    const result = parseDataNasc('1990-03-15');
    expect(result).toContain('1990-03-15');
  });

  test('retorna null para formato invalido', () => {
    expect(parseDataNasc('abc')).toBeNull();
  });
});

describe('parseEstadoCivil', () => {
  test('retorna 2 (casado) como default', () => {
    expect(parseEstadoCivil(null)).toBe(2);
    expect(parseEstadoCivil(undefined)).toBe(2);
  });

  test('converte string para codigo', () => {
    expect(parseEstadoCivil('solteiro')).toBe(1);
    expect(parseEstadoCivil('casado')).toBe(2);
    expect(parseEstadoCivil('divorciado')).toBe(3);
    expect(parseEstadoCivil('viuvo')).toBe(4);
  });

  test('aceita numero direto', () => {
    expect(parseEstadoCivil(3)).toBe(3);
  });

  test('ignora case e espacos', () => {
    expect(parseEstadoCivil(' Solteiro ')).toBe(1);
    expect(parseEstadoCivil('CASADO')).toBe(2);
  });

  test('retorna default para valor desconhecido', () => {
    expect(parseEstadoCivil('outro')).toBe(2);
  });
});

describe('parseSexo', () => {
  test('retorna M como default', () => {
    expect(parseSexo(null)).toBe('M');
    expect(parseSexo(undefined)).toBe('M');
  });

  test('reconhece F', () => {
    expect(parseSexo('F')).toBe('F');
    expect(parseSexo('f')).toBe('F');
    expect(parseSexo(' F ')).toBe('F');
  });

  test('retorna M para outros valores', () => {
    expect(parseSexo('M')).toBe('M');
    expect(parseSexo('X')).toBe('M');
  });
});

describe('extrairAnoVeiculo', () => {
  test('retorna null para vazio', () => {
    expect(extrairAnoVeiculo(null)).toBeNull();
    expect(extrairAnoVeiculo('')).toBeNull();
  });

  test('extrai ano do final da descricao', () => {
    expect(extrairAnoVeiculo('JEEP COMPASS 2023')).toBe(2023);
    expect(extrairAnoVeiculo('ONIX 1.0 2022')).toBe(2022);
  });

  test('retorna null se nao encontrar', () => {
    expect(extrairAnoVeiculo('JEEP COMPASS')).toBeNull();
  });
});

describe('extrairNomeCondutor', () => {
  test('retorna string vazia para null', () => {
    expect(extrairNomeCondutor(null)).toBe('');
  });

  test('extrai nome antes da virgula', () => {
    expect(extrairNomeCondutor('Joao Silva, 15/03/1990')).toBe('Joao Silva');
  });

  test('retorna valor inteiro se nao tem virgula', () => {
    expect(extrairNomeCondutor('Joao Silva')).toBe('Joao Silva');
  });
});

describe('extrairDataNascCondutor', () => {
  test('retorna null para vazio', () => {
    expect(extrairDataNascCondutor(null)).toBeNull();
  });

  test('retorna null se nao tem virgula', () => {
    expect(extrairDataNascCondutor('Joao Silva')).toBeNull();
  });

  test('extrai data apos virgula', () => {
    const result = extrairDataNascCondutor('Joao Silva, 15/03/1990');
    expect(result).toBe('1990-03-15T00:00:00.000Z');
  });
});
