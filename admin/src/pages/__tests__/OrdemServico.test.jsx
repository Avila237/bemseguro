import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Topbar (via Page) busca o usuário.
vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

// Camada de queries mockada.
const carregarLista = vi.fn();
const contarStatus = vi.fn();
const cancelarOS = vi.fn();
vi.mock('../../lib/ordens.js', () => ({
  carregarLista: (...a) => carregarLista(...a),
  contarStatus: (...a) => contarStatus(...a),
  cancelarOS: (...a) => cancelarOS(...a),
  PAGE_SIZE: 10,
}));

import OrdemServico from '../OrdemServico.jsx';

const ROWS = {
  rows: [
    {
      id: 'f256d8aa-0000-0000-0000-000000000000',
      placa: 'KF9G31',
      cpf: '12345678900',
      nome: 'Teste Completo',
      veiculo: 'Celta Spirit 1.0',
      status: 'erro',
      created_at: new Date(Date.now() - 8 * 60000).toISOString(),
      melhorPreco: null,
    },
    {
      id: '959373bb-1111-1111-1111-111111111111',
      placa: 'RTA1B23',
      cpf: '98765432100',
      nome: 'Maria Souza',
      veiculo: 'Onix LT 1.0',
      status: 'cotado',
      created_at: new Date(Date.now() - 60 * 60000).toISOString(),
      melhorPreco: 2926.79,
    },
  ],
  total: 2,
  pageSize: 10,
};
const COUNTS = { todos: 2, pendente: 0, cotando: 0, cotado: 1, erro: 1, cancelada: 0 };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ordens']}>
      <Routes>
        <Route path="/ordens" element={<OrdemServico />} />
        <Route path="/ordens/:id" element={<div>Detalhe da OS</div>} />
        <Route path="/nova-cotacao" element={<div>Tela Nova Cotação</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('OrdemServico (Lista de OS)', () => {
  beforeEach(() => {
    carregarLista.mockReset().mockResolvedValue(ROWS);
    contarStatus.mockReset().mockResolvedValue(COUNTS);
    cancelarOS.mockReset().mockResolvedValue();
  });

  test('mostra skeleton enquanto carrega', () => {
    carregarLista.mockReturnValue(new Promise(() => {}));
    contarStatus.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.skeleton')).toBeTruthy();
    expect(screen.queryByText('Teste Completo')).not.toBeInTheDocument();
  });

  test('renderiza linhas com Nº OS, CPF mascarado, status e melhor preço', async () => {
    renderPage();
    expect(await screen.findByText('Teste Completo')).toBeInTheDocument();
    expect(screen.getByText('OS-F256D8')).toBeInTheDocument();
    expect(screen.getByText('123.***.***-00')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.926,79')).toBeInTheDocument();
    // veículo na linha menor
    expect(screen.getByText('Celta Spirit 1.0')).toBeInTheDocument();
  });

  test('clicar numa linha navega para o detalhe', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('Teste Completo'));
    expect(await screen.findByText('Detalhe da OS')).toBeInTheDocument();
  });

  test('clicar numa tab de status recarrega com o filtro', async () => {
    renderPage();
    await screen.findByText('Teste Completo');
    await userEvent.click(screen.getByRole('button', { name: /^Cotado/ }));
    await waitFor(() =>
      expect(carregarLista).toHaveBeenCalledWith(expect.objectContaining({ status: 'cotado', page: 0 }))
    );
  });

  test('busca com debounce filtra a lista', async () => {
    renderPage();
    await screen.findByText('Teste Completo');
    await userEvent.type(screen.getByLabelText('Buscar'), 'maria');
    await waitFor(() =>
      expect(carregarLista).toHaveBeenCalledWith(expect.objectContaining({ busca: 'maria' }))
    );
  });

  test('estado vazio quando não há OS', async () => {
    carregarLista.mockResolvedValue({ rows: [], total: 0, pageSize: 10 });
    contarStatus.mockResolvedValue({ todos: 0, pendente: 0, cotando: 0, cotado: 0, erro: 0, cancelada: 0 });
    renderPage();
    expect(await screen.findByText('Nenhuma OS encontrada')).toBeInTheDocument();
  });

  test('paginação avança de página', async () => {
    carregarLista.mockResolvedValue({ ...ROWS, total: 25 });
    renderPage();
    await screen.findByText('Teste Completo');
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(carregarLista).toHaveBeenCalledWith(expect.objectContaining({ page: 1 })));
  });

  test('botão Nova Cotação navega para /nova-cotacao', async () => {
    renderPage();
    await screen.findByText('Teste Completo');
    await userEvent.click(screen.getByRole('button', { name: /nova cotação/i }));
    expect(await screen.findByText('Tela Nova Cotação')).toBeInTheDocument();
  });
});
