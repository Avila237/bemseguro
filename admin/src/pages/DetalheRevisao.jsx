import { useEffect, useMemo, useRef, useState } from 'react';
import Page from '../components/Page.jsx';
import { Card, Modal, StatusBadge, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { numeroOS, dataHora } from '../lib/format.js';
import { listarDocumentos, listarHistoricoDocumentos, getSignedUrl, anexarDocumento, removerDocumento, confiancaMedia, confiancaCampo, TIPO_LABEL, TIPOS_DOC } from '../lib/documentos.js';
import { dispararCotacaoAposRevisao } from '../lib/ordens.js';
import { ESTADO_CIVIL_MAP, SEXO_MAP } from '../lib/enums.js';

// Opções dos selects: exibe por extenso, persiste o código (slug/letra) que o
// backend reconhece (ver lib/enums.js — parseEstadoCivil / parseSexo).
const ECIVIL_OPTS = Object.entries(ESTADO_CIVIL_MAP).map(([value, label]) => ({ value, label }));
const SEXO_OPTS = Object.entries(SEXO_MAP).map(([value, label]) => ({ value, label }));

// Garante que o valor atual apareça no select: vazio → "Selecione…"; valor fora
// do padrão (ex.: vindo do CRM) entra como opção crua p/ não se perder/alterar.
function optionsComValor(base, value) {
  const v = value == null ? '' : String(value);
  if (!v) return [{ value: '', label: 'Selecione…' }, ...base];
  if (!base.some(o => o.value === v)) return [{ value: v, label: v }, ...base];
  return base;
}

// ── Confiança (limiares do briefing: >85 alta/verde · >75 média/azul · <75 revisar/âmbar) ──
function confNivel(pct) { return pct > 85 ? 'alta' : pct > 75 ? 'media' : 'revisar'; }
function confCor(pct) { return pct > 85 ? 'var(--green)' : pct > 75 ? 'var(--blue)' : 'var(--amber)'; }
function confTexto(pct) { const n = confNivel(pct); return n === 'alta' ? 'IA · alta' : n === 'media' ? 'IA · média' : 'IA · revisar'; }

const SEV = {
  alta:     { col: 'var(--red)',   ic: 'alert' },
  bloqueio: { col: 'var(--red)',   ic: 'xCircle' },
  media:    { col: 'var(--amber)', ic: 'info' },
};

const REVIEW = {
  fg: 'oklch(0.50 0.110 75)',
  bg: 'color-mix(in oklch, var(--amber) 14%, var(--surface))',
  border: 'color-mix(in oklch, var(--amber) 40%, transparent)',
};

// `iaKey` = chave em documentos_os.confianca_por_campo (como a IA nomeia o campo).
const CONDUTOR_DEFS = [
  { key: 'cNome', label: 'Nome completo', doc: 'cnh_condutor', iaKey: 'nome' },
  { key: 'cCpf', label: 'CPF', doc: 'cnh_condutor', mono: true, iaKey: 'cpf' },
  { key: 'cNasc', label: 'Data de nascimento', doc: 'cnh_condutor', mono: true, iaKey: 'data_nascimento' },
  { key: 'cSexo', label: 'Sexo', doc: 'cnh_condutor', iaKey: 'sexo', options: SEXO_OPTS },
];

// Anel de confiança (SVG).
function ConfRing({ v, size = 40, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = confCor(v);
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} strokeLinecap="round" />
      </svg>
      <span className="mono fw600" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: size * 0.27, color: col }}>{v}</span>
    </div>
  );
}

// Chip de confiança da IA ao lado do label do campo.
function ConfChip({ v }) {
  if (v == null) return null;
  const col = confCor(v);
  return (
    <span className="row center gap-4" title={'Confiança da extração: ' + v + '%'}
      style={{ fontSize: 10.5, fontWeight: 600, color: col, padding: '2px 6px', borderRadius: 99, background: 'color-mix(in oklch, ' + col + ' 12%, transparent)', border: '1px solid color-mix(in oklch, ' + col + ' 26%, transparent)', whiteSpace: 'nowrap' }}>
      <Icon.sparkle width={11} height={11} />{confTexto(v)} {v}%
    </span>
  );
}

