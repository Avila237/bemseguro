import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Placeholder de login. A tela real sera implementada depois em src/pages/.
function LoginPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-status-gray">
      Tela de login (a implementar)
    </div>
  );
}

// Placeholder do conteudo protegido. Cada pagina sera adicionada depois.
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
        <Route path="/login" element={<LoginPlaceholder />} />

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
          <Route index element={<ContentPlaceholder />} />
          {/* As paginas serao registradas aqui conforme forem criadas */}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
