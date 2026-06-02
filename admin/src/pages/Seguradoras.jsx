import { useCallback, useEffect, useMemo, useState } from 'react';
import Page from '../components/Page.jsx';
import { Card, SegLogo, Toggle, Empty, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { slug, timeAgo } from '../lib/format.js';
import { listarSeguradoras, setAtiva, getMetricasTodas } from '../lib/seguradoras.js';

const JANELAS = [
  { dias: 1, label: 'Últimas 24h' },
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
];

function corTaxa(t) {
  return t >= 90 ? 'var(--green)' : t >= 85 ? 'var(--blue)' : 'var(--amber)';
}

// Bloco de métricas à direita: loading → skeleton; sem dados → aviso; senão dados.
function MetricasSeg({ m, loading }) {
  if (loading) {
    return (
      <div className="row center gap-20" style={{ flex: 'none' }} aria-busy="true">
        <div className="col" style={{ alignItems: 'flex-end', gap: 4, width: 96 }}>
          <Skeleton width={48} height={16} />
          <Skeleton width="100%" height={5} />
          <Skeleton width={64} height={10} />
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 4 }}>
          <Skeleton width={40} height={16} />
          <Skeleton width={56} height={10} />
        </div>
      </div>
    );
  }

  if (!m || m.semDados) {
    return (
      <div className="row center" style={{ flex: 'none', width: 232, justifyContent: 'flex-end' }}>
        <span className="fz12 muted" style={{ textAlign: 'right' }}>Sem dados suficientes no período</span>
      </div>
    );
  }

  const cor = corTaxa(m.taxaRetorno);
  return (
    <div className="row center gap-20" style={{ flex: 'none' }}>
      <div className="col" style={{ alignItems: 'flex-end', gap: 4, width: 96 }}>
        <span className="mono fw600" style={{ fontSize: 16, color: cor }}>{m.taxaRetorno}%</span>
        <div style={{ width: '100%', height: 5, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: m.taxaRetorno + '%', height: '100%', background: cor, borderRadius: 99 }}></div>
        </div>
        <span
          className="fz11 muted"
          style={{ cursor: 'help' }}
          title="Calculada com base nas OSs cotadas no período. Pode variar conforme a amostra."
        >
          taxa retorno
        </span>
      </div>
      <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
        <span className="mono fw600" style={{ fontSize: 16 }}>{m.tempoMedio != null ? `${m.tempoMedio}s` : '—'}</span>
        <span className="fz11 muted">tempo médio</span>
      </div>
    </div>
  );
}

function SegRow({ s, m, loading, onToggle }) {
  const semSucesso = !loading && (!m || m.semDados || !m.ultimoSucesso);
  return (
    <Card style={{ opacity: s.ativa ? 1 : 0.72 }}>
      <div className="row center gap-14">
        <SegLogo nome={s.nome} size={44} />
        <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
          <div className="row center gap-8">
            <span className="fw600" style={{ fontSize: 15 }}>{s.nome}</span>
            <span className="mono fz11 muted">#{slug(s.nome)}</span>
          </div>
          <div className="row center gap-12 fz12 muted wrap">
            <span className="row center gap-4">
              <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--green)' }}></span>Configurada
            </span>
            {semSucesso ? (
              <span>Sem sucesso no período</span>
            ) : !loading && m ? (
              <span>Último sucesso <span className="fw500" style={{ color: 'var(--text-soft)' }}>{timeAgo(m.ultimoSucesso)}</span></span>
            ) : null}
            {!loading && m && m.erros24h > 0 && (
              <span style={{ color: 'var(--red)' }} title="Erros são globais da operação (não há registro de erro por seguradora).">
                {m.erros24h} erro{m.erros24h > 1 ? 's' : ''} em 24h (global)
              </span>
            )}
          </div>
        </div>

        {/* mini métricas reais (agregadas de cotacoes no período) */}
        <MetricasSeg m={m} loading={loading} />

        <div className="row center gap-20" style={{ flex: 'none' }}>
          <div style={{ width: 1, height: 30, background: 'var(--border)' }}></div>
          <div className="col center gap-4">
            <Toggle on={s.ativa} onChange={() => onToggle(s)} aria-label={`Ativar ${s.nome}`} />
            <span className="fz11 muted">{s.ativa ? 'Ativo' : 'Inativo'}</span>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" title="Configurar" aria-label={`Configurar ${s.nome}`} onClick={() => alert('Configuração da seguradora (em breve).')}>
            <Icon.settings />
          </button>
        </div>
      </div>
    </Card>
  );
}

