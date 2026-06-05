import { describe, test, expect } from 'vitest';
import { ESTADO_CIVIL_MAP, SEXO_MAP, estadoCivilLabel, sexoLabel } from '../enums.js';

describe('ESTADO_CIVIL_MAP', () => {
  test('mapeia os códigos (slugs) reais para rótulos por extenso', () => {
    expect(ESTADO_CIVIL_MAP.solteiro).toBe('Solteiro(a)');
    expect(ESTADO_CIVIL_MAP.casado).toBe('Casado(a)');
    expect(ESTADO_CIVIL_MAP.divorciado).toBe('Divorciado(a)');
    expect(ESTADO_CIVIL_MAP.viuvo).toBe('Viúvo(a)');
  });

  // Os códigos devem casar exatamente com os que o backend reconhece
  // (src/utils/parsers.js → parseEstadoCivil: solteiro/casado/divorciado/viuvo),
  // garantindo round-trip correto até o Aggilizador.
  test('cobre exatamente os códigos que o backend reconhece', () => {
    expect(Object.keys(ESTADO_CIVIL_MAP).sort()).toEqual(['casado', 'divorciado', 'solteiro', 'viuvo']);
  });
});

describe('SEXO_MAP', () => {
  test('M/F → Masculino/Feminino', () => {
    expect(SEXO_MAP.M).toBe('Masculino');
    expect(SEXO_MAP.F).toBe('Feminino');
  });
});

describe('estadoCivilLabel', () => {
  test('rótulo por extenso a partir do código', () => {
    expect(estadoCivilLabel('casado')).toBe('Casado(a)');
    expect(estadoCivilLabel('viuvo')).toBe('Viúvo(a)');
  });

  test('devolve o próprio valor quando o código é desconhecido', () => {
    // Valor fora do padrão (ex.: vindo do CRM) não é escondido nem alterado.
    expect(estadoCivilLabel('uniao_estavel')).toBe('uniao_estavel');
    expect(estadoCivilLabel('')).toBe('');
  });
});

describe('sexoLabel', () => {
  test('rótulo por extenso a partir do código', () => {
    expect(sexoLabel('M')).toBe('Masculino');
    expect(sexoLabel('F')).toBe('Feminino');
  });

  test('devolve o próprio valor quando o código é desconhecido', () => {
    expect(sexoLabel('X')).toBe('X');
  });
});
