import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Variáveis acessíveis dentro das factories de mock (vi.mock é "hoisted").
const { mockNavigate, mockSignOut } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignOut: vi.fn(),
}));

// Topbar usa useNavigate para redirecionar no logout — mockamos só essa peça.
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

// Topbar busca o usuário logado e faz signOut via Supabase — mockamos.
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }),
      signOut: mockSignOut,
    },
  },
}));

import Topbar from '../Topbar.jsx';

beforeEach(() => {
  mockNavigate.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });
});

describe('Topbar', () => {
  test('exibe título e subtítulo da página', () => {
    render(<Topbar title="Dashboard" subtitle="Visão geral" />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Visão geral')).toBeInTheDocument();
  });

  test('renderiza as ações passadas pela página', () => {
    render(<Topbar title="Dashboard" actions={<button>Nova Cotação</button>} />);
    expect(screen.getByRole('button', { name: 'Nova Cotação' })).toBeInTheDocument();
  });

  test('exibe o sino de alertas', () => {
    render(<Topbar title="Dashboard" />);
    expect(screen.getByRole('button', { name: 'Alertas' })).toBeInTheDocument();
  });

  test('exibe o e-mail do usuário carregado do Supabase', async () => {
    render(<Topbar title="Dashboard" />);
    expect(await screen.findByText('admin@bemseguro.com')).toBeInTheDocument();
  });

  test('clicar no avatar abre o dropdown com "Meu perfil" e "Sair"', async () => {
    render(<Topbar title="Dashboard" />);
    expect(screen.queryByRole('menu')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /menu do usuário/i }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /meu perfil/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sair/i })).toBeInTheDocument();
  });

  test('clicar em "Sair" chama signOut e redireciona para o login', async () => {
    render(<Topbar title="Dashboard" />);
    await userEvent.click(screen.getByRole('button', { name: /menu do usuário/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sair/i }));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true }));
  });

  test('clicar em "Meu perfil" navega para /perfil e fecha o menu', async () => {
    render(<Topbar title="Dashboard" />);
    await userEvent.click(screen.getByRole('button', { name: /menu do usuário/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /meu perfil/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/perfil');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test('tecla ESC fecha o dropdown', async () => {
    render(<Topbar title="Dashboard" />);
    await userEvent.click(screen.getByRole('button', { name: /menu do usuário/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  test('clicar fora fecha o dropdown', async () => {
    render(
      <div>
        <Topbar title="Dashboard" />
        <button>area fora</button>
      </div>
    );
    await userEvent.click(screen.getByRole('button', { name: /menu do usuário/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'area fora' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
