// Edge Function: run-quote (final com hardening bcrypt)
//
// Auth dupla:
//   - x-api-key (CRM externo) — validada via RPC validar_api_key (bcrypt + prefix)
//   - JWT autenticado (painel admin) — fallback quando não há x-api-key
//
// Suporta:
//   - Cotação nova (formato v2: segurado/veiculo/condutor/apoliceAnterior, ou legado)
//   - Recotar (body com os_id reutiliza dados_risco persistidos)
//
// Fluxo: cria OS → status=cotando → await Railway → 202 imediato

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, x-secret-token, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    console.error("[run-quote] validar_api_key erro:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.id ? row : null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const railwayUrl = Deno.env.get("RAILWAY_URL")!;
    const railwaySecretToken = Deno.env.get("RAILWAY_SECRET_TOKEN")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── AUTH: API key (bcrypt) OU JWT ──
    const apiKey = req.headers.get("x-api-key") || "";
    const authHeader = req.headers.get("authorization") || "";

    let apiKeyId: string | null = null;
    let authSource = "jwt";

    if (apiKey) {
      const valida = await validarApiKey(supabase, apiKey);
      if (!valida) return json({ error: "API key inválida ou inativa" }, 401);
      apiKeyId = valida.id;
      authSource = "api_key";
    } else {
      if (!authHeader.startsWith("Bearer ")) {
        return json({ error: "Autenticação necessária (x-api-key ou Authorization Bearer)" }, 401);
      }
      authSource = "painel";
    }

    // ── Parsear body ──
    const body = await req.json();

    // ── RECOTAR: body com os_id reutiliza OS existente ──
    if (body.os_id) {
      const { data: osExistente, error: osErr } = await supabase
        .from("os_cotacao")
        .select("id, api_key_id, dados_risco, placa, cpf")
        .eq("id", body.os_id)
        .maybeSingle();

      if (osErr || !osExistente) {
        return json({ error: "OS não encontrada" }, 404);
      }

      // Escopo: API key só recota OS criadas com a própria chave
      if (apiKeyId && osExistente.api_key_id !== apiKeyId) {
        return json({ error: "OS não encontrada" }, 404);
      }

      console.log(`[run-quote] RECOTAR OS=${osExistente.id} | placa=${osExistente.placa} | auth=${authSource}`);

      await supabase
        .from("os_cotacao")
        .update({ status: "cotando", error_message: null })
        .eq("id", osExistente.id);

      const railwayPayload = {
        ...osExistente.dados_risco,
        os_id: osExistente.id,
        placa: osExistente.placa,
        cpf: osExistente.cpf,
      };

      await dispararRailway(supabase, osExistente.id, railwayPayload, railwayUrl, railwaySecretToken);

      await supabase.from("audit_log").insert({
        api_key_id: apiKeyId,
        endpoint: "/functions/v1/run-quote",
        method: "POST",
        request_payload: { os_id: osExistente.id, auth: authSource, acao: "recotar" },
        response_status: 202,
      });

      return json({
        os_id: osExistente.id,
        status: "cotando",
        message: "Recotação disparada",
      }, 202);
    }

    // ── COTAÇÃO NOVA ──
    const novoFormato = !!body.segurado;

    let placa: string, cpf: string, nome: string, email: string, cep: string;

    if (novoFormato) {
      placa = body.veiculo?.placa || "";
      cpf = body.segurado?.cpf || "";
      nome = body.segurado?.nome || "";
      email = body.segurado?.email || "";
      cep = body.segurado?.cep || "";
    } else {
      placa = body.placa || "";
      cpf = body.cpf || "";
      nome = body.nome || "";
      email = body.email || "";
      cep = body.cep || "";
    }

    if (!placa || !cpf) {
      return json({ error: "placa e cpf são obrigatórios" }, 400);
    }

    const placaLimpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 7);
    const cpfLimpo = cpf.replace(/\D/g, "");

    let dadosRisco: any;
    if (novoFormato) {
      dadosRisco = {
        ramo: body.ramo || "auto",
        segurado: body.segurado,
        veiculo: body.veiculo,
        condutor: body.condutor || null,
        apoliceAnterior: body.apoliceAnterior || null,
      };
    } else {
      dadosRisco = body.dados_risco || {};
    }

    const { data: os, error: osError } = await supabase
      .from("os_cotacao")
      .insert({
        status: "pendente",
        placa: placaLimpa,
        cpf: cpfLimpo,
        nome: nome || null,
        email: email || null,
        cep: cep || null,
        dados_risco: dadosRisco,
        api_key_id: apiKeyId,
      })
      .select("id, status, placa, cpf, created_at")
      .single();

    if (osError) {
      console.error("[run-quote] Erro ao criar OS:", osError.message);
      return json({ error: "Erro ao criar OS", detail: osError.message }, 500);
    }

    console.log(
      `[run-quote] OS=${os.id} | placa=${os.placa} | formato=${novoFormato ? "v2" : "legado"} | auth=${authSource}`
    );

    await supabase.from("os_cotacao").update({ status: "cotando" }).eq("id", os.id);

    const railwayPayload = { ...body, os_id: os.id, placa: placaLimpa, cpf: cpfLimpo };
    await dispararRailway(supabase, os.id, railwayPayload, railwayUrl, railwaySecretToken);

    await supabase.from("audit_log").insert({
      api_key_id: apiKeyId,
      endpoint: "/functions/v1/run-quote",
      method: "POST",
      request_payload: {
        placa: placaLimpa,
        cpf: "***",
        ramo: dadosRisco.ramo || "auto",
        formato: novoFormato ? "v2" : "legado",
        auth: authSource,
      },
      response_status: 202,
    });

    return json({
      os_id: os.id,
      status: "pendente",
      formato: novoFormato ? "v2" : "legado",
      message: "Cotação disparada. Consulte GET /functions/v1/get-cotacoes?os_id=" + os.id,
    }, 202);
  } catch (err) {
    console.error("[run-quote] Erro inesperado:", err.message);
    return json({ error: "Erro interno", detail: err.message }, 500);
  }
});

async function dispararRailway(supabase: any, osId: string, payload: any, railwayUrl: string, token: string) {
  try {
    const res = await fetch(`${railwayUrl}/quote/auto`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secret-token": token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[run-quote] Railway respondeu ${res.status}: ${errText}`);
      await supabase
        .from("os_cotacao")
        .update({
          status: "erro",
          error_message: `Railway ${res.status}: ${errText.substring(0, 500)}`,
        })
        .eq("id", osId);
    } else {
      console.log(`[run-quote] Railway aceitou OS=${osId}`);
    }
  } catch (err) {
    console.error(`[run-quote] Erro ao chamar Railway: ${err.message}`);
    await supabase
      .from("os_cotacao")
      .update({
        status: "erro",
        error_message: `Falha na conexão com Railway: ${err.message}`,
      })
      .eq("id", osId);
  }
}