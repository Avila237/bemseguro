// Edge Function: extract-doc
//
// Proxy entre o painel admin (browser) e o Railway /extract/{cnh|crlv}. O painel
// NÃO pode chamar o /extract direto: o endpoint exige `x-secret-token` (secret do
// Railway) e o bucket de documentos é privado (só service_role). Esta função
// recebe o upload com o JWT do painel, valida, e repassa o arquivo ao Railway com
// o token guardado no servidor — o secret nunca chega ao browser. Mesmo padrão
// das demais Edge Functions (lookup-placa / run-quote).
//
// POST multipart/form-data: os_id, tipo (cnh_segurado|cnh_condutor|crlv), arquivo
// Auth: Authorization Bearer (JWT do painel — o gateway do Supabase valida o JWT).
//
// Roda em Deno (não Node). APLICAÇÃO MANUAL: fazer deploy no Supabase (CLI/Studio).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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

const TIPOS = new Set(["cnh_segurado", "cnh_condutor", "crlv"]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  // Auth: exige JWT do painel. O gateway do Supabase (verify_jwt) já valida o
  // token antes da função rodar; aqui só garantimos a presença do header.
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Autenticação necessária (Authorization Bearer)" }, 401);
  }

  const railwayUrl = Deno.env.get("RAILWAY_URL");
  const railwaySecretToken = Deno.env.get("RAILWAY_SECRET_TOKEN");
  if (!railwayUrl || !railwaySecretToken) {
    console.error("[extract-doc] RAILWAY_URL/RAILWAY_SECRET_TOKEN não configurados");
    return json({ error: "Configuração do servidor incompleta" }, 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (_) {
    return json({ error: "Esperado multipart/form-data" }, 400);
  }

  const osId = form.get("os_id");
  const tipo = form.get("tipo");
  const arquivo = form.get("arquivo");

  if (!osId || typeof osId !== "string") return json({ error: "os_id obrigatório" }, 400);
  if (!tipo || typeof tipo !== "string" || !TIPOS.has(tipo)) {
    return json({ error: "tipo inválido (use cnh_segurado, cnh_condutor ou crlv)" }, 400);
  }
  if (!(arquivo instanceof File)) return json({ error: "arquivo obrigatório" }, 400);

  // Endpoint-base do Railway: CRLV → /extract/crlv; CNH (segurado/condutor) → /extract/cnh.
  const base = tipo === "crlv" ? "crlv" : "cnh";

  // Reconstrói o multipart para repassar ao Railway. Para CNH, encaminha o `tipo`
  // (cnh_segurado | cnh_condutor) que o /extract/cnh usa para a coluna documentos_os.tipo.
  const fwd = new FormData();
  fwd.append("os_id", osId);
  if (base === "cnh") fwd.append("tipo", tipo);
  fwd.append("arquivo", arquivo, arquivo.name);

  try {
    const res = await fetch(`${railwayUrl}/extract/${base}`, {
      method: "POST",
      headers: { "x-secret-token": railwaySecretToken },
      // NÃO setar Content-Type: o fetch define o multipart com boundary automaticamente.
      body: fwd,
    });

    // Repassa a resposta do Railway diretamente (JSON), preservando o status.
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract-doc] erro ao chamar Railway:", (err as Error).message);
    return json({ error: "Falha ao contatar o serviço de extração" }, 502);
  }
});
