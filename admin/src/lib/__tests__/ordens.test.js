import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock do client Supabase: `from(table)` devolve um builder encadeável
// (update/eq/select/…) "thenable" que resolve com o resultado configurado em
// `h.result`. Os argumentos são ignorados; controlamos só a resposta.
const h = vi.hoisted(() => ({ result: { data: [{ id: 'os1' }], error: null } }));
vi.mock('../../lib/supabase.js', () => {
  const make = () => {
    const b = {};
    for (const m of ['select', 'update', 'eq', 'in', 'gte', 'lte', 'order', 'range', 'or']) {
      b[m] = () => b;
    }
    b.then = (resolve) => resolve(h.result);
    return b;
  };
  return { supabase: { from: () => make() } };
});

import { cancelarOS } from '../ordens.js';

describe('cancelarOS', () => {
  beforeEach(() => {
    h.result = { data: [{ id: 'os1' }], error: null };
  });

  test('resolve quando uma linha é atualizada', async () => {
    h.result = { data: [{ id: 'os1' }], error: null };
    await expect(cancelarOS('os1')).resolves.toBeUndefined();
  });

  test('lança quando 0 linhas são atualizadas (UPDATE bloqueado por RLS, sem erro)', async () => {
    // Sintoma do bug: o Supabase não retorna erro, mas nada foi alterado.
    h.result = { data: [], error: null };
    await expect(cancelarOS('os1')).rejects.toThrow(/Nenhuma alteração foi salva/i);
  });

  test('lança quando o Supabase retorna erro', async () => {
    h.result = { data: null, error: { message: 'permission denied' } };
    await expect(cancelarOS('os1')).rejects.toThrow(/permission denied/i);
  });
});
