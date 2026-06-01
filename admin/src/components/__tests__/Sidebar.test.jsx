import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect } from 'vitest';
import Sidebar from '../Sidebar.jsx';
import { NAV_ITEMS } from '../../lib/nav.js';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  test('exibe o wordmark BemSeguro · Hub · Admin', () => {
    renderAt('/dashboard');
    // "Bem" e "Seguro" são spans separados (Seguro em laranja)
    expect(screen.getByText('Bem')).toBeInTheDocument();
    expect(screen.getByText('Seguro')).toBeInTheDocument();
    expect(screen.getByText('Hub · Admin')).toBeInTheDocument();
  });

  test('renderiza todos os itens do menu', () => {
    renderAt('/dashboard');
    for (const item of NAV_ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
    expect(NAV_ITEMS.map(i => i.label)).toEqual([
      'Dashboard',
      'Ordens de Serviço',
      'Nova Cotação',
      'Seguradoras',
      'Monitoring',
      'API Keys',
      'Audit Log',
    ]);
  });

  test('item ativo recebe aria-current=page', () => {
    renderAt('/seguradoras');
    const link = screen.getByText('Seguradoras').closest('a');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  test('itens inativos nao recebem aria-current', () => {
    renderAt('/seguradoras');
    const dashboard = screen.getByText('Dashboard').closest('a');
    expect(dashboard).not.toHaveAttribute('aria-current');
  });
});