// Campo editável com badge de confiança + destaque de problema (laranja).
// Campos com `f.options` viram <select> (estado civil, sexo): exibem o rótulo por
// extenso e persistem o código.
function RevField({ f, value, conf, problema, onChange }) {
  const accent = problema ? 'var(--brand)' : null;
  const wrap = accent ? {
    background: 'color-mix(in oklch, ' + accent + ' 7%, var(--surface))',
    border: '1px solid color-mix(in oklch, ' + accent + ' 30%, var(--border))',
    borderLeft: '3px solid ' + accent,
    borderRadius: 'var(--r-sm)', padding: '7px 9px 8px',
  } : { padding: '1px 0' };
  const accentBorder = accent ? { borderColor: 'color-mix(in oklch, ' + accent + ' 55%, var(--border-strong))' } : {};
  return (
    <div className="field" data-field={f.key} style={{ gap: 5, scrollMarginTop: 90, ...wrap }}>
      <div className="row between center" style={{ gap: 8 }}>
        <label className="label" style={{ fontSize: 12 }}>{f.label}</label>
        <ConfChip v={conf} />
      </div>
      {f.options ? (
        <select
          className="select"
          value={value ?? ''}
          aria-label={f.label}
          onChange={e => onChange(e.target.value)}
          style={{ height: 34, ...accentBorder }}
        >
          {optionsComValor(f.options, value).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          className={'input' + (f.mono ? ' mono' : '')}
          value={value ?? ''}
          aria-label={f.label}
          onChange={e => onChange(e.target.value)}
          style={{ height: 34, ...accentBorder }}
        />
      )}
      {problema && (
        <span className="row center gap-5" style={{ fontSize: 11.5, color: 'var(--brand-text)', fontWeight: 500 }}>
          <Icon.alert width={12} height={12} style={{ flex: 'none' }} />{problema}
        </span>
      )}
    </div>
  );
}

// Cartão de documento no trilho (ou estado "não enviado").
function DocCard({ tipo, doc, onRemover }) {
  const [abrindo, setAbrindo] = useState(false);
  const label = TIPO_LABEL[tipo] || tipo;

  async function ver() {
    if (!doc) return;
    setAbrindo(true);
    try {
      const url = await getSignedUrl(doc.storage_path, doc.storage_bucket);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (e) {
      alert('Não foi possível abrir o documento: ' + e.message);
    } finally {
      setAbrindo(false);
    }
  }

  if (!doc) {
    return (
      <div className="col gap-8" style={{ padding: '12px 13px', borderRadius: 'var(--r-md)', border: '1.5px dashed var(--border-strong)', background: 'var(--bg-sunken)' }}>
        <div className="row center gap-10">
          <div style={{ width: 34, height: 34, borderRadius: 9, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}>
            <Icon.user width={17} height={17} />
          </div>
          <div className="col" style={{ gap: 1, minWidth: 0 }}>
            <span className="fz13 fw600">{label}</span>
            <span className="fz11" style={{ color: 'var(--red)', fontWeight: 500 }}>Não enviado pelo CRM</span>
          </div>
        </div>
      </div>
    );
  }

  const pct = doc.confianca_extracao != null ? Math.round(Number(doc.confianca_extracao) * 100) : null;
  const arquivo = String(doc.storage_path || '').split('/').pop() || label;
  // dataHora → "dd/mm HH:mm:ss"; troca o separador por " · " para "{data} · {hora}".
  const ts = dataHora(doc.created_at);
  const tsFmt = ts.replace(' ', ' · ');
  // Card em DUAS linhas: a linha 2 fica embaixo da 1 (container em coluna), então
  // o badge de confiança não sobrepõe a metadata e os botões não espremem o nome.
  return (
    <div className="col gap-8" style={{ padding: '11px 12px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
      {/* Linha 1: ícone + (tipo + nome do arquivo) + badge de confiança */}
      <div className="row center gap-10">
        <div style={{ width: 36, height: 36, borderRadius: 9, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--blue-tint)', color: 'var(--blue-text)' }}>
          <Icon.doc width={18} height={18} />
        </div>
        <div className="col grow" style={{ gap: 1, minWidth: 0 }}>
          <span className="fz13 fw600" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
          <span className="mono fz11 muted" title={arquivo} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{arquivo}</span>
        </div>
        {pct != null && <ConfRing v={pct} size={36} />}
      </div>
      {/* Linha 2: metadata (esquerda, cinza) + ações (direita) */}
      <div className="row between center gap-8">
        <span className="fz11 muted" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pct != null ? `Extração ${tsFmt}` : tsFmt}
        </span>
        <div className="row center gap-6" style={{ flex: 'none' }}>
          <button className="btn btn-secondary btn-sm" onClick={ver} disabled={abrindo}>
            <Icon.eye /> Ver <Icon.external />
          </button>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemover && onRemover(doc)}
            title="Remover documento" aria-label="Remover documento" style={{ color: 'var(--red)' }}>
            <Icon.trash width={15} height={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Rótulo do tipo-base de documento que a IA reporta na detecção de tipo incorreto.
const TIPO_BASE_LABEL = { cnh: 'CNH', crlv: 'CRLV', rg: 'RG', outro: 'outro documento' };
const tipoBaseLbl = (t) => TIPO_BASE_LABEL[t] || t || 'documento';

// Modal de anexar documento (upload → extração da IA).
function UploadModal({ open, onClose, tipoFaltando, onExtraido }) {
  const [tipo, setTipo] = useState(tipoFaltando || 'cnh_condutor');
  const [file, setFile] = useState(null);
  const [erro, setErro] = useState('');
  const [tipoErro, setTipoErro] = useState(null); // { detectado, esperado } — documento de tipo incorreto
  const [fase, setFase] = useState('idle'); // idle | extraindo | erro
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setTipo(tipoFaltando || 'cnh_condutor'); setFile(null); setErro(''); setTipoErro(null); setFase('idle'); }
  }, [open, tipoFaltando]);

  const TIPOS_OK = /\.(jpe?g|png|pdf)$/i;

  function escolher(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // Novo arquivo escolhido → limpa erros anteriores (inclusive o de tipo incorreto).
    setErro(''); setTipoErro(null);
    if (!TIPOS_OK.test(f.name)) { setErro('Formato não suportado. Aceitos: JPG, PNG ou PDF.'); setFile(null); return; }
    if (f.size > 10 * 1024 * 1024) { setErro('Arquivo acima de 10 MB. Reduza a resolução e tente de novo.'); setFile(null); return; }
    setFile(f);
  }

  async function confirmar() {
    if (!file) { setErro('Selecione um arquivo.'); return; }
    setFase('extraindo'); setErro(''); setTipoErro(null);
    try {
      await onExtraido(tipo, file);
      onClose();
    } catch (e) {
      // Documento de tipo incorreto: alerta dedicado, NÃO fecha o modal nem limpa
      // os campos — o operador corrige (anexa o documento certo) e tenta de novo.
      if (e && e.tipoIncorreto) {
        setTipoErro({ detectado: e.tipoDetectado, esperado: e.tipoEsperado });
      } else {
        setErro(e.message || 'Falha na extração.');
      }
      setFase('idle');
    }
  }

  const extraindo = fase === 'extraindo';

  return (
    <Modal open={open} onClose={extraindo ? () => {} : onClose} title="Anexar novo documento" width={520}
      footer={
        <>
          <span className="fz12 muted">JPG, PNG ou PDF · até 10 MB</span>
          <div className="row center gap-8">
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={extraindo}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={confirmar} disabled={extraindo || !file}>
              {extraindo ? <span className="spin" style={{ width: 13, height: 13, border: '2px solid color-mix(in oklch, #fff 45%, transparent)', borderTopColor: '#fff', borderRadius: 99 }} /> : <Icon.sparkle />}
              {extraindo ? 'Extraindo…' : 'Anexar e extrair'}
            </button>
          </div>
        </>
      }
    >
      <div className="col gap-14">
        <div className="field">
          <label className="label">Tipo de documento</label>
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value)} disabled={extraindo} aria-label="Tipo de documento">
            {TIPOS_DOC.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
          </select>
        </div>
        <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" style={{ display: 'none' }} onChange={escolher} />
        <button
          type="button"
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={extraindo}
          style={{ border: '1.5px dashed var(--border-strong)', background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', padding: '24px 20px', cursor: 'pointer', textAlign: 'center', font: 'inherit' }}
        >
          <div className="col center gap-8">
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--blue)' }}><Icon.download width={20} height={20} /></div>
            <span className="fz13 fw600">{file ? file.name : 'Clique para selecionar o arquivo'}</span>
            <span className="fz12 muted">A IA lê o documento e preenche os campos automaticamente</span>
          </div>
        </button>
        {extraindo && (
          <div className="row center gap-10 fz13" style={{ color: 'var(--brand-text)' }}>
            <Icon.sparkle className="spin" width={16} height={16} />Extraindo dados com a IA…
          </div>
        )}
        {tipoErro && (
          <div className="row center gap-10" role="alert" style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--red-tint)', border: '1.5px solid color-mix(in oklch, var(--red) 45%, transparent)' }}>
            <Icon.alert width={20} height={20} style={{ color: 'var(--red)', flex: 'none' }} />
            <span className="fz13" style={{ color: 'var(--st-erro-fg)', fontWeight: 500 }}>
              {`⚠️ Documento incorreto detectado. Você anexou um ${tipoBaseLbl(tipoErro.detectado)}, mas selecionou ${tipoBaseLbl(tipoErro.esperado)}. Verifique e tente novamente.`}
            </span>
          </div>
        )}
        {erro && (
          <div className="row center gap-8" style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--red-tint)', border: '1px solid color-mix(in oklch, var(--red) 26%, transparent)' }}>
            <Icon.alert width={16} height={16} style={{ color: 'var(--red)', flex: 'none' }} />
            <span className="fz12" style={{ color: 'var(--st-erro-fg)' }}>{erro}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Construção dos campos a partir de dados_risco ──
function construirCampos(os) {
  const dr = os.dados_risco || {};
  const seg = dr.segurado || {};
  const veic = (dr.veiculo && typeof dr.veiculo === 'object') ? dr.veiculo : {};
  const cond = (dr.condutor && typeof dr.condutor === 'object') ? dr.condutor : null;

  const segurado = [
    { key: 'nome', label: 'Nome completo', doc: 'cnh_segurado', iaKey: 'nome', value: seg.nome ?? os.nome ?? '' },
    { key: 'cpf', label: 'CPF', doc: 'cnh_segurado', iaKey: 'cpf', mono: true, value: seg.cpf ?? os.cpf ?? '' },
    { key: 'nascimento', label: 'Data de nascimento', doc: 'cnh_segurado', iaKey: 'data_nascimento', mono: true, value: seg.dataNascimento ?? seg.data_nascimento ?? '' },
    { key: 'sexo', label: 'Sexo', doc: 'cnh_segurado', iaKey: 'sexo', options: SEXO_OPTS, value: seg.sexo ?? '' },
    { key: 'estadoCivil', label: 'Estado civil', doc: null, options: ECIVIL_OPTS, value: seg.estadoCivil ?? seg.estado_civil ?? dr.estado_civil ?? '' },
    { key: 'cep', label: 'CEP de pernoite', doc: null, mono: true, value: seg.cep ?? os.cep ?? '' },
    { key: 'validadeCnh', label: 'Validade da CNH', doc: 'cnh_segurado', iaKey: 'validade_cnh', mono: true, value: seg.validade_cnh ?? '' },
  ];
  const veiculo = [
    { key: 'placa', label: 'Placa', doc: 'crlv', iaKey: 'placa', mono: true, value: veic.placa ?? os.placa ?? '' },
    { key: 'chassi', label: 'Chassi', doc: 'crlv', iaKey: 'chassi', mono: true, value: veic.chassi ?? '' },
    { key: 'marca', label: 'Marca', doc: 'crlv', iaKey: 'marca', value: veic.marca ?? '' },
    { key: 'modelo', label: 'Modelo', doc: 'crlv', iaKey: 'modelo', value: veic.modelo ?? '' },
    { key: 'anoFab', label: 'Ano fabricação', doc: 'crlv', iaKey: 'ano_fabricacao', mono: true, value: veic.anoFabricacao ?? veic.anoFab ?? '' },
    { key: 'anoMod', label: 'Ano modelo', doc: 'crlv', iaKey: 'ano_modelo', mono: true, value: veic.anoModelo ?? veic.anoMod ?? '' },
    { key: 'fipe', label: 'Código FIPE', doc: 'crlv', iaKey: 'codigo_fipe', mono: true, value: veic.fipe ?? '' },
  ];
  const condutor = cond ? CONDUTOR_DEFS.map(f => ({
    ...f,
    value: f.key === 'cNome' ? (cond.nome ?? '') : f.key === 'cCpf' ? (cond.cpf ?? '') : f.key === 'cNasc' ? (cond.dataNascimento ?? cond.data_nascimento ?? '') : (cond.sexo ?? ''),
  })) : [];
  return { segurado, veiculo, condutor };
}

function valoresIniciais(campos) {
  const v = {};
  [...campos.segurado, ...campos.veiculo, ...campos.condutor].forEach(f => { v[f.key] = f.value; });
  return v;
}

// Chaves de campo (da tela) que pertencem a cada bloco/documento — usado para
// LIMPAR o bloco correspondente ao remover um documento. Espelha camposExtraidos.
const CAMPOS_POR_TIPO = {
  cnh_segurado: ['nome', 'cpf', 'nascimento', 'sexo', 'validadeCnh'],
  crlv: ['placa', 'chassi', 'marca', 'modelo', 'anoFab', 'anoMod', 'fipe'],
  cnh_condutor: ['cNome', 'cCpf', 'cNasc', 'cSexo'],
};

// Mapeia um campo extraído (chaves da IA) para as chaves de campo da tela.
function camposExtraidos(tipo, dados) {
  dados = dados || {};
  if (tipo === 'crlv') {
    return { placa: dados.placa, chassi: dados.chassi, marca: dados.marca, modelo: dados.modelo, anoFab: dados.ano_fabricacao, anoMod: dados.ano_modelo, fipe: dados.codigo_fipe ?? dados.fipe };
  }
  if (tipo === 'cnh_condutor') {
    return { cNome: dados.nome, cCpf: dados.cpf, cNasc: dados.data_nascimento, cSexo: dados.sexo };
  }
  return { nome: dados.nome, cpf: dados.cpf, nascimento: dados.data_nascimento, sexo: dados.sexo, validadeCnh: dados.validade_cnh };
}

function limparUndefined(obj) {
  const o = {};
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null) o[k] = v; });
  return o;
}

// Mapeia uma linha de error_message para { field, sev, label } (pill + destaque).
function mapearProblema(texto) {
  const t = String(texto).toLowerCase();
  const conf = t.match(/campo\s+([a-z_]+)/);
  if (t.includes('baixa confian') && conf) {
    const map = { cpf: 'cpf', placa: 'placa', data_nascimento: 'nascimento', chassi: 'chassi', nome: 'nome' };
    const field = map[conf[1]] || null;
    const lbl = { cpf: 'CPF', placa: 'Placa', nascimento: 'Nascimento', chassi: 'Chassi', nome: 'Nome' }[field] || 'Confiança baixa';
    return { texto, field, sev: 'media', label: lbl };
  }
  if (t.includes('condutor') && (t.includes('não foi') || t.includes('nao foi') || t.includes('faltando') || t.includes('não enviada') || t.includes('nao enviada'))) {
    return { texto, field: null, sev: 'bloqueio', label: 'CNH do condutor' };
  }
  if (t.includes('condutor') && t.includes('vencida')) return { texto, field: null, sev: 'alta', label: 'CNH do condutor' };
  if (t.includes('vencida')) return { texto, field: 'validadeCnh', sev: 'alta', label: 'Validade da CNH' };
  if (t.includes('fipe') || t.includes('identificar o veículo') || t.includes('identificar o veiculo')) return { texto, field: 'placa', sev: 'alta', label: 'Veículo / placa' };
  if (t.includes('cpf')) return { texto, field: 'cpf', sev: 'alta', label: 'CPF' };
  if (t.includes('nome')) return { texto, field: 'nome', sev: 'media', label: 'Nome' };
  if (t.includes('chassi')) return { texto, field: 'chassi', sev: 'media', label: 'Chassi' };
  if (t.includes('modelo')) return { texto, field: 'modelo', sev: 'media', label: 'Modelo' };
  if (t.includes('placa')) return { texto, field: 'placa', sev: 'media', label: 'Placa' };
  return { texto, field: null, sev: 'media', label: texto.length > 32 ? texto.slice(0, 30) + '…' : texto };
}

function soDigitos(v) { return String(v ?? '').replace(/\D/g, ''); }

// Validações cruzadas calculadas NO FRONTEND a partir dos dados extraídos dos 3
// documentos (documentos_os.dados_extraidos). Recalculadas sempre que um documento
// é (re)anexado. Devolve problemas no mesmo formato de `mapearProblema`, marcados
// com `front: true` (sempre pendentes enquanto a condição valer — não dependem de
// edição de campo). Somam-se às inconsistências vindas do backend (error_message).
function validacoesCruzadasFront(docsByTipo) {
  const probs = [];
  const seg = docsByTipo.cnh_segurado && docsByTipo.cnh_segurado.dados_extraidos;
  const cond = docsByTipo.cnh_condutor && docsByTipo.cnh_condutor.dados_extraidos;
  const crlv = docsByTipo.crlv && docsByTipo.crlv.dados_extraidos;

  // Condutor == segurado (mesmo CPF), mas o CRLV diz que o dono é outra pessoa →
  // provável que o dono do veículo seja o segurado correto (dono_eh_condutor=false).
  if (seg && cond && crlv) {
    const segCpf = soDigitos(seg.cpf);
    const condCpf = soDigitos(cond.cpf);
    const donoCpf = soDigitos(crlv.cpf_proprietario);
    if (segCpf && condCpf && donoCpf && segCpf === condCpf && donoCpf !== segCpf) {
      const nome = crlv.nome_proprietario || '—';
      probs.push({
        front: true,
        field: null,
        sev: 'media',
        label: 'Dono do veículo',
        texto: `CNH do condutor é igual à CNH do segurado, mas o CRLV indica que o proprietário do veículo é ${nome} (CPF ${donoCpf}). Provavelmente o segurado correto é o dono do veículo. Verifique se o formulário deveria ter dono_eh_condutor=false.`,
      });
    }
  }
  return probs;
}

function jump(key) {
  if (typeof document === 'undefined') return;
  const el = document.querySelector('[data-field="' + key + '"]');
  if (!el) return;
  try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { /* jsdom */ }
  el.style.transition = 'box-shadow .3s';
  el.style.boxShadow = '0 0 0 3px var(--brand-tint-2)';
  setTimeout(() => { try { el.style.boxShadow = 'none'; } catch (_) {} }, 1100);
}

function Bloco({ icon, title, n, action, children }) {
  const I = Icon[icon];
  return (
    <Card pad={false}>
      <div className="card-head" style={{ padding: '11px 16px' }}>
        <div className="row center gap-8 card-title">
          {I && <I width={15} height={15} style={{ color: 'var(--text-mute)' }} />}{title}
          {n != null && <span className="muted fw500" style={{ fontSize: 11 }}>· {n}</span>}
        </div>
        {action}
      </div>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 11, alignItems: 'start' }}>{children}</div>
      </div>
    </Card>
  );
}

export default function DetalheRevisao({ os, navigate, onCancelar, cancelando, reload }) {
  const campos0 = useMemo(() => construirCampos(os), [os]);
  const baseVals = useRef(valoresIniciais(campos0)).current;

  const [fields, setFields] = useState(campos0);
  const [vals, setVals] = useState(() => valoresIniciais(campos0));
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [tipoAnexar, setTipoAnexar] = useState(null); // tipo pré-selecionado ao reabrir o anexo
  const [enviando, setEnviando] = useState(false);
  const [erroDisparo, setErroDisparo] = useState('');
  const [historico, setHistorico] = useState([]);
  const [histAberto, setHistAberto] = useState(false);
  const [docRemover, setDocRemover] = useState(null); // documento aguardando confirmação de remoção
  const [removendo, setRemovendo] = useState(false);
  const [erroRemocao, setErroRemocao] = useState('');

  async function carregarDocs() {
    setDocsLoading(true);
    try {
      setDocs(await listarDocumentos(os.id));
    } catch (e) {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }
  async function carregarHistorico() {
    try {
      setHistorico(await listarHistoricoDocumentos(os.id));
    } catch (e) {
      setHistorico([]);
    }
  }
  useEffect(() => { carregarDocs(); carregarHistorico(); /* eslint-disable-next-line */ }, [os.id]);

  const removidos = useMemo(() => (historico || []).filter(d => d.removido_em), [historico]);

  const docsByTipo = useMemo(() => {
    const m = {};
    docs.forEach(d => { m[d.tipo] = d; });
    return m;
  }, [docs]);

  // Inconsistências do backend (error_message) + validações cruzadas do frontend
  // (recalculadas a partir dos dados extraídos dos documentos anexados).
  const problemasMsg = useMemo(
    () => String(os.error_message || '').split('\n').map(s => s.trim()).filter(Boolean).map(mapearProblema),
    [os.error_message]
  );
  const problemasFront = useMemo(() => validacoesCruzadasFront(docsByTipo), [docsByTipo]);
  const problemas = useMemo(() => [...problemasMsg, ...problemasFront], [problemasMsg, problemasFront]);

  // Problema "resolvido": campo editado (≠ valor inicial), ou — quando não tem
  // campo (ex.: CNH do condutor faltando) — quando o documento do condutor chega.
  // Validações de frontend (`front`) são recalculadas dos documentos: enquanto
  // aparecem, estão pendentes (somem sozinhas quando a condição deixa de valer).
  const resolvido = (p) => {
    if (p.front) return false;
    if (p.field) return vals[p.field] !== baseVals[p.field];
    return !!docsByTipo.cnh_condutor;
  };
  const pendentes = problemas.filter(p => !resolvido(p));
  const pendenciasCriticas = pendentes.filter(p => p.sev === 'alta' || p.sev === 'bloqueio');

  const editadosCount = Object.keys(vals).filter(k => vals[k] !== baseVals[k]).length;

  // Mapa campo → problema (para destacar o input).
  const problemaPorCampo = useMemo(() => {
    const m = {};
    problemas.forEach(p => { if (p.field && !resolvido(p)) m[p.field] = p.texto; });
    return m;
    /* eslint-disable-next-line */
  }, [problemas, vals, docsByTipo]);

  const setVal = (k, v) => { setVals(s => ({ ...s, [k]: v })); if (erroDisparo) setErroDisparo(''); };

  // Confiança fiel por campo: usa confianca_por_campo (a IA retorna por campo).
  // Fallback para a média do documento (docs antigos sem confianca_por_campo).
  // Campos do formulário (sem `doc`/`iaKey`) não têm badge.
  function confDe(field) {
    if (!field.doc) return null;
    if (field.iaKey) {
      const c = confiancaCampo(docs, field.doc, field.iaKey);
      if (c != null) return Math.round(c * 100);
    }
    const d = docsByTipo[field.doc];
    if (d && d.confianca_extracao != null) return Math.round(Number(d.confianca_extracao) * 100);
    return null;
  }

  const media = confiancaMedia(docs);
  const mediaPct = media != null ? Math.round(media * 100) : null;

  async function onExtraido(tipo, file) {
    const data = await anexarDocumento(os.id, tipo, file);
    // Usa o tipo REAL retornado pela Edge Function (autoritativo) para decidir o
    // bloco a preencher — anexar CNH do condutor NÃO pode sobrescrever o Segurado,
    // e vice-versa. `camposExtraidos` mapeia cada tipo só para as chaves do seu
    // bloco (cnh_segurado→segurado, cnh_condutor→condutor, crlv→veículo).
    const tipoReal = (data && data.tipo) || tipo;
    const novos = limparUndefined(camposExtraidos(tipoReal, data && data.dados));
    setVals(s => ({ ...s, ...novos }));
    if (tipoReal === 'cnh_condutor' && fields.condutor.length === 0) {
      setFields(s => ({ ...s, condutor: CONDUTOR_DEFS.map(f => ({ ...f, value: novos[f.key] ?? '' })) }));
    }
    await carregarDocs();
    await carregarHistorico();
  }

  // Confirma o soft delete do documento em `docRemover`: marca removido (Edge
  // Function), limpa os campos do bloco correspondente, recarrega ativos +
  // histórico (recalcula as validações cruzadas) e reabre o anexar com o tipo
  // pré-selecionado para o operador subir o documento certo.
  async function confirmarRemocao() {
    if (!docRemover || removendo) return;
    const tipo = docRemover.tipo;
    setRemovendo(true);
    setErroRemocao('');
    try {
      await removerDocumento(docRemover.id);
      // Limpa os campos do bloco correspondente (mantém os campos de formulário).
      const keys = CAMPOS_POR_TIPO[tipo] || [];
      if (keys.length) setVals(s => { const n = { ...s }; keys.forEach(k => { n[k] = ''; }); return n; });
      // Condutor removido → volta ao estado "Faltando" (bloco vazio).
      if (tipo === 'cnh_condutor') setFields(s => ({ ...s, condutor: [] }));
      setDocRemover(null);
      await carregarDocs();        // recarrega ativos → recalcula validações cruzadas
      await carregarHistorico();   // atualiza o collapse de removidos
      setTipoAnexar(tipo);
      setUploadOpen(true);         // reabre o anexar com o tipo pré-selecionado
    } catch (e) {
      setErroRemocao(e.message || 'Falha ao remover o documento.');
    } finally {
      setRemovendo(false);
    }
  }

  function montarDadosRisco() {
    const dr = { ...(os.dados_risco || {}) };
    const seg = (dr.segurado && typeof dr.segurado === 'object') ? dr.segurado : {};
    const veic = (dr.veiculo && typeof dr.veiculo === 'object') ? dr.veiculo : {};
    dr.segurado = { ...seg, nome: vals.nome, cpf: vals.cpf, dataNascimento: vals.nascimento, sexo: vals.sexo, estadoCivil: vals.estadoCivil, cep: vals.cep, validade_cnh: vals.validadeCnh };
    dr.veiculo = { ...veic, placa: vals.placa, chassi: vals.chassi, marca: vals.marca, modelo: vals.modelo, anoFabricacao: vals.anoFab, anoModelo: vals.anoMod, fipe: vals.fipe };
    if (fields.condutor.length > 0) {
      dr.condutor = { ...(dr.condutor || {}), nome: vals.cNome, cpf: vals.cCpf, dataNascimento: vals.cNasc, sexo: vals.cSexo, relacaoSegurado: 'outro' };
    }
    return dr;
  }

  async function handleDisparar() {
    if (enviando || pendenciasCriticas.length > 0) return;
    setEnviando(true);
    setErroDisparo('');
    try {
      await dispararCotacaoAposRevisao(os.id, {
        dados_risco: montarDadosRisco(),
        placa: String(vals.placa || '').toUpperCase().replace(/\s/g, ''),
        cpf: String(vals.cpf || '').replace(/\D/g, ''),
      });
      if (reload) await reload(); // a OS vira "cotando" → a tela troca para o modo normal
    } catch (e) {
      setErroDisparo(e.message || 'Falha ao disparar a cotação.');
      setEnviando(false);
    }
  }

  const renderField = (f) => (
    <RevField key={f.key} f={f} value={vals[f.key]} conf={confDe(f)} problema={problemaPorCampo[f.key]} onChange={v => setVal(f.key, v)} />
  );

  const editedLabel = editadosCount === 0 ? 'Nenhuma alteração ainda' : `${editadosCount} ${editadosCount === 1 ? 'campo alterado' : 'campos alterados'}`;

  return (
    <Page title={<span className="mono">{numeroOS(os.id)}</span>} subtitle={`${os.placa || '—'} · ${vals.nome || '—'}`} max={1320}>
      <button onClick={() => navigate('/ordens')} className="row center gap-6 fz13 fw500" style={{ border: 'none', background: 'transparent', color: 'var(--text-soft)', cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        <Icon.chevLeft width={16} height={16} />Voltar para Ordens de Serviço
      </button>

      <div className="row between center wrap gap-12" style={{ marginBottom: 14 }}>
        <div className="row center gap-10 wrap">
          <StatusBadge status="revisao_manual" />
          <span className="tag tag-blue"><Icon.car width={13} height={13} />Auto</span>
          <span className="tag"><Icon.link width={12} height={12} />Origem: CRM</span>
        </div>
      </div>

      {erroDisparo && (
        <div className="row center gap-10" style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 'var(--r-md)', background: 'var(--red-tint)', border: '1px solid color-mix(in oklch, var(--red) 26%, transparent)' }}>
          <Icon.alert width={18} height={18} style={{ color: 'var(--red)', flex: 'none' }} />
          <span className="fz13" style={{ color: 'var(--st-erro-fg)' }}><b>Não foi possível disparar.</b> {erroDisparo}</span>
        </div>
      )}

      {/* Banner de inconsistências + chips de atalho */}
      {problemas.length > 0 && (
        <div className="row center between wrap gap-12" style={{ marginBottom: 14, padding: '11px 16px', borderRadius: 'var(--r-md)', background: REVIEW.bg, border: '1px solid ' + REVIEW.border }}>
          <div className="row center gap-10" style={{ minWidth: 0 }}>
            <Icon.alert width={18} height={18} style={{ color: REVIEW.fg, flex: 'none' }} />
            <span className="fz13" style={{ color: REVIEW.fg }}>
              <b>{problemas.length} {problemas.length === 1 ? 'inconsistência' : 'inconsistências'}</b> detectadas pela validação automática — clique para revisar:
            </span>
          </div>
          <div className="row center gap-6 wrap" style={{ justifyContent: 'flex-end' }}>
            {problemas.map((p, i) => {
              const s = SEV[p.sev] || SEV.media;
              const onClick = p.field ? () => jump(p.field) : () => setUploadOpen(true);
              const I = Icon[s.ic];
              return (
                <button key={i} onClick={onClick} title={p.texto} className="row center gap-5"
                  style={{ padding: '4px 9px', borderRadius: 99, cursor: 'pointer', font: 'inherit', fontSize: 11.5, fontWeight: 600, color: s.col, background: 'color-mix(in oklch, ' + s.col + ' 11%, var(--surface))', border: '1px solid color-mix(in oklch, ' + s.col + ' 26%, transparent)' }}>
                  {I && <I width={12} height={12} />}{p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(288px, 324px)', gap: 16, alignItems: 'start' }}>
        {/* ESQUERDA — formulário denso */}
        <div className="col gap-14" style={{ minWidth: 0 }}>
          <Bloco icon="user" title="Segurado" n={fields.segurado.length + ' campos'}>
            {fields.segurado.map(renderField)}
          </Bloco>
          <Bloco icon="car" title="Veículo" n={fields.veiculo.length + ' campos'}>
            {fields.veiculo.map(renderField)}
          </Bloco>
          <Bloco icon="users" title="Condutor"
            action={fields.condutor.length > 0
              ? <span className="tag tag-blue">Diferente do segurado</span>
              : <span className="tag" style={{ color: 'var(--red)', background: 'var(--red-tint)', borderColor: 'color-mix(in oklch, var(--red) 22%, transparent)' }}>Faltando</span>}>
            {fields.condutor.length === 0 ? (
              <div style={{ gridColumn: '1 / -1' }} className="row center between wrap gap-10">
                <span className="muted fz12" style={{ maxWidth: 320 }}>Condutor não identificado — anexe a CNH do condutor para a IA preencher os campos.</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setUploadOpen(true)}><Icon.plus /> Anexar</button>
              </div>
            ) : fields.condutor.map(renderField)}
          </Bloco>

          {/* Rodapé de ações (sticky) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--sh-md)', position: 'sticky', bottom: 16, zIndex: 5 }}>
            <div className="row center gap-10" style={{ minWidth: 0 }}>
              <span className="row center gap-6 fz12 muted"><Icon.clock width={14} height={14} />{editedLabel}</span>
              {pendentes.length > 0 && (
                <span className="tag" style={{ color: 'var(--st-erro-fg)', background: 'var(--red-tint)', borderColor: 'color-mix(in oklch, var(--red) 24%, transparent)' }}>
                  {pendentes.length} {pendentes.length === 1 ? 'pendência' : 'pendências'}
                </span>
              )}
            </div>
            <div className="row center gap-8">
              <button className="btn btn-danger btn-sm" onClick={onCancelar} disabled={cancelando || enviando}>
                {cancelando ? <Icon.refresh className="spin" /> : <Icon.x />} Cancelar OS
              </button>
              <button className="btn btn-primary" onClick={handleDisparar} disabled={enviando || pendenciasCriticas.length > 0}
                title={pendenciasCriticas.length > 0 ? 'Resolva as pendências críticas antes de cotar' : undefined}>
                {enviando ? <span className="spin" style={{ width: 14, height: 14, border: '2px solid color-mix(in oklch, #fff 45%, transparent)', borderTopColor: '#fff', borderRadius: 99 }} /> : <Icon.bolt />}
                {enviando ? 'Disparando…' : 'Disparar cotação'}
              </button>
            </div>
          </div>
        </div>

        {/* DIREITA — trilho de documentos (sticky) */}
        <div className="col gap-12" style={{ position: 'sticky', top: 16, minWidth: 0 }}>
          {/* Confiança média */}
          <div className="row center gap-12" style={{ padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            {mediaPct != null ? <ConfRing v={mediaPct} size={46} stroke={5} /> : (
              <div style={{ width: 46, height: 46, borderRadius: 99, border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--text-faint)', flex: 'none' }}><Icon.sparkle width={18} height={18} /></div>
            )}
            <div className="col" style={{ gap: 1 }}>
              <span className="fz11 muted fw500" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confiança média</span>
              <span className="fw600" style={{ fontSize: 14, color: mediaPct != null ? confCor(mediaPct) : 'var(--text-mute)' }}>
                {mediaPct != null ? `${mediaPct}% · extração da IA` : 'sem documentos'}
              </span>
            </div>
          </div>

          <Card pad={false}>
            <div className="card-head" style={{ padding: '11px 16px' }}>
              <div className="row center gap-8 card-title"><Icon.doc width={15} height={15} style={{ color: 'var(--text-mute)' }} />Documentos</div>
              <span className="tag">{docs.filter(d => TIPOS_DOC.includes(d.tipo)).length}/3</span>
            </div>
            <div style={{ padding: '12px 14px' }} className="col gap-10">
              {docsLoading ? (
                <><Skeleton height={56} /><Skeleton height={56} /></>
              ) : (
                TIPOS_DOC.map(tipo => <DocCard key={tipo} tipo={tipo} doc={docsByTipo[tipo] || null} onRemover={setDocRemover} />)
              )}
              <button onClick={() => { setTipoAnexar(null); setUploadOpen(true); }} className="row center gap-7" style={{ justifyContent: 'center', padding: '10px', borderRadius: 'var(--r-sm)', border: '1px dashed var(--border-strong)', background: 'transparent', cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 12.5, font: 'inherit' }}>
                <Icon.plus width={14} height={14} />Anexar novo documento
              </button>
              <span className="fz11 muted" style={{ textAlign: 'center', lineHeight: 1.4 }}>JPG, PNG ou PDF · até 10 MB<br />Anexar dispara nova extração da IA</span>
            </div>
          </Card>

          {/* Histórico de documentos removidos (soft delete) — read-only */}
          {removidos.length > 0 && (
            <Card pad={false}>
              <button onClick={() => setHistAberto(v => !v)} className="card-head" aria-expanded={histAberto}
                style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <div className="row center gap-8 card-title">
                  <Icon.history width={15} height={15} style={{ color: 'var(--text-mute)' }} />Histórico de documentos removidos
                </div>
                <span className="row center gap-6">
                  <span className="tag">{removidos.length}</span>
                  <Icon.chevDown width={16} height={16} style={{ color: 'var(--text-mute)', transform: histAberto ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
                </span>
              </button>
              {histAberto && (
                <div className="col gap-8" style={{ padding: '4px 14px 14px' }}>
                  {removidos.map(d => {
                    const arq = String(d.storage_path || '').split('/').pop() || (TIPO_LABEL[d.tipo] || d.tipo);
                    return (
                      <div key={d.id} className="row center gap-10" style={{ padding: '9px 11px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg-sunken)' }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                          <Icon.doc width={15} height={15} />
                        </div>
                        <div className="col" style={{ gap: 1, minWidth: 0 }}>
                          <span className="fz12 fw600">{TIPO_LABEL[d.tipo] || d.tipo}</span>
                          <span className="mono fz11 muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arq}</span>
                          <span className="fz11 muted">Removido em {dataHora(d.removido_em)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => { setUploadOpen(false); setTipoAnexar(null); }}
        tipoFaltando={tipoAnexar || TIPOS_DOC.find(t => !docsByTipo[t]) || 'cnh_segurado'}
        onExtraido={onExtraido}
      />

      {/* Confirmação de remoção (soft delete) */}
      <Modal open={!!docRemover} onClose={removendo ? () => {} : () => { setDocRemover(null); setErroRemocao(''); }}
        title="Remover documento" width={460}
        footer={
          <>
            <span />
            <div className="row center gap-8">
              <button className="btn btn-ghost btn-sm" onClick={() => { setDocRemover(null); setErroRemocao(''); }} disabled={removendo}>Cancelar</button>
              <button className="btn btn-danger btn-sm" onClick={confirmarRemocao} disabled={removendo}>
                {removendo ? <Icon.refresh className="spin" /> : <Icon.trash width={15} height={15} />} Remover
              </button>
            </div>
          </>
        }
      >
        <div className="col gap-10">
          <p className="fz13" style={{ margin: 0 }}>
            Tem certeza que deseja remover este documento{docRemover ? ` (${TIPO_LABEL[docRemover.tipo] || docRemover.tipo})` : ''}?
          </p>
          <p className="fz12 muted" style={{ margin: 0 }}>
            Esta ação é registrada no histórico mas o arquivo é preservado.
          </p>
          {erroRemocao && (
            <div className="row center gap-8" style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--red-tint)', border: '1px solid color-mix(in oklch, var(--red) 26%, transparent)' }}>
              <Icon.alert width={16} height={16} style={{ color: 'var(--red)', flex: 'none' }} />
              <span className="fz12" style={{ color: 'var(--st-erro-fg)' }}>{erroRemocao}</span>
            </div>
          )}
        </div>
      </Modal>
    </Page>
  );
}
