import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';

// Placeholder do conteudo protegido. Cada pagina sera adicionada depois em src/pages/.
function ContentPlaceholder() {
  return (
    <div className="text-status-gray">
      Selecione uma seção no menu lateral.
    </div>
  );
}

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
          <Route path="dashboard" element={<ContentPlaceholder />} />
          {/* As demais paginas serao registradas aqui conforme forem criadas */}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
