// Helpers de formatação e apresentação compartilhados.

export function BRL(v) {
  if (v == null || isNaN(v)) return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Máscara de CPF: 123.***.***-00 (preserva 3 primeiros e 2 últimos dígitos).
export function maskCPF(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length < 11) return cpf || '—';
  return `${d.slice(0, 3)}.***.***-${d.slice(9, 11)}`;
}

// Máscara progressiva de CPF/CNPJ para inputs (000.000.000-00 ou 00.000.000/0000-00).
export function formatCpfCnpj(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

// Máscara progressiva de telefone para inputs: (00) 00000-0000 / (00) 0000-0000.
export function formatTelefone(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

// Máscara progressiva de CEP: 00000-000.
export function formatCep(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

// Converte data ISO (YYYY-MM-DD, do input date) para BR (DD/MM/YYYY).
export function isoParaBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
}

// Tempo relativo a partir de um timestamp ISO: "agora", "8min atrás", "1h atrás", "2d atrás".
export function timeAgo(iso) {
  if (!iso) return '—';
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min atrás`;
  if (min < 1440) return `${Math.floor(min / 60)}h atrás`;
  return `${Math.floor(min / 1440)}d atrás`;
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
