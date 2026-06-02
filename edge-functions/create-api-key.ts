// create-api-key — Edge Function (Supabase / Deno)
//
// Cria uma API key com o hardening de seguranca (ver context.md > API Keys):
//   - Gera o PLAINTEXT da chave no SERVIDOR (bsh_live_ + 24 hex).
//   - Persiste apenas o HASH bcrypt (via funcao SQL criar_api_key -> pgcrypto)
//     e o prefixo visivel (key_prefix). O plaintext nunca e gravado.
//   - Retorna o plaintext UMA UNICA VEZ (nao e mais recuperavel depois disso).
//
// Chamada pelo painel admin autenticado (supabase.functions.invoke). Exige um
// usuario Supabase Auth valido no header Authorization.
//
// Migracao necessaria: db/migrations/003-api-keys-prefix.sql
// Deploy manual:        supabase functions deploy create-api-key

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// bsh_live_ + 24 chars hex (12 bytes aleatorios). Prefixo visivel = 13 chars.
function gerarChave(): { chave: string; prefix: string } {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const chave = "bsh_live_" + hex;
  return { chave, prefix: chave.slice(0, 13) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo nao permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Exige usuario autenticado (JWT do painel no header Authorization).
  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "Nao autenticado" }, 401);
  }

  // 2) Valida o corpo.
  let body: { nome?: string; rateLimit?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalido" }, 400);
  }
  const nome = (body.nome ?? "").trim();
  if (!nome) return json({ error: "nome obrigatorio" }, 400);
  const rateLimit = Number(body.rateLimit) || 60;

  // 3) Gera a chave e persiste via funcao SQL (hash bcrypt feito no servidor,
  //    pgcrypto). O plaintext NUNCA e gravado.
  const { chave, prefix } = gerarChave();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await admin.rpc("criar_api_key", {
    p_nome: nome,
    p_chave: chave,
    p_prefix: prefix,
    p_rate: rateLimit,
  });
  if (error) {
    return json({ error: "Falha ao criar a chave: " + error.message }, 500);
  }

  // criar_api_key retorna setof => array. Pega a 1a linha (sem key_hash).
  const row = Array.isArray(data) ? data[0] : data;

  // 4) Retorna o plaintext UMA UNICA VEZ + a linha persistida (sem o hash).
  return json({ chave, key: row }, 201);
});
