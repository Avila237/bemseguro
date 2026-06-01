import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../lib/nav.js';
import { Icon, Shield } from './Icons.jsx';

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

export default function Sidebar() {
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
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
