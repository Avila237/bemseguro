import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock do client Supabase: cada `from(table)` devolve um builder encadeável
// (select/eq/gte/in/order…) que é "thenable" e resolve com os dados configurados
// para aquela tabela em `h.tables`. Os filtros são ignorados de propósito — a
// lógica de janela é exercida em JS dentro de getMetricas/getMetricasTodas.
const h = vi.hoisted(() => ({ tables: {} }));
vi.mock('../../lib/supabase.js', () => {
  const make = (table) => {
    const builder = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'gt', 'lt', 'in', 'order', 'limit']) {
      builder[m] = () => builder;
    }
    builder.then = (resolve) => resolve(h.tables[table] || { data: [], error: null });
    return builder;
  };
  return { supabase: { from: (table) => make(table) } };
});

import { getMetricas, getMetricasTodas } from '../seguradoras.js';

const now = Date.now();
const HORA = 3600 * 1000;
const DIA = 24 * HORA;
const iso = (ms) => new Date(ms).toISOString();

beforeEach(() => {
  h.tables = {
    os_cotacao: {
      data: [
        { id: 'os1', status: 'cotado', created_at: iso(now - 2 * DIA) },
        { id: 'os2', status: 'cotado', created_at: iso(now - 3 * DIA) },
        { id: 'os3', status: 'cotado', created_at: iso(now - 4 * DIA) },
        { id: 'os4', status: 'cotado', created_at: iso(now - 5 * DIA) },
        { id: 'osOld', status: 'cotado', created_at: iso(now - 10 * DIA) }, // fora de 7d
        { id: 'os5', status: 'erro', created_at: iso(now - 2 * HORA) }, // erro nas últimas 24h
      ],
      error: null,
    },
    cotacoes: {
      data: [
        { os_id: 'os1', seguradora: 'Allianz', premio: 2900, created_at: iso(now - 2 * DIA + 90 * 1000) },
        { os_id: 'os2', seguradora: 'Allianz', premio: 3100, created_at: iso(now - 3 * DIA + 120 * 1000) },
        { os_id: 'os3', seguradora: 'Allianz', premio: 3000, created_at: iso(now - 4 * DIA + 60 * 1000) },
        { os_id: 'os4', seguradora: 'Allianz', premio: 0, created_at: iso(now - 5 * DIA + 130 * 1000) }, // sem prêmio
        { os_id: 'osOld', seguradora: 'Allianz', premio: 2800, created_at: iso(now - 10 * DIA + 90 * 1000) },
      ],
      error: null,
    },
  };
});

describe('getMetricas', () => {
  test('calcula a taxa de retorno (aproximação) corretamente', async () => {
    const m = await getMetricas('Allianz', 7);
    // 3 de 4 OSs concluídas no período tiveram prêmio (os4 = premio 0; osOld fora da janela)
    expect(m.taxaRetorno).toBe(75);
    expect(m.amostra).toBe(4);
    expect(m.semDados).toBe(false);
  });

  test('calcula o tempo médio em segundos', async () => {
    const m = await getMetricas('Allianz', 7);
    // média de (90, 120, 60, 130) = 100s
    expect(m.tempoMedio).toBe(100);
  });

  test('último sucesso = max(created_at) das cotações com premio>0', async () => {
    const m = await getMetricas('Allianz', 7);
    expect(m.ultimoSucesso).toBe(iso(now - 2 * DIA + 90 * 1000)); // os1 é a mais recente
  });

  test('a janela de 7 dias exclui OSs/cotações mais antigas', async () => {
    const m7 = await getMetricas('Allianz', 7);
    const m30 = await getMetricas('Allianz', 30);
    expect(m7.amostra).toBe(4); // osOld (10d) fora da janela de 7 dias
    expect(m7.taxaRetorno).toBe(75);
    expect(m30.amostra).toBe(5); // osOld dentro de 30 dias
    expect(m30.taxaRetorno).toBe(80); // 4 de 5
  });

  test('erros 24h são globais (contagem de OSs em erro nas últimas 24h)', async () => {
    const m = await getMetricas('Allianz', 7);
    expect(m.erros24h).toBe(1);
  });
});

describe('getMetricasTodas', () => {
  test('retorna um dicionário por seguradora', async () => {
    const all = await getMetricasTodas(['Allianz', 'HDI Seguros'], 7);
    expect(all.Allianz.taxaRetorno).toBe(75);
    // HDI não tem cotações no período → "sem dados suficientes"
    expect(all['HDI Seguros'].semDados).toBe(true);
    // erros são globais → mesmo número para todas
    expect(all.Allianz.erros24h).toBe(all['HDI Seguros'].erros24h);
  });
});
