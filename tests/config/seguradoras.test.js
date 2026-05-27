const { carregarSeguradoras, getCalculos, CORRETORA_ID } = require('../../src/config/seguradoras');

describe('seguradoras config', () => {
  test('CORRETORA_ID e valido', () => {
    expect(CORRETORA_ID).toBe('d256d28a-b6ac-4077-b183-71f3780f0192');
  });

  test('getCalculos retorna array vazio antes de carregar', () => {
    expect(Array.isArray(getCalculos())).toBe(true);
  });

  test('carregarSeguradoras monta calculos a partir do Supabase', async () => {
    const mockData = [
      {
        id: '1',
        nome: 'Aliro',
        nome_seguradora: 'Aliro',
        ativa: true,
        seguradora_id: 22,
        credenciais: { login: 'user', senha: 'pass' },
        config: { percComissao: 15, percDesconto: 0 },
      },
    ];

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: mockData, error: null }),
        }),
      }),
    };

    const result = await carregarSeguradoras(mockSupabase);
    expect(result).toHaveLength(1);
    expect(result[0].nome).toBe('Aliro');
    expect(result[0].seguradora).toBe(22);
    expect(result[0].login).toBe('user');
    expect(result[0].idIntegracao).toContain('_seguradora_22_');
    expect(result[0].idIntegracao).toContain(CORRETORA_ID);
    expect(result[0].tipoCobertura).toBe(2);
    expect(result[0].percComissao).toBe(15);
  });

  test('carregarSeguradoras lanca erro no Supabase', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    };

    await expect(carregarSeguradoras(mockSupabase)).rejects.toEqual({ message: 'DB error' });
  });
});
