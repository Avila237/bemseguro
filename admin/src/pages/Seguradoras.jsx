import { useCallback, useEffect, useState } from 'react';
import Page from '../components/Page.jsx';
import { Card, SegLogo, Toggle, Empty, Skeleton } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { slug } from '../lib/format.js';
import { listarSeguradoras, setAtiva, metricasPlaceholder } from '../lib/seguradoras.js';

function SegRow({ s, onToggle }) {
  const m = metricasPlaceholder(s.nome);
  const taxaCor = m.taxaRetorno >= 90 ? 'var(--green)' : m.taxaRetorno >= 85 ? 'var(--blue)' : 'var(--amber)';
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
            <span>Último sucesso <span className="fw500" style={{ color: 'var(--text-soft)' }}>{m.ultimoSucessoMin}min atrás</span></span>
            {m.erros24h > 0 && (
              <span style={{ color: 'var(--red)' }}>{m.erros24h} erro{m.erros24h > 1 ? 's' : ''} em 24h</span>
            )}
          </div>
        </div>

        {/* mini métricas (placeholder) */}
        <div className="row center gap-20" style={{ flex: 'none' }}>
          <div className="col" style={{ alignItems: 'flex-end', gap: 4, width: 96 }}>
            <div className="row center gap-6" style={{ alignSelf: 'stretch', justifyContent: 'flex-end' }}>
              <span className="mono fw600" style={{ fontSize: 16, color: taxaCor }}>{m.taxaRetorno}%</span>
            </div>
            <div style={{ width: '100%', height: 5, borderRadius: 99, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ width: m.taxaRetorno + '%', height: '100%', background: taxaCor, borderRadius: 99 }}></div>
            </div>
            <span className="fz11 muted">taxa retorno</span>
          </div>
          <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
            <span className="mono fw600" style={{ fontSize: 16 }}>{m.tempoMedio}s</span>
            <span className="fz11 muted">tempo médio</span>
          </div>
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
    <button className="btn btn-secondary btn-sm" onClick={() => alert('Teste de conexões (em breve).')}>
      <Icon.refresh /> Testar conexões
    </button>
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
          {list.map(s => <SegRow key={s.id} s={s} onToggle={alternar} />)}
        </div>
      )}
    </Page>
  );
}
