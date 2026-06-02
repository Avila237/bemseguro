import { useState, useEffect, useMemo, Fragment } from 'react';
import Page from '../components/Page.jsx';
import { Icon } from '../components/Icons.jsx';
import { SECOES, LAST_UPDATED } from '../data/ajuda.js';

/* ─────────────────────────── markup inline ───────────────────────────────
 * Converte strings com marcação leve em nós React:
 *   **negrito**  `mono`  {kbd:F5}  {badge:cotando|Cotando}  {ok:Ativa}  {star}
 * (campos `code` são renderizados crus, fora daqui.)
 */
const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\{kbd:[^}]+\}|\{badge:[^}]+\}|\{ok:[^}]+\}|\{star\})/g;

function renderInline(text, goTo) {
  if (text == null) return null;
  if (typeof text !== 'string') return text;
  return text.split(INLINE_RE).map((p, i) => {
    if (!p) return null;
    if (p.startsWith('**') && p.endsWith('**')) return <B key={i}>{p.slice(2, -2)}</B>;
    if (p.startsWith('`') && p.endsWith('`')) return <Term key={i}>{p.slice(1, -1)}</Term>;
    if (p.startsWith('{kbd:')) return <KBD key={i}>{p.slice(5, -1)}</KBD>;
    if (p.startsWith('{ok:')) return <span key={i} style={{ color: 'var(--st-cotado-fg)', fontWeight: 600 }}>{p.slice(4, -1)}</span>;
    if (p === '{star}') return <span key={i} style={{ color: 'var(--brand)', fontWeight: 700 }}>*</span>;
    if (p.startsWith('{badge:')) {
      const [key, label] = p.slice(7, -1).split('|');
      return <span key={i} className={'badge st-' + key} style={{ verticalAlign: 'middle' }}><span className="dot"></span>{label || key}</span>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/* ─────────────────────────── primitivos de prosa (Doc) ───────────────────── */
function H2({ children }) {
  return <h2 style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{children}</h2>;
}
function H3({ children, id }) {
  return <h3 id={id} style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', margin: '26px 0 9px', scrollMarginTop: 80 }}>{children}</h3>;
}
function Lead({ children }) {
  return <p style={{ fontSize: 15.5, color: 'var(--text-soft)', lineHeight: 1.6, margin: '6px 0 4px', textWrap: 'pretty' }}>{children}</p>;
}
function P({ children }) {
  return <p style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.68, margin: '0 0 13px', textWrap: 'pretty' }}>{children}</p>;
}
function UL({ children }) {
  return <ul style={{ margin: '0 0 14px', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</ul>;
}
function LI({ children }) {
  return (
    <li style={{ display: 'flex', gap: 10, fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.6 }}>
      <span style={{ flex: 'none', width: 6, height: 6, borderRadius: 99, background: 'var(--brand)', marginTop: 8 }}></span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </li>
  );
}
function B({ children }) { return <strong style={{ fontWeight: 600, color: 'var(--text)' }}>{children}</strong>; }
function Term({ children }) {
  return <span className="mono" style={{ fontSize: 12.5, fontWeight: 500, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px', color: 'var(--text)' }}>{children}</span>;
}
function KBD({ children }) {
  return <kbd className="mono" style={{ fontSize: 11.5, fontWeight: 600, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderBottomWidth: 2, borderRadius: 5, padding: '2px 7px', color: 'var(--text)', boxShadow: 'var(--sh-sm)' }}>{children}</kbd>;
}

const CALLOUT = {
  info:    { ic: 'info',  bg: 'var(--blue-tint)',       bd: 'var(--blue-tint-2)',                                   fg: 'var(--blue-text)',       lbl: 'Informação' },
  atencao: { ic: 'alert', bg: 'var(--st-cancelada-bg)', bd: 'color-mix(in oklch, var(--amber) 30%, var(--border))', fg: 'var(--st-cancelada-fg)', lbl: 'Atenção' },
  perigo:  { ic: 'alert', bg: 'var(--red-tint)',        bd: 'color-mix(in oklch, var(--red) 28%, var(--border))',   fg: 'var(--red)',             lbl: 'Cuidado' },
  dica:    { ic: 'sparkle', bg: 'var(--brand-tint)',    bd: 'var(--brand-tint-2)',                                  fg: 'var(--brand-text)',      lbl: 'Dica' },
};
function Callout({ type = 'info', title, children }) {
  const c = CALLOUT[type] || CALLOUT.info;
  const I = Icon[c.ic] || Icon.info;
  return (
    <div className="help-callout" style={{ display: 'flex', gap: 12, padding: '13px 15px', borderRadius: 'var(--r-md)', background: c.bg, border: '1px solid ' + c.bd, margin: '16px 0' }}>
      <span style={{ flex: 'none', color: c.fg, marginTop: 1 }}><I width={18} height={18} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: c.fg, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{title || c.lbl}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-soft)', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

function Code({ children, label, lang }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    try { navigator.clipboard && navigator.clipboard.writeText(typeof children === 'string' ? children : ''); } catch { /* clipboard indisponível */ }
    setDone(true); setTimeout(() => setDone(false), 1400);
  };
  return (
    <div className="help-code" style={{ margin: '14px 0', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-sunken)' }}>
      <div className="row between center" style={{ padding: '7px 8px 7px 13px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <span className="mono fz11 fw600 muted" style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label || lang || 'código'}</span>
        <button onClick={copy} className="no-print" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: done ? 'var(--green)' : 'var(--text-mute)', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-sans)', padding: '3px 6px', borderRadius: 6 }}>
          {done ? <Icon.check width={14} height={14} /> : <Icon.copy width={14} height={14} />}{done ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="mono scroll" style={{ margin: 0, padding: '13px 15px', fontSize: 12.5, lineHeight: 1.65, overflow: 'auto', color: 'var(--text)', whiteSpace: 'pre' }}>{children}</pre>
    </div>
  );
}

function Shot({ children }) {
  return (
    <div className="help-shot" style={{
      margin: '16px 0', borderRadius: 'var(--r-md)', border: '1.5px dashed var(--border-strong)',
      background: 'repeating-linear-gradient(135deg, var(--surface-2), var(--surface-2) 10px, var(--bg-sunken) 10px, var(--bg-sunken) 20px)',
      minHeight: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '22px 20px', textAlign: 'center',
    }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', color: 'var(--text-mute)', boxShadow: 'var(--sh-sm)' }}><Icon.eye width={18} height={18} /></span>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-mute)', maxWidth: 460 }}><span className="mono" style={{ color: 'var(--text-soft)' }}>[Screenshot]</span> {children}</span>
    </div>
  );
}

function Steps({ items }) {
  return (
    <ol style={{ listStyle: 'none', margin: '14px 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: 13, paddingBottom: i < items.length - 1 ? 16 : 0, position: 'relative' }}>
          {i < items.length - 1 && <span style={{ position: 'absolute', left: 13, top: 28, bottom: 0, width: 1.5, background: 'var(--border)' }}></span>}
          <span style={{ width: 27, height: 27, borderRadius: 99, background: 'var(--brand-tint)', color: 'var(--brand-text)', fontWeight: 700, fontSize: 13, display: 'grid', placeItems: 'center', flex: 'none', zIndex: 1, border: '1px solid var(--brand-tint-2)' }}>{i + 1}</span>
          <div style={{ fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.6, paddingTop: 3, minWidth: 0 }}>{it}</div>
        </li>
      ))}
    </ol>
  );
}

function Glossary({ items }) {
  return (
    <dl className="help-glossary" style={{ margin: '14px 0 4px', borderTop: '1px solid var(--border)' }}>
      {items.map(([term, def], i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '168px 1fr', gap: 18, padding: '13px 2px', borderBottom: '1px solid var(--border)' }}>
          <dt style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{term}</dt>
          <dd style={{ margin: 0, fontSize: 13.5, color: 'var(--text-soft)', lineHeight: 1.6 }}>{def}</dd>
        </div>
      ))}
    </dl>
  );
}

function Faq({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ margin: '14px 0', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }} className="help-faq-item">
            <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: 'none', background: isOpen ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{it.q}</span>
              <Icon.chevDown width={17} height={17} style={{ flex: 'none', color: 'var(--text-mute)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
            </button>
            <div className="help-faq-body" style={{ display: isOpen ? 'block' : 'none', padding: '0 16px 16px', fontSize: 13.5, color: 'var(--text-soft)', lineHeight: 1.65 }}>{it.a}</div>
          </div>
        );
      })}
    </div>
  );
}

function DocTable({ head, rows }) {
  return (
    <div style={{ margin: '14px 0', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <table className="table" style={{ fontSize: 13 }}>
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} style={{ cursor: 'default' }}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function StatusList({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0' }}>
      {items.map(([st, lbl, desc]) => (
        <div key={st} className="row gap-12" style={{ alignItems: 'flex-start' }}>
          <span className={'badge st-' + st} style={{ flex: 'none', minWidth: 96 }}><span className="dot"></span>{lbl}</span>
          <span style={{ fontSize: 13.5, color: 'var(--text-soft)', lineHeight: 1.55, paddingTop: 2 }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── renderer de bloco ───────────────────────────── */
function Block({ b, goTo, onPrintRunbook }) {
  switch (b.type) {
    case 'p': return <P>{renderInline(b.text, goTo)}</P>;
    case 'h3': return <H3 id={b.id}>{renderInline(b.text, goTo)}</H3>;
    case 'ul': return <UL>{b.items.map((it, i) => <LI key={i}>{renderInline(it, goTo)}</LI>)}</UL>;
    case 'steps': return <Steps items={b.items.map(it => renderInline(it, goTo))} />;
    case 'callout': return <Callout type={b.variant} title={b.title}>{renderInline(b.text, goTo)}</Callout>;
    case 'code': return <Code label={b.label} lang={b.lang}>{b.code}</Code>;
    case 'shot': return <Shot>{renderInline(b.text, goTo)}</Shot>;
    case 'glossary': return <Glossary items={b.items.map(([t, d]) => [t, renderInline(d, goTo)])} />;
    case 'faq': return <Faq items={b.items.map(it => ({ q: it.q, a: renderInline(it.a, goTo) }))} />;
    case 'table': return <DocTable head={b.head} rows={b.rows.map(r => r.map(c => renderInline(c, goTo)))} />;
    case 'statuses': return <StatusList items={b.items} />;
    case 'printRunbook':
      return (
        <div className="no-print" style={{ margin: '8px 0 18px' }}>
          <button className="btn btn-secondary btn-sm" onClick={onPrintRunbook}><Icon.printer width={14} height={14} />Imprimir runbook</button>
        </div>
      );
    default: return null;
  }
}

/* ─────────────────────────── página ──────────────────────────────────────── */
export default function Ajuda() {
  const [q, setQ] = useState('');
  const [qd, setQd] = useState('');
  const [active, setActive] = useState(SECOES[0].id);

  // Busca com debounce de 300ms (filtra apenas o índice).
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const matches = (s) => !qd || (s.label + ' ' + s.title + ' ' + (s.kw || '')).toLowerCase().includes(qd);
  const shown = useMemo(() => SECOES.filter(matches), [qd]);

  const idx = SECOES.findIndex(s => s.id === active);
  const next = idx >= 0 && idx < SECOES.length - 1 ? SECOES[idx + 1] : null;

  const goTo = (id) => setActive(id);

  const printGuide = () => {
    document.body.classList.remove('ajuda-print-runbook');
    try { window.print(); } catch { /* jsdom / print indisponível */ }
  };
  const printRunbook = () => {
    document.body.classList.add('ajuda-print-runbook');
    try { window.print(); } catch { /* ignore */ }
    setTimeout(() => document.body.classList.remove('ajuda-print-runbook'), 600);
  };

  const actions = (
    <button className="btn btn-secondary btn-sm" onClick={printGuide}>
      <Icon.printer width={16} height={16} />Imprimir guia
    </button>
  );

  return (
    <Page title="Ajuda & Documentação" subtitle="Guia do operador · BemSeguro Hub" actions={actions} max={1180}>
      <div className="help-grid" style={{ display: 'grid', gridTemplateColumns: '236px 1fr', gap: 34, alignItems: 'start' }}>

        {/* ÍNDICE + BUSCA (sticky) */}
        <aside className="help-aside no-print" style={{ position: 'sticky', top: 8, alignSelf: 'start' }}>
          <div className="help-searchbar" style={{ position: 'relative', marginBottom: 14 }}>
            <Icon.search width={15} height={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar nas seções…" className="input" aria-label="Buscar nas seções"
              style={{ paddingLeft: 33, paddingRight: q ? 30 : 12, height: 36, fontSize: 13 }} />
            {q && <button onClick={() => setQ('')} className="btn btn-ghost btn-icon btn-sm" style={{ position: 'absolute', right: 3, top: 3 }} aria-label="Limpar busca"><Icon.x width={14} height={14} /></button>}
          </div>

          <div className="eyebrow" style={{ padding: '0 4px 8px' }}>Índice</div>
          <nav aria-label="Índice da ajuda" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {shown.length === 0 && <div className="fz12 muted" style={{ padding: '8px 6px' }}>Nada encontrado para “{q}”.</div>}
            {shown.map(s => {
              const I = Icon[s.icon] || Icon.doc;
              const on = active === s.id;
              return (
                <button key={s.id} onClick={() => goTo(s.id)} aria-current={on ? 'true' : undefined} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: 'none',
                  cursor: 'pointer', textAlign: 'left', background: on ? 'var(--brand-tint)' : 'transparent',
                  color: on ? 'var(--brand-text)' : 'var(--text-soft)', fontWeight: on ? 600 : 500, fontSize: 13,
                  transition: 'background .12s, color .12s',
                }}>
                  <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: on ? 'var(--brand-text)' : 'var(--text-faint)', flex: 'none', width: 16 }}>{s.num}</span>
                  <I width={16} height={16} style={{ flex: 'none' }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                </button>
              );
            })}
          </nav>

          <div style={{ marginTop: 16, padding: '12px 13px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <div className="row gap-8 center" style={{ marginBottom: 6 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand-tint)', color: 'var(--brand-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon.lifebuoy width={15} height={15} /></span>
              <span className="fz12 fw600">Precisa de ajuda?</span>
            </div>
            <div className="fz11 muted" style={{ lineHeight: 1.5, marginBottom: 9 }}>Plantão técnico para incidentes críticos.</div>
            <button onClick={() => goTo('runbook')} className="btn btn-secondary btn-sm" style={{ width: '100%' }}><Icon.bolt width={14} height={14} />Runbook de incidentes</button>
          </div>
        </aside>

        {/* CONTEÚDO — um artigo por vez na tela; @media print revela todos */}
        <div className="help-doc" style={{ maxWidth: 768, minWidth: 0 }}>
          {SECOES.map(s => {
            const I = Icon[s.icon] || Icon.doc;
            const isActive = active === s.id;
            const nx = (() => { const i = SECOES.findIndex(x => x.id === s.id); return i < SECOES.length - 1 ? SECOES[i + 1] : null; })();
            return (
              <article key={s.id} id={'help-' + s.id} data-id={s.id} data-active={isActive ? 'true' : undefined}
                className="help-article" style={{ display: isActive ? 'block' : 'none' }}>
                {/* breadcrumb */}
                <div className="row center gap-6 fz12 muted no-print" style={{ marginBottom: 14 }}>
                  <span>Ajuda &amp; Docs</span>
                  <Icon.chevRight width={13} height={13} style={{ color: 'var(--text-faint)' }} />
                  <span className="fw500" style={{ color: 'var(--text-soft)' }}>{s.label}</span>
                </div>

                {/* cabeçalho da seção */}
                <div className="row gap-12 center" style={{ marginBottom: 12 }}>
                  <span style={{ width: 42, height: 42, borderRadius: 11, flex: 'none', background: 'var(--brand-tint)', color: 'var(--brand-text)', display: 'grid', placeItems: 'center', border: '1px solid var(--brand-tint-2)' }}><I width={21} height={21} /></span>
                  <div className="col" style={{ gap: 2, minWidth: 0 }}>
                    <span className="eyebrow" style={{ color: 'var(--brand-text)' }}>Seção {s.num}</span>
                    <H2>{s.title}</H2>
                  </div>
                </div>

                {s.lead && <Lead>{renderInline(s.lead, goTo)}</Lead>}
                <div style={{ marginTop: 10 }}>
                  {s.blocks.map((b, i) => <Block key={i} b={b} goTo={goTo} onPrintRunbook={printRunbook} />)}
                </div>

                {/* footer do artigo: próximo + última atualização */}
                <div className="help-foot" style={{ marginTop: 30, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  {nx && (
                    <button onClick={() => goTo(nx.id)} className="help-next no-print" style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px',
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', cursor: 'pointer',
                      textAlign: 'left', boxShadow: 'var(--sh-sm)', fontFamily: 'inherit',
                    }}>
                      <div className="col grow" style={{ gap: 2 }}>
                        <span className="fz11 muted fw500" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Próximo</span>
                        <span className="fw600" style={{ fontSize: 14.5 }}>{nx.num} · {nx.title}</span>
                      </div>
                      <span style={{ width: 34, height: 34, borderRadius: 99, background: 'var(--brand-tint)', color: 'var(--brand-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon.arrowRight width={17} height={17} /></span>
                    </button>
                  )}
                  <div className="fz12 muted" style={{ marginTop: 14 }}>Última atualização: {LAST_UPDATED}</div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .help-grid { grid-template-columns: 1fr !important; }
          .help-aside { position: static !important; }
        }
        @media print {
          aside, header, .help-aside, .no-print { display: none !important; }
          .scroll { overflow: visible !important; height: auto !important; }
          .help-grid { display: block !important; }
          .help-doc { max-width: none !important; }
          .help-article { display: block !important; break-inside: auto; page-break-inside: auto; padding-top: 12px; border-top: 1px solid var(--border); }
          .help-callout, .help-code, .help-shot, .help-glossary > div { break-inside: avoid; page-break-inside: avoid; }
          h2, h3 { break-after: avoid; }
          body.ajuda-print-runbook .help-article:not([data-id="runbook"]) { display: none !important; }
          body.ajuda-print-runbook .help-article[data-id="runbook"] { border-top: none !important; }
        }
      `}</style>
    </Page>
  );
}
