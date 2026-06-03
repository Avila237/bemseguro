const { Router } = require('express');
const multer = require('multer');
const { internalAuth } = require('../utils/auth');
const { extrairDocumento } = require('../services/anthropic');
const { createLogger } = require('../utils/logger');

const router = Router();
const log = createLogger({ scope: 'extract' });

// Tipos aceitos (imagens + PDF) e teto de 10MB.
const MIMES_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10MB

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

// Handler parametrizado por tipo de documento (cnh | crlv).
function criarHandler(tipoDocumento) {
  return async function handler(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo obrigatorio (campo "arquivo")' });
    }

    const { buffer, mimetype, size } = req.file;
    log.info(`tipo=${tipoDocumento} tamanho=${Math.round(size / 1024)}kb mime=${mimetype}`);

    try {
      const base64Image = buffer.toString('base64');
      const resultado = await extrairDocumento({ tipoDocumento, base64Image, mimeType: mimetype });
      return res.json({ success: true, tipo: tipoDocumento, ...resultado });
    } catch (err) {
      // O anthropic.js ja capturou no Sentry; aqui so respondemos ao chamador.
      log.error(`Extracao falhou tipo=${tipoDocumento}: ${err.message}`);
      return res.status(502).json({ success: false, error: 'Falha ao extrair dados do documento' });
    }
  };
}

// internalAuth ANTES do multer: requisicao sem token nao chega a consumir o body.
router.post('/extract/cnh', internalAuth, uploadDocumento, criarHandler('cnh'));
router.post('/extract/crlv', internalAuth, uploadDocumento, criarHandler('crlv'));

module.exports = router;
