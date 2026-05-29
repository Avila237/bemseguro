const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabase() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false },
    realtime: {
      transport: require('ws'),
      params: { eventsPerSecond: 0 },
    },
  });
  return _client;
}

module.exports = { getSupabase };
