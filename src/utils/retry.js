// Retry com backoff exponencial para chamadas HTTP transitorias.
//
// Uso:
//   const { retryComBackoff, isRetryable } = require('./retry');
//   const data = await retryComBackoff(async () => {
//     const res = await fetch(url);
//     if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
//     return res.json();
//   });
//
// A funcao `fn` deve LANCAR um erro (com `.status` quando for HTTP) para sinalizar
// falha. `isRetryable(err)` decide se vale a pena tentar de novo.

// 4xx de dados/auth: nao adianta retentar (o problema nao se resolve sozinho).
const STATUS_PERMANENTES = new Set([400, 401, 403, 404, 422]);
// Transitorios do lado do servidor / timeouts / rate-limit.
const STATUS_RETRYABLE = new Set([408, 429, 502, 503, 504]);
// Erros de rede (Node embrulha em TypeError com `.cause.code`).
const CODES_REDE = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE']);

// Decide se um erro vale uma nova tentativa.
//   Retryable: timeout, 502, 503, 504, 408, 429, erros de rede (ECONNRESET/ETIMEDOUT/...)
//   Permanente: 400, 401, 403, 404, 422 (problema de dados/auth) e demais status.
function isRetryable(err) {
  if (!err) return false;

  // 1) Status HTTP explicito no erro.
  const status = err.status != null ? err.status : err.statusCode;
  if (typeof status === 'number') {
    if (STATUS_PERMANENTES.has(status)) return false;
    if (STATUS_RETRYABLE.has(status)) return true;
    return false; // qualquer outro status: conservador, nao retenta
  }

  // 2) Timeout via AbortController.
  if (err.name === 'AbortError') return true;

  // 3) Erros de rede (code direto ou em err.cause.code).
  const code = err.code || (err.cause && err.cause.code);
  if (code && CODES_REDE.has(code)) return true;

  // 4) Mensagens genericas de timeout/rede (undici lanca "fetch failed").
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch failed')) return true;

  return false;
}

const sleepPadrao = ms => new Promise(r => setTimeout(r, ms));

// Executa `fn` com retry exponencial. Retorna o resultado da tentativa
// bem-sucedida ou lanca o ultimo erro (apos esgotar as tentativas ou ao
// encontrar um erro permanente).
//
// opts:
//   maxTentativas (3)      — total de tentativas (inclui a primeira)
//   delayInicial  (1000)   — ms antes da 2a tentativa
//   fator         (2)      — o delay e multiplicado por este fator a cada retry
//   delayMaximo   (10000)  — teto do delay (ms)
//   deveRetentar  (isRetryable) — predicado (err) => boolean
//   sleep         (setTimeout) — injetavel para testes
async function retryComBackoff(fn, opts = {}) {
  const {
    maxTentativas = 3,
    delayInicial = 1000,
    fator = 2,
    delayMaximo = 10000,
    deveRetentar = isRetryable,
    sleep = sleepPadrao,
  } = opts;

  let ultimoErro;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await fn(tentativa);
    } catch (err) {
      ultimoErro = err;
      const ehUltima = tentativa >= maxTentativas;
      if (ehUltima || !deveRetentar(err)) throw err;

      const delay = Math.min(delayInicial * Math.pow(fator, tentativa - 1), delayMaximo);
      console.log(`[retry] tentativa ${tentativa + 1}/${maxTentativas} apos ${delay}ms`);
      await sleep(delay);
    }
  }
  // Inalcancavel na pratica (o loop sempre retorna ou lanca), mas mantemos por seguranca.
  throw ultimoErro;
}

module.exports = { retryComBackoff, isRetryable };
