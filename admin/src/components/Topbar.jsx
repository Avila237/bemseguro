import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import { supabase } from '../lib/supabase.js';

// Item do dropdown do avatar. Hover/disabled tratados localmente para manter
// o componente autossuficiente (sem classes extras no design system).
function MenuItem({ icon, label, onClick, disabled, danger, loading }) {
  const [hover, setHover] = useState(false);
  const cor = danger ? 'var(--red)' : 'var(--text-soft)';
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '8px 10px',
        border: 'none',
        borderRadius: 'var(--r-xs)',
        background: hover && !disabled ? 'var(--surface-2)' : 'transparent',
        color: disabled ? 'var(--text-mute)' : danger ? 'var(--red)' : 'var(--text)',
        font: 'inherit',
        fontSize: 13.5,
        fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background .12s',
      }}
    >
      <span style={{ display: 'grid', placeItems: 'center', color: cor, flex: 'none' }}>
        {loading ? <Icon.refresh className="spin" width={16} height={16} /> : icon}
      </span>
      {label}
    </button>
  );
}

export default function Topbar({ title, subtitle, actions }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!ativo) return;
      const user = data && data.user;
      if (user && user.email) setEmail(user.email);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Fecha o dropdown ao clicar fora ou apertar ESC.
  useEffect(() => {
    if (!aberto) return;
    function onClickFora(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setAberto(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', onClickFora);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickFora);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  const nome = email ? email.split('@')[0] : 'Operação BS';
  const iniciais = (nome || 'BS')
    .replace(/[._-]/g, ' ')
    .split(/\s+/)
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function meuPerfil() {
    setAberto(false);
    window.alert(
      'Em desenvolvimento. Por enquanto, dados do usuário só podem ser editados pelo administrador via Supabase.'
    );
  }

  async function sair() {
    if (saindo) return;
    setSaindo(true);
    try {
      await supabase.auth.signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <header
      style={{
        height: 'var(--topbar-h)',
        flex: 'none',
        borderBottom: '1px solid var(--border)',
        background: 'oklch(0.998 0.001 75 / 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        gap: 16,
      }}
    >
      <div className="col" style={{ gap: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && (
          <span className="fz12 muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </span>
        )}
      </div>

      <div className="row center gap-10">
        {actions}
        <div style={{ position: 'relative' }}>
          <button type="button" aria-label="Alertas" className="btn btn-ghost btn-icon">
            <Icon.bell />
          </button>
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 7,
              height: 7,
              borderRadius: 99,
              background: 'var(--red)',
              border: '2px solid var(--surface)',
            }}
          ></span>
        </div>
        <div style={{ width: 1, height: 26, background: 'var(--border)' }}></div>

        {/* Avatar + dropdown (Meu perfil / Sair) */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setAberto(v => !v)}
            aria-label="Menu do usuário"
            aria-haspopup="menu"
            aria-expanded={aberto}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 6px 4px 4px',
              border: '1px solid transparent',
              borderRadius: 99,
              background: aberto ? 'var(--surface-2)' : 'transparent',
              cursor: 'pointer',
              font: 'inherit',
              transition: 'background .12s',
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 99,
                background: 'var(--blue-tint-2)',
                color: 'var(--blue-text)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 12.5,
                flex: 'none',
              }}
            >
              {iniciais}
            </span>
            <span className="col" style={{ lineHeight: 1.15, textAlign: 'left' }}>
              <span className="fz12 fw600">Operação BS</span>
              <span className="fz11 muted">{email || 'admin@bemseguro.com.br'}</span>
            </span>
            <Icon.chevDown
              width={15}
              height={15}
              style={{
                color: 'var(--text-mute)',
                transition: 'transform .14s',
                transform: aberto ? 'rotate(180deg)' : 'none',
              }}
            />
          </button>

          {aberto && (
            <div
              role="menu"
              aria-label="Menu do usuário"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                minWidth: 232,
                maxWidth: 'min(280px, calc(100vw - 32px))',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--sh-pop)',
                padding: 6,
                zIndex: 50,
              }}
            >
              <MenuItem icon={<Icon.user width={16} height={16} />} label="Meu perfil" onClick={meuPerfil} />
              <div style={{ height: 1, background: 'var(--border)', margin: '5px 4px' }}></div>
              <MenuItem
                icon={<Icon.arrowRight width={16} height={16} />}
                label={saindo ? 'Saindo…' : 'Sair'}
                onClick={sair}
                disabled={saindo}
                loading={saindo}
                danger
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
