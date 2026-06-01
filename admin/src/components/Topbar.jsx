import { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';
import { supabase } from '../lib/supabase.js';

export default function Topbar({ title, subtitle, actions }) {
  const [email, setEmail] = useState('');

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

  const nome = email ? email.split('@')[0] : 'Operação BS';
  const iniciais = (nome || 'BS')
    .replace(/[._-]/g, ' ')
    .split(/\s+/)
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
        <div className="row center gap-8">
          <div
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
            }}
          >
            {iniciais}
          </div>
          <div className="col" style={{ lineHeight: 1.15 }}>
            <span className="fz12 fw600">Operação BS</span>
            <span className="fz11 muted">{email || 'admin@bemseguro.com.br'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
