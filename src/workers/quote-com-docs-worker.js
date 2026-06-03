// Worker de cotacao COM documentos: orquestra a extracao por IA dos documentos,
// faz o merge form + IA, roda as validacoes cruzadas e decide entre disparar a
// cotacao real ou marcar a OS para revisao manual.
//
// A logica fica em `processarComDocs(input, deps)` — uma funcao exportada e
// testavel (deps injetaveis). O bootstrap de Worker Thread, no fim do arquivo,
// so roda quando o modulo e carregado DENTRO de uma thread (workerData presente).

// Sentry tem que ser o PRIMEIRO require do worker (registro de modulos proprio).
const Sentry = require('../instrument');
const { isMainThread, parentPort, workerData } = require('worker_threads');
const { createLogger } = require('../utils/logger');
const { buscarFipePorPlaca } = require('../services/fipe');
const { compararNomes } = require('../utils/similaridade');

// Campos criticos cuja confianca da IA precisa ser >= a este limiar.
const LIMIAR_CONFIANCA = 0.7;
const CAMPOS_CRITICOS = ['cpf', 'placa', 'data_nascimento', 'chassi', 'nome'];

function selfUrl() {
  return process.env.RAILWAY_URL || `http://127.0.0.1:${process.env.PORT || 8080}`;
}

function soDigitos(s) {
  return String(s == null ? '' : s).replace(/\D/g, '');
}

