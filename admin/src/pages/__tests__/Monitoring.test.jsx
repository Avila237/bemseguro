import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

const carregarMonitoring = vi.fn();
const checarRailway = vi.fn();
vi.mock('../../lib/monitoring.js', () => ({
  carregarMonitoring: (...a) => carregarMonitoring(...a),
  checarRailway: (...a) => checarRailway(...a),
}));

import Monitoring from '../Monitoring.jsx';

const DADOS = {
  tempoMedioS: 42,
  tempoDelta: -8,
  taxaSucesso: 89,
  totalOS7: 120,
  erros24h: 8,
  errosDelta: 3,
  serie: Array.from({ length: 30 }, (_, i) => (i % 5) + 1), // valores 1..5, nenhum 0/8
  taxaPorSeg: [
    { nome: 'HDI', taxa: 92, total: 50 },
    { nome: 'Allianz', taxa: 84, total: 40 },
  ],
  errosRecentes: [
    { id: 'aaaa1111-0000-0000-0000-000000000000', msg: 'Sessão expirada após 3 tentativas', seg: 'Aggilizador', created_at: new Date(Date.now() - 24 * 60000).toISOString() },
    { id: 'bbbb2222-0000-0000-0000-000000000000', msg: 'Timeout no retorno do prêmio', seg: 'Aggilizador', created_at: new Date(Date.now() - 95 * 60000).toISOString() },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/monitoring']}>
      <Monitoring />
    </MemoryRouter>
  );
}

describe('Monitoring', () => {
  beforeEach(() => {
    carregarMonitoring.mockReset().mockResolvedValue(DADOS);
    checarRailway.mockReset().mockResolvedValue(true);
  });

  test('mostra skeleton enquanto carrega', () => {
    carregarMonitoring.mockReturnValue(new Promise(() => {}));
    checarRailway.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  test('renderiza os 4 cards de métricas com valores reais', async () => {
    renderPage();
    expect(await screen.findByText('Tempo médio de cotação')).toBeInTheDocument();
    expect(screen.getByText('Taxa de sucesso global')).toBeInTheDocument();
    expect(screen.getByText('Sessão Aggilizador')).toBeInTheDocument();
    expect(screen.getByText('Erros (24h)')).toBeInTheDocument();

    expect(screen.getByText('42')).toBeInTheDocument(); // tempo médio (s)
    expect(screen.getByText('89')).toBeInTheDocument(); // taxa de sucesso (%)
    expect(screen.getByText('Ativa')).toBeInTheDocument(); // sessão Aggilizador
    expect(screen.getByText('8')).toBeInTheDocument(); // erros 24h
  });

  test('mostra badge "Railway saudável" quando o health check passa', async () => {
    renderPage();
    expect(await screen.findByText('Railway saudável')).toBeInTheDocument();
  });

  test('mostra badge "Railway indisponível" quando o health check falha', async () => {
    checarRailway.mockResolvedValue(false);
    renderPage();
    expect(await screen.findByText('Railway indisponível')).toBeInTheDocument();
  });

  test('renderiza o gráfico de cotações por dia (30 barras)', async () => {
    renderPage();
    await screen.findByText('Cotações por dia');
    // 30 barras com title "X cotações"
    expect(screen.getAllByTitle(/cotações/).length).toBe(30);
  });

  test('renderiza a taxa de sucesso por seguradora', async () => {
    renderPage();
    await screen.findByText('Taxa de sucesso por seguradora');
    expect(screen.getByText('HDI')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('Allianz')).toBeInTheDocument();
    expect(screen.getByText('84%')).toBeInTheDocument();
  });

  test('lista os erros recentes com mensagem e referência da OS', async () => {
    renderPage();
    expect(await screen.findByText('Sessão expirada após 3 tentativas')).toBeInTheDocument();
    expect(screen.getByText('Timeout no retorno do prêmio')).toBeInTheDocument();
    // referência da OS derivada do uuid (numeroOS)
    expect(screen.getByText('OS-AAAA11')).toBeInTheDocument();
    expect(screen.getByText('OS-BBBB22')).toBeInTheDocument();
  });

  test('o botão Atualizar recarrega as métricas', async () => {
    renderPage();
    await screen.findByText('Tempo médio de cotação');
    expect(carregarMonitoring).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /atualizar/i }));
    await waitFor(() => expect(carregarMonitoring).toHaveBeenCalledTimes(2));
  });

  test('estado de erro quando a query falha', async () => {
    carregarMonitoring.mockRejectedValue(new Error('RLS bloqueou'));
    renderPage();
    expect(await screen.findByText('Não foi possível carregar as métricas')).toBeInTheDocument();
    expect(screen.getByText('RLS bloqueou')).toBeInTheDocument();
  });
});
