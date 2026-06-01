import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import OrdemServico from './pages/OrdemServico.jsx';
import DetalheOS from './pages/DetalheOS.jsx';
import NovaCotacao from './pages/NovaCotacao.jsx';

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Area autenticada: tudo dentro do Layout, protegido por sessao Supabase */}
        <Route
          element={
            <ProtectedRoute>
              <Layout>
                <Outlet />
              </Layout>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="ordens" element={<OrdemServico />} />
          <Route path="ordens/:id" element={<DetalheOS />} />
          <Route path="nova-cotacao" element={<NovaCotacao />} />
          {/* As demais paginas serao registradas aqui conforme forem criadas */}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
