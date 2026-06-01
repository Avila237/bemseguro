const { parentPort, workerData } = require('worker_threads');
const { createLogger } = require('../utils/logger');
const { resolverFipe } = require('../services/fipe');
const { montarPayload, dispararCotacao, pollVersoes } = require('../services/aggilizador');

const { body, session, calculos, saveCotacoesUrl, railwayToken } = workerData;

(async () => {
  // Detecta o formato de entrada: novo contrato CRM traz blocos estruturados
  // (presenca de body.segurado); formato legado traz campos soltos + dados_risco.
  const novoFormato = !!body.segurado;

  let placa, cpf, nome, email, cep;
  const os_id = body.os_id;
  let dadosRiscoFipe;          // objeto compativel com resolverFipe
  let montarExtra = {};        // campos extras do novo formato p/ montarPayload

  if (novoFormato) {
    const segurado = body.segurado || {};
    const veiculo = body.veiculo || {};
    const condutor = body.condutor || {};
    const apoliceAnterior = body.apoliceAnterior || {};

    placa = veiculo.placa;
    cpf = segurado.cpf;
    nome = segurado.nome;
    email = segurado.email;
    cep = segurado.cep;

    const anoModelo = parseInt(veiculo.anoModelo, 10) || null;
    const anoFabricacao = parseInt(veiculo.anoFabricacao, 10) || null;

    // resolverFipe espera dados_risco com { veiculo (descricao), fipe, chassi };
    // incluimos anoModelo/anoFabricacao para que o ano do veiculo seja resolvido
    // a partir do bloco veiculo (e nao apenas parseado da descricao).
    dadosRiscoFipe = {
      veiculo: veiculo.modelo || '',
      fipe: veiculo.fipe || undefined,
      chassi: veiculo.chassi || null,
      anoModelo,
      anoFabricacao,
    };

    montarExtra = {
      segurado,
      condutor,
      apoliceAnterior,
      anoFabricacao,
      anoModelo,
    };
  } else {
    ({ placa, cpf, nome, email, cep } = body);
    dadosRiscoFipe = body.dados_risco || {};
  }

  const { aggerToken, mcToken } = session;
  const placaNorm = (placa || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 7);

  const log = createLogger({ scope: 'worker', placa: placaNorm, os_id });

  log.info(`CPF=${cpf} | formato=${novoFormato ? 'novo' : 'legado'}`);

  try {
    const fipeResult = await resolverFipe({
      dados_risco: dadosRiscoFipe,
      placa: placaNorm,
      mcToken,
      aggerToken,
      log,
    });

    log.info(`FIPE=${fipeResult.fipe} ano=${fipeResult.anoVeiculo} chassi=${fipeResult.chassi || 'null'}`);

    const payload = montarPayload({
      placa: placaNorm,
      cpf,
      nome,
      email,
      cep,
      dados_risco: dadosRiscoFipe,
      fipeResult,
      calculos,
      ...montarExtra,
    });

    log.info(`Disparando cotacao em ${calculos.length} seguradoras...`);

    let cotacaoResult;
    try {
      cotacaoResult = await dispararCotacao(payload, aggerToken);
    } catch (e) {
      if (e.status === 401) {
        parentPort.postMessage({ success: false, error: 'Token expirado', os_id, invalidateSession: true });
        return;
      }
      throw e;
    }

    log.info(`calcularV2 status=${cotacaoResult.status} versaoId=${cotacaoResult.versaoId}`);

    let resultados = [];
    if (cotacaoResult.versaoId) {
      resultados = await pollVersoes(cotacaoResult.versaoId, mcToken, log);
    }

    log.info(`Concluido. Total: ${resultados.length} seguradoras`);
    resultados.forEach(r => log.info(`${r.seguradora}: R$ ${r.premio} | pdf: ${r.url_pdf || 'null'}`));

    if (os_id && saveCotacoesUrl) {
      try {
        const saveRes = await fetch(saveCotacoesUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Gateway do Supabase exige Bearer com a anon key em toda Edge Function
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
            'x-secret-token': railwayToken,
          },
          body: JSON.stringify({ os_id, resultados }),
        });
        const saveData = await saveRes.json();
        log.info(`save-cotacoes: status=${saveRes.status} inseridos=${saveData.inseridos}`);
      } catch (e) {
        log.error(`save-cotacoes erro: ${e.message}`);
      }
    }

    parentPort.postMessage({
      success: true,
      os_id: os_id || null,
      placa: placaNorm,
      total: resultados.length,
      resultados,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error(`Erro fatal: ${err.message}`);
    parentPort.postMessage({
      success: false,
      error: err.message,
      os_id: body.os_id || null,
    });
  }
})();
