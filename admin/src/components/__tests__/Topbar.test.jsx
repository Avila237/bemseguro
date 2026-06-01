import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';

// Topbar busca o usuário logado via Supabase — mockamos.
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }),
    },
  },
}));

import Topbar from '../Topbar.jsx';

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
});