// ISO (YYYY-MM-DD...) -> DD/MM/AAAA para mensagens amigaveis.
function isoParaBR(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

// ── Dependencias com implementacao real (sobrescritas nos testes) ──

// Chama o endpoint interno /extract/{cnh|crlv} com o arquivo em multipart.
// Faz upload no Storage + IA + insert em documentos_os (do lado do /extract).
async function chamarExtract(baseUrl, token, osId, doc) {
  const base = doc.tipo === 'crlv' ? 'crlv' : 'cnh';
  const fd = new FormData();
  fd.append('os_id', osId);
  if (base === 'cnh') fd.append('tipo', doc.tipo); // cnh_segurado | cnh_condutor
  const blob = new Blob([Buffer.from(doc.base64, 'base64')], { type: doc.mimeType });
  fd.append('arquivo', blob, doc.filename || `${doc.tipo}`);

  let res;
  try {
    res = await fetch(`${baseUrl}/extract/${base}`, {
      method: 'POST',
      headers: { 'x-secret-token': token },
      body: fd,
    });
  } catch (e) {
    throw Object.assign(new Error(e.message), { tipo: doc.tipo });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw Object.assign(new Error(`HTTP ${res.status} ${t.slice(0, 150)}`), { tipo: doc.tipo });
  }
  const data = await res.json();
  return {
    tipo: doc.tipo,
    dados: data.dados || {},
    confianca: data.confianca || {},
    documento_id: data.documento_id || null,
    storage_path: data.storage_path || null,
  };
}

// Dispara a cotacao real reaproveitando o endpoint /quote/auto existente.
async function dispararQuoteAuto(baseUrl, token, payload) {
  const res = await fetch(`${baseUrl}/quote/auto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-secret-token': token },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`/quote/auto HTTP ${res.status}: ${t.slice(0, 150)}`);
  }
  return res.json().catch(() => ({}));
}

// ── Núcleo testável ──
async function processarComDocs(input, deps = {}) {
  const {
    os_id,
    form = {},
    documentos = [],
    session = {},
    baseUrl = selfUrl(),
    railwayToken = process.env.RAILWAY_SECRET_TOKEN,
  } = input;

  const {
    extrair = chamarExtract,
    buscarFipe = buscarFipePorPlaca,
    dispararQuote = dispararQuoteAuto,
    getSupabaseFn = () => require('../services/supabase').getSupabase(),
    agora = () => new Date(),
  } = deps;

  // os_id NAO entra no contexto do logger (as mensagens ja escrevem "OS=..." —
  // evita duplicar o prefixo) para casar com o formato [quote-com-docs] OS=...
  const log = createLogger({ scope: 'quote-com-docs' });
  const mcToken = session && session.mcToken;

  async function atualizarOS(patch) {
    const { error } = await getSupabaseFn().from('os_cotacao').update(patch).eq('id', os_id);
    if (error) throw new Error(`update OS: ${error.message}`);
  }

  // ── Etapa 1: extracao paralela de cada documento ──
  log.info(`OS=${os_id} iniciando extração de ${documentos.length} documentos`);
  const t0 = Date.now();
  let extracoes;
  try {
    extracoes = await Promise.all(documentos.map((d) => extrair(baseUrl, railwayToken, os_id, d)));
  } catch (err) {
    const msg = `Falha na extração do documento: ${err.tipo || 'desconhecido'}. Erro: ${err.message}`;
    log.error(`OS=${os_id} ${msg}`);
    try {
      await atualizarOS({ status: 'erro', error_message: msg });
    } catch (e) {
      log.error(`OS=${os_id} falha ao marcar erro: ${e.message}`);
    }
    return { os_id, status: 'erro', error_message: msg };
  }
  log.info(`OS=${os_id} extração concluída em ${Date.now() - t0}ms`);

  const porTipo = {};
  for (const e of extracoes) porTipo[e.tipo] = e;
  const cnhSeg = porTipo['cnh_segurado'] || { dados: {}, confianca: {} };
  const crlv = porTipo['crlv'] || { dados: {}, confianca: {} };
  const cnhCond = porTipo['cnh_condutor'] || null;

  const dCnh = cnhSeg.dados || {};
  const cCnh = cnhSeg.confianca || {};
  const dCrlv = crlv.dados || {};
  const cCrlv = crlv.confianca || {};
  const dCond = cnhCond ? (cnhCond.dados || {}) : null;

  // ── Etapa 2: merge form + IA ──
  const placa = dCrlv.placa ? String(dCrlv.placa).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
  const cpfSegurado = soDigitos(dCnh.cpf) || null;

  const dadosRisco = {
    ramo: 'auto',
    origem: 'CRM-docs',
    uso: form.uso,
    estado_civil: form.estado_civil,
    dono_eh_condutor: form.dono_eh_condutor,
    renovacao: form.renovacao,
    external_ref: form.external_ref || null,
    callback_url: form.callback_url || null,
    telefone: form.telefone || null,
    segurado: {
      nome: form.nome,
      cpf: cpfSegurado,
      dataNascimento: dCnh.data_nascimento || null,
      sexo: dCnh.sexo || null,
      estadoCivil: form.estado_civil,
      cep: soDigitos(form.cep_pernoite),
      email: '',
      telefone: form.telefone || null,
      validade_cnh: dCnh.validade_cnh || null,
    },
    veiculo: {
      placa,
      chassi: dCrlv.chassi || null,
      marca: dCrlv.marca || null,
      modelo: dCrlv.modelo || null,
      anoFabricacao: dCrlv.ano_fabricacao || null,
      anoModelo: dCrlv.ano_modelo || null,
      fipe: null, // preenchido pelo lookup abaixo, se encontrado
      cpf_proprietario: soDigitos(dCrlv.cpf_proprietario) || null,
    },
    condutor: dCond
      ? {
          nome: dCond.nome,
          cpf: soDigitos(dCond.cpf) || null,
          dataNascimento: dCond.data_nascimento || null,
          sexo: dCond.sexo || null,
          relacaoSegurado: 'outro',
        }
      : null,
    apoliceAnterior: null,
    documentos_extraidos: extracoes.map((e) => ({
      tipo: e.tipo,
      documento_id: e.documento_id,
      storage_path: e.storage_path,
    })),
  };

  // ── Etapa 3: validacoes cruzadas ──
  const problemas = [];

  // a) Confianca da IA nos campos criticos (cpf/nome/nascimento da CNH; placa/
  //    chassi do CRLV). Confianca ausente conta como baixa (forca revisao).
  const confPorCampo = {
    cpf: cCnh.cpf,
    nome: cCnh.nome,
    data_nascimento: cCnh.data_nascimento,
    placa: cCrlv.placa,
    chassi: cCrlv.chassi,
  };
  for (const campo of CAMPOS_CRITICOS) {
    const c = confPorCampo[campo];
    if (c == null || c < LIMIAR_CONFIANCA) {
      problemas.push(`Baixa confiança na extração do campo ${campo}`);
    }
  }

  // b) Nome do formulario vs nome da CNH (similaridade < 0.8).
  if (dCnh.nome) {
    const { igual } = compararNomes(form.nome, dCnh.nome);
    if (!igual) {
      problemas.push(`Nome no formulário ('${form.nome}') diferente do nome na CNH ('${dCnh.nome}')`);
    }
  }

  // c) CNH do segurado vencida.
  const hojeISO = agora().toISOString().slice(0, 10);
  if (dCnh.validade_cnh && String(dCnh.validade_cnh).slice(0, 10) < hojeISO) {
    problemas.push(`CNH do segurado vencida em ${isoParaBR(dCnh.validade_cnh)}`);
  }

  // d) CNH do condutor vencida (se houver condutor distinto).
  if (dCond && dCond.validade_cnh && String(dCond.validade_cnh).slice(0, 10) < hojeISO) {
    problemas.push(`CNH do condutor vencida em ${isoParaBR(dCond.validade_cnh)}`);
  }

  // e) CPF do proprietario (CRLV) != CPF do segurado (CNH) quando o formulario
  //    diz que o dono e o condutor.
  if (form.dono_eh_condutor === true) {
    const cpfCrlv = soDigitos(dCrlv.cpf_proprietario);
    const cpfCnh = soDigitos(dCnh.cpf);
    if (cpfCrlv && cpfCnh && cpfCrlv !== cpfCnh) {
      problemas.push(
        `CPF do proprietário no CRLV (${cpfCrlv}) diferente do CPF do segurado na CNH (${cpfCnh}), mas formulário indicou que dono é condutor`,
      );
    }
  }

  // f) Lookup FIPE pela placa. Encontrado -> enriquece o payload; senao -> problema.
  let fipeResult = null;
  if (placa) {
    try {
      fipeResult = await buscarFipe(placa, mcToken, log);
    } catch (e) {
      log.warn(`OS=${os_id} lookup FIPE falhou: ${e.message}`);
      fipeResult = null;
    }
  }
  if (!fipeResult || !fipeResult.fipe) {
    problemas.push(`Não foi possível identificar o veículo via lookup FIPE pela placa ${placa || '(ausente)'}`);
  } else {
    dadosRisco.veiculo.fipe = fipeResult.fipe;
    if (!dadosRisco.veiculo.anoModelo && fipeResult.anoModelo) dadosRisco.veiculo.anoModelo = fipeResult.anoModelo;
    if (!dadosRisco.veiculo.anoFabricacao && fipeResult.anoFabricacao) dadosRisco.veiculo.anoFabricacao = fipeResult.anoFabricacao;
    if (!dadosRisco.veiculo.chassi && fipeResult.chassi) dadosRisco.veiculo.chassi = fipeResult.chassi;
  }

  // ── Etapa 4: decisao ──
  log.info(`OS=${os_id} validações cruzadas: ${problemas.length} problemas encontrados`);
  const patchBase = { placa, cpf: cpfSegurado, dados_risco: dadosRisco };

  if (problemas.length > 0) {
    const mensagem = problemas.join('\n');
    await atualizarOS({ ...patchBase, status: 'revisao_manual', error_message: mensagem });
    log.info(`OS=${os_id} → revisão manual`);
    return { os_id, status: 'revisao_manual', error_message: mensagem, problemas };
  }

  await atualizarOS({ ...patchBase, status: 'cotando', error_message: null });
  log.info(`OS=${os_id} → cotando`);

  const quotePayload = {
    os_id,
    ramo: 'auto',
    origem: 'CRM-docs',
    segurado: {
      nome: form.nome,
      cpf: cpfSegurado,
      dataNascimento: dCnh.data_nascimento || null,
      sexo: dCnh.sexo || null,
      estadoCivil: form.estado_civil,
      cep: soDigitos(form.cep_pernoite),
      email: '',
      telefone: form.telefone || null,
    },
    veiculo: {
      placa,
      modelo: dCrlv.modelo || null,
      anoModelo: dadosRisco.veiculo.anoModelo,
      anoFabricacao: dadosRisco.veiculo.anoFabricacao,
      chassi: dadosRisco.veiculo.chassi,
      fipe: dadosRisco.veiculo.fipe,
    },
    condutor: dCond
      ? {
          nome: dCond.nome,
          cpf: soDigitos(dCond.cpf) || null,
          dataNascimento: dCond.data_nascimento || null,
          sexo: dCond.sexo || null,
          relacaoSegurado: 'outro',
        }
      : null,
    apoliceAnterior: null,
  };

  try {
    await dispararQuote(baseUrl, railwayToken, quotePayload);
  } catch (e) {
    const msg = `Falha ao disparar cotação: ${e.message}`;
    log.error(`OS=${os_id} ${msg}`);
    try {
      await atualizarOS({ status: 'erro', error_message: msg });
    } catch (_) {
      /* ja logado */
    }
    return { os_id, status: 'erro', error_message: msg };
  }

  return { os_id, status: 'cotando' };
}

module.exports = { processarComDocs, chamarExtract, dispararQuoteAuto, isoParaBR };

// ── Bootstrap de Worker Thread (so dentro de uma thread com workerData) ──
if (!isMainThread && workerData && workerData.__runComDocs) {
  processarComDocs(workerData)
    .then((result) => {
      parentPort.postMessage({ success: result.status !== 'erro', ...result });
    })
    .catch((err) => {
      Sentry.captureException(err, {
        tags: { component: 'quote-com-docs-worker', os_id: workerData.os_id },
        extra: { os_id: workerData.os_id },
      });
      Sentry.flush(2000).catch(() => {});
      parentPort.postMessage({ success: false, error: err.message, os_id: workerData.os_id });
    });
}
