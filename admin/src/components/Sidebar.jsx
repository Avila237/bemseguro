import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../lib/nav.js';
import { Icon, Shield } from './Icons.jsx';
import { contarOSAtivas } from '../lib/osStats.js';
import { getSessionStatus, formatTTL, faixaSessao, TTL_TOTAL_S } from '../lib/sessionStatus.js';

// Wordmark em texto (logo provisório) — estilo do design system.
function Wordmark() {
  return (
    <div className="row center gap-10">
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          flex: 'none',
          background: 'linear-gradient(145deg, var(--brand), var(--brand-press))',
          display: 'grid',
          placeItems: 'center',
          boxShadow: 'var(--sh-sm)',
        }}
      >
        <Shield width={19} height={19} style={{ color: '#fff', strokeWidth: 2 }} />
      </div>
      <div className="col" style={{ lineHeight: 1.1 }}>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>
          Bem<span style={{ color: 'var(--brand)' }}>Seguro</span>
        </span>
        <span
          className="mono"
          style={{ fontSize: 9.5, color: 'var(--text-mute)', letterSpacing: '0.14em', textTransform: 'uppercase' }}
        >
          Hub · Admin
        </span>
      </div>
    </div>
  );
}

// Widget de estado real da sessão Aggilizador (rodapé). Lê GET /session/status
// no Railway e atualiza a cada 30s. Cor por tempo restante (verde/amarelo/vermelho);
// se o Railway não responder, mostra "Status indisponível" em cinza.
function SessaoAggilizador() {
  // undefined = carregando · null = indisponível · objeto = dados reais
  const [estado, setEstado] = useState(undefined);

  useEffect(() => {
    let ativo = true;
    const carregar = () =>
      getSessionStatus()
        .then(d => { if (ativo) setEstado(d); })
        .catch(() => { if (ativo) setEstado(null); });
    carregar();
    const t = setInterval(carregar, 30000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, []);

  const titulo = (
    <span className="fz11 fw600 muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      Sessão Aggilizador
    </span>
  );

  const moldura = inner => (
    <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 12px' }}>
        {inner}
      </div>
    </div>
  );

  // Railway não respondeu — estado desconhecido.
  if (estado === null) {
    return moldura(
      <div className="row between center">
        {titulo}
        <span className="fz12 muted">Status indisponível</span>
      </div>
    );
  }

  // Carga inicial.
  if (estado === undefined) {
    return moldura(
      <div className="row between center">
        {titulo}
        <span className="fz12 muted">Verificando…</span>
      </div>
    );
  }

  const f = faixaSessao(estado);
  const pct = estado.ativa
    ? Math.min(100, Math.max(0, Math.round((estado.ttl_segundos / TTL_TOTAL_S) * 100)))
    : 0;

  return moldura(
    <>
      <div className="row between center" style={{ marginBottom: 7 }}>
        {titulo}
        <span className={`badge ${f.badge}`} style={{ padding: '3px 8px', fontSize: 11 }}>
          <span className="dot"></span>{f.rotulo}
        </span>
      </div>
      <div className="row between center">
        <span className="fz12 muted">Expira em</span>
        <span className="mono fz12 fw600">{estado.ativa ? formatTTL(estado.ttl_segundos) : '--:--'}</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: 'var(--border)', marginTop: 7, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: f.cor, borderRadius: 99, transition: 'width .3s' }}></div>
      </div>
    </>
  );
}

export default function Sidebar() {
  // Badge dinâmico de OS ativas (pendente + cotando) no item "Ordens de Serviço".
  const [ativas, setAtivas] = useState(0);
  useEffect(() => {
    let ativo = true;
    const carregar = () =>
      contarOSAtivas()
        .then(c => { if (ativo) setAtivas(c); })
        .catch(() => {});
    carregar();
    const t = setInterval(carregar, 60000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, []);

  return (
    <aside
      style={{
        width: 'var(--sidebar-w)',
        flex: 'none',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          height: 'var(--topbar-h)',
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Wordmark />
      </div>

      <nav
        className="scroll"
        style={{ flex: 1, overflow: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <div className="eyebrow" style={{ padding: '4px 10px 8px' }}>Operação</div>
        {NAV_ITEMS.map(item => {
          const I = Icon[item.icon] || Icon.grid;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '9px 11px',
                borderRadius: 9,
                position: 'relative',
                textDecoration: 'none',
                background: isActive ? 'var(--brand-tint)' : 'transparent',
                color: isActive ? 'var(--brand-text)' : 'var(--text-soft)',
                fontWeight: isActive ? 600 : 500,
                fontSize: 13.5,
                transition: 'background .12s, color .12s',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        left: -12,
                        top: 8,
                        bottom: 8,
                        width: 3,
                        borderRadius: 99,
                        background: 'var(--brand)',
                      }}
                    ></span>
                  )}
                  <I width={18} height={18} style={{ flex: 'none', strokeWidth: isActive ? 2 : 1.8 }} />
                  <span className="grow">{item.label}</span>
                  {item.to === '/ordens' && ativas > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        background: isActive ? 'var(--brand)' : 'var(--surface-2)',
                        color: isActive ? '#fff' : 'var(--text-mute)',
                        padding: '1px 7px',
                        borderRadius: 99,
                        border: isActive ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      {ativas}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Sessão Aggilizador — estado real via GET /session/status (Railway). */}
      <SessaoAggilizador />
    </aside>
  );
}
