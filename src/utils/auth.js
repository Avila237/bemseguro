const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

function internalAuth(req, res, next) {
  const token = req.headers['x-secret-token'];
  if (token !== process.env.RAILWAY_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function createApiKeyAuth(supabase) {
  return async function apiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ error: 'x-api-key obrigatorio' });
    }

    try {
      const { data: keys, error } = await supabase
        .from('api_keys')
        .select('id, key_hash, ativa')
        .eq('ativa', true);

      if (error) throw error;

      for (const row of keys) {
        const match = await bcrypt.compare(apiKey, row.key_hash);
        if (match) {
          supabase
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', row.id)
            .then(() => {});
          req.apiKeyId = row.id;
          return next();
        }
      }

      return res.status(401).json({ error: 'API key invalida' });
    } catch (err) {
      return res.status(500).json({ error: 'Erro na autenticacao' });
    }
  };
}

module.exports = { internalAuth, createApiKeyAuth };
