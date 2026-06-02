import { useEffect, useState } from 'react';
import Page from '../components/Page.jsx';
import { Card, Empty, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { supabase } from '../lib/supabase.js';
import { timeAgo } from '../lib/format.js';
import { carregarHistorico } from '../lib/perfil.js';

// Tons (cor) das ações do histórico — chave vem de descreverAtividade.
const TONE = {
  blue: 'var(--blue)', brand: 'var(--brand)', red: 'var(--red)',
  green: 'var(--green)', amber: 'var(--amber)', mute: 'var(--text-mute)',
};

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}
function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
function iniciaisDe(nome) {
  return (nome || 'BS')
    .replace(/[._-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'BS';
}

// ---- Linha de dado (somente leitura) ----
function DataRow({ label, children, last }) {
  return (
    <div className="row between center" style={{ gap: 16, padding: '13px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span className="fz13 muted fw500" style={{ flex: 'none', width: 140 }}>{label}</span>
      <div className="row center gap-8" style={{ flex: 1, justifyContent: 'flex-end', textAlign: 'right', minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ---- Campo de senha com mostrar/ocultar ----
function PwField({ label, value, onChange, error, hint }) {
  const [show, setShow] = useState(false);
  const Eye = show ? Icon.eyeOff : Icon.eye;
  return (
    <div className="field">
      <label className="label">{label}<span className="req">*</span></label>
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          type={show ? 'text' : 'password'}
          value={value}
          aria-label={label}
          placeholder="••••••••"
          autoComplete="off"
          onChange={e => onChange(e.target.value)}
          style={{ paddingRight: 42, borderColor: error ? 'var(--red)' : undefined }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          title={show ? 'Ocultar' : 'Mostrar'}
          aria-label={show ? `Ocultar ${label}` : `Mostrar ${label}`}
          style={{ position: 'absolute', right: 5, top: 5, width: 30, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--text-mute)' }}
        >
          <Eye width={16} height={16} />
        </button>
      </div>
      {error
        ? <span className="hint row center gap-4" style={{ color: 'var(--red)' }}><Icon.alert width={12} height={12} />{error}</span>
        : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function strength(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(3, Math.max(p.length >= 8 ? 1 : 0, s - 1));
}
const STR_LABEL = ['', 'Fraca', 'Boa', 'Forte'];
const STR_COLOR = ['var(--border-strong)', 'var(--red)', 'var(--amber)', 'var(--green)'];

// ---- Card: Trocar senha ----
function TrocarSenha({ email }) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [conf, setConf] = useState('');
  const [errs, setErrs] = useState({});
  const [status, setStatus] = useState('idle'); // idle | saving | success | error
  const [msg, setMsg] = useState(null);

  const st = strength(nw);
  const saving = status === 'saving';

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (!cur) er.cur = 'Informe sua senha atual.';
    if (nw.length < 8) er.nw = 'A nova senha deve ter no mínimo 8 caracteres.';
    else if (nw === cur) er.nw = 'A nova senha deve ser diferente da atual.';
    if (conf !== nw) er.conf = 'A confirmação não confere com a nova senha.';
    setErrs(er);
    if (Object.keys(er).length) { setStatus('error'); setMsg(null); return; }

    setStatus('saving');
    setMsg(null);
    try {
      // Verifica a senha atual (UX). O Supabase não exige a senha atual em
      // updateUser, mas validamos para não trocar por engano.
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: cur });
      if (signErr) {
        setErrs({ cur: 'Senha atual incorreta.' });
        setStatus('error');
        setMsg(null);
        return;
      }
      const { error: updErr } = await supabase.auth.updateUser({ password: nw });
      if (updErr) {
        setMsg(updErr.message || 'Não foi possível salvar a nova senha.');
        setStatus('error');
        return;
      }
      setStatus('success');
      setCur(''); setNw(''); setConf(''); setErrs({});
    } catch (e2) {
      setMsg(e2.message || 'Erro inesperado ao salvar a senha.');
      setStatus('error');
    }
  }

  const onEdit = setter => v => {
    setter(v);
    if (status === 'error' || status === 'success') { setStatus('idle'); setMsg(null); }
  };

  return (
    <Card title="Trocar senha" action={<span className="row center gap-6 fz11 muted"><Icon.lock width={13} height={13} />Criptografada</span>} style={{ minWidth: 0 }}>
      <form onSubmit={submit} className="col gap-14">
        {status === 'success' && (
          <div className="fade-in row center gap-8" role="status" style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--green-tint)', border: '1px solid color-mix(in oklch, var(--green) 28%, transparent)' }}>
            <Icon.checkCircle width={17} height={17} style={{ color: 'var(--green)', flex: 'none' }} />
            <span className="fz13" style={{ color: 'var(--st-cotado-fg)' }}>Senha alterada com sucesso. Use a nova senha no próximo login.</span>
          </div>
        )}
        {status === 'error' && (
          <div className="fade-in row center gap-8" role="alert" style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--red-tint)', border: '1px solid color-mix(in oklch, var(--red) 26%, transparent)' }}>
            <Icon.alert width={16} height={16} style={{ color: 'var(--red)', flex: 'none' }} />
            <span className="fz13" style={{ color: 'var(--st-erro-fg)' }}>{msg || 'Não foi possível salvar. Revise os campos destacados.'}</span>
          </div>
        )}

        <PwField label="Senha atual" value={cur} onChange={onEdit(setCur)} error={errs.cur} />

        <div className="col gap-7">
          <PwField label="Nova senha" value={nw} onChange={onEdit(setNw)} error={errs.nw} hint={!nw ? 'Mínimo de 8 caracteres.' : null} />
          {nw && !errs.nw && (
            <div className="row center gap-8">
              <div className="row gap-4" style={{ flex: 1 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= st ? STR_COLOR[st] : 'var(--border)' }}></div>
                ))}
              </div>
              <span className="fz11 fw600" style={{ color: STR_COLOR[st], minWidth: 34 }}>{STR_LABEL[st]}</span>
            </div>
          )}
        </div>

        <PwField label="Confirmar nova senha" value={conf} onChange={onEdit(setConf)} error={errs.conf} />

        <div className="row between center" style={{ marginTop: 2 }}>
          <span className="fz11 muted">Você continua conectado nesta sessão.</span>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <Icon.refresh className="spin" width={16} height={16} /> : <Icon.lock width={16} height={16} />}
            {saving ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </div>
      </form>
    </Card>
  );
}

// ---- Item de atividade ----
function ActItem({ it, last }) {
  const I = Icon[it.ico] || Icon.activity;
  const col = TONE[it.tone] || TONE.mute;
  return (
    <div className="row gap-12" style={{ padding: '11px 0', borderBottom: last ? 'none' : '1px solid var(--border)', alignItems: 'flex-start' }}>
      <div style={{ width: 34, height: 34, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center', color: col, background: 'color-mix(in oklch, ' + col + ' 13%, var(--surface))', border: '1px solid color-mix(in oklch, ' + col + ' 22%, transparent)' }}>
        <I width={16} height={16} />
      </div>
      <div className="col grow" style={{ gap: 2, minWidth: 0, paddingTop: 1 }}>
        <span className="fz13 fw500" style={{ color: 'var(--text)' }}>{it.text}</span>
        {it.sub && <span className="fz12 muted">{it.sub}</span>}
      </div>
      <span className="mono fz12 muted" style={{ flex: 'none', paddingTop: 2 }} title={fmtDataHora(it.created_at)}>{timeAgo(it.created_at)}</span>
    </div>
  );
}

// ---- Card: Histórico de atividade ----
function Historico({ itens, loading }) {
  return (
    <Card
      title="Histórico de atividade"
      pad={false}
      action={!loading && itens.length > 0 ? <span className="fz11 muted">Últimas {itens.length} ações</span> : null}
    >
      {loading ? (
        <div className="col gap-14" style={{ padding: '14px 18px 18px' }} aria-busy="true">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="row center gap-12">
              <Skeleton width={34} height={34} radius="9px" />
              <Skeleton width={i % 2 ? '50%' : '64%'} height={13} />
            </div>
          ))}
        </div>
      ) : itens.length === 0 ? (
        <Empty
          icon="history"
          title="Ainda não há ações registradas"
          sub="Suas ações no painel — cotações e recotações — aparecerão aqui assim que você começar a usar o sistema."
        />
      ) : (
        <div style={{ padding: '4px 18px 14px' }}>
          <div className="row center gap-6 fz12 muted" style={{ padding: '10px 0 8px' }}>
            <Icon.info width={13} height={13} style={{ flex: 'none' }} />
            Mostrando o histórico geral do painel (ainda não é por usuário).
          </div>
          {itens.map((it, i) => (
            <ActItem key={it.id || i} it={it} last={i === itens.length - 1} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ---- Skeleton da carga inicial ----
function Loading() {
  return (
    <div className="col gap-18" aria-busy="true">
      <div className="card card-pad row center gap-16">
        <Skeleton width={64} height={64} radius="99px" />
        <div className="col gap-8"><Skeleton width={180} height={18} /><Skeleton width={240} height={13} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {[0, 1].map(c => (
          <div key={c} className="card">
            <div className="card-head"><Skeleton width={120} height={13} /></div>
            <div className="card-pad col gap-16">{[0, 1, 2, 3].map(i => <Skeleton key={i} width={c ? '100%' : (i % 2 ? '70%' : '90%')} height={c ? 30 : 13} />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MeuPerfil() {
  const [user, setUser] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [itens, setItens] = useState([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (ativo) setUser((data && data.user) || null); })
      .catch(() => { if (ativo) setUser(null); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    let ativo = true;
    setHistLoading(true);
    carregarHistorico(20)
      .then(rows => { if (ativo) setItens(rows); })
      .catch(() => { if (ativo) setItens([]); })
      .finally(() => { if (ativo) setHistLoading(false); });
    return () => { ativo = false; };
  }, []);

  const meta = (user && user.user_metadata) || {};
  const nome = meta.full_name || meta.name || (user && user.email ? user.email.split('@')[0] : 'Operador');
  const email = (user && user.email) || '';
  const papel = 'Operador'; // placeholder — ainda não há RBAC (ver context.md)

  return (
    <Page title="Meu perfil" subtitle="Sua conta e atividade no BemSeguro Hub" max={1020}>
      {carregando ? (
        <Loading />
      ) : (
        <div className="col gap-18 fade-up">
          {/* Banner de identidade */}
          <div className="card card-pad row between center" style={{ gap: 16 }}>
            <div className="row center gap-16" style={{ minWidth: 0 }}>
              <div style={{ width: 64, height: 64, flex: 'none', borderRadius: 99, background: 'var(--blue-tint-2)', color: 'var(--blue-text)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 24, letterSpacing: '0.01em' }}>{iniciaisDe(nome)}</div>
              <div className="col" style={{ gap: 5, minWidth: 0 }}>
                <div className="row center gap-10 wrap">
                  <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>{nome}</span>
                  <span className="tag tag-brand">{papel}</span>
                </div>
                <span className="fz13 muted">Corretora BemSeguro · Equipe de cotação</span>
              </div>
            </div>
            <span className="row center gap-6 fz12 muted" style={{ flex: 'none', padding: '6px 11px', borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <Icon.eye width={14} height={14} />Visível apenas para você
            </span>
          </div>

          {/* Dados + Senha */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
            <Card title="Dados da conta" action={<span className="tag">Somente leitura</span>} style={{ minWidth: 0 }}>
              <DataRow label="Nome completo">
                <span className="fz13 fw500">{nome}</span>
              </DataRow>
              <DataRow label="E-mail">
                <span className="fz13 fw500" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || '—'}</span>
                <span className="row center gap-4 fz11 muted" style={{ flex: 'none', padding: '3px 7px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)' }} title="O e-mail não pode ser alterado no piloto.">
                  <Icon.lock width={12} height={12} />não editável
                </span>
              </DataRow>
              <DataRow label="Papel">
                <span className="tag tag-brand">{papel}</span>
              </DataRow>
              <DataRow label="Último login">
                <span className="col" style={{ gap: 1, alignItems: 'flex-end' }}>
                  <span className="fz13 fw500">{fmtDataHora(user && user.last_sign_in_at)}</span>
                  <span className="fz11 muted">{user && user.last_sign_in_at ? timeAgo(user.last_sign_in_at) : '—'}</span>
                </span>
              </DataRow>
              <DataRow label="Conta criada em" last>
                <span className="fz13 fw500">{fmtData(user && user.created_at)}</span>
              </DataRow>
            </Card>

            <TrocarSenha email={email} />
          </div>

          {/* Histórico */}
          <Historico itens={itens} loading={histLoading} />
        </div>
      )}
    </Page>
  );
}
