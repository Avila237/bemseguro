import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Topbar (via Page) busca o usuário; mockamos o client.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

// Controlamos os dados do painel mockando a camada de queries.
const carregarDashboard = vi.fn();
vi.mock('../../lib/dashboard.js', () => ({
  carregarDashboard: (...a) => carregarDashboard(...a),
}));

import Dashboard from '../Dashboard.jsx';

const DADOS = {
  counts: { total: 5, pendente: 1, cotando: 1, cotado: 2, erro: 1, cancelada: 0, conversao: 40 },
  cotacoes: { total: 12, osCount: 5, media: 2.4, serie: [1, 2, 3, 0, 1, 2, 1, 0, 3, 2, 1, 4, 2, 1] },
  alertas: [{ id: 'abc123de', tipo: 'travada', placa: 'ABC1D23', min: 11 }],
  ultimas: [
    { id: 'uuid-0001', placa: 'JCU9D37', nome: 'Ricardo Cabral', veiculo: 'VW Saveiro', status: 'cotado', melhorPreco: 2926.79 },
  ],
  ranking: [{ seguradora: 'Allianz', sucesso: 4, taxa: 80 }],
  vazio: false,
};

function renderDash() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/nova-cotacao" element={<div>Tela Nova Cotação</div>} />
        <Route path="/ordens" element={<div>Lista de OS</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    carregarDashboard.mockReset();
  });

  test('mostra skeleton de carregamento enquanto busca os dados', () => {
    carregarDashboard.mockReturnValue(new Promise(() => {})); // nunca resolve
    renderDash();
    expect(screen.getAllByText('Carregando…').length).toBeGreaterThan(0);
  });

  test('renderiza KPIs, tabela de últimas OS e ranking', async () => {
    carregarDashboard.mockResolvedValue(DADOS);
    renderDash();

    // KPIs
    expect(await screen.findByText('OS hoje')).toBeInTheDocument();
    expect(screen.getByText('40% de conversão')).toBeInTheDocument();

    // tabela últimas OS
    expect(screen.getByText('JCU9D37')).toBeInTheDocument();
    expect(screen.getByText('Ricardo Cabral')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.926,79')).toBeInTheDocument();

    // ranking
    expect(screen.getByText('Allianz')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();

    // alerta de OS travada
    expect(screen.getByText(/OS travada/)).toBeInTheDocument();
  });

  test('mostra estado vazio quando não há dados', async () => {
    carregarDashboard.mockResolvedValue({
      counts: { total: 0, pendente: 0, cotando: 0, cotado: 0, erro: 0, cancelada: 0, conversao: 0 },
      cotacoes: { total: 0, osCount: 0, media: 0, serie: [] },
      alertas: [],
      ultimas: [],
      ranking: [],
      vazio: true,
    });
    renderDash();
    expect(await screen.findByText('Nenhuma OS ainda')).toBeInTheDocument();
  });

  test('o botão Atualizar recarrega os dados', async () => {
    carregarDashboard.mockResolvedValue(DADOS);
    renderDash();
    await screen.findByText('OS hoje');
    expect(carregarDashboard).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /atualizar/i }));
    await waitFor(() => expect(carregarDashboard).toHaveBeenCalledTimes(2));
  });

  test('botão Nova Cotação navega para /nova-cotacao', async () => {
    carregarDashboard.mockResolvedValue(DADOS);
    renderDash();
    await screen.findByText('OS hoje');
    await userEvent.click(screen.getByRole('button', { name: /nova cotação/i }));
    expect(await screen.findByText('Tela Nova Cotação')).toBeInTheDocument();
  });
});
