import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

const carregarAudit = vi.fn();
const listarEndpoints = vi.fn();
vi.mock('../../lib/auditLog.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual, // mantém STATUS_OPCOES e PAGE_SIZE reais
    carregarAudit: (...a) => carregarAudit(...a),
    listarEndpoints: (...a) => listarEndpoints(...a),
  };
});

import AuditLog from '../AuditLog.jsx';

// created_at sem 'Z' → horário local (determinístico p/ dataHora entre máquinas).
const ROWS = [
  { id: 'a1', endpoint: '/run-quote', metodo: 'POST', status: 202, ms: 184, interno: false, keyNome: 'CRM Produção', created_at: '2026-06-01T14:32:08' },
  { id: 'a2', endpoint: '/lookup/placa', metodo: 'POST', status: 200, ms: 410, interno: true, keyNome: 'interno', created_at: '2026-06-01T14:30:12' },
  { id: 'a3', endpoint: '/run-quote', metodo: 'POST', status: 500, ms: 1820, interno: false, keyNome: 'CRM Produção', created_at: '2026-06-01T14:22:18' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/audit-log']}>
      <AuditLog />
    </MemoryRouter>
  );
}

describe('AuditLog', () => {
  beforeEach(() => {
    carregarAudit.mockReset().mockResolvedValue({ rows: ROWS, total: 3, pageSize: 20 });
    listarEndpoints.mockReset().mockResolvedValue(['/lookup/placa', '/run-quote']);
    vi.stubGlobal('alert', vi.fn());
  });

  test('mostra skeleton enquanto carrega', () => {
    carregarAudit.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  test('renderiza linhas com data/hora, método, endpoint, status e duração', async () => {
    renderPage();
    expect(await screen.findByText('01/06 14:32:08')).toBeInTheDocument();
    const tabela = within(screen.getByRole('table'));
    expect(tabela.getAllByText('/run-quote').length).toBeGreaterThanOrEqual(1);
    // status como badge (escopo na tabela — fora dos <option> do filtro)
    expect(tabela.getByText('202')).toBeInTheDocument();
    expect(tabela.getByText('500')).toBeInTheDocument();
    expect(tabela.getByText('184ms')).toBeInTheDocument();
    expect(tabela.getByText('1.8s')).toBeInTheDocument(); // 1820ms formatado em segundos
  });

  test('mostra "interno" quando api_key_id é null e o nome da key caso contrário', async () => {
    renderPage();
    await screen.findByText('01/06 14:32:08');
    expect(screen.getByText('interno')).toBeInTheDocument();
    expect(screen.getAllByText('CRM Produção').length).toBeGreaterThanOrEqual(1);
  });

  test('popula o dropdown de endpoints e filtra ao selecionar', async () => {
    renderPage();
    await screen.findByText('01/06 14:32:08');
    await waitFor(() => expect(listarEndpoints).toHaveBeenCalled());

    await userEvent.selectOptions(screen.getByLabelText('Endpoint'), '/run-quote');
    await waitFor(() =>
      expect(carregarAudit).toHaveBeenCalledWith(expect.objectContaining({ endpoint: '/run-quote', page: 0 }))
    );
  });

  test('filtra por status HTTP', async () => {
    renderPage();
    await screen.findByText('01/06 14:32:08');
    await userEvent.selectOptions(screen.getByLabelText('Status'), '500');
    await waitFor(() =>
      expect(carregarAudit).toHaveBeenCalledWith(expect.objectContaining({ status: '500', page: 0 }))
    );
  });

  test('rodapé mostra contagem e janela de 24h', async () => {
    renderPage();
    await screen.findByText('01/06 14:32:08');
    expect(screen.getByText(/janela de 24h/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('paginação avança de página e rechama a query', async () => {
    carregarAudit.mockResolvedValue({ rows: ROWS, total: 45, pageSize: 20 });
    renderPage();
    await screen.findByText('01/06 14:32:08');
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    await waitFor(() =>
      expect(carregarAudit).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    );
  });

  test('estado vazio quando não há registros', async () => {
    carregarAudit.mockResolvedValue({ rows: [], total: 0, pageSize: 20 });
    renderPage();
    expect(await screen.findByText('Nenhuma chamada registrada')).toBeInTheDocument();
  });

  test('estado de erro quando a query falha', async () => {
    carregarAudit.mockRejectedValue(new Error('RLS bloqueou'));
    renderPage();
    expect(await screen.findByText('Erro ao carregar')).toBeInTheDocument();
    expect(screen.getByText('RLS bloqueou')).toBeInTheDocument();
  });
});
