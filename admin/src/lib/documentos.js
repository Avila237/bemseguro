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
// O bucket é privado (só service_role lê direto) — o link assinado dá acesso
// temporário sem expor o arquivo publicamente.
export async function getSignedUrl(storagePath, bucket = BUCKET) {
  if (!storagePath) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message || 'Falha ao gerar o link do documento');
  return (data && data.signedUrl) || null;
}

// Anexa um novo documento: lê o arquivo como base64 e chama a Edge Function
// `extract-doc` (proxy server-side para o /extract/{cnh|crlv} do Railway). O
// token do Railway NUNCA vai para o browser — mesmo padrão de `lookup-placa` /
// `run-quote`. Devolve os dados extraídos pela IA ({ dados, confianca, ... }).
export async function anexarDocumento(osId, tipo, file) {
  const base64 = await fileParaBase64(file);
  const { data, error } = await supabase.functions.invoke('extract-doc', {
    body: { os_id: osId, tipo, base64, mimeType: file.type, filename: file.name },
  });
  if (error) throw new Error(error.message || 'Falha ao extrair o documento');
  return data;
}

function fileParaBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    r.onload = () => {
      const s = String(r.result || '');
      // Remove o prefixo "data:<mime>;base64," — fica só o conteúdo base64.
      resolve(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s);
    };
    r.readAsDataURL(file);
  });
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
