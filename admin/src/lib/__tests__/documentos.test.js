import { describe, test, expect, beforeEach, vi } from 'vitest';

// Estado configurável do mock do Supabase.
const h = vi.hoisted(() => ({
  docsResult: { data: [], error: null },
  signedResult: { data: { signedUrl: 'https://signed.example/doc' }, error: null },
}));

vi.mock('../../lib/supabase.js', () => {
  const builder = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => Promise.resolve(h.docsResult));
  const createSignedUrl = vi.fn(() => Promise.resolve(h.signedResult));
  return {
    supabase: {
      from: vi.fn(() => builder),
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
      functions: { invoke: vi.fn() },
    },
  };
});

import { listarDocumentos, getSignedUrl, confiancaMedia, confiancaCampo } from '../documentos.js';

describe('listarDocumentos', () => {
  beforeEach(() => {
    h.docsResult = { data: [], error: null };
  });

  test('retorna os documentos da OS', async () => {
    h.docsResult = {
      data: [
        { id: 'd1', tipo: 'cnh_segurado', confianca_extracao: 0.64 },
        { id: 'd2', tipo: 'crlv', confianca_extracao: 0.91 },
      ],
      error: null,
    };
    const docs = await listarDocumentos('os-1');
    expect(docs).toHaveLength(2);
    expect(docs[0].tipo).toBe('cnh_segurado');
  });

  test('lança quando o Supabase retorna erro', async () => {
    h.docsResult = { data: null, error: { message: 'permission denied' } };
    await expect(listarDocumentos('os-1')).rejects.toThrow(/permission denied/i);
  });
});

describe('getSignedUrl', () => {
  test('gera uma signed URL temporária', async () => {
    h.signedResult = { data: { signedUrl: 'https://signed.example/doc' }, error: null };
    const url = await getSignedUrl('os-1/crlv-123.pdf');
    expect(url).toBe('https://signed.example/doc');
  });

  test('retorna null quando o path é vazio', async () => {
    expect(await getSignedUrl('')).toBeNull();
  });
});

describe('confiancaMedia', () => {
  test('média das confianças individuais (ignora nulos)', () => {
    const docs = [
      { confianca_extracao: 0.64 },
      { confianca_extracao: 0.91 },
      { confianca_extracao: null },
    ];
    expect(confiancaMedia(docs)).toBeCloseTo(0.775, 5);
  });

  test('null quando não há confiança numérica', () => {
    expect(confiancaMedia([])).toBeNull();
    expect(confiancaMedia([{ confianca_extracao: null }])).toBeNull();
  });
});

describe('confiancaCampo', () => {
  const docs = [
    { tipo: 'cnh_segurado', confianca_por_campo: { nome: 0.96, cpf: 0.58 } },
    { tipo: 'crlv', confianca_por_campo: { placa: 0.99 } },
  ];

  test('retorna a confiança do campo no documento certo', () => {
    expect(confiancaCampo(docs, 'cnh_segurado', 'cpf')).toBe(0.58);
    expect(confiancaCampo(docs, 'crlv', 'placa')).toBe(0.99);
  });

  test('null quando o campo, o documento ou o mapa não existem', () => {
    expect(confiancaCampo(docs, 'cnh_segurado', 'inexistente')).toBeNull();
    expect(confiancaCampo(docs, 'cnh_condutor', 'nome')).toBeNull();
    expect(confiancaCampo([{ tipo: 'cnh_segurado' }], 'cnh_segurado', 'nome')).toBeNull();
  });
});
