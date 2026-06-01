import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock do client Supabase: controlamos getSession e signInWithPassword por teste.
const getSession = vi.fn();
const signInWithPassword = vi.fn();
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: (...a) => getSession(...a),
      signInWithPassword: (...a) => signInWithPassword(...a),
    },
  },
}));

import Login from '../Login.jsx';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>Painel Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    getSession.mockReset();
    signInWithPassword.mockReset();
  });

  test('renderiza os campos de e-mail, senha e o botao entrar', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderLogin();
    expect(await screen.findByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
    expect(screen.getByText('Entrar no painel')).toBeInTheDocument();
  });

  test('mostra erro quando as credenciais sao invalidas', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    renderLogin();

    await userEvent.type(await screen.findByLabelText('E-mail'), 'errado@teste.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senhaerrada');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/credenciais inválidas/i);
    expect(screen.queryByText('Painel Dashboard')).not.toBeInTheDocument();
  });

  test('chama signInWithPassword e redireciona ao dashboard em caso de sucesso', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    signInWithPassword.mockResolvedValue({ data: { session: { user: { id: '1' } } }, error: null });
    renderLogin();

    await userEvent.type(await screen.findByLabelText('E-mail'), 'admin@bemseguro.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'segredo123');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'admin@bemseguro.com',
      password: 'segredo123',
    });
    expect(await screen.findByText('Painel Dashboard')).toBeInTheDocument();
  });

  test('exibe o painel de marca com tagline e badges das seguradoras', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderLogin();
    await screen.findByLabelText('E-mail');
    expect(
      screen.getByText('Automação de cotações em 8 seguradoras, num só lugar.')
    ).toBeInTheDocument();
    expect(screen.getByText('Allianz')).toBeInTheDocument();
    expect(screen.getByText('Tokio Marine')).toBeInTheDocument();
  });

  test('alterna a visibilidade da senha pelo botao mostrar/ocultar', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderLogin();
    const senha = await screen.findByLabelText('Senha');
    expect(senha).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(senha).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(senha).toHaveAttribute('type', 'password');
  });

  test('redireciona direto ao dashboard se ja autenticado', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: '1' } } } });
    renderLogin();
    expect(await screen.findByText('Painel Dashboard')).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
  });
});
