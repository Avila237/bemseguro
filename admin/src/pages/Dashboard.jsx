import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { Card, StatusBadge, Bars, SegLogo, Empty, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { BRL, numeroOS } from '../lib/format.js';
import { carregarDashboard } from '../lib/dashboard.js';

function StatCard({ label, value, icon, tint, fg, sub, pulse }) {
  const I = Icon[icon] || Icon.doc;
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-ico" style={{ background: tint, color: fg }}><I /></span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && (
        <div className="stat-sub">
          {pulse && (
            <span style={{ width: 7, height: 7, borderRadius: 99, background: fg, display: 'inline-block', animation: 'pulse 1.2s infinite' }}></span>
          )}
          {sub}
        </div>
      )}
    </div>
  );
}

function SkeletonView() {
  return (
    <div className="col gap-16">
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="stat">
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={28} style={{ marginTop: 10 }} />
            <Skeleton width="70%" height={10} style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 14 }}>
        <Card title="Carregando…"><Skeleton height={120} /></Card>
        <Card title="Carregando…"><Skeleton height={120} /></Card>
      </div>
    </div>
  );
}

function Conteudo({ dados, navigate }) {
  const { counts, cotacoes, alertas, ultimas, ranking } = dados;
  const media = cotacoes.media.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <>
      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 14 }}>
        <StatCard label="OS hoje" value={counts.total} icon="doc" tint="var(--surface-2)" fg="var(--text-soft)" sub="criadas hoje" />
        <StatCard label="Cotando" value={counts.cotando} icon="refresh" tint="var(--st-cotando-bg)" fg="var(--blue)" sub="em processamento" pulse={counts.cotando > 0} />
        <StatCard label="Cotado" value={counts.cotado} icon="checkCircle" tint="var(--st-cotado-bg)" fg="var(--green)" sub={`${counts.conversao}% de conversão`} />
        <StatCard label="Pendente" value={counts.pendente} icon="clock" tint="var(--st-pendente-bg)" fg="var(--text-mute)" sub="aguardando" />
        <StatCard label="Com erro" value={counts.erro} icon="alert" tint="var(--st-erro-bg)" fg="var(--red)" sub="requer atenção" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 14 }}>
        {/* coluna esquerda */}
        <div className="col gap-16" style={{ minWidth: 0 }}>
          <Card title="Cotações recebidas hoje">
            <div className="row between center" style={{ alignItems: 'flex-end' }}>
              <div className="col gap-4">
                <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>{cotacoes.total}</div>
                <div className="fz12 muted">de {cotacoes.osCount} OS · média {media} por OS</div>
              </div>
              <div style={{ width: '52%' }}>
                <Bars data={cotacoes.serie} color="var(--brand)" height={48} />
                <div className="fz11 muted" style={{ textAlign: 'right', marginTop: 6 }}>últimos 14 dias</div>
              </div>
            </div>
          </Card>

          <Card
            title="Últimas Ordens de Serviço"
            pad={false}
            action={
              <button
                onClick={() => navigate('/ordens')}
                className="row center gap-4 fz12 fw500"
                style={{ border: 'none', background: 'transparent', color: 'var(--blue)', cursor: 'pointer' }}
              >
                Ver todas<Icon.chevRight width={14} height={14} />
              </button>
            }
          >
            {ultimas.length === 0 ? (
              <Empty title="Nenhuma OS registrada" sub="As ordens de serviço aparecerão aqui assim que forem criadas." />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Nº OS</th>
                    <th>Placa</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th className="num">Melhor preço</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimas.map(o => (
                    <tr key={o.id} onClick={() => navigate(`/ordens/${o.id}`)}>
                      <td className="mono fw600">{numeroOS(o.id)}</td>
                      <td className="mono">{o.placa}</td>
                      <td>
                        <div className="col" style={{ lineHeight: 1.2 }}>
                          <span className="fw500">{o.nome || '—'}</span>
                          {o.veiculo && <span className="fz11 muted">{o.veiculo}</span>}
                        </div>
                      </td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="num mono fw600">{o.melhorPreco != null ? BRL(o.melhorPreco) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* coluna direita */}
        <div className="col gap-16" style={{ minWidth: 0 }}>
          <Card
            title="Alertas"
            action={
              <span
                className="tag"
                style={{ color: 'var(--red)', borderColor: 'color-mix(in oklch, var(--red) 25%, var(--border))', background: 'var(--red-tint)' }}
              >
                {alertas.length} ativos
              </span>
            }
          >
            {alertas.length === 0 ? (
              <Empty icon="checkCircle" title="Tudo certo" sub="Nenhuma OS travada ou com erro no momento." />
            ) : (
              <div className="col gap-10">
                {alertas.map(a => (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/ordens/${a.id}`)}
                    className="row center gap-10"
                    style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: a.tipo === 'travada' ? 'var(--st-cotando-bg)' : 'var(--red-tint)' }}
                  >
                    {a.tipo === 'travada' ? (
                      <Icon.clock width={17} height={17} style={{ color: 'var(--blue)', flex: 'none' }} />
                    ) : (
                      <Icon.alert width={17} height={17} style={{ color: 'var(--red)', flex: 'none' }} />
                    )}
                    <div className="col grow" style={{ lineHeight: 1.3, minWidth: 0 }}>
                      <span className="fz13 fw600">
                        {a.tipo === 'travada' ? 'OS travada' : 'Erro de cotação'} — {numeroOS(a.id)}
                      </span>
                      <span className="fz11 muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.tipo === 'travada' ? `Cotando há ${a.min}min · permite reset manual` : a.msg}
                      </span>
                    </div>
                    <Icon.chevRight width={15} height={15} style={{ color: 'var(--text-faint)' }} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Melhor taxa de retorno" action={<span className="fz11 muted">hoje</span>}>
            {ranking.length === 0 ? (
              <Empty icon="activity" title="Sem cotações hoje" sub="O ranking aparece quando as seguradoras retornarem prêmios." />
            ) : (
              <div className="col gap-12">
                {ranking.map((s, i) => (
                  <div key={s.seguradora} className="row center gap-10">
                    <span className="mono fz12 muted" style={{ width: 14 }}>{i + 1}</span>
                    <SegLogo nome={s.seguradora} size={28} />
                    <span className="fz13 fw500 grow">{s.seguradora}</span>
                    <div style={{ width: 84 }}>
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
                        <div style={{ width: s.taxa + '%', height: '100%', background: i === 0 ? 'var(--green)' : 'var(--blue)', borderRadius: 99 }}></div>
                      </div>
                    </div>
                    <span className="mono fz12 fw600" style={{ width: 36, textAlign: 'right' }}>{s.taxa}%</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);

  const load = useCallback(async ({ inicial = false } = {}) => {
    if (inicial) setCarregando(true);
    else setAtualizando(true);
    try {
      const d = await carregarDashboard();
      setDados(d);
      setErro(null);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar os dados.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  // Carga inicial + auto-refresh a cada 60s.
  useEffect(() => {
    load({ inicial: true });
    const t = setInterval(() => load(), 60000);
    return () => clearInterval(t);
  }, [load]);

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

  const actions = (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => load()} disabled={atualizando}>
        <Icon.refresh className={atualizando ? 'spin' : ''} /> Atualizar
      </button>
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/nova-cotacao')}>
        <Icon.plus /> Nova Cotação
      </button>
    </>
  );

  return (
    <Page title="Dashboard" subtitle={`Visão geral da operação · ${hoje}`} actions={actions}>
      {carregando ? (
        <SkeletonView />
      ) : erro ? (
        <Card>
          <div className="col center" style={{ gap: 12, padding: '32px 20px', textAlign: 'center' }}>
            <Icon.alert width={26} height={26} style={{ color: 'var(--red)' }} />
            <div className="fw600">Não foi possível carregar o painel</div>
            <div className="muted fz13" style={{ maxWidth: 360 }}>{erro}</div>
            <button className="btn btn-secondary btn-sm" onClick={() => load({ inicial: true })}>
              <Icon.refresh /> Tentar novamente
            </button>
          </div>
        </Card>
      ) : dados.vazio ? (
        <Card>
          <Empty title="Nenhuma OS ainda" sub="Quando as cotações começarem a chegar, os indicadores aparecem aqui." />
        </Card>
      ) : (
        <Conteudo dados={dados} navigate={navigate} />
      )}
    </Page>
  );
}
