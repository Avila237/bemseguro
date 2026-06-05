// Edge Function: get-doc-url
//
// Gera uma signed URL temporária para um arquivo do bucket PRIVADO
// `documentos-clientes`. O browser (anon/authenticated) NÃO consegue
// `createSignedUrl` direto: o bucket é privado e a anon key não o lê → o Storage
// devolve o genérico "Object not found". Esta função usa a SERVICE_ROLE no
// servidor (que tem acesso) e devolve a URL assinada. Mesmo padrão das demais
// Edge Functions (extract-doc / lookup-placa / run-quote): o segredo fica no
// servidor, nunca no bundle do painel.
//
// POST { storage_path: string, expires_in?: number }
// Auth: Authorization Bearer (JWT do painel — o gateway do Supabase valida o JWT).
// Resposta: 200 { signedUrl } | 4xx/5xx { error }
//
// SEGURANÇA (os documentos são PII — CNH/CRLV):
//  - O `bucket` é FIXO no servidor; qualquer `bucket` vindo do cliente é ignorado
//    (não deixar o cliente assinar URL de bucket arbitrário com a service_role).
//  - `storage_path` é validado por regex estrita (uuid/arquivo) — anti-probing e
//    sem path traversal.
//  - Autorização (anti-IDOR): antes de assinar, confirma que o `storage_path`
//    corresponde a uma row de `documentos_os`, consultada sob a **RLS do usuário**
//    (JWT do painel). Assim só se assina caminho de documento de fato registrado,
//    e qualquer policy por-usuário que venha a existir passa a ser respeitada
//    automaticamente (hoje, no piloto, a RLS é `using(true)` p/ authenticated).
//
// Roda em Deno (não Node). APLICAÇÃO MANUAL: fazer deploy no Supabase (CLI/Studio).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (todas
// injetadas automaticamente pelo runtime de Edge Functions do Supabase).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const BUCKET = "documentos-clientes"; // fixo — NÃO aceitar bucket do cliente
const EXPIRACAO_PADRAO = 3600; // 1h
const EXPIRACAO_MAX = 3600; // teto p/ não emitir links de vida longa

// storage_path esperado: `{os_id-uuid}/{tipo}-{timestamp}.{ext}`
// (ver src/routes/extract.js). Regex estrita evita path traversal/probing.
const PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[\w.\-]+\.(jpe?g|png|webp|pdf)$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  // Auth: exige JWT do painel. O gateway do Supabase (verify_jwt) já valida o
  // token antes da função rodar; aqui garantimos a presença do header e o usamos
  // para a consulta sob RLS abaixo.
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Autenticação necessária (Authorization Bearer)" }, 401);
  }

  let body: { storage_path?: string; expires_in?: number };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "Corpo JSON inválido" }, 400);
  }

  const storagePath = (body.storage_path || "").trim();
  if (!storagePath) return json({ error: "storage_path obrigatório" }, 400);
  if (!PATH_RE.test(storagePath)) return json({ error: "storage_path inválido" }, 400);

  const expiresIn = Math.min(
    Number(body.expires_in) > 0 ? Number(body.expires_in) : EXPIRACAO_PADRAO,
    EXPIRACAO_MAX,
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[get-doc-url] SUPABASE_URL/ANON/SERVICE_ROLE não configurados");
    return json({ error: "Configuração do servidor incompleta" }, 500);
  }

  // ── Autorização (anti-IDOR): o path tem de ser de um documento registrado,
  //    visto sob a RLS do usuário (JWT do painel) — não a service_role. ──
  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: doc, error: docErr } = await userClient
      .from("documentos_os")
      .select("id")
      .eq("storage_path", storagePath)
      .maybeSingle();
    if (docErr) {
      console.error("[get-doc-url] consulta documentos_os falhou:", docErr.message);
      return json({ error: "Falha ao validar o documento" }, 500);
    }
    if (!doc) return json({ error: "Documento não encontrado" }, 404);
  } catch (err) {
    console.error("[get-doc-url] erro na autorização:", (err as Error).message);
    return json({ error: "Falha ao validar o documento" }, 500);
  }

  // ── Assina com a service_role (só agora, já autorizado), no bucket fixo. ──
  try {
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl) {
      console.error("[get-doc-url] createSignedUrl falhou:", error?.message, "path:", storagePath);
      return json({ error: "Documento não encontrado" }, 404);
    }
    return json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error("[get-doc-url] Erro:", (err as Error).message);
    return json({ error: "Erro ao gerar o link do documento" }, 500);
  }
});
