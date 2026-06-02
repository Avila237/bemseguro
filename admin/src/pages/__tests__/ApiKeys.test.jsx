import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

const listarApiKeys = vi.fn();
const criarApiKey = vi.fn();
const revogarApiKey = vi.fn();
vi.mock('../../lib/apiKeys.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    listarApiKeys: (...a) => listarApiKeys(...a),
    criarApiKey: (...a) => criarApiKey(...a),
    revogarApiKey: (...a) => revogarApiKey(...a),
  };
});

import ApiKeys from '../ApiKeys.jsx';

const KEYS = [
  { id: 'k1', nome: 'CRM Produção', key_prefix: 'bsh_live_a93f', ativa: true, rate_limit: 600, created_at: '2026-03-12T10:00:00Z', last_used_at: new Date(Date.now() - 2 * 60000).toISOString() },
  { id: 'k3', nome: 'Webhook legado', key_prefix: 'bsh_live_0d12', ativa: false, rate_limit: 300, created_at: '2026-01-02T10:00:00Z', last_used_at: null },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/api-keys']}>
      <ApiKeys />
    </MemoryRouter>
  );
}

describe('ApiKeys', () => {
  beforeEach(() => {
    listarApiKeys.mockReset().mockResolvedValue(KEYS);
    criarApiKey.mockReset().mockResolvedValue({ chave: 'bsh_live_deadbeefdeadbeefdeadbeef', row: {} });
    revogarApiKey.mockReset().mockResolvedValue();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  test('mostra skeleton enquanto carrega', () => {
    listarApiKeys.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  test('renderiza a tabela com o prefixo da chave, rate e status', async () => {
    renderPage();
    expect(await screen.findByText('CRM Produção')).toBeInTheDocument();
    // exibe apenas o prefixo visível (nunca o hash) seguido de reticências
    expect(screen.getByText('bsh_live_a93f…')).toBeInTheDocument();
    expect(screen.getByText('600/min')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Revogada')).toBeInTheDocument();
  });

  test('só a chave ativa tem botão Revogar', async () => {
    renderPage();
    await screen.findByText('CRM Produção');
    expect(screen.getAllByRole('button', { name: /revogar/i })).toHaveLength(1);
  });

  test('revogar confirma e chama revogarApiKey', async () => {
    renderPage();
    await screen.findByText('CRM Produção');
    await userEvent.click(screen.getByRole('button', { name: /revogar/i }));
    await waitFor(() => expect(revogarApiKey).toHaveBeenCalledWith('k1'));
  });

  test('criar chave: gera, salva e exibe a chave uma única vez', async () => {
    renderPage();
    await screen.findByText('CRM Produção');
    await userEvent.click(screen.getByRole('button', { name: /nova api key/i }));
    expect(await screen.findByText('Criar nova API Key')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nome da chave'), 'CRM Teste');
    await userEvent.click(screen.getByRole('button', { name: /gerar chave/i }));

    await waitFor(() => expect(criarApiKey).toHaveBeenCalledWith({ nome: 'CRM Teste', rateLimit: 60 }));
    expect(await screen.findByText('bsh_live_deadbeefdeadbeefdeadbeef')).toBeInTheDocument();
    expect(screen.getAllByText(/não será exibida novamente/i).length).toBeGreaterThan(0);
  });

  test('estado vazio quando não há chaves', async () => {
    listarApiKeys.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Nenhuma API key')).toBeInTheDocument();
  });
});
