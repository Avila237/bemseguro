import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Sidebar busca o contador de OS ativas para o badge — mockamos.
vi.mock('../../lib/osStats.js', () => ({ contarOSAtivas: vi.fn().mockResolvedValue(4) }));

// O widget de sessão chama GET /session/status — mockamos só o fetch, mantendo
// os helpers reais (formatTTL/faixaSessao) via importOriginal.
const { mockSessionStatus } = vi.hoisted(() => ({ mockSessionStatus: vi.fn() }));
vi.mock('../../lib/sessionStatus.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSessionStatus: (...a) => mockSessionStatus(...a) };
});

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
  beforeEach(() => {
    mockSessionStatus.mockReset().mockResolvedValue({
      ativa: true,
      ttl_segundos: 1800, // 30:00, > 10min → verde / "Ativa"
      expira_em: new Date(Date.now() + 1800000).toISOString(),
      ultima_renovacao: new Date(Date.now() - 300000).toISOString(),
    });
  });

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
      'Ajuda & Docs',
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

  test('exibe badge com o total de OS ativas no item Ordens de Serviço', async () => {
    renderAt('/dashboard');
    const badge = await screen.findByText('4');
    expect(badge).toBeInTheDocument();
    // o badge fica dentro do link de Ordens de Serviço
    expect(badge.closest('a')).toHaveTextContent('Ordens de Serviço');
  });

  test('widget da Sessão Aggilizador mostra dados reais (badge + timer)', async () => {
    renderAt('/dashboard');
    // ttl 1800s → "Ativa" (verde) e timer 30:00
    expect(await screen.findByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('30:00')).toBeInTheDocument();
  });

  test('widget mostra "Status indisponível" quando o Railway não responde', async () => {
    mockSessionStatus.mockRejectedValue(new Error('rede'));
    renderAt('/dashboard');
    expect(await screen.findByText('Status indisponível')).toBeInTheDocument();
  });
});
