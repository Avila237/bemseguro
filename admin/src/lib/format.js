// Helpers de formatação e apresentação compartilhados.

export function BRL(v) {
  if (v == null || isNaN(v)) return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Rótulo legível por status (enum do banco).
export const STATUS_LABEL = {
  pendente: 'Pendente',
  cotando: 'Cotando',
  cotado: 'Cotado',
  erro: 'Erro',
  cancelada: 'Cancelada',
};

// Nº de OS curto e estável a partir do uuid (não há coluna `numero` no banco).
export function numeroOS(id) {
  if (!id) return '—';
  return 'OS-' + String(id).replace(/-/g, '').slice(0, 6).toUpperCase();
}

// Extrai a descrição do veículo de dados_risco (suporta formato novo e legado).
export function veiculoDe(dadosRisco) {
  if (!dadosRisco) return '';
  const v = dadosRisco.veiculo;
  if (v && typeof v === 'object') return v.modelo || v.descricao || '';
  if (typeof v === 'string') return v;
  return dadosRisco.modelo || '';
}

// Cor + sigla determinísticas para uma seguradora (sem depender de query extra).
const PALETA_SEG = ['#003781', '#0033A0', '#006B3F', '#E60012', '#CC092F', '#F37021', '#0072CE', '#7A1FA0'];
export function segVisual(nome) {
  const txt = String(nome || '?').trim();
  const sigla = txt
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
  let hash = 0;
  for (let i = 0; i < txt.length; i++) hash = (hash * 31 + txt.charCodeAt(i)) >>> 0;
  return { sigla, cor: PALETA_SEG[hash % PALETA_SEG.length] };
}
