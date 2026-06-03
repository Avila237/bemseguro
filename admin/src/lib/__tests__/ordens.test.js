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

import { cancelarOS, STATUS_META, STATUS_LISTA } from '../ordens.js';

describe('STATUS_META — novos status (integração CRM + IA)', () => {
  test('extraindo_documentos: rótulo "Extraindo documentos" e classe azul (st-cotando reaproveitado p/ cor)', () => {
    expect(STATUS_META.extraindo_documentos.label).toBe('Extraindo documentos');
    expect(STATUS_META.extraindo_documentos.classe).toBe('st-extraindo_documentos');
  });

  test('revisao_manual: rótulo "Revisão manual" e classe âmbar', () => {
    expect(STATUS_META.revisao_manual.label).toBe('Revisão manual');
    expect(STATUS_META.revisao_manual.classe).toBe('st-revisao_manual');
  });

  test('callback_pendente: rótulo "Aguardando CRM" e classe azul claro', () => {
    expect(STATUS_META.callback_pendente.label).toBe('Aguardando CRM');
    expect(STATUS_META.callback_pendente.classe).toBe('st-callback_pendente');
  });

  test('mantém os status originais (label + classe)', () => {
    expect(STATUS_META.cotado.label).toBe('Cotado');
    expect(STATUS_META.cancelada.classe).toBe('st-cancelada');
  });

  test('STATUS_LISTA inclui os 3 novos status no ciclo de vida', () => {
    expect(STATUS_LISTA).toEqual(expect.arrayContaining(['extraindo_documentos', 'revisao_manual', 'callback_pendente']));
  });
});

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
