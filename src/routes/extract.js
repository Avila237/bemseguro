const { Router } = require('express');
const multer = require('multer');
const { internalAuth } = require('../utils/auth');
const { extrairDocumento } = require('../services/anthropic');
const { getSupabase } = require('../services/supabase');
const { createLogger } = require('../utils/logger');

const router = Router();
const log = createLogger({ scope: 'extract' });

// Tipos aceitos (imagens + PDF) e teto de 10MB.
const MIMES_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB
const BUCKET = 'documentos-clientes';

// Extensao do arquivo derivada do MIME (para compor o storage_path).
const EXT_POR_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

// Tipos validos de CNH em documentos_os (CRLV e sempre 'crlv').
const TIPOS_CNH = new Set(['cnh_segurado', 'cnh_condutor']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!MIMES_PERMITIDOS.has(file.mimetype)) {
      // Sinaliza MIME invalido — convertido em 400 no tratador abaixo.
      return cb(Object.assign(new Error('Tipo de arquivo nao suportado'), { code: 'TIPO_INVALIDO' }));
    }
    cb(null, true);
  },
});

// Envolve o middleware do multer para traduzir os erros em status HTTP claros:
// arquivo grande -> 413, MIME invalido / falha de upload -> 400.
function uploadDocumento(req, res, next) {
  upload.single('arquivo')(req, res, (err) => {
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

// Media das confiancas individuais devolvidas pela IA (0–1). Null se nao houver
// nenhum valor numerico — alimenta documentos_os.confianca_extracao (NUMERIC(3,2)).
function mediaConfianca(confianca) {
  const valores = Object.values(confianca || {}).filter(v => typeof v === 'number' && !Number.isNaN(v));
  if (valores.length === 0) return null;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  return Number(media.toFixed(2));
}

// Handler parametrizado pelo tipo-base do documento (define o prompt da IA):
//   docBase = 'cnh'  -> tipo persistido: cnh_segurado (default) ou cnh_condutor
//   docBase = 'crlv' -> tipo persistido: sempre 'crlv'
function criarHandler(docBase) {
  return async function handler(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo obrigatorio (campo "arquivo")' });
    }

    const os_id = ((req.body && req.body.os_id) || '').trim();
    if (!os_id) {
      return res.status(400).json({ error: 'os_id obrigatorio' });
    }

    // Resolve o tipo persistido em documentos_os.
    let tipo;
    if (docBase === 'crlv') {
      tipo = 'crlv';
    } else {
      tipo = ((req.body && req.body.tipo) || 'cnh_segurado').trim();
      if (!TIPOS_CNH.has(tipo)) {
        return res.status(400).json({ error: 'tipo invalido para CNH (use cnh_segurado ou cnh_condutor)' });
      }
    }

    const supabase = getSupabase();

    // 1) Valida que a OS existe antes de qualquer upload/IA.
    let osRow;
    try {
      const { data, error } = await supabase
        .from('os_cotacao')
        .select('id')
        .eq('id', os_id)
        .maybeSingle();
      if (error) throw error;
      osRow = data;
    } catch (err) {
      log.error(`Falha ao validar OS ${os_id}: ${err.message}`);
      return res.status(500).json({ error: 'Falha ao validar a OS' });
    }
    if (!osRow) {
      return res.status(404).json({ error: 'OS nao encontrada' });
    }

    const { buffer, mimetype, size } = req.file;
    const ext = EXT_POR_MIME[mimetype] || 'bin';
    const timestamp = Math.floor(Date.now() / 1000);
    const storagePath = `${os_id}/${tipo}-${timestamp}.${ext}`;

    log.info(`tipo=${tipo} tamanho=${Math.round(size / 1024)}kb mime=${mimetype} os=${os_id}`);

    // 2) Sobe o arquivo no Storage. Se falhar, NAO chama a IA.
    try {
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { contentType: mimetype, upsert: false });
      if (upErr) throw upErr;
    } catch (err) {
      log.error(`Falha no upload Storage ${BUCKET}/${storagePath}: ${err.message}`);
      return res.status(500).json({ error: 'Falha ao salvar o arquivo no Storage' });
    }

    // 3) Extracao por IA (arquivo ja persistido no Storage).
    let extracao;
    try {
      const base64Image = buffer.toString('base64');
      extracao = await extrairDocumento({ tipoDocumento: docBase, base64Image, mimeType: mimetype });
    } catch (err) {
      // Documento de tipo incorreto (ex.: CRLV anexado no slot de CNH): a IA
      // detecta e o wrapper lanca TIPO_INCORRETO. NAO insere em documentos_os e
      // REMOVE o arquivo que acabou de subir (nao deixa upload invalido orfao).
      if (err.code === 'TIPO_INCORRETO') {
        try {
          await supabase.storage.from(BUCKET).remove([storagePath]);
        } catch (rmErr) {
          log.warn(`Falha ao remover arquivo de tipo incorreto (${BUCKET}/${storagePath}): ${rmErr.message}`);
        }
        log.info(`tipo incorreto esperado=${err.tipoEsperado} detectado=${err.tipoDetectado} os=${os_id} (arquivo removido)`);
        return res.status(422).json({
          error: 'Documento de tipo incorreto',
          tipo_esperado: err.tipoEsperado,
          tipo_detectado: err.tipoDetectado,
          mensagem: err.message,
        });
      }
      // O anthropic.js ja capturou no Sentry; o arquivo segue no Storage.
      log.error(`Extracao falhou tipo=${tipo}: ${err.message}`);
      return res.status(502).json({ success: false, error: 'Falha ao extrair dados do documento' });
    }

    // 4) Persiste os metadados + extracao em documentos_os. Se falhar, o arquivo
    //    JA esta no Storage (rollback parcial) — registra warning e devolve 500.
    let documentoId;
    try {
      const { data, error } = await supabase
        .from('documentos_os')
        .insert({
          os_id,
          tipo,
          storage_path: storagePath,
          storage_bucket: BUCKET,
          mime_type: mimetype,
          tamanho_bytes: size,
          dados_extraidos: extracao.dados,
          confianca_extracao: mediaConfianca(extracao.confianca),
          confianca_por_campo: extracao.confianca || null,
          revisado: false,
        })
        .select('id')
        .single();
      if (error) throw error;
      documentoId = data.id;
    } catch (err) {
      log.warn(`Insert em documentos_os falhou (arquivo ja no Storage: ${BUCKET}/${storagePath}): ${err.message}`);
      return res.status(500).json({ error: 'Falha ao registrar o documento' });
    }

    return res.json({
      success: true,
      tipo,
      documento_id: documentoId,
      storage_path: storagePath,
      dados: extracao.dados,
      confianca: extracao.confianca,
      observacoes: extracao.observacoes,
      modelo: extracao.modelo,
      tokensUsados: extracao.tokensUsados,
    });
  };
}

// internalAuth ANTES do multer: requisicao sem token nao chega a consumir o body.
router.post('/extract/cnh', internalAuth, uploadDocumento, criarHandler('cnh'));
router.post('/extract/crlv', internalAuth, uploadDocumento, criarHandler('crlv'));

module.exports = router;
