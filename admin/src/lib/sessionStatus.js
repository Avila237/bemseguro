// Estado real da sessão Aggilizador, exposto pelo backend Railway em
// GET /session/status (público, sem auth — mesma abordagem do health check).
// Não traz tokens, só: { ativa, expira_em, ttl_segundos, ultima_renovacao }.

const RAILWAY_BASE = 'https://bemseguro-production.up.railway.app';
const URL_SESSION = `${RAILWAY_BASE}/session/status`;

// TTL total da sessão no backend (55 min) — usado para a barra de progresso.
export const TTL_TOTAL_S = 55 * 60;

export async function getSessionStatus() {
  const res = await fetch(URL_SESSION, { method: 'GET' });
  if (!res.ok) throw new Error(`/session/status respondeu ${res.status}`);
  return res.json();
}

// "MM:SS" a partir de segundos restantes (nunca negativo).
export function formatTTL(segundos) {
  const s = Math.max(0, Math.floor(segundos || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// Faixa visual (cor + classe de badge + rótulo) pelo tempo restante da sessão:
// verde >10min · amarelo 1–10min · vermelho expirada/quase expirando.
export function faixaSessao(estado) {
  if (!estado || !estado.ativa) {
    return { nivel: 'expirada', cor: 'var(--red)', tint: 'var(--st-erro-bg)', badge: 'st-erro', rotulo: 'Expirada' };
  }
  const ttl = estado.ttl_segundos || 0;
  if (ttl > 600) {
    return { nivel: 'ok', cor: 'var(--green)', tint: 'var(--st-cotado-bg)', badge: 'st-cotado', rotulo: 'Ativa' };
  }
  if (ttl > 60) {
    return { nivel: 'aviso', cor: 'var(--amber)', tint: 'var(--st-cancelada-bg)', badge: 'st-cancelada', rotulo: 'Expirando' };
  }
  return { nivel: 'critico', cor: 'var(--red)', tint: 'var(--st-erro-bg)', badge: 'st-erro', rotulo: 'Expira já' };
}
