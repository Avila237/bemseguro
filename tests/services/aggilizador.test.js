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

  test('classeBonus default 0 e sinistro 0 no formato legado', () => {
    const payload = montarPayload(baseParams);
    expect(payload.cotacao.automoveis[0].classeBonus).toBe(0);
    expect(payload.cotacao.bonusAnterior).toBe(0);
    expect(payload.cotacao.sinistrosAnterior).toBe(0);
    expect(payload.cotacao.seguradoraAnteriorId).toBeNull();
    expect(payload.cotacao.numeroRenovacao).toBeNull();
  });
});

describe('montarPayload — novo formato (contrato CRM)', () => {
  const fipeResult = {
    fipe: '',
    fabricante: 59,
    modelo: 'VOLKSWAGEN - SAVEIRO - ROBUST 1.6',
    valReferenciado: 0,
    anoVeiculo: null,
    chassi: null,
  };

  const novoParams = {
    placa: 'JCU9D37',
    cpf: '12345678900',
    nome: 'Nome Completo',
    email: 'email@teste.com',
    cep: '98700000',
    dados_risco: {
      veiculo: 'VOLKSWAGEN - SAVEIRO - ROBUST 1.6',
      fipe: undefined,
      chassi: '9BWKL45U1SP009017',
    },
    fipeResult,
    calculos: [{ nome: 'Aliro', seguradora: 22 }],
    segurado: {
      nome: 'Nome Completo',
      cpf: '12345678900',
      dataNascimento: '10/12/1992',
      sexo: 'M',
      estadoCivil: 'casado',
      cep: '98700000',
      email: 'email@teste.com',
      telefone: '(55) 99999-0000',
    },
    veiculo: {
      placa: 'JCU9D37',
      modelo: 'VOLKSWAGEN - SAVEIRO - ROBUST 1.6',
      anoModelo: '2024',
      anoFabricacao: '2024',
      chassi: '9BWKL45U1SP009017',
      fipe: '',
    },
    condutor: {
      nome: 'Ricardo de Souza Cabral',
      cpf: '12345678900',
      dataNascimento: '10/12/1992',
      sexo: 'M',
      relacaoSegurado: 'segurado',
    },
    apoliceAnterior: {
      seguradora: '',
      numero: '',
      classeBonus: 0,
      sinistro: false,
    },
    anoFabricacao: 2024,
    anoModelo: 2024,
  };

  test('usa dados do bloco segurado', () => {
    const payload = montarPayload(novoParams);
    const s = payload.cotacao.segurado;
    expect(s.nome).toBe('Nome Completo');
    expect(s.cpfCnpj).toBe('12345678900');
    expect(s.sexo).toBe('M');
    expect(s.estadoCivil).toBe(2);
    expect(s.dataNasc).toBe('1992-12-10T00:00:00.000Z');
    expect(s.cep).toBe('98700000');
    expect(s.email).toBe('email@teste.com');
  });

  test('usa dados do bloco condutor separado do segurado', () => {
    const payload = montarPayload(novoParams);
    const c = payload.cotacao.automoveis[0].condutores[0];
    expect(c.nome).toBe('Ricardo de Souza Cabral');
    expect(c.dataNasc).toBe('1992-12-10T00:00:00.000Z');
    expect(c.sexo).toBe('M');
    expect(c.relacComSegurado).toBe(1);
    expect(c.principal).toBe(true);
  });

  test('usa anoModelo e anoFabricacao explicitos do veiculo', () => {
    const payload = montarPayload(novoParams);
    expect(payload.cotacao.automoveis[0].anoModelo).toBe(2024);
    expect(payload.cotacao.automoveis[0].anoFabricacao).toBe(2024);
  });

  test('usa fipeResult.anoVeiculo como fallback quando anoModelo/anoFabricacao ausentes', () => {
    const params = {
      ...novoParams,
      anoModelo: undefined,
      anoFabricacao: undefined,
      fipeResult: { ...fipeResult, anoVeiculo: 2021 },
    };
    const payload = montarPayload(params);
    expect(payload.cotacao.automoveis[0].anoModelo).toBe(2021);
    expect(payload.cotacao.automoveis[0].anoFabricacao).toBe(2021);
  });

  test('usa chassi do bloco veiculo', () => {
    const payload = montarPayload(novoParams);
    expect(payload.cotacao.automoveis[0].chassi).toBe('9BWKL45U1SP009017');
  });

  test('placa do bloco veiculo e normalizada', () => {
    const payload = montarPayload(novoParams);
    expect(payload.cotacao.automoveis[0].placa).toBe('JCU9D37');
  });

  test('quando condutor ausente, usa dados do segurado', () => {
    const params = { ...novoParams, condutor: undefined };
    const payload = montarPayload(params);
    const c = payload.cotacao.automoveis[0].condutores[0];
    expect(c.nome).toBe('Nome Completo');
    expect(c.relacComSegurado).toBe(1);
  });

  test('quando condutor.nome vazio, usa dados do segurado', () => {
    const params = {
      ...novoParams,
      condutor: { nome: '', cpf: '', dataNascimento: '', sexo: '', relacaoSegurado: '' },
    };
    const payload = montarPayload(params);
    expect(payload.cotacao.automoveis[0].condutores[0].nome).toBe('Nome Completo');
  });

  test('mapeia classeBonus, sinistro e seguradora anterior', () => {
    const params = {
      ...novoParams,
      apoliceAnterior: { seguradora: '5', numero: 'AP-123', classeBonus: 7, sinistro: true },
    };
    const payload = montarPayload(params);
    expect(payload.cotacao.automoveis[0].classeBonus).toBe(7);
    expect(payload.cotacao.bonusAnterior).toBe(7);
    expect(payload.cotacao.sinistrosAnterior).toBe(1);
    expect(payload.cotacao.seguradoraAnteriorId).toBe('5');
    expect(payload.cotacao.numeroRenovacao).toBe('AP-123');
  });

  test('classeBonus default 0 e sinistro false', () => {
    const payload = montarPayload(novoParams);
    expect(payload.cotacao.automoveis[0].classeBonus).toBe(0);
    expect(payload.cotacao.sinistrosAnterior).toBe(0);
    expect(payload.cotacao.seguradoraAnteriorId).toBeNull();
  });

  test('pctAjuste continua 100', () => {
    const payload = montarPayload(novoParams);
    expect(payload.cotacao.automoveis[0].pctAjuste).toBe(100);
  });
});
