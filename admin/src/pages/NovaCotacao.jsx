import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { Card, Toast } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { formatCpfCnpj, formatTelefone, formatCep } from '../lib/format.js';
import { lookupPlaca, montarPayloadV2, criarCotacao } from '../lib/cotacao.js';

const COBERTURAS = [
  { label: 'Danos materiais', valor: 'R$ 200.000' },
  { label: 'Danos corporais', valor: 'R$ 400.000' },
  { label: 'Danos morais', valor: 'R$ 100.000' },
  { label: 'Vidros', valor: 'Nível 2' },
  { label: 'Assistência 24h', valor: 'Nível 1' },
  { label: 'Carro reserva', valor: 'Nível 3' },
  { label: 'Km anual', valor: '6.000' },
  { label: 'pctAjuste', valor: '100' },
];

const ESTADO = {
  leadNovo: true,
  nome: '', cpf: '', email: '', telefone: '', origem: 'Manual',
  ramo: 'auto', prioridade: 'Média', observacoes: '',
  placa: '', modelo: '', anoModelo: '', anoFabricacao: '', chassi: '', fipe: '', fabricante: '', cepPernoite: '',
  condIgual: true, condutorNome: '', condutorCpf: '',
  dataNascimento: '', sexo: '', estadoCivil: '',
  apSeguradora: '', apNumero: '', apClasse: '0', apSinistro: false,
};

function FormSection({ icon, title, sub, children, right }) {
  const I = Icon[icon];
  return (
    <Card pad={false}>
      <div className="card-head">
        <div className="row center gap-10">
          <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--brand-tint)', color: 'var(--brand-text)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            {I && <I width={15} height={15} />}
          </span>
          <div className="col" style={{ gap: 0, lineHeight: 1.25 }}>
            <span className="card-title">{title}</span>
            {sub && <span className="fz11 muted">{sub}</span>}
          </div>
        </div>
        {right}
      </div>
      <div className="card-pad">{children}</div>
    </Card>
  );
}

