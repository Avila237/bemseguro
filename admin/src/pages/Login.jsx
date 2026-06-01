import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { Shield, Mail, Lock, Eye, EyeOff, Refresh, ArrowRight } from '../components/Icons.jsx';

const SEGURADORAS = ['Allianz', 'Porto Seguro', 'HDI', 'Tokio Marine', '+4'];
const SYSTEM_URL = 'bemseguro-production.up.railway.app/admin';

export default function Login() {
  const navigate = useNavigate();
  const [verificando, setVerificando] = useState(true);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [show, setShow] = useState(false);
  const [manter, setManter] = useState(true);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  // Se já houver sessão ativa, vai direto pro dashboard.
  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data && data.session) {
        navigate('/dashboard', { replace: true });
      } else {
        setVerificando(false);
      }
    });
    return () => {
      ativo = false;
    };
  }, [navigate]);

  async function submit(e) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        setErro('Credenciais inválidas. Verifique o e-mail e a senha.');
        return;
      }
      navigate('/dashboard', { replace: true });
    } catch {
      setErro('Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function esqueciSenha(e) {
    e.preventDefault();
    alert('Entre em contato com o administrador.');
  }

  if (verificando) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <Refresh className="spin" width={20} height={20} style={{ color: 'var(--text-mute)' }} />
      </div>
    );
  }

  return (
    <div
      className="login-split"
      style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', background: 'var(--bg)' }}
    >
      {/* painel esquerdo — marca */}
      <div
        className="login-brand"
        style={{
          position: 'relative',
          background: 'linear-gradient(160deg, oklch(0.55 0.16 45), oklch(0.46 0.14 38))',
          color: '#fff',
          padding: '48px 56px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.5,
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        ></div>

        <div className="row center gap-12" style={{ position: 'relative' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: 'rgba(255,255,255,0.16)',
              display: 'grid',
              placeItems: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            <Shield width={22} height={22} style={{ color: '#fff', strokeWidth: 2 }} />
          </div>
          <div className="col" style={{ lineHeight: 1.1 }}>
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>BemSeguro</span>
            <span className="mono" style={{ fontSize: 10, opacity: 0.8, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Hub · Admin
            </span>
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: 420 }}>
          <h2 style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 16 }}>
            Automação de cotações em 8 seguradoras, num só lugar.
          </h2>
          <p style={{ fontSize: 14.5, opacity: 0.9, lineHeight: 1.6 }}>
            Receba dados via CRM ou formulário, dispare a cotação simultânea e acompanhe prêmios e PDFs em tempo real.
          </p>
          <div className="row wrap gap-8" style={{ marginTop: 24 }}>
            {SEGURADORAS.map(s => (
              <span
                key={s}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  padding: '5px 11px',
                  borderRadius: 99,
                  background: 'rgba(255,255,255,0.14)',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="mono" style={{ position: 'relative', fontSize: 11, opacity: 0.7 }}>
          {SYSTEM_URL}
        </div>
      </div>

      {/* painel direito — formulário */}
      <div style={{ display: 'grid', placeItems: 'center', padding: 32 }}>
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 360 }} noValidate>
          <h1 style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>Entrar no painel</h1>
          <p className="muted fz13" style={{ marginTop: 6, marginBottom: 28 }}>
            Acesso restrito à equipe da corretora.
          </p>

          <div className="col gap-16">
            <div className="field">
              <label className="label" htmlFor="email">E-mail</label>
              <div style={{ position: 'relative' }}>
                <Mail width={16} height={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-faint)' }} />
                <input
                  id="email"
                  className="input"
                  style={{ paddingLeft: 36 }}
                  type="email"
                  autoComplete="email"
                  placeholder="voce@corretora.com.br"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="senha">Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock width={16} height={16} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-faint)' }} />
                <input
                  id="senha"
                  className="input mono"
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{ position: 'absolute', right: 8, top: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-mute)', padding: 4 }}
                >
                  {show ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}
                </button>
              </div>
            </div>

            <div className="row between center">
              <label className="row center gap-6 fz13 soft" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={manter}
                  onChange={e => setManter(e.target.checked)}
                  style={{ accentColor: 'var(--brand)', width: 15, height: 15 }}
                />{' '}
                Manter conectado
              </label>
              <a href="#" className="fz13" onClick={esqueciSenha}>Esqueci a senha</a>
            </div>

            {erro && (
              <div
                role="alert"
                className="fz13"
                style={{
                  background: 'var(--red-tint)',
                  color: 'var(--red)',
                  border: '1px solid color-mix(in oklch, var(--red) 25%, transparent)',
                  borderRadius: 'var(--r-sm)',
                  padding: '9px 12px',
                }}
              >
                {erro}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: 4 }}
              disabled={loading}
            >
              {loading ? <Refresh className="spin" width={17} height={17} /> : <>Entrar <ArrowRight /></>}
            </button>
          </div>

          <div className="fz12 muted" style={{ textAlign: 'center', marginTop: 22, lineHeight: 1.6 }}>
            Autenticação via <span className="fw600">Supabase Auth</span>.
            <br />
            Usuários criados manualmente — sem cadastro público.
          </div>
        </form>
      </div>
    </div>
  );
}
