import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { Card, StatusBadge, SegLogo, Empty, Skeleton, KV } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { BRL, numeroOS, maskCPF, timeAgo, veiculoDe } from '../lib/format.js';
import { carregarOS, recotarOS } from '../lib/detalhe.js';
import { cancelarOS } from '../lib/ordens.js';

const SEXO = { M: 'Masculino', F: 'Feminino' };
const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

// Normaliza os_cotacao.dados_risco (formato estruturado novo) + colunas da OS.
function normalizar(os) {
  const dr = os.dados_risco || {};
  const seg = dr.segurado || {};
  const veic = typeof dr.veiculo === 'object' && dr.veiculo ? dr.veiculo : {};
  const cond = dr.condutor || {};
  const ap = dr.apoliceAnterior || dr.apolice_anterior || {};
  const cidadeUF = seg.cidade ? `${seg.cidade}${seg.uf ? ' / ' + seg.uf : ''}` : dr.cidade || '';

  return {
    ramo: dr.ramo || 'auto',
    origem: dr.origem || seg.origem || null,
    prioridade: dr.prioridade || null,
    segurado: {
      nome: os.nome || seg.nome || '',
      cpf: os.cpf || seg.cpf || '',
      email: os.email || seg.email || '',
      telefone: seg.telefone || dr.telefone || '',
      cep: os.cep || seg.cep || '',
      cidadeUF,
    },
    veiculo: {
      descricao: veiculoDe(dr),
      placa: os.placa || veic.placa || '',
      fipe: veic.fipe || '',
      chassi: veic.chassi || '',
      anoFab: veic.anoFabricacao || veic.anoFab || '',
      anoMod: veic.anoModelo || veic.anoMod || '',
      cepPernoite: veic.cepPernoite || seg.cep || os.cep || '',
    },
    condutor: {
      nome: cond.nome || os.nome || seg.nome || '',
      nascimento: cond.dataNascimento || cond.dataNasc || '',
      sexo: SEXO[cond.sexo] || cap(cond.sexo) || '',
      estadoCivil: cap(cond.estadoCivil || seg.estadoCivil || ''),
      relacao: cap(cond.relacaoSegurado || cond.relacao || ''),
    },
    apolice: ap.seguradora || ap.numero ? {
      seguradora: ap.seguradora,
      numero: ap.numero,
      classeBonus: ap.classeBonus ?? 0,
      sinistro: ap.sinistro,
    } : null,
  };
}

function Block({ icon, title, action, children }) {
  const I = Icon[icon];
  return (
    <Card title={undefined} pad={false}>
      <div className="card-head">
        <div className="row center gap-8 card-title">
          {I && <I width={16} height={16} style={{ color: 'var(--text-mute)' }} />}
          {title}
        </div>
        {action}
      </div>
      <div className="card-pad">{children}</div>
    </Card>
  );
}

