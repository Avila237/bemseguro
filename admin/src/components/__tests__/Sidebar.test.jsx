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
  test('exibe o logo BemSeguro HUB · ADMIN', () => {
    renderAt('/');
    expect(screen.getByText('BemSeguro HUB')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  test('renderiza todos os itens do menu', () => {
    renderAt('/');
    for (const item of NAV_ITEMS) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
    // garante a lista esperada do design
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

  test('item ativo recebe destaque laranja (bg-primary)', () => {
    renderAt('/seguradoras');
    const link = screen.getByText('Seguradoras').closest('a');
    expect(link.className).toContain('bg-primary');
  });

  test('itens inativos nao recebem o destaque laranja', () => {
    renderAt('/seguradoras');
    const dashboard = screen.getByText('Dashboard').closest('a');
    expect(dashboard.className).not.toContain('bg-primary');
  });
});
