import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock do client Supabase: controlamos o retorno de getSession por teste.
const getSession = vi.fn();
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getSession: (...args) => getSession(...args) } },
}));

import ProtectedRoute from '../ProtectedRoute.jsx';

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Área protegida</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Tela de login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  test('renderiza os filhos quando ha sessao ativa', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    renderApp();
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
  });

  test('redireciona para /login quando nao ha sessao', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderApp();
    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
  });

  test('mostra estado de carregamento enquanto verifica a sessao', () => {
    getSession.mockReturnValue(new Promise(() => {})); // nunca resolve
    renderApp();
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });
});
