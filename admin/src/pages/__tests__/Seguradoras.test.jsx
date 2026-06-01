import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

const listarSeguradoras = vi.fn();
const setAtiva = vi.fn();
vi.mock('../../lib/seguradoras.js', async (orig) => {
  const actual = await orig();
  return { ...actual, listarSeguradoras: (...a) => listarSeguradoras(...a), setAtiva: (...a) => setAtiva(...a) };
});

import Seguradoras from '../Seguradoras.jsx';

const SEG = [
  { id: '1', nome: 'Allianz', nome_seguradora: 'Allianz Seguros', ativa: true },
  { id: '2', nome: 'HDI Seguros', nome_seguradora: 'HDI', ativa: false },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/seguradoras']}>
      <Seguradoras />
    </MemoryRouter>
  );
}

describe('Seguradoras', () => {
  beforeEach(() => {
    listarSeguradoras.mockReset().mockResolvedValue(SEG);
    setAtiva.mockReset().mockResolvedValue();
    vi.stubGlobal('alert', vi.fn());
  });

  test('mostra skeleton enquanto carrega', () => {
    listarSeguradoras.mockReturnValue(new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  test('exibe o banner de segurança sobre credenciais', async () => {
    renderPage();
    expect(await screen.findByText(/Credenciais nunca aparecem no painel/)).toBeInTheDocument();
  });

  test('renderiza um card por seguradora com nome e slug', async () => {
    renderPage();
    expect(await screen.findByText('Allianz')).toBeInTheDocument();
    expect(screen.getByText('#allianz')).toBeInTheDocument();
    expect(screen.getByText('HDI Seguros')).toBeInTheDocument();
    expect(screen.getByText('#hdi')).toBeInTheDocument();
  });

  test('subtítulo mostra X de Y ativas', async () => {
    renderPage();
    expect(await screen.findByText('1 de 2 ativas para cotação simultânea')).toBeInTheDocument();
  });

  test('seguradora inativa mostra rótulo "Inativo"', async () => {
    renderPage();
    await screen.findByText('Allianz');
    expect(screen.getByText('Inativo')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  test('toggle chama setAtiva com o novo valor', async () => {
    renderPage();
    await screen.findByText('Allianz');
    await userEvent.click(screen.getByRole('switch', { name: 'Ativar Allianz' }));
    await waitFor(() => expect(setAtiva).toHaveBeenCalledWith('1', false));
  });

  test('estado vazio quando não há seguradoras', async () => {
    listarSeguradoras.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Nenhuma seguradora cadastrada')).toBeInTheDocument();
  });
});
