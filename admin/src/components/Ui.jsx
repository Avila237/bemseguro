// Primitivos visuais reutilizáveis (portados do design system "Clareza
// Operacional"). Usam as classes/tokens de theme.css.
import { Icon } from './Icons.jsx';
import { STATUS_META, segVisual } from '../lib/format.js';

// ---- Card ----
export function Card({ title, action, children, pad = true, className = '', style }) {
  return (
    <div className={'card ' + className} style={style}>
      {(title || action) && (
        <div className="card-head">
          <div className="card-title">{title}</div>
          {action}
        </div>
      )}
      <div className={pad ? 'card-pad' : ''}>{children}</div>
    </div>
  );
}

// ---- Status pill ----
export function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  return (
    <span className={'badge ' + (meta?.classe || 'st-pendente')}>
      <span className="dot"></span>
      {meta?.label || status}
    </span>
  );
}

// ---- Logo monograma de seguradora ----
export function SegLogo({ nome, size = 28 }) {
  const { sigla, cor } = segVisual(nome);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        flex: 'none',
        background: cor,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: size * 0.38,
        letterSpacing: '0.02em',
        boxShadow: 'var(--sh-sm)',
      }}
    >
      {sigla}
    </div>
  );
}

// ---- Mini gráfico de barras ----
export function Bars({ data, color = 'var(--blue)', height = 46, max }) {
  const vals = data && data.length ? data : [0];
  const mx = max || Math.max(...vals, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {vals.map((v, i) => (
        <div
          key={i}
          title={String(v)}
          style={{
            flex: 1,
            height: Math.max(3, (v / mx) * height) + 'px',
            background: color,
            borderRadius: 2,
            opacity: 0.35 + 0.65 * (v / mx),
          }}
        ></div>
      ))}
    </div>
  );
}

// ---- Estado vazio ----
export function Empty({ icon = 'inbox', title, sub }) {
  const I = Icon[icon] || Icon.inbox;
  return (
    <div className="col center" style={{ gap: 12, padding: '44px 20px', textAlign: 'center' }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-faint)',
        }}
      >
        <I width={22} height={22} />
      </div>
      <div className="fw600">{title}</div>
      {sub && <div className="muted fz13" style={{ maxWidth: 320 }}>{sub}</div>}
    </div>
  );
}

// ---- Toast (notificação transitória, canto inferior) ----
export function Toast({ message, type = 'success' }) {
  if (!message) return null;
  const cor = { success: 'var(--green)', error: 'var(--red)', info: 'var(--blue)' }[type] || 'var(--blue)';
  const ic = { success: 'check', error: 'xCircle', info: 'info' }[type] || 'info';
  const I = Icon[ic];
  return (
    <div
      role="status"
      className="fade-up"
      style={{
        position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 10, background: 'var(--text)', color: '#fff',
        padding: '10px 16px', borderRadius: 99, boxShadow: 'var(--sh-pop)', fontSize: 13.5, fontWeight: 500,
      }}
    >
      <span style={{ color: cor, display: 'flex' }}>{I && <I width={16} height={16} />}</span>
      {message}
    </div>
  );
}

// ---- KV (par rótulo/valor usado nos blocos de detalhe) ----
export function KV({ k, v, mono }) {
  return (
    <div className="col gap-4" style={{ minWidth: 0 }}>
      <span className="fz11 muted fw500" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</span>
      <span className={'fz13 fw500' + (mono ? ' mono' : '')} style={{ wordBreak: 'break-word' }}>
        {v || <span className="muted">—</span>}
      </span>
    </div>
  );
}

// ---- Modal ----
export function Modal({ open, onClose, title, footer, children, width = 540 }) {
  if (!open) return null;
  return (
    <div
      className="fade-in"
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'oklch(0.27 0.012 65 / 0.32)', backdropFilter: 'blur(2px)', display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <div
        className="fade-up"
        role="dialog"
        aria-modal="true"
        onMouseDown={e => e.stopPropagation()}
        style={{ width, maxWidth: '100%', maxHeight: '90vh', background: 'var(--surface)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-pop)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {title && (
          <div className="row between center" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="fw600" style={{ fontSize: 15 }}>{title}</div>
            <button className="btn btn-ghost btn-sm btn-icon" aria-label="Fechar" onClick={onClose}><Icon.x /></button>
          </div>
        )}
        <div className="scroll" style={{ overflow: 'auto', padding: 20 }}>{children}</div>
        {footer && (
          <div className="row between center" style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', gap: 10 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Toggle switch ----
export function Toggle({ on, onChange, blue, ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={'toggle' + (on ? ' on' : '') + (blue ? ' blue' : '')}
      onClick={() => onChange(!on)}
      {...rest}
    ></button>
  );
}

// ---- Skeleton (loading) ----
export function Skeleton({ width = '100%', height = 14, radius = 'var(--r-xs)', style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }}></div>;
}
