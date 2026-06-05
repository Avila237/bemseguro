import { supabase } from './supabase.js';

const BUCKET = 'documentos-clientes';

// Rótulos legíveis dos tipos de documento (documentos_os.tipo).
export const TIPO_LABEL = {
  cnh_segurado: 'CNH do segurado',
  cnh_condutor: 'CNH do condutor',
  crlv: 'CRLV',
};

// Tipos esperados de uma OS (ordem de exibição no trilho de documentos).
export const TIPOS_DOC = ['cnh_segurado', 'crlv', 'cnh_condutor'];

// Lista os documentos de uma OS (documentos_os filtrado por os_id, mais antigo
// primeiro). Inclui dados_extraidos + confianca_extracao para alimentar a tela.
export async function listarDocumentos(osId) {
  const { data, error } = await supabase
    .from('documentos_os')
    .select('id, tipo, storage_path, storage_bucket, mime_type, tamanho_bytes, dados_extraidos, confianca_extracao, confianca_por_campo, created_at')
    .eq('os_id', osId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Falha ao carregar os documentos');
  return data || [];
}

// Gera uma signed URL temporária (1h) para um arquivo do Storage privado.
//
// O bucket é PRIVADO e a anon key não o lê — chamar `createSignedUrl` direto do
// browser falhava com "Object not found" (o Storage nega e não vaza existência).
// A URL é gerada pela Edge Function `get-doc-url` (service_role no servidor),
// mesmo padrão de `lookup-placa` / `extract-doc`: o segredo nunca vai pro bundle.
//
// O `bucket` é decidido pelo servidor (fixo em `documentos-clientes`) — não é
// enviado pelo cliente (evita assinar bucket arbitrário com a service_role). O
// 2º parâmetro é mantido só por compatibilidade com a chamada do DocCard.
export async function getSignedUrl(storagePath, _bucket = BUCKET) {
  if (!storagePath) return null;
  // TEMP (remover após validar em produção): confere o path enviado.
  console.log('[signed-url] path:', storagePath);
  const { data, error } = await supabase.functions.invoke('get-doc-url', {
    body: { storage_path: storagePath },
  });
  if (error) throw new Error(error.message || 'Falha ao gerar o link do documento');
  return (data && data.signedUrl) || null;
}

// Anexa um novo documento: envia o arquivo binário (multipart/form-data) para a
// Edge Function `extract-doc` (proxy server-side para o /extract/{cnh|crlv} do
// Railway). O token do Railway NUNCA vai para o browser — mesmo padrão de
// `lookup-placa` / `run-quote`. Devolve os dados extraídos pela IA
// ({ success, tipo, documento_id, dados, confianca, ... }).
//
// IMPORTANTE: a `extract-doc` espera **multipart/form-data** com o `File`, então
// NÃO dá pra usar `supabase.functions.invoke` (que serializa o body como JSON e
// fazia a função responder "Esperado multipart/form-data"). Chamamos via `fetch`
// direto, montando o `FormData` e passando o JWT da sessão no `Authorization`.
export async function anexarDocumento(osId, tipo, file) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Não autenticado');

  const form = new FormData();
  form.append('os_id', osId);
  form.append('tipo', tipo);
  form.append('arquivo', file);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-doc`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      // NÃO setar Content-Type — o fetch define o multipart com boundary sozinho.
    },
    body: form,
  });

  // 422 = documento de tipo incorreto (ex.: CRLV no slot de CNH). A IA detectou e
  // a Edge Function já removeu o arquivo do Storage. Propaga erro estruturado para
  // a UI mostrar um alerta claro (sem fechar o modal).
  if (res.status === 422) {
    const erro = await res.json().catch(() => ({}));
    const e = new Error(erro.mensagem || erro.error || 'Documento de tipo incorreto');
    e.tipoIncorreto = true;
    e.tipoDetectado = erro.tipo_detectado;
    e.tipoEsperado = erro.tipo_esperado;
    throw e;
  }

  if (!res.ok) {
    const erro = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(erro.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Confiança de um campo específico extraído pela IA. Busca o documento do tipo
// indicado e devolve `confianca_por_campo[campo]` (fração 0–1) ou null se não
// houver (ex.: documento sem confiança por campo, ou campo vindo do formulário).
// Ex.: confiancaCampo(docs, 'cnh_segurado', 'cpf') → confiança do CPF na CNH.
export function confiancaCampo(documentos, tipoDoc, campo) {
  const doc = (documentos || []).find(d => d && d.tipo === tipoDoc);
  const mapa = doc && doc.confianca_por_campo;
  if (!mapa || typeof mapa !== 'object') return null;
  const v = Number(mapa[campo]);
  return Number.isFinite(v) ? v : null;
}

// Média das confianças individuais (confianca_extracao) dos documentos. Fração
// 0–1, ou null se nenhum documento tiver confiança numérica.
export function confiancaMedia(documentos) {
  const vals = (documentos || [])
    .filter(d => d && d.confianca_extracao != null)
    .map(d => Number(d.confianca_extracao))
    .filter(v => Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
