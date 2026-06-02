import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

const listarSeguradoras = vi.fn();
const setAtiva = vi.fn();
const getMetricasTodas = vi.fn();
vi.mock('../../lib/seguradoras.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    listarSeguradoras: (...a) => listarSeguradoras(...a),
    setAtiva: (...a) => setAtiva(...a),
    getMetricasTodas: (...a) => getMetricasTodas(...a),
  };
});

import Seguradoras from '../Seguradoras.jsx';

const SEG = [
  { id: '1', nome: 'Allianz', nome_seguradora: 'Allianz Seguros', ativa: true },
  { id: '2', nome: 'HDI Seguros', nome_seguradora: 'HDI', ativa: false },
];

const METRICAS = {
  Allianz: { taxaRetorno: 92, tempoMedio: 41, ultimoSucesso: new Date(Date.now() - 5 * 60000).toISOString(), erros24h: 0, semDados: false, amostra: 20 },
  'HDI Seguros': { taxaRetorno: 84, tempoMedio: 55, ultimoSucesso: new Date(Date.now() - 30 * 60000).toISOString(), erros24h: 2, semDados: false, amostra: 18 },
};

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
    getMetricasTodas.mockReset().mockResolvedValue(METRICAS);
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

  test('métricas reais aparecem após carregar', async () => {
    renderPage();
    expect(await screen.findByText('92%')).toBeInTheDocument(); // taxa de retorno Allianz
    expect(screen.getByText('84%')).toBeInTheDocument(); // HDI
    expect(screen.getByText('41s')).toBeInTheDocument(); // tempo médio Allianz
  });

  test('o dropdown de janela recarrega as métricas com o novo período', async () => {
    renderPage();
    await screen.findByText('92%');
    // carga inicial usa a janela padrão (7 dias)
    await waitFor(() => expect(getMetricasTodas).toHaveBeenLastCalledWith(expect.any(Array), 7));

    await userEvent.selectOptions(screen.getByLabelText('Janela de tempo das métricas'), '30');
    await waitFor(() => expect(getMetricasTodas).toHaveBeenLastCalledWith(expect.any(Array), 30));
  });

  test('trocar a janela mostra loading nas métricas (feedback visível da recarga)', async () => {
    // 1ª carga (7d) resolve; a recarga ao trocar a janela fica pendente.
    getMetricasTodas
      .mockReset()
      .mockResolvedValueOnce(METRICAS)
      .mockImplementation(() => new Promise(() => {}));

    const { container } = renderPage();
    await screen.findByText('92%'); // métricas iniciais já visíveis
    expect(container.querySelector('[aria-busy="true"]')).toBeFalsy(); // sem loading

    await userEvent.selectOptions(screen.getByLabelText('Janela de tempo das métricas'), '30');

    // Com a recarga em andamento, o bloco de métricas deve voltar ao skeleton —
    // antes do fix as métricas antigas ficavam na tela e parecia que nada mudou.
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeTruthy());
  });

  test('mostra loading nas métricas enquanto recarrega', async () => {
    getMetricasTodas.mockReturnValue(new Promise(() => {})); // nunca resolve
    const { container } = renderPage();
    // a lista de seguradoras já carregou (skeleton da lista sumiu)…
    await screen.findByText('Allianz');
    // …mas as métricas seguem em loading (skeleton com aria-busy no bloco de métricas)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
