describe('supabase service', () => {
  const original = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };

  afterEach(() => {
    process.env.SUPABASE_URL = original.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.key;
    jest.resetModules();
  });

  test('lanca erro sem variaveis de ambiente', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getSupabase } = require('../../src/services/supabase');
    expect(() => getSupabase()).toThrow('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios');
  });

  test('cria client com variaveis corretas', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const { getSupabase } = require('../../src/services/supabase');
    const client = getSupabase();
    expect(client).toBeDefined();
  });

  test('usa o pacote ws como transport do realtime (necessario no Node 20)', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const ws = require('ws');
    const { getSupabase } = require('../../src/services/supabase');
    const client = getSupabase();
    expect(client.realtime.transport).toBe(ws);
  });

  test('retorna a mesma instancia (singleton)', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const { getSupabase } = require('../../src/services/supabase');
    expect(getSupabase()).toBe(getSupabase());
  });
});