function ListaSkeleton() {
  return (
    <div className="col gap-12">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <div className="row center gap-14">
            <Skeleton width={44} height={44} radius="9px" />
            <div className="col grow gap-6">
              <Skeleton width="30%" height={14} />
              <Skeleton width="55%" height={11} />
            </div>
            <Skeleton width={120} height={28} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function Seguradoras() {
  const [list, setList] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [janela, setJanela] = useState(7); // dias; padrão 7
  const [metricas, setMetricas] = useState({});
  const [metricasLoading, setMetricasLoading] = useState(false);

  const load = useCallback(async () => {
    setCarregando(true);
    try {
      setList(await listarSeguradoras());
      setErro(null);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Recarrega as métricas reais quando a lista fica pronta ou a janela muda.
  // Depende de `nomesKey` (não da identidade de `list`) para não recarregar a
  // cada toggle de ativa/inativa.
  const nomes = useMemo(() => list.map(s => s.nome), [list]);
  const nomesKey = nomes.join('|');
  useEffect(() => {
    if (!nomes.length) {
      setMetricas({});
      return;
    }
    let ativo = true;
    setMetricasLoading(true);
    getMetricasTodas(nomes, janela)
      .then(m => { if (ativo) setMetricas(m); })
      .catch(() => { if (ativo) setMetricas({}); })
      .finally(() => { if (ativo) setMetricasLoading(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomesKey, janela]);

  async function alternar(s) {
    const novo = !s.ativa;
    setList(l => l.map(x => (x.id === s.id ? { ...x, ativa: novo } : x))); // otimista
    try {
      await setAtiva(s.id, novo);
    } catch (e) {
      setList(l => l.map(x => (x.id === s.id ? { ...x, ativa: !novo } : x))); // reverte
      alert('Não foi possível atualizar a seguradora: ' + e.message);
    }
  }

  const ativas = list.filter(s => s.ativa).length;

  const actions = (
    <div className="row center gap-10">
      <div className="row center gap-6">
        <label htmlFor="janela-metricas" className="fz12 muted">Janela</label>
        <select
          id="janela-metricas"
          className="select"
          aria-label="Janela de tempo das métricas"
          value={janela}
          onChange={e => setJanela(Number(e.target.value))}
          style={{ height: 30, width: 'auto', padding: '0 28px 0 10px', fontSize: 12.5, borderRadius: 'var(--r-xs)' }}
        >
          {JANELAS.map(j => (
            <option key={j.dias} value={j.dias}>{j.label}</option>
          ))}
        </select>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={() => alert('Teste de conexões (em breve).')}>
        <Icon.refresh /> Testar conexões
      </button>
    </div>
  );

  return (
    <Page
      title="Seguradoras"
      subtitle={`${ativas} de ${list.length} ativas para cotação simultânea`}
      actions={actions}
      max={1000}
    >
      {/* banner de segurança */}
      <Card style={{ marginBottom: 16, background: 'var(--blue-tint)', borderColor: 'var(--blue-tint-2)' }}>
        <div className="row center gap-10">
          <Icon.lock width={18} height={18} style={{ color: 'var(--blue-text)', flex: 'none' }} />
          <span className="fz13" style={{ color: 'var(--blue-text)' }}>
            <span className="fw600">Credenciais nunca aparecem no painel.</span> As senhas de acesso de cada
            seguradora ficam apenas no backend — aqui você só liga/desliga e acompanha desempenho.
          </span>
        </div>
      </Card>

      {carregando ? (
        <ListaSkeleton />
      ) : erro ? (
        <Card><Empty icon="alert" title="Erro ao carregar" sub={erro} /></Card>
      ) : list.length === 0 ? (
        <Card><Empty icon="shield" title="Nenhuma seguradora cadastrada" sub="As seguradoras são configuradas no backend (tabela seguradoras)." /></Card>
      ) : (
        <div className="col gap-12">
          {list.map(s => (
            <SegRow
              key={s.id}
              s={s}
              m={metricas[s.nome]}
              // Mostra o skeleton em QUALQUER recarga em andamento (carga inicial
              // E troca de janela). Antes era `&& !metricas[s.nome]`, que suprimia
              // o feedback ao trocar a janela: as métricas antigas continuavam na
              // tela durante a nova query, parecendo que o dropdown não fez nada.
              loading={metricasLoading}
              onToggle={alternar}
            />
          ))}
        </div>
      )}
    </Page>
  );
}
