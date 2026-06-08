// Fixtures de extração por IA — o formato que o /extract devolve e que o worker
// quote-com-docs consome (porTipo[tipo] = { tipo, dados, confianca }).
//
// Cada factory retorna um objeto NOVO a cada chamada: os testes mutam livremente
// (ex.: baixar uma confiança, vencer uma validade) sem vazar estado entre casos.
//
// Mantidos coerentes com o que a IA realmente extrai de cada documento. São
// reutilizáveis pelos testes do worker e, futuramente, pelos testes dos prompts
// (cnh/crlv) — manter os dados em sincronia com os prompts em src/prompts/.

// CNH do segurado (titular). Confiança cobre os campos críticos cpf/nome/nascimento.
function dadosExtraidosCnhSegurado() {
  return {
    tipo: 'cnh_segurado',
    dados: {
      nome: 'JOAO SILVA',
      cpf: '123.456.789-00',
      data_nascimento: '1990-01-01',
      sexo: 'M',
      validade_cnh: '2030-01-01',
    },
    confianca: { nome: 0.95, cpf: 0.98, data_nascimento: 0.9 },
  };
}

// CRLV do veículo. Confiança cobre os campos críticos placa/chassi.
function dadosExtraidosCrlv() {
  return {
    tipo: 'crlv',
    dados: {
      placa: 'ABC1D23',
      chassi: '9BWZZZ377VT004251',
      marca: 'VW',
      modelo: 'GOL 1.0',
      ano_fabricacao: '2020',
      ano_modelo: '2021',
      cpf_proprietario: '123.456.789-00',
    },
    confianca: { placa: 0.97, chassi: 0.85 },
  };
}

// CNH do condutor (distinto do segurado). Simétrico ao segurado, com CPF/nome/
// nascimento próprios — usado quando o dono NÃO é o condutor principal.
function dadosExtraidosCondutor() {
  return {
    tipo: 'cnh_condutor',
    dados: {
      nome: 'MARIA SOUZA',
      cpf: '987.654.321-00',
      data_nascimento: '1992-05-15',
      sexo: 'F',
      validade_cnh: '2030-01-01',
    },
    confianca: { nome: 0.94, cpf: 0.96, data_nascimento: 0.91 },
  };
}

module.exports = {
  dadosExtraidosCnhSegurado,
  dadosExtraidosCrlv,
  dadosExtraidosCondutor,
};
