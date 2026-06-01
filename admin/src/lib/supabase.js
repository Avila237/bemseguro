import { createClient } from '@supabase/supabase-js';

// Client Supabase para autenticacao no browser. Usa a ANON KEY (publica),
// nunca a service_role. As variaveis vem do .env via Vite (prefixo VITE_).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
