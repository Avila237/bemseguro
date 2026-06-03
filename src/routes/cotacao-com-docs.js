const { Router } = require('express');
const multer = require('multer');
const { getSupabase } = require('../services/supabase');
const { createLogger } = require('../utils/logger');
// Importa do ./instrument (e nao direto de @sentry/node) para usar a mesma
// instance global inicializada no boot.
const Sentry = require('../instrument');

const router = Router();
const log = createLogger({ scope: 'cotacao-com-docs' });

// ── Constantes de upload ──
const MIMES_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB
const USOS_VALIDOS = new Set(['passeio', 'comercial']);
const BOOL_VALIDOS = new Set(['true', 'false']);

// Campos de arquivo aceitos (cnh_condutor e condicional).
const CAMPOS_ARQUIVO = [
  { name: 'cnh_segurado', maxCount: 1 },
  { name: 'crlv', maxCount: 1 },
  { name: 'cnh_condutor', maxCount: 1 },
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO, files: CAMPOS_ARQUIVO.length },
  fileFilter: (req, file, cb) => {
    if (!MIMES_PERMITIDOS.has(file.mimetype)) {
      return cb(Object.assign(new Error('Tipo de arquivo nao suportado'), { code: 'TIPO_INVALIDO' }));
    }
    cb(null, true);
  },
});

// Traduz erros do multer em status HTTP claros (grande -> 413, MIME/erro -> 400).
function uploadDocumentos(req, res, next) {
  upload.fields(CAMPOS_ARQUIVO)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Arquivo excede o tamanho maximo de 10MB' });
    }
    if (err.code === 'TIPO_INVALIDO') {
      return res.status(400).json({ error: 'Tipo de arquivo nao suportado. Use JPEG, PNG, WEBP ou PDF.' });
    }
    return res.status(400).json({ error: 'Falha ao processar o upload: ' + err.message });
  });
}

// ── Auth via x-api-key (RPC validar_api_key — bcrypt + prefixo, mesma da
// Edge Function run-quote/get-cotacoes). Roda ANTES do multer: requisicao sem
// chave nao chega a consumir os uploads. ──
async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'x-api-key obrigatorio' });
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('validar_api_key', { p_chave: apiKey });
    if (error) {
      log.error(`validar_api_key erro: ${error.message}`);
      return res.status(500).json({ error: 'Falha na validacao da API key' });
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.id) {
      return res.status(401).json({ error: 'API key invalida ou inativa' });
    }
    req.apiKeyId = row.id;
    next();
  } catch (err) {
    log.error(`Erro inesperado na auth: ${err.message}`);
    return res.status(500).json({ error: 'Erro na autenticacao' });
  }
}

// Primeiro arquivo de um campo (multer .fields agrupa por nome em arrays).
function pegarArquivo(req, campo) {
  const arr = req.files && req.files[campo];
  return (arr && arr[0]) || null;
}

function arquivoParaDoc(tipo, file) {
  return {
    tipo,
    base64: file.buffer.toString('base64'),
    mimeType: file.mimetype,
    tamanho: file.size,
    filename: file.originalname || null,
  };
}

// URL do proprio Railway (para o disparo do worker no /quote/auto-com-docs).
function selfUrl() {
  return process.env.RAILWAY_URL || `http://127.0.0.1:${process.env.PORT || 8080}`;
}

// Dispara o processamento async (fire-and-forget). Nao bloqueia o 202.
function dispararWorkerDocs(payload) {
  const url = `${selfUrl()}/quote/auto-com-docs`;
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-token': process.env.RAILWAY_SECRET_TOKEN,
    },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) log.error(`Worker docs respondeu ${res.status} | OS=${payload.os_id}`);
    })
    .catch((err) => {
      log.error(`Falha ao disparar worker docs | OS=${payload.os_id} | ${err.message}`);
      Sentry.captureException(err, {
        tags: { component: 'cotacao-com-docs', operation: 'disparar_worker' },
        extra: { os_id: payload.os_id },
      });
      Sentry.flush(2000).catch(() => {});
    });
}

