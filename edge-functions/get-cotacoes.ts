// Edge Function: get-cotacoes (final com hardening bcrypt + IDOR)
//
// Consulta status e resultados de uma OS.
// Auth dupla: API key (bcrypt via RPC validar_api_key) OU JWT autenticado.
// IDOR: consumidor de API key só enxerga OS criadas com a própria chave.
//
// GET https://<project>.supabase.co/functions/v1/get-cotacoes?os_id=<uuid>
// Resposta: 200 { os: {...cpf mascarado}, cotacoes: [...], total_cotacoes: N }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function validarApiKey(admin: any, chave: string) {
  if (!chave) return null;
  const { data, error } = await admin.rpc("validar_api_key", { p_chave: chave });
  if (error) {
    console.error("[get-cotacoes] validar_api_key erro:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.id ? row : null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Método não permitido" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── AUTH: API key (bcrypt) OU JWT ──
    const apiKey = req.headers.get("x-api-key") || "";
    const authHeader = req.headers.get("authorization") || "";

    let apiKeyId: string | null = null;

    if (apiKey) {
      const valida = await validarApiKey(supabase, apiKey);
      if (!valida) return json({ error: "API key inválida ou inativa" }, 401);
      apiKeyId = valida.id;
    } else {
      if (!authHeader.startsWith("Bearer ")) {
        return json({
          error: "Autenticação necessária (x-api-key ou Authorization Bearer)",
        }, 401);
      }
    }

    // ── Buscar OS ──
    const url = new URL(req.url);
    const osId = url.searchParams.get("os_id");

    if (!osId) {
      return json({ error: "os_id é obrigatório como query param" }, 400);
    }

    // IDOR: API key só vê OS da própria chave
    let query = supabase
      .from("os_cotacao")
      .select(
        "id, status, placa, cpf, nome, email, cep, dados_risco, error_message, created_at, updated_at, api_key_id"
      )
      .eq("id", osId);

    if (apiKeyId) {
      query = query.eq("api_key_id", apiKeyId);
    }

    const { data: os, error: osError } = await query.maybeSingle();

    if (osError || !os) {
      return json({ error: "OS não encontrada", os_id: osId }, 404);
    }

    // ── Buscar cotações ──
    const { data: cotacoes } = await supabase
      .from("cotacoes")
      .select(
        "id, seguradora, premio, franquia, cobertura, url_pdf, nro_calculo, calculo_id, created_at"
      )
      .eq("os_id", osId)
      .order("premio", { ascending: true });

    // ── Mascarar CPF ──
    const cpfMasked = os.cpf
      ? os.cpf.substring(0, 3) +
        ".***.***-" +
        os.cpf.substring(os.cpf.length - 2)
      : null;

    // Não vaza api_key_id na resposta
    const { api_key_id: _, ...osPublico } = os;

    return json({
      os: { ...osPublico, cpf: cpfMasked },
      cotacoes: cotacoes || [],
      total_cotacoes: (cotacoes || []).length,
    });
  } catch (err) {
    console.error("[get-cotacoes] Erro:", err.message);
    return json({ error: "Erro interno", detail: err.message }, 500);
  }
});