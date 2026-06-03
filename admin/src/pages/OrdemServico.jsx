import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { Card, StatusBadge, Empty, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { BRL, numeroOS, maskCPF, timeAgo } from '../lib/format.js';
import { carregarLista, contarStatus, cancelarOS, PAGE_SIZE } from '../lib/ordens.js';

const TABS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendente', label: 'Pendente' },
  { id: 'extraindo_documentos', label: 'Extraindo documentos' },
  { id: 'revisao_manual', label: 'Revisão manual' },
  { id: 'cotando', label: 'Cotando' },
  { id: 'cotado', label: 'Cotado' },
  { id: 'callback_pendente', label: 'Aguardando CRM' },
  { id: 'erro', label: 'Erro' },
  { id: 'cancelada', label: 'Cancelada' },
];

function RowMenu({ id, numero, onVer, onRecotar, onCancelar }) {
  const [open, setOpen] = useState(false);
  const acoes = [
    ['eye', 'Ver detalhes', onVer],
    ['refresh', 'Recotar', onRecotar],
    ['x', 'Cancelar OS', onCancelar],
  ];
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm btn-icon"
        style={{ width: 28, height: 28 }}
        aria-label={`Ações ${numero}`}
        onClick={() => setOpen(v => !v)}
      >
        <Icon.menu width={15} height={15} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)}></div>
          <div
            className="fade-in"
            style={{ position: 'absolute', right: 0, top: 32, zIndex: 31, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--sh-lg)', padding: 5, minWidth: 168 }}
          >
            {acoes.map(([ic, lb, fn], i) => {
              const I = Icon[ic];
              return (
                <button
                  key={i}
                  onClick={() => { setOpen(false); fn(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 7, fontSize: 13, color: lb.includes('Cancelar') ? 'var(--red)' : 'var(--text)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <I width={15} height={15} />
                  {lb}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Paginacao({ page, pageSize, total, onPage }) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const inicio = total === 0 ? 0 : page * pageSize + 1;
  const fim = Math.min(total, (page + 1) * pageSize);

  // janela de páginas em torno da atual
  const nums = [];
  const janela = 5;
  let ini = Math.max(0, page - 2);
  let f = Math.min(paginas, ini + janela);
  ini = Math.max(0, f - janela);
  for (let i = ini; i < f; i++) nums.push(i);

  return (
    <div className="row between center" style={{ padding: '11px 16px', borderTop: '1px solid var(--border)' }}>
      <span className="fz12 muted">
        Mostrando <span className="fw600" style={{ color: 'var(--text)' }}>{inicio}–{fim}</span> de {total} OS
      </span>
      <div className="row center gap-4">
        <button className="btn btn-ghost btn-sm btn-icon" aria-label="Anterior" disabled={page === 0} onClick={() => onPage(page - 1)}>
          <Icon.chevLeft width={15} height={15} />
        </button>
        {nums.map(n => (
          <button
            key={n}
            className={'btn btn-sm' + (n === page ? '' : ' btn-ghost')}
            style={{ width: 30, ...(n === page ? { background: 'var(--text)', color: '#fff' } : {}) }}
            onClick={() => onPage(n)}
          >
            {n + 1}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm btn-icon" aria-label="Próxima" disabled={page >= paginas - 1} onClick={() => onPage(page + 1)}>
          <Icon.chevRight width={15} height={15} />
        </button>
      </div>
    </div>
  );
}

function TabelaSkeleton() {
  return (
    <div style={{ padding: '8px 14px' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="row center gap-12" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <Skeleton width={80} height={14} />
          <Skeleton width={90} height={14} />
          <Skeleton width={110} height={14} />
          <Skeleton width="30%" height={14} />
          <Skeleton width={70} height={20} radius="99px" />
          <Skeleton width={90} height={14} />
        </div>
      ))}
    </div>
  );
}

export default function OrdemServico() {
  const navigate = useNavigate();

  const [status, setStatus] = useState('todos');
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [ramo, setRamo] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [page, setPage] = useState(0);

  const [dados, setDados] = useState({ rows: [], total: 0, pageSize: PAGE_SIZE });
  const [counts, setCounts] = useState({ todos: 0, pendente: 0, extraindo_documentos: 0, revisao_manual: 0, cotando: 0, cotado: 0, callback_pendente: 0, erro: 0, cancelada: 0 });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // debounce da busca (300ms) — reseta página
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(buscaInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaInput]);

  // filtros (exceto página) → volta pra primeira página
  const setFiltro = useCallback(setter => valor => {
    setter(valor);
    setPage(0);
  }, []);

  const filtros = { status, busca, ramo, de: de || undefined, ate: ate ? ate + 'T23:59:59' : undefined };
  const filtrosKey = JSON.stringify({ ...filtros, page });

  const load = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, cs] = await Promise.all([
        carregarLista({ ...filtros, page }),
        contarStatus(filtros),
      ]);
      setDados(lista);
      setCounts(cs);
      setErro(null);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancelar(o) {
    if (!window.confirm(`Cancelar a ${numeroOS(o.id)}? Esta ação muda o status para "cancelada".`)) return;
    try {
      await cancelarOS(o.id);
      load();
    } catch (e) {
      alert('Não foi possível cancelar: ' + e.message);
    }
  }

  const actions = (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => alert('Exportação ainda não implementada.')}>
        <Icon.download /> Exportar
      </button>
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/nova-cotacao')}>
        <Icon.plus /> Nova Cotação
      </button>
    </>
  );

  return (
    <Page
      title="Ordens de Serviço"
      subtitle={`${counts.todos} OS · ordenadas pela mais recente`}
      actions={actions}
      max={1280}
    >
      {/* tabs de status */}
      <div className="row gap-6 wrap" style={{ marginBottom: 14 }}>
        {TABS.map(t => {
          const active = status === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setFiltro(setStatus)(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 99, cursor: 'pointer',
                fontSize: 13, fontWeight: 500, transition: 'all .12s',
                border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
                background: active ? 'var(--brand)' : 'var(--surface)',
                color: active ? '#fff' : 'var(--text-soft)',
              }}
            >
              {t.label}
              <span
                style={{ fontSize: 11, fontWeight: 600, padding: '0px 6px', borderRadius: 99, background: active ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)', color: active ? '#fff' : 'var(--text-mute)' }}
              >
                {counts[t.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <Card pad={false}>
        {/* barra de filtros */}
        <div className="row center gap-10 wrap" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Icon.search width={16} height={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-faint)' }} />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              placeholder="Buscar por nome, placa, CPF ou nº OS…"
              aria-label="Buscar"
              value={buscaInput}
              onChange={e => setBuscaInput(e.target.value)}
            />
          </div>
          <select className="select" style={{ width: 150 }} aria-label="Ramo" value={ramo} onChange={e => setFiltro(setRamo)(e.target.value)}>
            <option value="">Todos os ramos</option>
            <option value="auto">Auto</option>
            <option value="residencial">Residencial</option>
            <option value="empresarial">Empresarial</option>
          </select>
          <div className="row center gap-6">
            <input className="input" type="date" aria-label="De" style={{ width: 140 }} value={de} onChange={e => setFiltro(setDe)(e.target.value)} />
            <span className="muted fz13">–</span>
            <input className="input" type="date" aria-label="Até" style={{ width: 140 }} value={ate} onChange={e => setFiltro(setAte)(e.target.value)} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => alert('Mais filtros em breve.')}>
            <Icon.filter /> Mais filtros
          </button>
        </div>

        {/* tabela / estados */}
        {carregando ? (
          <TabelaSkeleton />
        ) : erro ? (
          <Empty icon="alert" title="Erro ao carregar" sub={erro} />
        ) : dados.rows.length === 0 ? (
          <Empty
            icon="search"
            title="Nenhuma OS encontrada"
            sub={busca || status !== 'todos' || ramo || de || ate ? 'Ajuste os filtros ou a busca para ver resultados.' : 'As ordens de serviço aparecerão aqui assim que forem criadas.'}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nº OS</th>
                <th>Placa</th>
                <th>CPF</th>
                <th>Cliente</th>
                <th>Ramo</th>
                <th>Status</th>
                <th className="num">Melhor preço</th>
                <th>Criada</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {dados.rows.map(o => (
                <tr key={o.id} onClick={() => navigate(`/ordens/${o.id}`)}>
                  <td className="mono fw600">{numeroOS(o.id)}</td>
                  <td>
                    <span className="tag" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.04em' }}>{o.placa}</span>
                  </td>
                  <td className="mono fz12 muted">{maskCPF(o.cpf)}</td>
                  <td>
                    <div className="col" style={{ lineHeight: 1.25 }}>
                      <span className="fw500">{o.nome || '—'}</span>
                      {o.veiculo && <span className="fz11 muted">{o.veiculo}</span>}
                    </div>
                  </td>
                  <td><span className="tag">Auto</span></td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="num mono fw600">{o.melhorPreco != null ? BRL(o.melhorPreco) : <span className="muted">—</span>}</td>
                  <td className="fz12 muted">{timeAgo(o.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <RowMenu
                      id={o.id}
                      numero={numeroOS(o.id)}
                      onVer={() => navigate(`/ordens/${o.id}`)}
                      onRecotar={() => alert(`Recotação de ${numeroOS(o.id)} ainda não implementada.`)}
                      onCancelar={() => handleCancelar(o)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!carregando && !erro && dados.rows.length > 0 && (
          <Paginacao page={page} pageSize={dados.pageSize} total={dados.total} onPage={setPage} />
        )}
      </Card>
    </Page>
  );
}