function CotacaoCard({ c, best }) {
  const temPremio = c.premio != null && c.premio > 0;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
        border: '1px solid ' + (best ? 'color-mix(in oklch, var(--green) 40%, var(--border))' : 'var(--border)'),
        background: best ? 'var(--st-cotado-bg)' : 'var(--surface)',
      }}
    >
      <SegLogo nome={c.seguradora} size={42} />
      <div className="col grow" style={{ gap: 5, minWidth: 0 }}>
        <div className="row center gap-8 wrap">
          <span className="fw600" style={{ fontSize: 14.5 }}>{c.seguradora}</span>
          {best && (
            <span className="badge st-cotado" style={{ padding: '3px 9px', fontSize: 11 }}>
              <Icon.target width={11} height={11} />Melhor Preço
            </span>
          )}
          <span className="badge st-cotado" style={{ padding: '3px 9px', fontSize: 11, background: 'transparent', color: 'var(--text-mute)' }}>
            <span className="dot" style={{ background: 'var(--green)' }}></span>Recebida
          </span>
        </div>
        <div className="row center gap-16 fz12 muted wrap">
          {c.franquia != null && <span>Franquia <span className="mono fw600" style={{ color: 'var(--text-soft)' }}>{BRL(c.franquia)}</span></span>}
          {c.cobertura && <span>Cobertura <span className="fw600" style={{ color: 'var(--text-soft)' }}>{c.cobertura}</span></span>}
          <span className="row center gap-4"><Icon.clock width={12} height={12} />{timeAgo(c.created_at)}</span>
          {c.nro_calculo && <span className="mono">#{c.nro_calculo}</span>}
        </div>
      </div>
      {temPremio && (
        <div className="col" style={{ alignItems: 'flex-end', gap: 2, flex: 'none' }}>
          <span className="mono fw600" style={{ fontSize: 19, letterSpacing: '-0.02em', color: best ? 'var(--st-cotado-fg)' : 'var(--text)' }}>{BRL(c.premio)}</span>
          <span className="fz11 muted">prêmio anual</span>
        </div>
      )}
      <div className="row center gap-6" style={{ flex: 'none' }}>
        {c.url_pdf && (
          <button className="btn btn-secondary btn-sm" onClick={() => window.open(c.url_pdf, '_blank', 'noopener')}>
            <Icon.pdf /> PDF <Icon.external />
          </button>
        )}
        <button className={'btn btn-sm ' + (best ? 'btn-primary' : 'btn-secondary')} onClick={() => alert(`Proposta com ${c.seguradora} (em breve).`)}>
          Selecionar
        </button>
      </div>
    </div>
  );
}

function CotacaoSkeleton() {
  return (
    <div className="row center gap-14" style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
      <Skeleton width={42} height={42} radius="9px" />
      <div className="col grow gap-6">
        <Skeleton width="40%" height={13} />
        <Skeleton width="70%" height={11} />
      </div>
      <Skeleton width={90} height={22} />
    </div>
  );
}

function DetalheSkeleton() {
  return (
    <Page title="Carregando…" subtitle="">
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
        <Card title="Cotações"><div className="col gap-10"><CotacaoSkeleton /><CotacaoSkeleton /><CotacaoSkeleton /></div></Card>
        <div className="col gap-14">
          <Card title="Dados do Segurado"><Skeleton height={90} /></Card>
          <Card title="Dados do Veículo"><Skeleton height={90} /></Card>
        </div>
      </div>
    </Page>
  );
}

