import { useCallback, useEffect, useState } from 'react';
import Page from '../components/Page.jsx';
import { Card, Empty, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { dataHora } from '../lib/format.js';
import { carregarAudit, listarEndpoints, STATUS_OPCOES, PAGE_SIZE } from '../lib/auditLog.js';

// Cor do método HTTP (texto): POST laranja, GET azul, PUT âmbar, DELETE vermelho.
const METODO_COR = { GET: 'var(--blue)', POST: 'var(--brand)', PUT: 'var(--amber)', DELETE: 'var(--red)' };

// Estilo do badge de status HTTP: 2xx verde, 3xx azul, 4xx amarelo, 5xx vermelho.
function httpStyle(code) {
  if (code < 300) return { bg: 'var(--st-cotado-bg)', fg: 'var(--st-cotado-fg)' };
  if (code < 400) return { bg: 'var(--st-cotando-bg)', fg: 'var(--st-cotando-fg)' };
  if (code < 500) return { bg: 'var(--st-cancelada-bg)', fg: 'var(--st-cancelada-fg)' };
  return { bg: 'var(--st-erro-bg)', fg: 'var(--st-erro-fg)' };
}

// Duração formatada: < 1s em ms, >= 1s em segundos com 1 casa.
function fmtDuracao(ms) {
  if (ms == null) return '—';
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';
}

function TabelaSkeleton() {
  return (
    <div style={{ padding: '8px 14px' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="row center gap-12" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <Skeleton width={110} height={14} />
          <Skeleton width={48} height={14} />
          <Skeleton width="28%" height={14} />
          <Skeleton width={120} height={14} />
          <Skeleton width={48} height={20} radius="99px" />
          <Skeleton width={56} height={14} />
        </div>
      ))}
    </div>
  );
}

export default function AuditLog() {
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState('');
  const [page, setPage] = useState(0);

  const [endpoints, setEndpoints] = useState([]);
  const [dados, setDados] = useState({ rows: [], total: 0, pageSize: PAGE_SIZE });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // debounce da busca (300ms) — reseta a página.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(buscaInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaInput]);

  // demais filtros → voltam para a primeira página.
  const setFiltro = useCallback(setter => valor => {
    setter(valor);
    setPage(0);
  }, []);

  // endpoints distintos (dropdown) — carregados uma vez.
  useEffect(() => {
    listarEndpoints()
      .then(setEndpoints)
      .catch(() => setEndpoints([]));
  }, []);

  const filtros = { busca, endpoint, status, data: data || undefined };
  const filtrosKey = JSON.stringify({ ...filtros, page });

  const load = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await carregarAudit({ ...filtros, page }));
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

  const paginas = Math.max(1, Math.ceil(dados.total / dados.pageSize));
  const algumFiltro = busca || endpoint || status || data;

  const actions = (
    <button className="btn btn-secondary btn-sm" onClick={() => alert('Exportação CSV ainda não implementada.')}>
      <Icon.download /> Exportar CSV
    </button>
  );

  return (
    <Page
      title="Audit Log"
      subtitle="Registro de chamadas à API · debug de integrações"
      actions={actions}
      max={1080}
    >
      <Card pad={false}>
        {/* barra de filtros */}
        <div className="row center gap-10 wrap" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Icon.search width={16} height={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-faint)' }} />
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              placeholder="Buscar por endpoint ou API key…"
              aria-label="Buscar"
              value={buscaInput}
              onChange={e => setBuscaInput(e.target.value)}
            />
          </div>
          <select className="select" style={{ width: 180 }} aria-label="Endpoint" value={endpoint} onChange={e => setFiltro(setEndpoint)(e.target.value)}>
            <option value="">Todos endpoints</option>
            {endpoints.map(ep => <option key={ep} value={ep}>{ep}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} aria-label="Status" value={status} onChange={e => setFiltro(setStatus)(e.target.value)}>
            <option value="">Todos status</option>
            {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="input" type="date" aria-label="Data" style={{ width: 150 }} value={data} onChange={e => setFiltro(setData)(e.target.value)} />
        </div>

        {/* tabela / estados */}
        {carregando ? (
          <TabelaSkeleton />
        ) : erro ? (
          <Empty icon="alert" title="Erro ao carregar" sub={erro} />
        ) : dados.rows.length === 0 ? (
          <Empty
            icon="history"
            title="Nenhuma chamada registrada"
            sub={algumFiltro ? 'Ajuste os filtros para ver resultados.' : 'As chamadas à API aparecerão aqui conforme o CRM e o painel forem usados.'}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Método</th>
                <th>Endpoint</th>
                <th>API key</th>
                <th>Status HTTP</th>
                <th className="num">Duração</th>
              </tr>
            </thead>
            <tbody>
              {dados.rows.map(a => {
                const hs = httpStyle(a.status);
                const lento = a.ms != null && a.ms > 1000;
                return (
                  <tr key={a.id} style={{ cursor: 'default' }}>
                    <td className="mono fz13 muted">{dataHora(a.created_at)}</td>
                    <td><span className="mono fz12 fw600" style={{ color: METODO_COR[a.metodo] || 'var(--text-soft)' }}>{a.metodo || '—'}</span></td>
                    <td className="mono fz13">{a.endpoint}</td>
                    <td className="fz13">{a.interno ? <span className="muted">interno</span> : a.keyNome}</td>
                    <td>
                      <span className="badge" style={{ background: hs.bg, color: hs.fg, padding: '4px 9px' }}>
                        <span className="mono fw600">{a.status}</span>
                      </span>
                    </td>
                    <td className="num">
                      <span className="mono fz13" style={{ color: lento ? 'var(--red)' : 'var(--text-soft)', fontWeight: lento ? 600 : 400 }}>
                        {fmtDuracao(a.ms)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* rodapé: contagem + paginação */}
        {!carregando && !erro && (
          <div className="row between center" style={{ padding: '11px 16px', borderTop: '1px solid var(--border)' }}>
            <span className="fz12 muted">
              <span className="fw600" style={{ color: 'var(--text)' }}>{dados.total}</span> chamadas · {data ? `dia ${data.split('-').reverse().join('/')}` : 'janela de 24h'}
            </span>
            <div className="row center gap-4">
              <button className="btn btn-ghost btn-sm btn-icon" aria-label="Anterior" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <Icon.chevLeft width={15} height={15} />
              </button>
              <span className="fz12 muted" style={{ padding: '0 8px' }}>{page + 1} / {paginas}</span>
              <button className="btn btn-ghost btn-sm btn-icon" aria-label="Próxima" disabled={page >= paginas - 1} onClick={() => setPage(p => p + 1)}>
                <Icon.chevRight width={15} height={15} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </Page>
  );
}
