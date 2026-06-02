import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@bemseguro.com' } } }) } },
}));

// Mantém montarPayloadV2 real; mocka só lookupPlaca e criarCotacao.
const lookupPlaca = vi.fn();
const criarCotacao = vi.fn();
vi.mock('../../lib/cotacao.js', async (orig) => {
  const actual = await orig();
  return { ...actual, lookupPlaca: (...a) => lookupPlaca(...a), criarCotacao: (...a) => criarCotacao(...a) };
});

import NovaCotacao from '../NovaCotacao.jsx';
import { montarPayloadV2, gerarIdempotencyKey } from '../../lib/cotacao.js';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/nova-cotacao']}>
      <Routes>
        <Route path="/nova-cotacao" element={<NovaCotacao />} />
        <Route path="/ordens" element={<div>Lista de OS</div>} />
        <Route path="/ordens/:id" element={<div>Detalhe da OS</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function preencherObrigatorios() {
  await userEvent.type(screen.getByLabelText('Nome completo'), 'Ricardo Cabral');
  await userEvent.type(screen.getByLabelText('CPF / CNPJ'), '12345678900');
  await userEvent.type(screen.getByLabelText('Placa'), 'JCU9D37');
  await userEvent.type(screen.getByLabelText('CEP de pernoite'), '98700000');
  fireEvent.change(screen.getByLabelText('Data de nascimento'), { target: { value: '1992-12-10' } });
  await userEvent.selectOptions(screen.getByLabelText('Sexo'), 'Masculino');
  await userEvent.selectOptions(screen.getByLabelText('Estado civil'), 'Casado');
}

describe('NovaCotacao', () => {
  beforeEach(() => {
    lookupPlaca.mockReset();
    criarCotacao.mockReset().mockResolvedValue({ id: 'new-os-id' });
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  test('renderiza as 4 seções do formulário', () => {
    renderPage();
    expect(screen.getByText('Cliente / Lead')).toBeInTheDocument();
    expect(screen.getByText('Dados da OS')).toBeInTheDocument();
    expect(screen.getByText('Dados do Veículo e Condutor')).toBeInTheDocument();
    expect(screen.getByText('Apólice Anterior')).toBeInTheDocument();
  });

  test('aplica máscara de CPF no input', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('CPF / CNPJ'), '12345678900');
    expect(screen.getByLabelText('CPF / CNPJ')).toHaveValue('123.456.789-00');
  });

  test('lookup de placa preenche o veículo ao sair do campo', async () => {
    lookupPlaca.mockResolvedValue({ encontrado: true, modelo: 'VW SAVEIRO ROBUST 1.6', anoModelo: '2024', anoFabricacao: '2024', fipe: '005340-7', chassi: '9BWKL45U1SP009017', fabricante: '59' });
    renderPage();
    const placa = screen.getByLabelText('Placa');
    await userEvent.type(placa, 'JCU9D37');
    fireEvent.blur(placa);
    await waitFor(() => expect(lookupPlaca).toHaveBeenCalledWith('JCU9D37'));
    expect(await screen.findByDisplayValue('VW SAVEIRO ROBUST 1.6')).toBeInTheDocument();
    expect(screen.getByLabelText('Cód. FIPE')).toHaveValue('005340-7');
  });

  test('o fabricante do lookup é enviado no payload do run-quote', async () => {
    lookupPlaca.mockResolvedValue({ encontrado: true, modelo: 'VW SAVEIRO ROBUST 1.6', anoModelo: '2024', anoFabricacao: '2024', fipe: '005340-7', chassi: '9BWKL45U1SP009017', fabricante: '59' });
    renderPage();
    await preencherObrigatorios();
    fireEvent.blur(screen.getByLabelText('Placa'));
    await waitFor(() => expect(lookupPlaca).toHaveBeenCalled());
    // aguarda o auto-preenchimento concluir (modelo refletido na tela)
    expect(await screen.findByDisplayValue('VW SAVEIRO ROBUST 1.6')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /criar os/i }));
    await waitFor(() => expect(criarCotacao).toHaveBeenCalledTimes(1));
    const payload = criarCotacao.mock.calls[0][0];
    expect(payload.veiculo.fabricante).toBe('59');
  });

  test('validação bloqueia submit e destaca campos obrigatórios', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /criar os/i }));
    expect(screen.getByText('Informe o nome completo')).toBeInTheDocument();
    expect(screen.getByText('CPF/CNPJ inválido')).toBeInTheDocument();
    expect(criarCotacao).not.toHaveBeenCalled();
  });

  test('cria a OS, mostra toast e redireciona para o detalhe', async () => {
    renderPage();
    await preencherObrigatorios();
    await userEvent.click(screen.getByRole('button', { name: /criar os/i }));

    await waitFor(() => expect(criarCotacao).toHaveBeenCalledTimes(1));
    const payload = criarCotacao.mock.calls[0][0];
    expect(payload.segurado.nome).toBe('Ricardo Cabral');
    expect(payload.segurado.sexo).toBe('M');
    expect(payload.condutor.relacaoSegurado).toBe('segurado');

    expect(screen.getByText('OS criada · cotação disparada')).toBeInTheDocument();
    expect(await screen.findByText('Detalhe da OS')).toBeInTheDocument();
  });

  test('envia uma Idempotency-Key (painel-<uuid>) ao criar a OS', async () => {
    renderPage();
    await preencherObrigatorios();
    await userEvent.click(screen.getByRole('button', { name: /criar os/i }));

    await waitFor(() => expect(criarCotacao).toHaveBeenCalledTimes(1));
    const idempotencyKey = criarCotacao.mock.calls[0][1];
    expect(idempotencyKey).toMatch(/^painel-[0-9a-f-]{36}$/i);
  });

  test('cada sessão de formulário usa uma Idempotency-Key distinta', async () => {
    const { unmount } = renderPage();
    await preencherObrigatorios();
    await userEvent.click(screen.getByRole('button', { name: /criar os/i }));
    await waitFor(() => expect(criarCotacao).toHaveBeenCalledTimes(1));
    const key1 = criarCotacao.mock.calls[0][1];
    unmount();

    renderPage();
    await preencherObrigatorios();
    await userEvent.click(screen.getByRole('button', { name: /criar os/i }));
    await waitFor(() => expect(criarCotacao).toHaveBeenCalledTimes(2));
    const key2 = criarCotacao.mock.calls[1][1];

    expect(key1).not.toBe(key2);
  });

  test('Descartar confirma e volta para a lista', async () => {
    renderPage();
    // há dois botões "Descartar" (header e barra de ação) — usa o primeiro
    await userEvent.click(screen.getAllByRole('button', { name: /descartar/i })[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(await screen.findByText('Lista de OS')).toBeInTheDocument();
  });
});

