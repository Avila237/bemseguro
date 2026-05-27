const { CORRETORA_ID } = require('../config/seguradoras');

const AGGER_API = 'https://api-prod.aggilizador.com.br';
const MULTICALCULO_API = 'https://api.multicalculo.net';

function montarPayload({ placa, cpf, nome, email, cep, dados_risco, fipeResult, calculos }) {
  const parsers = require('../utils/parsers');

  const condutorNomeNasc = (dados_risco || {}).condutor_nome_nascimento || '';
  const nomeCondutor = parsers.extrairNomeCondutor(condutorNomeNasc) || nome || '';
  const dataNascISO = parsers.extrairDataNascCondutor(condutorNomeNasc) || parsers.parseDataNasc((dados_risco || {}).dataNasc);
  const sexo = parsers.parseSexo((dados_risco || {}).sexo_condutor || (dados_risco || {}).sexo);
  const estadoCivil = parsers.parseEstadoCivil((dados_risco || {}).estado_civil || (dados_risco || {}).estadoCivil);
  const cepPernoite = ((dados_risco || {}).cep_pernoite || cep || '').replace(/\D/g, '');
  const placaNorm = (placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 7);

  const { fipe, fabricante, modelo, valReferenciado, anoVeiculo, chassi } = fipeResult || {};

  const vigenciaIni = new Date().toISOString();
  const vigenciaFim = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return {
    cotacao: {
      segurado: {
        nome: nomeCondutor,
        tipoPessoa: 'F',
        cpfCnpj: (cpf || '').replace(/\D/g, ''),
        estadoCivil,
        dataNasc: dataNascISO,
        dataPrimHabil: null,
        sexo,
        fone1: '',
        cep: cepPernoite,
        residLogradouro: null,
        residNumero: null,
        residBairro: null,
        residCidade: null,
        residUF: null,
        email: email || '',
        uf: 'RS',
        cidade: '',
        bairro: '',
        logradouro: '',
        isPCD: false,
      },
      calculos,
      automoveis: [{
        descricao: modelo || '',
        fabricante: fabricante || null,
        anoFabricacao: anoVeiculo || null,
        anoModelo: anoVeiculo || null,
        combustivel: 1,
        fipe: fipe || null,
        chassi: chassi || (dados_risco || {}).chassi || null,
        placa: placaNorm,
        pctAjuste: 100,
        financiado: null,
        tpUtilizacao: null,
        cepPernoite,
        kmAnual: 6000,
        zeroKm: false,
        jovemCondutor: false,
        tpUso: 1,
        tipo: 'v',
        residentes: [],
        condutores: [{
          relacComSegurado: 1,
          tpResidencia: 1,
          dataPrimHabil: null,
          principal: true,
          cpfCnpj: (cpf || '').replace(/\D/g, ''),
          nome: nomeCondutor,
          dataNasc: dataNascISO,
          sexo,
          estadoCivil,
          tempoHabilitacao: 5,
        }],
        blindado: false,
        alienado: false,
        kitGas: false,
        rastreador: '0',
        antiFurto: '0',
        valReferenciado: valReferenciado || 0,
        garagemResidencia: '2',
        garagemTrabalho: '0',
        garagemEstudo: '0',
        associado: false,
        periodoUso: '0',
        gasInstalValor: 0,
        tipoIsencao: 0,
      }],
      results: {
        main: { errors: [], successes: [] },
        alternatives: { errors: [], successes: [] },
        all: { errors: [], successes: [] },
        porAssinatura: { errors: [], successes: [] },
        ofertaCruzada: { errors: [], successes: [] },
      },
      loaded: false,
      isClearDraft: false,
      tipo: 5,
      integracaoInfo: 1,
      vigenciaIni,
      vigenciaFim,
      renovacao: false,
      renovacaoGarantida: false,
      bonusAnterior: 0,
      sinistrosAnterior: 0,
      numeroRenovacao: null,
      seguradoraAnteriorId: null,
      vigFimAnterior: null,
      CI: null,
      tpCobertura: 1,
      ramo: 31,
    },
    negocio: null,
  };
}

async function dispararCotacao(payload, aggerToken) {
  const res = await fetch(`${AGGER_API}/calculo/calcularV2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': aggerToken,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) {
    throw Object.assign(new Error('Token expirado'), { status: 401 });
  }

  const data = await res.json();
  const versaoId = Array.isArray(data)
    ? (data[0] && data[0].idIntegracao)
    : data.idIntegracao;

  return { status: res.status, versaoId, data };
}

async function pollVersoes(versaoId, mcToken, log) {
  const MAX_ROUNDS = 25;
  const INTERVAL_MS = 8000;
  let resultados = [];

  for (let i = 0; i < MAX_ROUNDS; i++) {
    await new Promise(r => setTimeout(r, INTERVAL_MS));

    const res = await fetch(`${MULTICALCULO_API}/calculo/cotacao/versoes/${versaoId}`, {
      headers: { 'Authorization': mcToken },
    });

    const versaoData = res.ok ? await res.json() : null;
    if (!versaoData) continue;

    const versaoObj = Array.isArray(versaoData) ? versaoData[0] : versaoData;
    const calcs = (versaoObj && versaoObj.calculos) ? versaoObj.calculos : [];
    const semRetorno = calcs.filter(c => c.retorno === false);
    const comRetorno = calcs.filter(c => c.retorno === true && c.premio > 0);
    const semPdf = comRetorno.filter(c => {
      const rp = (c.resultados || []).find(r => r.premio > 0) || {};
      return !rp.pathPdf;
    });

    log.info(`polling ${i + 1} | premio=${comRetorno.length} | aguardando=${semRetorno.length} | sem_pdf=${semPdf.length}`);

    if (comRetorno.length > 0) {
      resultados = comRetorno.map(c => {
        const rp = (c.resultados || []).find(r => r.premio > 0 && r.pathPdf)
          || (c.resultados || []).find(r => r.premio > 0)
          || (c.resultados || [])[0]
          || {};
        return {
          seguradora: c.nomeSeguradora || c.seguradoraTxt || c.nome,
          premio: c.premio || 0,
          franquia: rp.franquia || c.franquia || null,
          cobertura: c.tipoCobertura || null,
          url_pdf: rp.pathPdf || null,
          calculo_id: c.id || null,
          nro_calculo: rp.nroCalculo || null,
          detalhes: JSON.stringify(c).substring(0, 3000),
        };
      });
    }

    if (semRetorno.length === 0 && semPdf.length === 0 && calcs.length > 0) {
      log.info('Todas retornaram com PDF!');
      break;
    }
    if (semRetorno.length === 0 && i >= 10) {
      log.info('Finalizando apos 10+ rounds.');
      break;
    }
  }

  resultados.sort((a, b) => a.premio - b.premio);
  return resultados;
}

module.exports = {
  AGGER_API,
  MULTICALCULO_API,
  montarPayload,
  dispararCotacao,
  pollVersoes,
};