function Campo({ label, req, hint, erro, children, style }) {
  return (
    <div className="field" style={style}>
      <label className="label">{label}{req && <span className="req">*</span>}</label>
      {children}
      {erro ? <span className="fz11" style={{ color: 'var(--red)' }}>{erro}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function Toggle({ on, onChange, blue }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={'toggle' + (on ? ' on' : '') + (blue ? ' blue' : '')}
      onClick={() => onChange(!on)}
    ></button>
  );
}

const erroStyle = { borderColor: 'var(--red)', boxShadow: '0 0 0 3px var(--red-tint)' };

export default function NovaCotacao() {
  const navigate = useNavigate();
  const [form, setForm] = useState(ESTADO);
  const [erros, setErros] = useState({});
  const [lookup, setLookup] = useState('idle'); // idle | loading | ok | nf
  const [apOpen, setApOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState(null);

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  async function doLookup() {
    const p = form.placa.trim();
    if (!p) return;
    setLookup('loading');
    try {
      const r = await lookupPlaca(p);
      if (r.encontrado) {
        setForm(f => ({
          ...f,
          modelo: r.modelo || f.modelo,
          anoModelo: r.anoModelo || f.anoModelo,
          anoFabricacao: r.anoFabricacao || f.anoFabricacao,
          fipe: r.fipe || f.fipe,
          chassi: r.chassi || f.chassi,
          fabricante: r.fabricante || f.fabricante,
        }));
        setLookup('ok');
        setToast('Placa encontrada · dados preenchidos');
      } else {
        setLookup('nf');
      }
    } catch {
      setLookup('nf');
    }
  }

  function validar() {
    const e = {};
    if (!form.nome.trim()) e.nome = 'Informe o nome completo';
    if (form.cpf.replace(/\D/g, '').length < 11) e.cpf = 'CPF/CNPJ inválido';
    if (form.placa.replace(/\W/g, '').length < 7) e.placa = 'Placa inválida';
    if (!form.cepPernoite.replace(/\D/g, '')) e.cepPernoite = 'Informe o CEP de pernoite';
    if (!form.condIgual && !form.condutorNome.trim()) e.condutorNome = 'Informe o nome do condutor';
    if (!form.dataNascimento) e.dataNascimento = 'Informe a data de nascimento';
    if (!form.sexo) e.sexo = 'Selecione o sexo';
    if (!form.estadoCivil) e.estadoCivil = 'Selecione o estado civil';
    return e;
  }

  async function criar() {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      const payload = montarPayloadV2(form);
      const { id } = await criarCotacao(payload);
      setToast('OS criada · cotação disparada');
      setTimeout(() => navigate(id ? `/ordens/${id}` : '/ordens'), 700);
    } catch (err) {
      alert('Não foi possível criar a OS: ' + err.message);
      setEnviando(false);
    }
  }

  function descartar() {
    if (window.confirm('Descartar esta cotação? Os dados preenchidos serão perdidos.')) {
      navigate('/ordens');
    }
  }

  const actions = (
    <button className="btn btn-ghost btn-sm" onClick={descartar}>
      <Icon.x /> Descartar
    </button>
  );

  return (
    <Page title="Nova Cotação" subtitle="Criação manual de OS · ramo Auto" actions={actions} max={920}>
      <Toast message={toast} />

      <button
        onClick={() => navigate('/ordens')}
        className="row center gap-6 fz13 fw500"
        style={{ border: 'none', background: 'transparent', color: 'var(--text-soft)', cursor: 'pointer', marginBottom: 14, padding: 0 }}
      >
        <Icon.chevLeft width={16} height={16} />Voltar
      </button>

      <div className="col gap-16">
        {/* Seção 1 — Cliente / Lead */}
        <FormSection
          icon="user"
          title="Cliente / Lead"
          sub="Dados do segurado"
          right={
            <div className="row" style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
              {[['Novo Lead', true], ['Lead Existente', false]].map(([lb, v]) => (
                <button
                  key={lb}
                  onClick={() => set('leadNovo', v)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 500, background: form.leadNovo === v ? 'var(--surface)' : 'transparent', color: form.leadNovo === v ? 'var(--text)' : 'var(--text-mute)', boxShadow: form.leadNovo === v ? 'var(--sh-sm)' : 'none' }}
                >
                  {lb}
                </button>
              ))}
            </div>
          }
        >
          {!form.leadNovo && (
            <div className="fz13 muted" style={{ marginBottom: 14 }}>
              Busca de lead existente em breve — por ora, use “Novo Lead”.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo label="Nome completo" req erro={erros.nome}>
              <input className="input" aria-label="Nome completo" placeholder="Ex: Ricardo de Souza Cabral" style={erros.nome ? erroStyle : undefined} value={form.nome} onChange={e => set('nome', e.target.value)} />
            </Campo>
            <Campo label="CPF / CNPJ" req erro={erros.cpf}>
              <input className="input mono" aria-label="CPF / CNPJ" placeholder="000.000.000-00" style={erros.cpf ? erroStyle : undefined} value={form.cpf} onChange={e => set('cpf', formatCpfCnpj(e.target.value))} />
            </Campo>
            <Campo label="E-mail">
              <input className="input" type="email" aria-label="E-mail" placeholder="email@exemplo.com" value={form.email} onChange={e => set('email', e.target.value)} />
            </Campo>
            <Campo label="Telefone">
              <input className="input mono" aria-label="Telefone" placeholder="(00) 00000-0000" value={form.telefone} onChange={e => set('telefone', formatTelefone(e.target.value))} />
            </Campo>
            <Campo label="Origem">
              <select className="select" aria-label="Origem" value={form.origem} onChange={e => set('origem', e.target.value)}>
                <option>Manual</option>
                <option>CRM</option>
                <option>Indicação</option>
              </select>
            </Campo>
          </div>
        </FormSection>

        {/* Seção 2 — Dados da OS */}
        <FormSection icon="doc" title="Dados da OS" sub="Tipo, prioridade e observações">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo label="Tipo de Seguro" req hint="Apenas Auto ativo no piloto.">
              <select className="select" aria-label="Tipo de Seguro" value={form.ramo} onChange={e => set('ramo', e.target.value)}>
                <option value="auto">Auto</option>
                <option value="residencial" disabled title="Em breve">Residencial (em breve)</option>
                <option value="empresarial" disabled title="Em breve">Empresarial (em breve)</option>
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select className="select" aria-label="Prioridade" value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                <option>Baixa</option>
                <option>Média</option>
                <option>Alta</option>
              </select>
            </Campo>
          </div>
          <Campo label="Observações" style={{ marginTop: 14 }}>
            <textarea className="textarea" rows={2} aria-label="Observações" placeholder="Anotações internas sobre a cotação…" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
          </Campo>
        </FormSection>

        {/* Seção 3 — Veículo / Condutor */}
        {form.ramo === 'auto' && (
          <FormSection icon="car" title="Dados do Veículo e Condutor" sub="Auto-preenchimento por placa">
            <div style={{ background: 'var(--blue-tint)', border: '1px solid var(--blue-tint-2)', borderRadius: 11, padding: 14, marginBottom: 16 }}>
              <div className="row center gap-12 wrap">
                <Campo label="Placa" req erro={erros.placa} style={{ width: 180 }}>
                  <input
                    className="input mono"
                    aria-label="Placa"
                    style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, ...(erros.placa ? erroStyle : {}) }}
                    placeholder="ABC1D23"
                    value={form.placa}
                    onChange={e => set('placa', e.target.value.toUpperCase())}
                    onBlur={doLookup}
                  />
                </Campo>
                <button className="btn btn-blue" style={{ marginTop: 22 }} onClick={doLookup} disabled={lookup === 'loading'}>
                  {lookup === 'loading' ? <><Icon.refresh className="spin" width={16} height={16} />Buscando…</> : <><Icon.search />Buscar placa</>}
                </button>
                <div className="grow"></div>
                {lookup === 'ok' && <span className="badge st-cotado" style={{ marginTop: 18 }}><Icon.check width={12} height={12} />FIPE resolvida</span>}
                {lookup === 'nf' && <span className="badge st-cancelada" style={{ marginTop: 18 }}><span className="dot"></span>Placa não encontrada · preencha manual</span>}
              </div>
              <div className="row center gap-6 fz11 muted" style={{ marginTop: 8 }}>
                <Icon.info width={13} height={13} />Ao sair do campo, chamamos <span className="mono">/lookup/placa</span> e preenchemos modelo, ano, FIPE e chassi.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Campo label="Veículo (marca/modelo)" style={{ gridColumn: 'span 2' }}>
                <input className="input" aria-label="Veículo" placeholder="Busca de modelo…" value={form.modelo} onChange={e => set('modelo', e.target.value)} />
              </Campo>
              <Campo label="Cód. FIPE">
                <input className="input mono" aria-label="Cód. FIPE" placeholder="000000-0" value={form.fipe} onChange={e => set('fipe', e.target.value)} />
              </Campo>
              <Campo label="Ano fabricação">
                <input className="input mono" aria-label="Ano fabricação" placeholder="2024" value={form.anoFabricacao} onChange={e => set('anoFabricacao', e.target.value)} />
              </Campo>
              <Campo label="Ano modelo">
                <input className="input mono" aria-label="Ano modelo" placeholder="2024" value={form.anoModelo} onChange={e => set('anoModelo', e.target.value)} />
              </Campo>
              <Campo label="Chassi (opcional)">
                <input className="input mono" aria-label="Chassi" placeholder="—" value={form.chassi} onChange={e => set('chassi', e.target.value)} />
              </Campo>
              <Campo label="CEP de pernoite" req erro={erros.cepPernoite}>
                <input className="input mono" aria-label="CEP de pernoite" placeholder="00000-000" style={erros.cepPernoite ? erroStyle : undefined} value={form.cepPernoite} onChange={e => set('cepPernoite', formatCep(e.target.value))} />
              </Campo>
            </div>

            <div className="divider" style={{ margin: '18px 0' }}></div>

            <div className="row between center" style={{ marginBottom: 14 }}>
              <span className="eyebrow">Condutor</span>
              <label className="row center gap-8 fz13 soft" style={{ cursor: 'pointer' }}>
                <Toggle on={form.condIgual} onChange={v => set('condIgual', v)} /> Condutor é o próprio segurado
              </label>
            </div>
            {!form.condIgual && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <Campo label="Nome do condutor" req erro={erros.condutorNome}>
                  <input className="input" aria-label="Nome do condutor" placeholder="Nome completo" style={erros.condutorNome ? erroStyle : undefined} value={form.condutorNome} onChange={e => set('condutorNome', e.target.value)} />
                </Campo>
                <Campo label="CPF do condutor">
                  <input className="input mono" aria-label="CPF do condutor" placeholder="000.000.000-00" value={form.condutorCpf} onChange={e => set('condutorCpf', formatCpfCnpj(e.target.value))} />
                </Campo>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Campo label="Data de nascimento" req erro={erros.dataNascimento}>
                <input className="input" type="date" aria-label="Data de nascimento" style={erros.dataNascimento ? erroStyle : undefined} value={form.dataNascimento} onChange={e => set('dataNascimento', e.target.value)} />
              </Campo>
              <Campo label="Sexo" req erro={erros.sexo}>
                <select className="select" aria-label="Sexo" style={erros.sexo ? erroStyle : undefined} value={form.sexo} onChange={e => set('sexo', e.target.value)}>
                  <option value="" disabled>Selecione</option>
                  <option>Masculino</option>
                  <option>Feminino</option>
                </select>
              </Campo>
              <Campo label="Estado civil" req erro={erros.estadoCivil}>
                <select className="select" aria-label="Estado civil" style={erros.estadoCivil ? erroStyle : undefined} value={form.estadoCivil} onChange={e => set('estadoCivil', e.target.value)}>
                  <option value="" disabled>Selecione</option>
                  <option>Solteiro</option>
                  <option>Casado</option>
                  <option>Divorciado</option>
                  <option>Viúvo</option>
                  <option>União Estável</option>
                </select>
              </Campo>
            </div>
          </FormSection>
        )}

        {/* Seção 4 — Apólice anterior (colapsável) */}
        <Card pad={false}>
          <button onClick={() => setApOpen(v => !v)} className="card-head" style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer' }} aria-expanded={apOpen}>
            <div className="row center gap-10">
              <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-mute)', display: 'grid', placeItems: 'center' }}><Icon.shield width={15} height={15} /></span>
              <div className="col" style={{ gap: 0, lineHeight: 1.25, textAlign: 'left' }}>
                <span className="card-title">Apólice Anterior</span>
                <span className="fz11 muted">Opcional · informe para aproveitar bônus</span>
              </div>
            </div>
            <Icon.chevDown width={18} height={18} style={{ color: 'var(--text-mute)', transform: apOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
          </button>
          {apOpen && (
            <div className="card-pad fade-in" style={{ borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <Campo label="Seguradora atual">
                  <input className="input" aria-label="Seguradora atual" placeholder="Ex: Porto Seguro" value={form.apSeguradora} onChange={e => set('apSeguradora', e.target.value)} />
                </Campo>
                <Campo label="Número da apólice">
                  <input className="input mono" aria-label="Número da apólice" placeholder="00.00.0000000" value={form.apNumero} onChange={e => set('apNumero', e.target.value)} />
                </Campo>
                <Campo label="Classe de bônus">
                  <select className="select" aria-label="Classe de bônus" value={form.apClasse} onChange={e => set('apClasse', e.target.value)}>
                    {Array.from({ length: 11 }).map((_, i) => <option key={i} value={i}>Classe {i}</option>)}
                  </select>
                </Campo>
              </div>
              <label className="row center gap-8 fz13 soft" style={{ cursor: 'pointer', marginTop: 14 }}>
                <Toggle on={form.apSinistro} onChange={v => set('apSinistro', v)} blue /> Houve sinistro na vigência anterior?
              </label>
            </div>
          )}
        </Card>

        {/* Coberturas info */}
        <Card pad={false} style={{ background: 'var(--surface-2)' }}>
          <div className="card-pad">
            <div className="row center gap-8" style={{ marginBottom: 12 }}>
              <Icon.lock width={15} height={15} style={{ color: 'var(--text-mute)' }} />
              <span className="fz13 fw600">Coberturas padrão Auto</span>
              <span className="tag">fixas no payload · não editáveis</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {COBERTURAS.map(c => (
                <div key={c.label} className="col gap-4" style={{ padding: '9px 11px', background: 'var(--surface)', borderRadius: 9, border: '1px solid var(--border)' }}>
                  <span className="fz11 muted">{c.label}</span>
                  <span className="mono fz13 fw600">{c.valor}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Barra de ação */}
        <div className="row between center" style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', boxShadow: 'var(--sh-lg)' }}>
          <span className="fz12 muted row center gap-6"><Icon.info width={14} height={14} />Campos com <span style={{ color: 'var(--brand)' }}>*</span> são obrigatórios</span>
          <div className="row gap-8">
            <button className="btn btn-secondary" onClick={descartar}>Descartar</button>
            <button className="btn btn-primary" onClick={criar} disabled={enviando}>
              {enviando ? <><Icon.refresh className="spin" width={16} height={16} />Criando…</> : <><Icon.bolt />Criar OS</>}
            </button>
          </div>
        </div>
      </div>
    </Page>
  );
}
