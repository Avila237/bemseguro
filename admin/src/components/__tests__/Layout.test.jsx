import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi } from 'vitest';

// Layout consome o client Supabase para descobrir o usuario logado — mockamos.
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }),
    },
  },
}));

import Layout from '../Layout.jsx';

function renderAt(path, children) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>{children}</Layout>
    </MemoryRouter>
  );
}

describe('Layout', () => {
  test('compoe sidebar, topbar e area de conteudo', async () => {
    renderAt('/', <div>Conteúdo da página</div>);
    // sidebar (logo)
    expect(screen.getByText('BemSeguro HUB')).toBeInTheDocument();
    // topbar (botao)
    expect(screen.getByRole('button', { name: 'Nova Cotação' })).toBeInTheDocument();
    // conteudo (children)
    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
    // aguarda o efeito de carregar o usuario assentar
    await screen.findByText('admin@bemseguro.com');
  });

  test('o titulo da topbar reflete a rota atual', async () => {
    renderAt('/seguradoras', <div>x</div>);
    expect(await screen.findByRole('heading', { name: 'Seguradoras' })).toBeInTheDocument();
    await screen.findByText('admin@bemseguro.com');
  });

  test('rota raiz mostra o titulo Dashboard', async () => {
    renderAt('/', <div>x</div>);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await screen.findByText('admin@bemseguro.com');
  });

  test('exibe o email do usuario carregado do Supabase', async () => {
    renderAt('/', <div>x</div>);
    expect(await screen.findByText('admin@bemseguro.com')).toBeInTheDocument();
  });
});
