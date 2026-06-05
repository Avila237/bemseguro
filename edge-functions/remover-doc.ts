// Edge Function: remover-doc
//
// Soft delete de um documento de uma OS (tela de revisão manual). NÃO apaga o
// arquivo do Storage — apenas marca `removido_em = now()` e `removido_por =
// user.id` (do JWT). O arquivo fica preservado para auditoria, e o painel mostra
// um histórico dos documentos removidos. A ação é registrada em `audit_log`.
//
// POST { documento_id }
// Auth: Authorization Bearer (JWT do painel — o gateway do Supabase valida o JWT;
// aqui também resolvemos o user.id para gravar `removido_por`).
// Resposta: 200 { success: true } | 4xx/5xx { error }
//
// Roda em Deno (não Node). APLICAÇÃO MANUAL: fazer deploy no Supabase (CLI/Studio).
// Migração necessária: db/migrations/009-soft-delete-documentos.sql
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (injetadas
// automaticamente pelo runtime de Edge Functions).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Autenticação necessária (Authorization Bearer)" }, 401);
  }

  let body: { documento_id?: string };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "Corpo JSON inválido" }, 400);
  }
  const documentoId = (body.documento_id || "").trim();
  if (!documentoId) return json({ error: "documento_id obrigatório" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("[remover-doc] SUPABASE_URL/ANON/SERVICE_ROLE não configurados");
    return json({ error: "Configuração do servidor incompleta" }, 500);
  }

  // Resolve o usuário do JWT (para gravar removido_por). Em Edge Function não há
  // sessão persistida: getUser() sem argumento devolve null — é preciso passar o
  // token explicitamente (extraído do header Authorization).
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Autorização (anti-IDOR): o documento precisa estar visível para o usuário sob
    // a RLS do painel (cliente `authed`, com o JWT) — NÃO a service_role. No piloto
    // a RLS de SELECT em documentos_os é `using(true)` (todo operador vê todas as
    // OS): a checagem garante existência/anti-probing e passa a respeitar qualquer
    // policy por-usuário futura automaticamente. Só então mutamos com a service_role
    // (necessária para gravar removido_por e para o insert em audit_log).
    const { data: doc, error: docErr } = await authed
      .from("documentos_os")
      .select("id")
      .eq("id", documentoId)
      .maybeSingle();
    if (docErr) {
      console.error("[remover-doc] consulta documentos_os falhou:", docErr.message);
      return json({ error: "Falha ao validar o documento" }, 500);
    }
    if (!doc) return json({ error: "Documento não encontrado" }, 404);

    // Marca o soft delete só se ainda estiver ativo (não re-carimba um já removido).
    const { data: rows, error } = await admin
      .from("documentos_os")
      .update({ removido_em: new Date().toISOString(), removido_por: userId })
      .eq("id", documentoId)
      .is("removido_em", null)
      .select("id");
    if (error) {
      console.error("[remover-doc] update falhou:", error.message);
      return json({ error: "Falha ao remover o documento" }, 500);
    }

    if (!rows || rows.length === 0) {
      // 0 linhas: já removido (a existência foi confirmada acima) — idempotente.
      return json({ success: true, already: true });
    }

    // Auditoria (auth:'painel' p/ aparecer no histórico do operador — ver perfil.js).
    await admin.from("audit_log").insert({
      endpoint: "/edge/remover-doc",
      method: "POST",
      request_payload: { documento_id: documentoId, auth: "painel" },
      response_status: 200,
    });

    console.log(`[remover-doc] documento removido id=${documentoId} por=${userId}`);
    return json({ success: true });
  } catch (err) {
    console.error("[remover-doc] Erro:", (err as Error).message);
    return json({ error: "Erro ao remover o documento" }, 500);
  }
});
