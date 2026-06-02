const { parentPort, workerData } = require('worker_threads');
const { createLogger } = require('../utils/logger');
const { resolverFipe } = require('../services/fipe');
const { montarPayload, dispararCotacao, pollVersoes } = require('../services/aggilizador');
const { retryComBackoff, isRetryable } = require('../utils/retry');

// Marca a OS como erro direto no banco (service_role). Usado quando o save-cotacoes
// falha em definitivo — nao depende do endpoint que justamente esta falhando.
async function marcarOSComoErro(osId, mensagem, log) {
  try {
    const { getSupabase } = require('../services/supabase');
    await getSupabase()
      .from('os_cotacao')
      .update({ status: 'erro', error_message: mensagem })
      .eq('id', osId);
    log.info(`OS marcada como erro: ${mensagem}`);
  } catch (e) {
    log.error(`nao foi possivel marcar OS como erro: ${e.message}`);
  }
}

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
    const fabricante = parseInt(veiculo.fabricante, 10) || null;

    // resolverFipe espera dados_risco com { veiculo (descricao), fipe, chassi };
    // incluimos anoModelo/anoFabricacao para que o ano do veiculo seja resolvido
    // a partir do bloco veiculo (e nao apenas parseado da descricao), e fabricante
    // para que o codigo do fabricante seja preservado no FIPE explicito.
    dadosRiscoFipe = {
      veiculo: veiculo.modelo || '',
      fipe: veiculo.fipe || undefined,
      chassi: veiculo.chassi || null,
      anoModelo,
      anoFabricacao,
      fabricante,
    };

    montarExtra = {
      segurado,
      condutor,
      apoliceAnterior,
      anoFabricacao,
      anoModelo,
      fabricante,
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
      const saveBody = { os_id, resultados };
      // Confirma o tamanho real do corpo enviado a save-cotacoes (debug do erro
      // "Unterminated string in JSON at position 3000"). O fetch calcula o
      // Content-Length a partir deste mesmo JSON.stringify, sem corte.
      console.log('[worker] save-cotacoes body length:', JSON.stringify(saveBody).length);
      try {
        // Retry ate 3x em falhas 5xx (transitorias) ou de rede. 4xx nao retenta.
        const saveData = await retryComBackoff(
          async () => {
            const saveRes = await fetch(saveCotacoesUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // Gateway do Supabase exige Bearer com a anon key em toda Edge Function
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'x-secret-token': railwayToken,
              },
              body: JSON.stringify(saveBody),
            });
            if (!saveRes.ok) {
              throw Object.assign(new Error(`save-cotacoes HTTP ${saveRes.status}`), { status: saveRes.status });
            }
            return saveRes.json();
          },
          {
            maxTentativas: 3,
            // Qualquer 5xx vale retry no save (alem dos casos padrao de isRetryable).
            deveRetentar: e => isRetryable(e) || (typeof e.status === 'number' && e.status >= 500),
          }
        );
        log.info(`save-cotacoes: ok inseridos=${saveData.inseridos}`);
      } catch (e) {
        // Falhou em definitivo (esgotou os retries ou erro permanente): a OS nao
        // pode ficar presa em "cotando". Marca como erro com mensagem clara.
        const msg = `Falha ao salvar cotacoes apos retries: ${e.message}`;
        log.error(msg);
        await marcarOSComoErro(os_id, msg, log);
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
