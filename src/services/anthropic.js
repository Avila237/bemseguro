const fs = require('fs');
const path = require('path');
const { retryComBackoff } = require('../utils/retry');
// Importa do ./instrument (e nao direto de @sentry/node) para garantir que o
// Sentry.init() ja rodou — mesma instance global inicializada no boot.
const Sentry = require('../instrument');
const { createLogger } = require('../utils/logger');

const log = createLogger({ scope: 'anthropic' });

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Modelo de visao para leitura de documentos. Configuravel via env; o padrao
// segue o pedido da feature (Sonnet 4.5). Para usar uma versao mais nova
// (ex.: claude-sonnet-4-6) basta setar ANTHROPIC_MODEL no ambiente.
const MODELO_PADRAO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const MAX_TOKENS = 2048;

// Mapa tipoDocumento -> arquivo de prompt em src/prompts/.
const PROMPTS = { cnh: 'cnh.md', crlv: 'crlv.md' };

// Cache dos prompts lidos do disco (lidos uma vez por processo).
const _promptCache = {};

function carregarPrompt(tipoDocumento) {
  const arquivo = PROMPTS[tipoDocumento];
  if (!arquivo) {
    throw new Error(`Tipo de documento invalido: ${tipoDocumento} (esperado cnh|crlv)`);
  }
  if (!_promptCache[tipoDocumento]) {
    const p = path.join(__dirname, '..', 'prompts', arquivo);
    _promptCache[tipoDocumento] = fs.readFileSync(p, 'utf8');
  }
  return _promptCache[tipoDocumento];
}

// Extrai o primeiro objeto JSON de um texto que pode vir cercado de prosa ou de
// cercas markdown (```json ... ```). A Claude API as vezes adiciona texto antes
// ou depois do JSON mesmo quando instruida a nao fazer — este parse e tolerante.
function extrairJSON(texto) {
  if (!texto || typeof texto !== 'string') {
    throw new Error('Resposta vazia da Claude API');
  }

  const semCerca = texto.replace(/```(?:json)?/gi, '').trim();
  const tentativas = [texto.trim(), semCerca];

  // Recorta do primeiro "{" ao ultimo "}" (cobre prosa antes/depois do JSON).
  const primeiro = semCerca.indexOf('{');
  const ultimo = semCerca.lastIndexOf('}');
  if (primeiro !== -1 && ultimo > primeiro) {
    tentativas.push(semCerca.slice(primeiro, ultimo + 1));
  }

  for (const t of tentativas) {
    try {
      return JSON.parse(t);
    } catch (_) {
      // tenta a proxima estrategia
    }
  }
  throw new Error('Nao foi possivel extrair JSON da resposta da Claude API');
}

// Monta o bloco de conteudo do documento para a Messages API. PDFs usam o bloco
// `document`; imagens (jpeg/png/webp) usam o bloco `image`.
function blocoDocumento(base64Image, mimeType) {
  if (mimeType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64Image },
    };
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: mimeType, data: base64Image },
  };
}

// Le um documento (CNH ou CRLV) via Claude API e devolve os dados estruturados.
//   { tipoDocumento: 'cnh'|'crlv', base64Image, mimeType }
// Retorna { dados, confianca, observacoes, modelo, tokensUsados }.
async function extrairDocumento({ tipoDocumento, base64Image, mimeType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY nao configurada');
  }

  const prompt = carregarPrompt(tipoDocumento);

  try {
    // Retry exponencial em falhas transitorias (429/5xx/timeout/rede). 4xx de
    // dados/auth nao sao retentados (isRetryable os trata como permanentes).
    const resposta = await retryComBackoff(async () => {
      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODELO_PADRAO,
          max_tokens: MAX_TOKENS,
          messages: [{
            role: 'user',
            content: [
              blocoDocumento(base64Image, mimeType),
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });

      if (!res.ok) {
        const corpo = await res.text().catch(() => '');
        throw Object.assign(
          new Error(`Anthropic HTTP ${res.status}: ${corpo.slice(0, 200)}`),
          { status: res.status },
        );
      }
      return res.json();
    });

    // Concatena os blocos de texto da resposta (normalmente um so).
    const texto = (resposta.content || [])
      .filter(b => b && b.type === 'text')
      .map(b => b.text)
      .join('\n');

    const parsed = extrairJSON(texto);

    // A IA detectou que o documento NAO e do tipo esperado (ex.: CRLV no slot de
    // CNH). O prompt instrui a devolver { erro: 'tipo_incorreto', ... }. Propaga
    // como erro com `code` para a rota traduzir em 422 + cleanup do Storage.
    if (parsed && parsed.erro === 'tipo_incorreto') {
      const err = new Error(
        `Documento incorreto. Esperado: ${parsed.tipo_esperado}, Detectado: ${parsed.tipo_detectado}. ${parsed.descricao_documento || ''}`.trim(),
      );
      err.code = 'TIPO_INCORRETO';
      err.tipoDetectado = parsed.tipo_detectado;
      err.tipoEsperado = parsed.tipo_esperado;
      throw err;
    }

    const tokensUsados =
      ((resposta.usage && resposta.usage.input_tokens) || 0) +
      ((resposta.usage && resposta.usage.output_tokens) || 0);

    log.info(`extracao ok tipo=${tipoDocumento} modelo=${resposta.model || MODELO_PADRAO} tokens=${tokensUsados}`);

    return {
      dados: parsed.dados || {},
      confianca: parsed.confianca || {},
      observacoes: parsed.observacoes || '',
      modelo: resposta.model || MODELO_PADRAO,
      tokensUsados,
    };
  } catch (err) {
    // Tipo incorreto e condicao esperada (documento errado anexado pelo operador),
    // nao erro de infra — propaga sem ruido no Sentry.
    if (err.code === 'TIPO_INCORRETO') {
      log.warn(`tipo incorreto esperado=${err.tipoEsperado} detectado=${err.tipoDetectado}`);
      throw err;
    }
    log.error(`Falha na extracao tipo=${tipoDocumento}: ${err.message}`);
    Sentry.captureException(err, {
      tags: { component: 'anthropic', operation: 'extrair_documento' },
      extra: { tipoDocumento, mimeType },
    });
    // Fire-and-forget (servidor persistente): nao bloqueia a resposta.
    Sentry.flush(2000).catch(() => {});
    throw err;
  }
}

module.exports = { extrairDocumento, extrairJSON, carregarPrompt, MODELO_PADRAO };
