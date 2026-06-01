import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect } from 'vitest';
import Layout from '../Layout.jsx';

function renderAt(path, children) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>{children}</Layout>
    </MemoryRouter>
  );
}

describe('Layout', () => {
  test('renderiza a sidebar e o conteúdo (children)', () => {
    renderAt('/dashboard', <div>Conteúdo da página</div>);
    // sidebar (wordmark)
    expect(screen.getByText('Seguro')).toBeInTheDocument();
    expect(screen.getByText('Hub · Admin')).toBeInTheDocument();
    // children
    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
  });

  test('renderiza os itens de navegação da sidebar', () => {
    renderAt('/dashboard', <div>x</div>);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Ordens de Serviço')).toBeInTheDocument();
  });
});
