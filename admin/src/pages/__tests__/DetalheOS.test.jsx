import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

const carregarOS = vi.fn();
const recotarOS = vi.fn();
vi.mock('../../lib/detalhe.js', () => ({
  carregarOS: (...a) => carregarOS(...a),
  recotarOS: (...a) => recotarOS(...a),
}));

const cancelarOS = vi.fn();
vi.mock('../../lib/ordens.js', () => ({ cancelarOS: (...a) => cancelarOS(...a) }));

import DetalheOS from '../DetalheOS.jsx';

const ID = 'f256d8aa-0000-0000-0000-000000000000';

const OS = {
  id: ID,
  status: 'cotado',
  placa: 'JCU9D37',
  cpf: '12345678900',
  nome: 'Ricardo Cabral',
  email: 'ricardo@x.com',
  cep: '98700-000',
  created_at: new Date().toISOString(),
  dados_risco: {
    ramo: 'auto',
    origem: 'CRM',
    segurado: { telefone: '(55) 99999-0000', cidade: 'Ijuí', uf: 'RS', estadoCivil: 'casado' },
    veiculo: { modelo: 'VW Saveiro Robust 1.6', placa: 'JCU9D37', fipe: '005340-7', chassi: '9BWKL45U1SP009017', anoFabricacao: '2024', anoModelo: '2024' },
    condutor: { nome: 'Ricardo Cabral', dataNascimento: '10/12/1992', sexo: 'M', relacaoSegurado: 'segurado' },
    apoliceAnterior: { seguradora: 'Porto Seguro', numero: '31.55.0099821', classeBonus: 7, sinistro: false },
  },
};

const COT = [
  { id: 'c1', os_id: ID, seguradora: 'Allianz', premio: 2926.79, franquia: 4390, cobertura: 'Compreensiva', url_pdf: 'https://x/allianz.pdf', nro_calculo: '480123', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: 'c2', os_id: ID, seguradora: 'Porto Seguro', premio: 3044, franquia: 4150, cobertura: 'Compreensiva', url_pdf: null, nro_calculo: '480130', created_at: new Date(Date.now() - 4 * 60000).toISOString() },
];

function renderDetalhe() {
  return render(
    <MemoryRouter initialEntries={[`/ordens/${ID}`]}>
      <Routes>
        <Route path="/ordens/:id" element={<DetalheOS />} />
        <Route path="/ordens" element={<div>Lista de OS</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DetalheOS', () => {
  beforeEach(() => {
    carregarOS.mockReset().mockResolvedValue({ os: OS, cotacoes: COT });
    recotarOS.mockReset().mockResolvedValue();
    cancelarOS.mockReset().mockResolvedValue();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('open', vi.fn());
  });

  test('mostra skeleton enquanto carrega', () => {
    carregarOS.mockReturnValue(new Promise(() => {}));
    const { container } = renderDetalhe();
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  test('renderiza header, dados e cotações', async () => {
    renderDetalhe();
    expect(await screen.findByText('OS-F256D8')).toBeInTheDocument();
    expect(screen.getByText('123.***.***-00')).toBeInTheDocument();
    expect(screen.getByText('VW Saveiro Robust 1.6')).toBeInTheDocument();
    expect(screen.getByText('005340-7')).toBeInTheDocument();
    // cotações
    expect(screen.getByText('Allianz')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.926,79')).toBeInTheDocument();
    expect(screen.getByText('Melhor Preço')).toBeInTheDocument();
    expect(screen.getByText(/2 recebidas/)).toBeInTheDocument();
  });

  test('mostra 404 quando a OS não existe', async () => {
    carregarOS.mockRejectedValue(Object.assign(new Error('nf'), { notFound: true }));
    renderDetalhe();
    expect(await screen.findByText('OS não encontrada')).toBeInTheDocument();
  });

  test('mostra mensagem quando nenhuma seguradora retornou', async () => {
    carregarOS.mockResolvedValue({ os: { ...OS, status: 'cotado' }, cotacoes: [] });
    renderDetalhe();
    expect(await screen.findByText('Nenhuma seguradora retornou prêmio')).toBeInTheDocument();
  });

  test('status cotando mostra "Aguardando retorno das seguradoras"', async () => {
    carregarOS.mockResolvedValue({ os: { ...OS, status: 'cotando' }, cotacoes: [] });
    renderDetalhe();
    expect(await screen.findByText(/Aguardando retorno das seguradoras/)).toBeInTheDocument();
  });

  test('Recotar dispara run-quote e entra em estado cotando', async () => {
    renderDetalhe();
    await screen.findByText('Allianz');
    const botoes = screen.getAllByRole('button', { name: /recotar/i });
    await userEvent.click(botoes[0]);
    expect(recotarOS).toHaveBeenCalledWith(expect.objectContaining({ id: ID }));
    expect(await screen.findByText(/Aguardando retorno das seguradoras/)).toBeInTheDocument();
  });

  test('Cancelar OS confirma e chama cancelarOS', async () => {
    renderDetalhe();
    await screen.findByText('Allianz');
    await userEvent.click(screen.getByRole('button', { name: /cancelar os/i }));
    expect(cancelarOS).toHaveBeenCalledWith(ID);
  });

  test('botão PDF abre a url em nova aba', async () => {
    renderDetalhe();
    await screen.findByText('Allianz');
    await userEvent.click(screen.getByRole('button', { name: /pdf/i }));
    expect(window.open).toHaveBeenCalledWith('https://x/allianz.pdf', '_blank', 'noopener');
  });

  test('faz polling a cada 5s enquanto cotando', async () => {
    vi.useFakeTimers();
    carregarOS.mockResolvedValue({ os: { ...OS, status: 'cotando' }, cotacoes: [] });
    renderDetalhe();
    await vi.advanceTimersByTimeAsync(0); // carga inicial
    expect(carregarOS).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000); // 1 ciclo de polling
    expect(carregarOS.mock.calls.length).toBeGreaterThanOrEqual(2);
    vi.useRealTimers();
  });
});
