import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

import Ajuda from '../Ajuda.jsx';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ajuda']}>
      <Ajuda />
    </MemoryRouter>
  );
}

// O <nav> do índice tem aria-label "Índice da ajuda" — escopa as buscas só ao índice
// (fora dele há o botão do card "Precisa de ajuda?" e os botões "Próximo" dos artigos).
const getIndice = () => screen.getByRole('navigation', { name: /índice/i });

describe('Ajuda — Central de Ajuda', () => {
  beforeEach(() => {
    vi.stubGlobal('print', vi.fn());
  });

  test('renderiza o índice com as 9 seções', () => {
    renderPage();
    const nav = getIndice();
    expect(within(nav).getAllByRole('button')).toHaveLength(9);
    ['Bem-vindo', 'Acesso ao Painel', 'Criando Cotações', 'Acompanhando OS', 'API Keys',
      'Seguradoras', 'Monitoring', 'Runbook de Incidentes', 'Perguntas Frequentes']
      .forEach(label => expect(within(nav).getByText(label)).toBeInTheDocument());
  });

  test('busca filtra as seções do índice (com debounce)', async () => {
    renderPage();
    const nav = getIndice();
    await userEvent.type(screen.getByLabelText('Buscar nas seções'), 'runbook');

    await waitFor(() => expect(within(nav).queryByText('Bem-vindo')).toBeNull());
    expect(within(nav).getByText('Runbook de Incidentes')).toBeInTheDocument();
    expect(within(nav).getAllByRole('button')).toHaveLength(1);
  });

  test('clicar numa seção do índice troca o artigo exibido', async () => {
    renderPage();
    const nav = getIndice();

    // começa no artigo 01 (Bem-vindo)
    expect(screen.getByText('Seção 01')).toBeVisible();
    expect(screen.getByText('Seção 03')).not.toBeVisible();

    await userEvent.click(within(nav).getByRole('button', { name: /Criando Cotações/i }));

    expect(screen.getByText('Seção 03')).toBeVisible();
    expect(screen.getByText('Seção 01')).not.toBeVisible();
  });

  test('o botão "Próximo" avança para a seção seguinte', async () => {
    const { container } = renderPage();

    // artigo ativo inicial = 01; clica em "Próximo" dentro dele
    const ativo = container.querySelector('article[data-active="true"]');
    expect(ativo).toHaveAttribute('data-id', 'bem-vindo');
    await userEvent.click(within(ativo).getByRole('button', { name: /Próximo/i }));

    // agora o ativo é a seção 02 (Acesso ao Painel)
    expect(container.querySelector('article[data-active="true"]')).toHaveAttribute('data-id', 'acesso');
    expect(screen.getByText('Seção 02')).toBeVisible();
  });

  test('botão "Imprimir guia" dispara window.print', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Imprimir guia/i }));
    expect(window.print).toHaveBeenCalled();
  });
});
