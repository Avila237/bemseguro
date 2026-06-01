// Primitivos visuais reutilizáveis (portados do design system "Clareza
// Operacional"). Usam as classes/tokens de theme.css.
import { Icon } from './Icons.jsx';
import { STATUS_LABEL, segVisual } from '../lib/format.js';

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
  return (
    <span className={'badge st-' + status}>
      <span className="dot"></span>
      {STATUS_LABEL[status] || status}
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

// ---- Skeleton (loading) ----
export function Skeleton({ width = '100%', height = 14, radius = 'var(--r-xs)', style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }}></div>;
}
