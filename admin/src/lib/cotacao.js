import { supabase } from './supabase.js';
import { isoParaBR } from './format.js';

const SEXO = { Masculino: 'M', Feminino: 'F' };
const ESTADO_CIVIL = {
  Solteiro: 'solteiro',
  Casado: 'casado',
  Divorciado: 'divorciado',
  'Viúvo': 'viuvo',
  'União Estável': 'uniao_estavel',
};

// Consulta a placa para auto-preencher o veículo. Passa pela Edge Function
// `lookup-placa` do Supabase (que guarda o secret token do Railway no servidor),
// em vez de chamar o Railway direto do browser — assim nenhum segredo vai pro bundle.
export async function lookupPlaca(placa) {
  const { data, error } = await supabase.functions.invoke('lookup-placa', { body: { placa } });
  if (error || !data || data.success === false) return { encontrado: false };
  return {
    encontrado: true,
    modelo: data.modelo || '',
    anoModelo: data.anoModelo != null ? String(data.anoModelo) : '',
    anoFabricacao: data.anoFabricacao != null ? String(data.anoFabricacao) : '',
    fipe: data.fipe || '',
    chassi: data.chassi || '',
    fabricante: data.fabricante != null ? String(data.fabricante) : '',
  };
}

// Monta o payload no formato v2 (blocos segurado/veiculo/condutor/apoliceAnterior).
export function montarPayloadV2(f) {
  const sexo = SEXO[f.sexo] || '';
  const estadoCivil = ESTADO_CIVIL[f.estadoCivil] || String(f.estadoCivil || '').toLowerCase();
  const nasc = isoParaBR(f.dataNascimento);
  const cpfSeg = String(f.cpf || '').replace(/\D/g, '');
  const condNome = f.condIgual ? f.nome : f.condutorNome;
  const condCpf = String((f.condIgual ? f.cpf : f.condutorCpf) || '').replace(/\D/g, '');

  return {
    ramo: f.ramo || 'auto',
    origem: f.origem || 'Manual',
    prioridade: f.prioridade || 'Média',
    observacoes: f.observacoes || '',
    segurado: {
      nome: f.nome || '',
      cpf: cpfSeg,
      dataNascimento: nasc,
      sexo,
      estadoCivil,
      cep: String(f.cepPernoite || '').replace(/\D/g, ''),
      email: f.email || '',
      telefone: f.telefone || '',
    },
    veiculo: {
      placa: String(f.placa || '').toUpperCase().replace(/\s/g, ''),
      modelo: f.modelo || '',
      anoModelo: f.anoModelo || '',
      anoFabricacao: f.anoFabricacao || '',
      chassi: f.chassi || '',
      fipe: f.fipe || '',
      fabricante: f.fabricante || '',
    },
    condutor: {
      nome: condNome || '',
      cpf: condCpf,
      dataNascimento: nasc,
      sexo,
      relacaoSegurado: f.condIgual ? 'segurado' : 'terceiro',
    },
    apoliceAnterior: {
      seguradora: f.apSeguradora || '',
      numero: f.apNumero || '',
      classeBonus: Number(f.apClasse) || 0,
      sinistro: !!f.apSinistro,
    },
  };
}

// Gera uma Idempotency-Key estável para uma sessão de formulário do painel.
// Formato: `painel-<uuid v4>`. Enviada no header Idempotency-Key ao run-quote —
// cliques duplos / retries com a mesma chave não criam OS duplicada.
export function gerarIdempotencyKey() {
  const c = globalThis.crypto || crypto;
  const uuid = c.randomUUID ? c.randomUUID() : uuidV4Fallback(c);
  return 'painel-' + uuid;
}

function uuidV4Fallback(c) {
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante
  const h = Array.from(b, x => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

// Cria a OS + dispara a cotação via Edge Function run-quote. Retorna o id criado.
// `idempotencyKey` (opcional) vai no header Idempotency-Key para tornar a criação
// idempotente (ver gerarIdempotencyKey).
export async function criarCotacao(payload, idempotencyKey) {
  const opts = { body: payload };
  if (idempotencyKey) opts.headers = { 'Idempotency-Key': idempotencyKey };
  const { data, error } = await supabase.functions.invoke('run-quote', opts);
  if (error) throw new Error(error.message || 'Falha ao criar a OS');
  const id = data?.id || data?.os_id || (data?.os && data.os.id) || null;
  return { id, data };
}