describe('montarPayloadV2', () => {
  test('monta o payload v2 com blocos segurado/veiculo/condutor/apoliceAnterior', () => {
    const p = montarPayloadV2({
      nome: 'Maria Souza', cpf: '123.456.789-00', email: 'm@x.com', telefone: '(55) 99999-0000',
      origem: 'CRM', prioridade: 'Alta', observacoes: 'teste',
      ramo: 'auto', placa: 'jcu9d37', modelo: 'VW Saveiro', anoModelo: '2024', anoFabricacao: '2024', chassi: '9BWK', fipe: '005340-7', fabricante: '59',
      cepPernoite: '98700-000', condIgual: true,
      dataNascimento: '1990-05-20', sexo: 'Feminino', estadoCivil: 'Solteiro',
      apSeguradora: 'Porto Seguro', apNumero: '31.55', apClasse: '7', apSinistro: true,
    });
    expect(p.ramo).toBe('auto');
    expect(p.segurado).toMatchObject({ nome: 'Maria Souza', cpf: '12345678900', sexo: 'F', estadoCivil: 'solteiro', dataNascimento: '20/05/1990', cep: '98700000' });
    expect(p.veiculo).toMatchObject({ placa: 'JCU9D37', modelo: 'VW Saveiro', fipe: '005340-7', anoModelo: '2024', fabricante: '59' });
    expect(p.condutor).toMatchObject({ nome: 'Maria Souza', relacaoSegurado: 'segurado', sexo: 'F' });
    expect(p.apoliceAnterior).toMatchObject({ seguradora: 'Porto Seguro', classeBonus: 7, sinistro: true });
  });
});

describe('gerarIdempotencyKey', () => {
  test('gera chaves únicas com prefixo painel- e formato uuid v4', () => {
    const a = gerarIdempotencyKey();
    const b = gerarIdempotencyKey();
    expect(a).toMatch(/^painel-[0-9a-f-]{36}$/i);
    expect(a).not.toBe(b);
  });
});
