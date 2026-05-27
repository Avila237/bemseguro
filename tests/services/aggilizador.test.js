const { montarPayload } = require('../../src/services/aggilizador');

describe('montarPayload', () => {
  const baseParams = {
    placa: 'ABC1D23',
    cpf: '123.456.789-00',
    nome: 'Joao Silva',
    email: 'joao@test.com',
    cep: '99010-000',
    dados_risco: {
      veiculo: 'Jeep Compass 2023',
      sexo: 'M',
      estado_civil: 'casado',
      dataNasc: '15/03/1990',
      cep_pernoite: '99010000',
    },
    fipeResult: {
      fipe: '0170461',
      fabricante: 29,
      modelo: 'COMPASS LONGITUDE 2.0',
      valReferenciado: 89147,
      anoVeiculo: 2023,
      chassi: null,
    },
    calculos: [{ nome: 'Aliro', seguradora: 22 }],
  };

  test('monta payload com campos obrigatorios', () => {
    const payload = montarPayload(baseParams);
    expect(payload.cotacao).toBeDefined();
    expect(payload.negocio).toBeNull();
    expect(payload.cotacao.segurado.nome).toBe('Joao Silva');
    expect(payload.cotacao.segurado.cpfCnpj).toBe('12345678900');
    expect(payload.cotacao.segurado.sexo).toBe('M');
    expect(payload.cotacao.segurado.estadoCivil).toBe(2);
  });

  test('placa e normalizada', () => {
    const payload = montarPayload(baseParams);
    expect(payload.cotacao.automoveis[0].placa).toBe('ABC1D23');
  });

  test('pctAjuste e 100', () => {
    const payload = montarPayload(baseParams);
    expect(payload.cotacao.automoveis[0].pctAjuste).toBe(100);
  });

  test('calculos sao passados diretamente', () => {
    const payload = montarPayload(baseParams);
    expect(payload.cotacao.calculos).toHaveLength(1);
    expect(payload.cotacao.calculos[0].nome).toBe('Aliro');
  });

  test('vigencia e 1 ano', () => {
    const payload = montarPayload(baseParams);
    const ini = new Date(payload.cotacao.vigenciaIni);
    const fim = new Date(payload.cotacao.vigenciaFim);
    const diffDays = (fim - ini) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(365, 0);
  });

  test('condutor usa CPF e dados do segurado', () => {
    const payload = montarPayload(baseParams);
    const condutor = payload.cotacao.automoveis[0].condutores[0];
    expect(condutor.cpfCnpj).toBe('12345678900');
    expect(condutor.principal).toBe(true);
    expect(condutor.tempoHabilitacao).toBe(5);
  });

  test('usa dados_risco.condutor_nome_nascimento quando presente', () => {
    const params = {
      ...baseParams,
      dados_risco: {
        ...baseParams.dados_risco,
        condutor_nome_nascimento: 'Maria Souza, 20/06/1985',
      },
    };
    const payload = montarPayload(params);
    expect(payload.cotacao.segurado.nome).toBe('Maria Souza');
    expect(payload.cotacao.segurado.dataNasc).toBe('1985-06-20T00:00:00.000Z');
  });

  test('trata dados_risco ausente', () => {
    const payload = montarPayload({
      ...baseParams,
      dados_risco: undefined,
      fipeResult: { fipe: null, fabricante: null, modelo: '', valReferenciado: 0, anoVeiculo: null },
    });
    expect(payload.cotacao.segurado.sexo).toBe('M');
    expect(payload.cotacao.segurado.estadoCivil).toBe(2);
  });
});
