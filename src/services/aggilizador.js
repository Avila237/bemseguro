const { CORRETORA_ID } = require('../config/seguradoras');
const { retryComBackoff } = require('../utils/retry');
// Importa do ./instrument (e nao direto de @sentry/node) para garantir que o
// Sentry.init() ja rodou — e o mesmo instance global inicializado no boot.
const Sentry = require('../instrument');

const AGGER_API = 'https://api-prod.aggilizador.com.br';
const MULTICALCULO_API = 'https://api.multicalculo.net';

// Limite de tamanho do campo `detalhes` (jsonb) para nao inflar a row.
const DETALHES_LIMITE = 3000;

// Serializa os dados brutos da seguradora num JSON SEMPRE valido, respeitando um
// teto de tamanho. NUNCA usar `JSON.stringify(c).substring(0, N)`: cortar uma
// string JSON num offset arbitrario produz JSON malformado (string/objeto sem
// fechamento) e a Edge Function save-cotacoes falha com
// "Unterminated string in JSON at position 3000" ao fazer JSON.parse. Quando o
// objeto excede o teto, embrulhamos o trecho cru numa STRING (devidamente
// escapada) dentro de um objeto valido, em vez de devolver JSON quebrado.
function detalhesSeguro(c, limite = DETALHES_LIMITE) {
  const json = JSON.stringify(c);
  if (json.length <= limite) return json;
  return JSON.stringify({ truncado: true, tamanhoOriginal: json.length, raw: json.slice(0, limite) });
}