router.post('/api/v1/cotacoes-com-docs', apiKeyAuth, uploadDocumentos, async (req, res) => {
  try {
    const body = req.body || {};

    // ── 1) Validacao dos campos do formulario ──
    const OBRIGATORIOS = ['nome', 'telefone', 'cep_pernoite', 'estado_civil', 'uso', 'dono_eh_condutor', 'renovacao'];
    const faltando = OBRIGATORIOS.filter((k) => !body[k] || String(body[k]).trim() === '');
    if (faltando.length > 0) {
      return res.status(400).json({ error: 'Campos obrigatorios ausentes', campos: faltando });
    }

    if (!USOS_VALIDOS.has(body.uso)) {
      return res.status(400).json({ error: 'uso invalido (use "passeio" ou "comercial")' });
    }
    if (!BOOL_VALIDOS.has(body.dono_eh_condutor)) {
      return res.status(400).json({ error: 'dono_eh_condutor deve ser "true" ou "false"' });
    }
    if (!BOOL_VALIDOS.has(body.renovacao)) {
      return res.status(400).json({ error: 'renovacao deve ser "true" ou "false"' });
    }

    const cepDigitos = String(body.cep_pernoite).replace(/\D/g, '');
    if (!/^\d{8}$/.test(cepDigitos)) {
      return res.status(400).json({ error: 'cep_pernoite invalido (use 12345678 ou 12345-678)' });
    }

    // callback_url, se presente, precisa ser HTTPS valida.
    const callbackUrl = body.callback_url ? String(body.callback_url).trim() : null;
    if (callbackUrl) {
      let parsed;
      try {
        parsed = new URL(callbackUrl);
      } catch (_) {
        return res.status(400).json({ error: 'callback_url invalida' });
      }
      if (parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'callback_url deve ser HTTPS' });
      }
    }

    const donoEhCondutor = body.dono_eh_condutor === 'true';
    const renovacao = body.renovacao === 'true';

    // ── 2) Validacao dos arquivos ──
    const cnhSegurado = pegarArquivo(req, 'cnh_segurado');
    const crlv = pegarArquivo(req, 'crlv');
    const cnhCondutor = pegarArquivo(req, 'cnh_condutor');

    if (!cnhSegurado) {
      return res.status(400).json({ error: 'cnh_segurado obrigatorio' });
    }
    if (!crlv) {
      return res.status(400).json({ error: 'crlv obrigatorio' });
    }
    if (!donoEhCondutor && !cnhCondutor) {
      return res.status(400).json({ error: 'cnh_condutor obrigatorio quando dono_eh_condutor=false' });
    }

    const externalRef = body.external_ref ? String(body.external_ref).trim() : null;
    const idempotencyKey = req.headers['idempotency-key'] || '';
    const supabase = getSupabase();

    // ── 3) Idempotencia (opcional, padrao Stripe/AWS) ──
    // Mesma chave nas ultimas 24h => replay (200) com a OS ja criada. Evita OS
    // duplicada em retries / reenvio do CRM. (A comparacao byte-a-byte do corpo
    // nao se aplica aqui por causa dos binarios; a chave de uso unico ja protege.)
    if (idempotencyKey) {
      const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existente } = await supabase
        .from('os_cotacao')
        .select('id, status')
        .eq('idempotency_key', idempotencyKey)
        .gte('created_at', desde24h)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existente) {
        log.info(`Idempotency replay OS=${existente.id} | key=${idempotencyKey}`);
        return res.status(200).json({
          os_id: existente.id,
          status: existente.status,
          external_ref: externalRef,
          message: 'OS ja criada com esta Idempotency-Key (replay)',
        });
      }
    }

    // ── 4) Cria a OS em status extraindo_documentos ──
    // telefone nao tem coluna dedicada em os_cotacao -> vai em dados_risco.
    // placa/cpf ficam null: serao preenchidos pela IA (extracao da CNH/CRLV).
    const dadosRisco = {
      uso: body.uso,
      estado_civil: String(body.estado_civil).trim(),
      dono_eh_condutor: donoEhCondutor,
      renovacao,
      external_ref: externalRef,
      callback_url: callbackUrl,
      telefone: String(body.telefone).trim(),
    };

    const { data: os, error: osError } = await supabase
      .from('os_cotacao')
      .insert({
        status: 'extraindo_documentos',
        nome: String(body.nome).trim(),
        cpf: null,
        placa: null,
        cep: cepDigitos,
        dados_risco: dadosRisco,
        api_key_id: req.apiKeyId,
        idempotency_key: idempotencyKey || null,
      })
      .select('id, status')
      .single();

    if (osError) {
      // Corrida com a mesma Idempotency-Key (viola o indice unico parcial):
      // devolve a OS ja criada como replay.
      if (idempotencyKey && (osError.code === '23505' || /duplicate key|unique/i.test(osError.message || ''))) {
        const { data: jaCriada } = await supabase
          .from('os_cotacao')
          .select('id, status')
          .eq('idempotency_key', idempotencyKey)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (jaCriada) {
          log.info(`Idempotency replay (corrida) OS=${jaCriada.id} | key=${idempotencyKey}`);
          return res.status(200).json({
            os_id: jaCriada.id,
            status: jaCriada.status,
            external_ref: externalRef,
            message: 'OS ja criada com esta Idempotency-Key (replay)',
          });
        }
      }
      log.error(`Erro ao criar OS: ${osError.message}`);
      Sentry.captureException(new Error(`Erro ao criar OS: ${osError.message}`), {
        tags: { component: 'cotacao-com-docs', operation: 'criar_os' },
      });
      Sentry.flush(2000).catch(() => {});
      return res.status(500).json({ error: 'Erro ao criar OS' });
    }

    // ── 5) Monta os documentos (base64 em memoria) e dispara o worker async ──
    const documentos = [arquivoParaDoc('cnh_segurado', cnhSegurado), arquivoParaDoc('crlv', crlv)];
    if (cnhCondutor) documentos.push(arquivoParaDoc('cnh_condutor', cnhCondutor));

    log.info(`OS criada=${os.id} | placa=pendente | docs=${documentos.length} arquivos`);

    dispararWorkerDocs({
      os_id: os.id,
      form: {
        nome: String(body.nome).trim(),
        telefone: dadosRisco.telefone,
        cep_pernoite: cepDigitos,
        estado_civil: dadosRisco.estado_civil,
        uso: body.uso,
        dono_eh_condutor: donoEhCondutor,
        renovacao,
        external_ref: externalRef,
        callback_url: callbackUrl,
      },
      documentos,
    });

    // ── 6) Audit log (payload mascarado, SEM binarios) ──
    try {
      await supabase.from('audit_log').insert({
        api_key_id: req.apiKeyId,
        endpoint: '/api/v1/cotacoes-com-docs',
        method: 'POST',
        request_payload: {
          auth: 'api_key',
          nome: String(body.nome).trim(),
          telefone: '***',
          cep_pernoite: cepDigitos,
          uso: body.uso,
          dono_eh_condutor: donoEhCondutor,
          renovacao,
          external_ref: externalRef,
          callback_url: callbackUrl ? true : false,
          docs: documentos.length,
        },
        response_status: 202,
      });
    } catch (auditErr) {
      // Falha de auditoria nao deve derrubar a criacao da OS.
      log.warn(`Falha ao gravar audit_log | OS=${os.id} | ${auditErr.message}`);
    }

    // ── 7) 202 imediato ──
    return res.status(202).json({
      os_id: os.id,
      status: os.status,
      external_ref: externalRef,
      message: `Cotação criada. Documentos sendo processados. Use GET /functions/v1/get-cotacoes?os_id=${os.id} ou aguarde callback`,
    });
  } catch (err) {
    log.error(`Erro inesperado: ${err.message}`);
    Sentry.captureException(err, { tags: { component: 'cotacao-com-docs' } });
    Sentry.flush(2000).catch(() => {});
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
