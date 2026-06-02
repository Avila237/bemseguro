import { useCallback, useEffect, useState } from 'react';
import Page from '../components/Page.jsx';
import { Card, Empty, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { numeroOS, timeAgo } from '../lib/format.js';
import { carregarMonitoring, checarRailway } from '../lib/monitoring.js';
import { getSessionStatus, formatTTL, faixaSessao } from '../lib/sessionStatus.js';

function StatCard({ label, value, unit, icon, tint, fg, sub }) {
  const I = Icon[icon] || Icon.doc;
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-ico" style={{ background: tint, color: fg }}><I /></span>
      </div>
      <div className="stat-value">
        {value}
        {unit && <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-mute)' }}>{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// Cor da barra por faixa de taxa de sucesso.
function corTaxa(t) {
  return t >= 90 ? 'var(--green)' : t >= 85 ? 'var(--blue)' : 'var(--amber)';
}

function SkeletonView() {
  return (
    <div className="col gap-16">
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat">
            <Skeleton width="60%" height={12} />
            <Skeleton width="40%" height={28} style={{ marginTop: 10 }} />
            <Skeleton width="70%" height={10} style={{ marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
        <Card title="Carregando…"><Skeleton height={180} /></Card>
        <Card title="Carregando…"><Skeleton height={180} /></Card>
      </div>
      <Card title="Carregando…"><Skeleton height={100} /></Card>
    </div>
  );
}

// Card "Sessão Aggilizador" com estado real (ou "Indisponível" se o Railway não
// respondeu). `sessao`: undefined/null = indisponível · objeto = dados reais.
function sessaoCardProps(sessao) {
  if (sessao == null) {
    return {
      value: <span style={{ fontSize: 22 }}>Indisponível</span>,
      tint: 'var(--st-pendente-bg)',
      fg: 'var(--text-mute)',
      sub: 'status indisponível',
    };
  }
  const f = faixaSessao(sessao);
  return {
    value: <span style={{ fontSize: 22 }}>{f.rotulo}</span>,
    tint: f.tint,
    fg: f.cor,
    sub: sessao.ativa ? (
      <span className="mono">expira em {formatTTL(sessao.ttl_segundos)} · última renovação {timeAgo(sessao.ultima_renovacao)}</span>
    ) : (
      <span>sessão expirada · última renovação {timeAgo(sessao.ultima_renovacao)}</span>
    ),
  };
}

function Conteudo({ dados, sessao }) {
  const { tempoMedioS, tempoDelta, taxaSucesso, totalOS7, erros24h, errosDelta, serie, taxaPorSeg, errosRecentes } = dados;
  const maxDia = Math.max(...serie, 1);
  const sessProps = sessaoCardProps(sessao);

  // sub do tempo médio: delta vs semana passada (queda = bom → seta verde p/ baixo).
  let subTempo = 'últimos 7 dias';
  if (tempoDelta != null && tempoDelta !== 0) {
    const caiu = tempoDelta < 0;
    const Seta = caiu ? Icon.arrowDown : Icon.arrowUp;
    subTempo = (
      <>
        <Seta width={13} height={13} style={{ color: caiu ? 'var(--green)' : 'var(--red)' }} />
        {Math.abs(tempoDelta)}% vs semana passada
      </>
    );
  }

  // sub dos erros: delta vs ontem.
  let subErros = 'nas últimas 24h';
  if (errosDelta !== 0) {
    const subiu = errosDelta > 0;
    const Seta = subiu ? Icon.arrowUp : Icon.arrowDown;
    subErros = (
      <>
        <Seta width={13} height={13} style={{ color: subiu ? 'var(--red)' : 'var(--green)' }} />
        {Math.abs(errosDelta)} {subiu ? 'a mais' : 'a menos'} que ontem
      </>
    );
  }

  return (
    <>
      {/* topo: 4 métricas técnicas */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <StatCard
          label="Tempo médio de cotação"
          value={tempoMedioS}
          unit="s"
          icon="clock"
          tint="var(--st-cotando-bg)"
          fg="var(--blue)"
          sub={subTempo}
        />
        <StatCard
          label="Taxa de sucesso global"
          value={taxaSucesso}
          unit="%"
          icon="checkCircle"
          tint="var(--st-cotado-bg)"
          fg="var(--green)"
          sub={`últimos 7 dias · ${totalOS7} OS`}
        />
        <StatCard
          label="Sessão Aggilizador"
          value={sessProps.value}
          icon="wifi"
          tint={sessProps.tint}
          fg={sessProps.fg}
          sub={sessProps.sub}
        />
        <StatCard
          label="Erros (24h)"
          value={erros24h}
          icon="alert"
          tint="var(--st-erro-bg)"
          fg="var(--red)"
          sub={subErros}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* cotações por dia (30 dias) — barras CSS proporcionais ao máximo */}
        <Card title="Cotações por dia" action={<span className="fz11 muted">últimos 30 dias</span>}>
          {serie.every(v => v === 0) ? (
            <Empty icon="activity" title="Sem cotações no período" sub="O gráfico aparece quando houver cotações nos últimos 30 dias." />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 180, padding: '8px 0' }}>
                {serie.map((v, i) => {
                  const recente = i >= serie.length - 5;
                  return (
                    <div
                      key={i}
                      className="grow"
                      title={`${v} cotações`}
                      style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
                    >
                      <div
                        style={{
                          height: (v / maxDia) * 100 + '%',
                          minHeight: v > 0 ? 2 : 0,
                          background: recente ? 'var(--brand)' : 'var(--blue)',
                          borderRadius: '3px 3px 0 0',
                          opacity: recente ? 1 : 0.55,
                          transition: 'height .3s',
                        }}
                      ></div>
                    </div>
                  );
                })}
              </div>
              <div className="row between fz11 muted" style={{ marginTop: 8 }}>
                <span>30 dias atrás</span>
                <span>hoje</span>
              </div>
            </>
          )}
        </Card>

        {/* taxa de sucesso por seguradora (30 dias) — barras horizontais */}
        <Card title="Taxa de sucesso por seguradora">
          {taxaPorSeg.length === 0 ? (
            <Empty icon="shield" title="Sem dados por seguradora" sub="Aparece quando houver cotações registradas." />
          ) : (
            <div className="col gap-11">
              {taxaPorSeg.map(s => (
                <div key={s.nome} className="row center gap-10">
                  <span className="fz12 fw500" style={{ width: 92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.nome}>{s.nome}</span>
                  <div className="grow" style={{ height: 8, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ width: s.taxa + '%', height: '100%', borderRadius: 99, background: corTaxa(s.taxa) }}></div>
                  </div>
                  <span className="mono fz12 fw600" style={{ width: 34, textAlign: 'right' }}>{s.taxa}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* erros recentes (24h) */}
      <Card
        title="Erros recentes"
        pad={false}
        action={
          <span
            className="tag"
            style={{ color: 'var(--red)', background: 'var(--red-tint)', borderColor: 'color-mix(in oklch, var(--red) 22%, var(--border))' }}
          >
            últimas 24h
          </span>
        }
      >
        {errosRecentes.length === 0 ? (
          <Empty icon="checkCircle" title="Nenhum erro nas últimas 24h" sub="A operação de cotação está saudável." />
        ) : (
          <div className="col gap-2" style={{ padding: '4px 14px 10px' }}>
            {errosRecentes.map((e, i) => (
              <div
                key={e.id}
                className="row center gap-12"
                style={{ padding: '11px 4px', borderBottom: i < errosRecentes.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--red-tint)', color: 'var(--red)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <Icon.xCircle width={16} height={16} />
                </span>
                <div className="col grow" style={{ gap: 1, minWidth: 0 }}>
                  <span className="fz13 fw500" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.msg}</span>
                  <span className="fz11 muted">{e.seg} · <span className="mono">{numeroOS(e.id)}</span></span>
                </div>
                <span className="mono fz11 muted" style={{ flex: 'none' }}>{timeAgo(e.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default function Monitoring() {
  const [dados, setDados] = useState(null);
  const [sessao, setSessao] = useState(null); // estado real da sessão Aggilizador (null = indisponível)
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);
  const [railwayOk, setRailwayOk] = useState(null); // null = checando

  const load = useCallback(async ({ inicial = false } = {}) => {
    if (inicial) setCarregando(true);
    else setAtualizando(true);
    try {
      // A sessão é independente das métricas: se o Railway estiver fora, o card
      // mostra "Indisponível", mas as métricas (Supabase) ainda carregam.
      const [d, ok, sess] = await Promise.all([
        carregarMonitoring(),
        checarRailway(),
        getSessionStatus().catch(() => null),
      ]);
      setDados(d);
      setRailwayOk(ok);
      setSessao(sess);
      setErro(null);
    } catch (e) {
      setErro(e.message || 'Erro ao carregar as métricas.');
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

  const railwayBadge =
    railwayOk == null ? (
      <span className="badge st-pendente"><span className="dot"></span>Verificando…</span>
    ) : railwayOk ? (
      <span className="badge st-cotado"><span className="dot"></span>Railway saudável</span>
    ) : (
      <span className="badge st-erro"><span className="dot"></span>Railway indisponível</span>
    );

  const actions = (
    <>
      {railwayBadge}
      <button className="btn btn-secondary btn-sm" onClick={() => load()} disabled={atualizando}>
        <Icon.refresh className={atualizando ? 'spin' : ''} /> Atualizar
      </button>
    </>
  );

  return (
    <Page title="Monitoring" subtitle="Painel técnico · saúde da operação de cotação" actions={actions} max={1240}>
      {carregando ? (
        <SkeletonView />
      ) : erro ? (
        <Card>
          <div className="col center" style={{ gap: 12, padding: '32px 20px', textAlign: 'center' }}>
            <Icon.alert width={26} height={26} style={{ color: 'var(--red)' }} />
            <div className="fw600">Não foi possível carregar as métricas</div>
            <div className="muted fz13" style={{ maxWidth: 360 }}>{erro}</div>
            <button className="btn btn-secondary btn-sm" onClick={() => load({ inicial: true })}>
              <Icon.refresh /> Tentar novamente
            </button>
          </div>
        </Card>
      ) : (
        <Conteudo dados={dados} sessao={sessao} />
      )}
    </Page>
  );
}
