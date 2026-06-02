import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// supabase.auth: getUser (dados), signInWithPassword (verifica senha atual),
// updateUser (troca de senha).
const getUser = vi.fn();
const updateUser = vi.fn();
const signInWithPassword = vi.fn();
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: (...a) => getUser(...a),
      updateUser: (...a) => updateUser(...a),
      signInWithPassword: (...a) => signInWithPassword(...a),
    },
  },
}));

// Histórico vem do lib (mockado); mantemos o resto real via importOriginal.
const carregarHistorico = vi.fn();
vi.mock('../../lib/perfil.js', async (orig) => {
  const actual = await orig();
  return { ...actual, carregarHistorico: (...a) => carregarHistorico(...a) };
});

import MeuPerfil from '../MeuPerfil.jsx';

const USER = {
  email: 'camila.nunes@bemseguro.com.br',
  user_metadata: { full_name: 'Camila Nunes' },
  created_at: '2025-01-14T10:00:00Z',
  last_sign_in_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2h atrás
};

const HIST = [
  { id: 'a1', ico: 'bolt', tone: 'blue', text: 'Disparou cotação para a placa OKF9G31', sub: 'Ramo: auto', created_at: new Date(Date.now() - 30 * 60000).toISOString(), status: 202 },
  { id: 'a2', ico: 'refresh', tone: 'amber', text: 'Recotou a OS-2841AB', sub: 'Reprocessou a cotação', created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), status: 202 },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/perfil']}>
      <MeuPerfil />
    </MemoryRouter>
  );
}

describe('MeuPerfil', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: USER } });
    updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
    signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
    carregarHistorico.mockReset().mockResolvedValue(HIST);
  });

  test('renderiza os dados do usuário autenticado', async () => {
    renderPage();
    await screen.findByText('Visível apenas para você');
    expect(screen.getAllByText('Camila Nunes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('camila.nunes@bemseguro.com.br').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operador').length).toBeGreaterThan(0); // papel (placeholder)
    expect(screen.getByText('não editável')).toBeInTheDocument(); // e-mail bloqueado
    expect(screen.getByText('Último login')).toBeInTheDocument();
    expect(screen.getByText('Conta criada em')).toBeInTheDocument();
    expect(screen.getAllByText('2h atrás').length).toBeGreaterThan(0); // último login relativo
  });

  test('a troca de senha valida os campos antes de enviar', async () => {
    renderPage();
    await screen.findByText('Visível apenas para você');

    await userEvent.type(screen.getByLabelText('Senha atual'), 'atual123');
    await userEvent.type(screen.getByLabelText('Nova senha'), 'curta'); // < 8 caracteres
    await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'curta');
    await userEvent.click(screen.getByRole('button', { name: /salvar nova senha/i }));

    expect(await screen.findByText(/no mínimo 8 caracteres/i)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test('troca de senha com sucesso chama updateUser e mostra confirmação', async () => {
    renderPage();
    await screen.findByText('Visível apenas para você');

    await userEvent.type(screen.getByLabelText('Senha atual'), 'atual123');
    await userEvent.type(screen.getByLabelText('Nova senha'), 'novaSenha123');
    await userEvent.type(screen.getByLabelText('Confirmar nova senha'), 'novaSenha123');
    await userEvent.click(screen.getByRole('button', { name: /salvar nova senha/i }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'novaSenha123' }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: USER.email, password: 'atual123' });
    expect(await screen.findByText(/senha alterada com sucesso/i)).toBeInTheDocument();
  });

  test('o histórico lista as ações do audit_log', async () => {
    renderPage();
    expect(await screen.findByText('Disparou cotação para a placa OKF9G31')).toBeInTheDocument();
    expect(screen.getByText('Recotou a OS-2841AB')).toBeInTheDocument();
    expect(screen.getByText(/histórico geral do painel/i)).toBeInTheDocument();
  });

  test('mostra o estado vazio quando não há histórico', async () => {
    carregarHistorico.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Ainda não há ações registradas')).toBeInTheDocument();
  });
});