function montarPayload({
  placa,
  cpf,
  nome,
  email,
  cep,
  dados_risco,
  fipeResult,
  calculos,
  // Novo formato (contrato CRM): blocos estruturados. Opcionais — quando
  // ausentes, cai no comportamento legado baseado em dados_risco.
  segurado,
  condutor,
  apoliceAnterior,
  anoFabricacao,
  anoModelo,
  fabricante, // codigo do fabricante vindo do bloco veiculo (formato v2)
}) {
  const parsers = require('../utils/parsers');
  const dr = dados_risco || {};
  const seg = segurado || null;

  // --- Dados do segurado (titular da apolice) ---
  let seguradoNome, seguradoCpf, seguradoDataNasc, seguradoSexo, seguradoEstadoCivil, seguradoCep, seguradoEmail;

  if (seg) {
    // Novo formato: bloco segurado explicito
    seguradoNome = seg.nome || nome || '';
    seguradoCpf = (seg.cpf || cpf || '').replace(/\D/g, '');
    seguradoDataNasc = parsers.parseDataNasc(seg.dataNascimento);
    seguradoSexo = parsers.parseSexo(seg.sexo);
    seguradoEstadoCivil = parsers.parseEstadoCivil(seg.estadoCivil);
    seguradoCep = (seg.cep || cep || '').replace(/\D/g, '');
    seguradoEmail = seg.email || email || '';
  } else {
    // Formato legado: dados soltos em dados_risco
    const condutorNomeNasc = dr.condutor_nome_nascimento || '';
    seguradoNome = parsers.extrairNomeCondutor(condutorNomeNasc) || nome || '';
    seguradoCpf = (cpf || '').replace(/\D/g, '');
    seguradoDataNasc = parsers.extrairDataNascCondutor(condutorNomeNasc) || parsers.parseDataNasc(dr.dataNasc);
    seguradoSexo = parsers.parseSexo(dr.sexo_condutor || dr.sexo);
    seguradoEstadoCivil = parsers.parseEstadoCivil(dr.estado_civil || dr.estadoCivil);
    seguradoCep = (dr.cep_pernoite || cep || '').replace(/\D/g, '');
    seguradoEmail = email || '';
  }

  // --- Condutor principal ---
  // Novo formato: bloco condutor proprio. Se ausente ou sem nome, usa o segurado.
  const temCondutor = condutor && condutor.nome && String(condutor.nome).trim() !== '';
  let condNome, condCpf, condDataNasc, condSexo, condEstadoCivil, condRelac;
  if (temCondutor) {
    condNome = condutor.nome;
    condCpf = (condutor.cpf || seguradoCpf || '').replace(/\D/g, '');
    condDataNasc = parsers.parseDataNasc(condutor.dataNascimento) || seguradoDataNasc;
    condSexo = parsers.parseSexo(condutor.sexo);
    condEstadoCivil = seguradoEstadoCivil;
    condRelac = parsers.parseRelacaoSegurado(condutor.relacaoSegurado);
  } else {
    condNome = seguradoNome;
    condCpf = seguradoCpf;
    condDataNasc = seguradoDataNasc;
    condSexo = seguradoSexo;
    condEstadoCivil = seguradoEstadoCivil;
    condRelac = 1;
  }

  // --- Apolice anterior / bonus ---
  const apolice = apoliceAnterior || {};
  const classeBonus = Number(apolice.classeBonus) || 0;
  const sinistro = apolice.sinistro === true;
  const seguradoraAnterior = apolice.seguradora || null;
  const numeroAnterior = apolice.numero || null;

  const cepPernoite = seguradoCep;
  const placaNorm = (placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 7);

  const { fipe, fabricante: fabricanteFipe, modelo, valReferenciado, anoVeiculo, chassi } = fipeResult || {};
  const anoFab = anoFabricacao || anoVeiculo || null;
  const anoMod = anoModelo || anoVeiculo || null;
  // Fabricante: prioriza o do resolverFipe; se ausente, usa o do bloco veiculo (v2).
  const fabricanteFinal = fabricanteFipe || fabricante || null;

  const vigenciaIni = new Date().toISOString();
  const vigenciaFim = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return {
    cotacao: {
      segurado: {
        nome: seguradoNome,
        tipoPessoa: 'F',
        cpfCnpj: seguradoCpf,
        estadoCivil: seguradoEstadoCivil,
        dataNasc: seguradoDataNasc,
        dataPrimHabil: null,
        sexo: seguradoSexo,
        fone1: '',
        cep: cepPernoite,
        residLogradouro: null,
        residNumero: null,
        residBairro: null,
        residCidade: null,
        residUF: null,
        email: seguradoEmail,
        uf: 'RS',
        cidade: '',
        bairro: '',
        logradouro: '',
        isPCD: false,
      },
      calculos,
      automoveis: [{
        descricao: modelo || '',
        fabricante: fabricanteFinal,
        anoFabricacao: anoFab,
        anoModelo: anoMod,
        combustivel: 1,
        // O Aggilizador espera `codigoFipe`. Mantemos `fipe` (igual ao server.js
        // original, que funciona) e enviamos `codigoFipe` com o mesmo valor.
        fipe: fipe || null,
        codigoFipe: fipe || null,
        chassi: chassi || dr.chassi || null,
        placa: placaNorm,
        pctAjuste: 100,
        classeBonus,
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
          relacComSegurado: condRelac,
          tpResidencia: 1,
          dataPrimHabil: null,
          principal: true,
          cpfCnpj: condCpf,
          nome: condNome,
          dataNasc: condDataNasc,
          sexo: condSexo,
          estadoCivil: condEstadoCivil,
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
      bonusAnterior: classeBonus,
      sinistrosAnterior: sinistro ? 1 : 0,
      numeroRenovacao: numeroAnterior,
      seguradoraAnteriorId: seguradoraAnterior,
      vigFimAnterior: null,
      CI: null,
      tpCobertura: 1,
      ramo: 31,
    },
    negocio: null,
  };
}

async function dispararCotacao(payload, aggerToken) {
  // Retry exponencial em falhas transitorias (502/503/504, timeout, rede). O 401
  // (sessao expirada) e os demais 4xx NAO sao retentados — isRetryable os trata
  // como permanentes — e propagam para o worker (que renova a sessao no 401).
  try {
    return await retryComBackoff(async () => {
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
      if (!res.ok) {
        throw Object.assign(new Error(`calcularV2 HTTP ${res.status}`), { status: res.status });
      }

      const data = await res.json();
      const versaoId = Array.isArray(data)
        ? (data[0] && data[0].idIntegracao)
        : data.idIntegracao;

      return { status: res.status, versaoId, data };
    });
  } catch (err) {
    // Retry esgotado (ou erro permanente). Captura no Sentry antes de re-lancar —
    // exceto o 401, que e fluxo esperado (renovacao de sessao tratada pelo worker)
    // e so geraria ruido.
    if (err.status !== 401) {
      // TODO temporario (debug): rastrear por que os eventos do worker nao chegam
      // ao Sentry. Remover apos a investigacao.
      console.log('[sentry-debug] entrou no catch, vai capturar');
      console.log('[sentry-debug] DSN env presente:', !!process.env.SENTRY_DSN);
      Sentry.captureException(err, {
        tags: { component: 'aggilizador', operation: 'calcularV2' },
      });
      console.log('[sentry-debug] captureException chamado');
      // O worker pode terminar logo apos o throw; forca o envio do evento antes.
      const flushResult = await Sentry.flush(2000); // aguarda ate 2s pro Sentry enviar o evento
      console.log('[sentry-debug] flush retornou:', flushResult);
    }
    throw err;
  }
}

async function pollVersoes(versaoId, mcToken, log) {
  const MAX_ROUNDS = 25;
  const INTERVAL_MS = 8000;
  let resultados = [];

  for (let i = 0; i < MAX_ROUNDS; i++) {
    await new Promise(r => setTimeout(r, INTERVAL_MS));

    // Retry exponencial dentro do round em falhas transitorias. Se esgotar as
    // tentativas (ou for erro permanente), seguimos para o proximo round em vez
    // de abortar todo o polling — o comportamento tolerante a falhas e mantido.
    let versaoData = null;
    try {
      versaoData = await retryComBackoff(async () => {
        const res = await fetch(`${MULTICALCULO_API}/calculo/cotacao/versoes/${versaoId}`, {
          headers: { 'Authorization': mcToken },
        });
        if (!res.ok) {
          throw Object.assign(new Error(`versoes HTTP ${res.status}`), { status: res.status });
        }
        return res.json();
      });
    } catch (e) {
      log.warn(`polling ${i + 1} | falha ao consultar versoes: ${e.message}`);
      versaoData = null;
    }
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
          detalhes: detalhesSeguro(c),
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
  detalhesSeguro,
};
