import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { tituloDaRota } from '../lib/nav.js';
import { supabase } from '../lib/supabase.js';

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [userName, setUserName] = useState('Admin');

  useEffect(() => {
    let ativo = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!ativo) return;
      const user = data && data.user;
      if (user) setUserName(user.email || 'Admin');
    });
    return () => {
      ativo = false;
    };
  }, []);

  const title = tituloDaRota(location.pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          userName={userName}
          onNovaCotacao={() => navigate('/nova-cotacao')}
        />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
