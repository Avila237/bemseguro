import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

// Verifica se ha uma sessao Supabase Auth ativa. Enquanto verifica, mostra um
// estado de carregamento; sem sessao, redireciona para /admin/login (o basename
// /admin do Router transforma o "/login" no caminho final).
export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState('loading'); // loading | authed | unauthed

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setStatus(data && data.session ? 'authed' : 'unauthed');
    });
    return () => {
      ativo = false;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center text-status-gray">
        Carregando…
      </div>
    );
  }

  if (status === 'unauthed') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
