import { useCallback, useEffect, useState } from 'react';
import Page from '../components/Page.jsx';
import { Card, Modal, Empty, Skeleton, Toast } from '../components/Ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { timeAgo } from '../lib/format.js';
import { listarApiKeys, criarApiKey, revogarApiKey } from '../lib/apiKeys.js';

const RATE_OPCOES = [60, 120, 300, 600];

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function TabelaSkeleton() {
  return (
    <div style={{ padding: '8px 14px' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="row center gap-12" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <Skeleton width="20%" height={14} />
          <Skeleton width={140} height={20} radius="var(--r-xs)" />
          <Skeleton width={80} height={14} />
          <Skeleton width={70} height={14} />
          <Skeleton width={60} height={20} radius="99px" />
        </div>
      ))}
    </div>
  );
}

export default function ApiKeys() {
  const [list, setList] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [rateLimit, setRateLimit] = useState(60);
  const [gerando, setGerando] = useState(false);
  const [gerada, setGerada] = useState(null); // chave completa, exibida 1x
  const [copiado, setCopiado] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setCarregando(true);
    try {
      setList(await listarApiKeys());
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

  function abrirCriar() {
    setNome('');
    setRateLimit(60);
    setGerada(null);
    setCopiado(false);
    setCreateOpen(true);
  }

  async function gerar() {
    if (!nome.trim()) {
      alert('Informe um nome para a chave.');
      return;
    }
    setGerando(true);
    try {
      const { chave } = await criarApiKey({ nome: nome.trim(), rateLimit });
      setGerada(chave);
      load();
    } catch (e) {
      alert('Não foi possível criar a chave: ' + e.message);
    } finally {
      setGerando(false);
    }
  }

  async function copiar() {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(gerada);
      setCopiado(true);
      setToast('Chave copiada');
    } catch {
      /* clipboard indisponível — ignora */
    }
  }

  async function revogar(k) {
    if (!window.confirm(`Revogar a chave "${k.nome}"? Integrações que a usam deixarão de funcionar.`)) return;
    try {
      await revogarApiKey(k.id);
      load();
    } catch (e) {
      alert('Não foi possível revogar: ' + e.message);
    }
  }

  const actions = (
    <button className="btn btn-primary btn-sm" onClick={abrirCriar}>
      <Icon.plus /> Nova API Key
    </button>
  );

  return (
    <Page title="API Keys" subtitle="Chaves de acesso para o CRM integrar via Edge Function" actions={actions} max={1000}>
      <Toast message={toast} />

      <Card pad={false}>
        {carregando ? (
          <TabelaSkeleton />
        ) : erro ? (
          <Empty icon="alert" title="Erro ao carregar" sub={erro} />
        ) : list.length === 0 ? (
          <Empty icon="key" title="Nenhuma API key" sub="Crie a primeira chave para o CRM integrar com o Hub." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Chave</th>
                <th>Criada em</th>
                <th>Último uso</th>
                <th>Rate limit</th>
                <th>Status</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {list.map(k => (
                <tr key={k.id} style={{ cursor: 'default', opacity: k.ativa ? 1 : 0.6 }}>
                  <td className="fw600">{k.nome}</td>
                  <td><span className="tag" style={{ fontFamily: 'var(--font-mono)' }}>{k.key_prefix ? `${k.key_prefix}…` : '—'}</span></td>
                  <td className="fz13 muted">{fmtData(k.created_at)}</td>
                  <td className="fz13 muted">{k.last_used_at ? timeAgo(k.last_used_at) : <span className="muted">nunca</span>}</td>
                  <td className="mono fz13">{k.rate_limit}/min</td>
                  <td>
                    {k.ativa
                      ? <span className="badge st-cotado"><span className="dot"></span>Ativa</span>
                      : <span className="badge st-pendente"><span className="dot"></span>Revogada</span>}
                  </td>
                  <td>
                    {k.ativa && (
                      <button className="btn btn-danger btn-sm" onClick={() => revogar(k)}>Revogar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Criar nova API Key"
        width={540}
        footer={
          gerada ? (
            <>
              <span className="fz12 muted">Salve esta chave — não será exibida novamente.</span>
              <button className="btn btn-primary" onClick={() => setCreateOpen(false)}>Concluir</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={gerar} disabled={gerando}>
                {gerando ? <><Icon.refresh className="spin" width={16} height={16} />Gerando…</> : <><Icon.key />Gerar chave</>}
              </button>
            </>
          )
        }
      >
        {!gerada ? (
          <div className="col gap-16">
            <div className="field">
              <label className="label">Nome da chave<span className="req">*</span></label>
              <input className="input" aria-label="Nome da chave" placeholder="Ex: CRM Produção" value={nome} onChange={e => setNome(e.target.value)} />
              <span className="hint">Identifica onde a chave é usada.</span>
            </div>
            <div className="field">
              <label className="label">Rate limit</label>
              <select className="select" aria-label="Rate limit" value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))}>
                {RATE_OPCOES.map(r => <option key={r} value={r}>{r}/min</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className="col gap-14">
            <div className="row center gap-10" style={{ padding: '11px 13px', background: 'var(--st-cancelada-bg)', borderRadius: 10 }}>
              <Icon.alert width={17} height={17} style={{ color: 'var(--amber)', flex: 'none' }} />
              <span className="fz13" style={{ color: 'var(--st-cancelada-fg)' }}>
                Esta chave é exibida <span className="fw600">uma única vez</span>. Salve-a agora — não será exibida novamente.
              </span>
            </div>
            <div className="field">
              <label className="label">Sua nova chave</label>
              <div className="row center gap-8" style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-strong)', borderRadius: 9, padding: '4px 4px 4px 12px' }}>
                <span className="mono fz13 grow" style={{ wordBreak: 'break-all' }}>{gerada}</span>
                <button className={'btn btn-sm ' + (copiado ? 'btn-blue' : 'btn-secondary')} onClick={copiar}>
                  {copiado ? <><Icon.check />Copiado</> : <><Icon.copy />Copiar</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