export default function DetalheOS() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [os, setOs] = useState(null);
  const [cotacoes, setCotacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [recotando, setRecotando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const fetchOS = useCallback(async ({ inicial = false } = {}) => {
    if (inicial) setCarregando(true);
    try {
      const { os: dados, cotacoes: cot } = await carregarOS(id);
      setOs(dados);
      setCotacoes(cot);
      setErro(null);
      setNaoEncontrada(false);
    } catch (e) {
      if (e.notFound) setNaoEncontrada(true);
      else setErro(e.message || 'Erro ao carregar.');
    } finally {
      if (inicial) setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOS({ inicial: true });
  }, [fetchOS]);

  const status = os?.status;

  // Polling a cada 5s enquanto a OS está em processamento (o sistema avança
  // sozinho): "cotando" ou "extraindo_documentos" (IA lendo CNH/CRLV).
  useEffect(() => {
    if (status !== 'cotando' && status !== 'extraindo_documentos') return;
    const t = setInterval(() => fetchOS(), 5000);
    return () => clearInterval(t);
  }, [status, fetchOS]);

  async function handleRecotar() {
    if (!os) return;
    setRecotando(true);
    try {
      await recotarOS(os);
      setOs(o => ({ ...o, status: 'cotando' })); // dispara o polling
      setCotacoes([]);
    } catch (e) {
      alert('Não foi possível recotar: ' + e.message);
    } finally {
      setRecotando(false);
    }
  }

  async function handleCancelar() {
    if (!os || cancelando) return;
    if (!window.confirm(`Cancelar a ${numeroOS(os.id)}? O status muda para "cancelada".`)) return;
    setCancelando(true);
    try {
      await cancelarOS(os.id);
      await fetchOS();
    } catch (e) {
      alert('Não foi possível cancelar: ' + e.message);
    } finally {
      setCancelando(false);
    }
  }

  if (carregando) return <DetalheSkeleton />;

  if (naoEncontrada) {
    return (
      <Page title="Ordem não encontrada" subtitle="">
        <Card>
          <Empty
            icon="search"
            title="OS não encontrada"
            sub="O identificador informado não corresponde a nenhuma ordem de serviço."
          />
          <div className="row center" style={{ justifyContent: 'center', paddingBottom: 16 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/ordens')}>
              <Icon.chevLeft /> Voltar para Ordens de Serviço
            </button>
          </div>
        </Card>
      </Page>
    );
  }

  if (erro) {
    return (
      <Page title="Erro" subtitle="">
        <Card><Empty icon="alert" title="Não foi possível carregar a OS" sub={erro} /></Card>
      </Page>
    );
  }

  const d = normalizar(os);
  const recebidas = cotacoes.filter(c => c.premio != null && c.premio > 0);
  const cotando = status === 'cotando';

  const actions = (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => alert('Dados validados — nenhum campo obrigatório faltando.')}>
        <Icon.check /> Validar
      </button>
      <button className="btn btn-secondary btn-sm" onClick={() => alert('Comparativo lado a lado (em breve).')}>
        <Icon.layers /> Comparar
      </button>
      <button className="btn btn-primary btn-sm" onClick={handleRecotar} disabled={cotando || recotando}>
        <Icon.refresh className={cotando || recotando ? 'spin' : ''} /> {cotando ? 'Cotando…' : 'Recotar'}
      </button>
    </>
  );

  return (
    <Page title={numeroOS(os.id)} subtitle={`${os.placa || '—'} · ${d.segurado.nome || '—'}`} actions={actions} max={1280}>
      <button
        onClick={() => navigate('/ordens')}
        className="row center gap-6 fz13 fw500"
        style={{ border: 'none', background: 'transparent', color: 'var(--text-soft)', cursor: 'pointer', marginBottom: 14, padding: 0 }}
      >
        <Icon.chevLeft width={16} height={16} />Voltar para Ordens de Serviço
      </button>

      {/* cabeçalho de badges */}
      <div className="row between center wrap gap-12" style={{ marginBottom: 16 }}>
        <div className="row center gap-12 wrap">
          <StatusBadge status={status} />
          <span className="tag tag-blue"><Icon.car width={13} height={13} />{cap(d.ramo)}</span>
          {d.origem && (
            <span className="tag">
              {d.origem === 'CRM' ? <Icon.link width={12} height={12} /> : d.origem === 'Manual' ? <Icon.edit width={12} height={12} /> : <Icon.server width={12} height={12} />}
              Origem: {d.origem}
            </span>
          )}
          {d.prioridade && (
            <span
              className="tag"
              style={{
                color: d.prioridade === 'Alta' ? 'var(--brand-text)' : 'var(--text-soft)',
                background: d.prioridade === 'Alta' ? 'var(--brand-tint)' : 'var(--surface-2)',
                borderColor: d.prioridade === 'Alta' ? 'var(--brand-tint-2)' : 'var(--border)',
              }}
            >
              Prioridade {d.prioridade}
            </span>
          )}
        </div>
        <button className="btn btn-danger btn-sm" onClick={handleCancelar} disabled={cancelando || status === 'cancelada'}>
          {cancelando ? <Icon.refresh className="spin" /> : <Icon.x />} {cancelando ? 'Cancelando…' : 'Cancelar OS'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* ESQUERDA: cotações */}
        <div className="col gap-16" style={{ minWidth: 0 }}>
          <Card title={undefined} pad={false}>
            <div className="card-head">
              <div className="row center gap-8 card-title">
                <Icon.money width={16} height={16} style={{ color: 'var(--text-mute)' }} />
                Cotações
                <span className="tag" style={{ marginLeft: 2 }}>{recebidas.length} recebidas · ordenado por prêmio</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleRecotar} disabled={cotando || recotando}>
                <Icon.refresh className={cotando || recotando ? 'spin' : ''} /> {recebidas.length ? 'Recotar' : 'Cotar Agora'}
              </button>
            </div>
            <div className="card-pad col gap-10">
              {cotando ? (
                <>
                  <div className="row center gap-8 fz13 muted" style={{ marginBottom: 2 }}>
                    <Icon.refresh className="spin" width={15} height={15} style={{ color: 'var(--blue)' }} />
                    Aguardando retorno das seguradoras…
                  </div>
                  <CotacaoSkeleton />
                  <CotacaoSkeleton />
                  <CotacaoSkeleton />
                </>
              ) : recebidas.length === 0 ? (
                <Empty
                  icon="money"
                  title="Nenhuma seguradora retornou prêmio"
                  sub="Tente recotar ou verifique os dados de risco da OS."
                />
              ) : (
                recebidas.map((c, i) => <CotacaoCard key={c.id || c.seguradora} c={c} best={i === 0} />)
              )}
            </div>
          </Card>
        </div>

        {/* DIREITA: dados */}
        <div className="col gap-14" style={{ minWidth: 0 }}>
          <Block icon="user" title="Dados do Segurado">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <KV k="Nome completo" v={d.segurado.nome} />
              <KV k="CPF" v={maskCPF(d.segurado.cpf)} mono />
              <KV k="E-mail" v={d.segurado.email} />
              <KV k="Telefone" v={d.segurado.telefone} mono />
              <KV k="CEP" v={d.segurado.cep} mono />
              <KV k="Cidade / UF" v={d.segurado.cidadeUF} />
            </div>
          </Block>

          <Block icon="car" title="Dados do Veículo">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <KV k="Veículo" v={d.veiculo.descricao} />
              <KV k="Placa" v={d.veiculo.placa} mono />
              <KV k="Cód. FIPE" v={d.veiculo.fipe} mono />
              <KV k="Chassi" v={d.veiculo.chassi} mono />
              <KV k="Ano fab. / modelo" v={d.veiculo.anoFab || d.veiculo.anoMod ? `${d.veiculo.anoFab || '—'} / ${d.veiculo.anoMod || '—'}` : ''} mono />
              <KV k="CEP pernoite" v={d.veiculo.cepPernoite} mono />
            </div>
          </Block>

          <Block icon="users" title="Dados do Condutor">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <KV k="Nome" v={d.condutor.nome} />
              <KV k="Nascimento" v={d.condutor.nascimento} mono />
              <KV k="Sexo" v={d.condutor.sexo} />
              <KV k="Estado civil" v={d.condutor.estadoCivil} />
              <KV k="Relação" v={d.condutor.relacao} />
            </div>
          </Block>

          <Block icon="shield" title="Apólice Anterior">
            {d.apolice ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <KV k="Seguradora" v={d.apolice.seguradora} />
                <KV k="Nº apólice" v={d.apolice.numero} mono />
                <KV k="Classe de bônus" v={String(d.apolice.classeBonus)} />
                <KV k="Houve sinistro?" v={d.apolice.sinistro ? 'Sim' : 'Não'} />
              </div>
            ) : (
              <span className="fz13 muted">Sem apólice anterior informada (1ª contratação · bônus 0).</span>
            )}
          </Block>

          <Block icon="layers" title="Dados do Risco">
            <pre
              className="mono scroll"
              style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, background: 'var(--bg-sunken)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', maxHeight: 240, overflow: 'auto', color: 'var(--text-soft)' }}
            >
              {JSON.stringify(os.dados_risco || {}, null, 2)}
            </pre>
          </Block>
        </div>
      </div>
    </Page>
  );
}
