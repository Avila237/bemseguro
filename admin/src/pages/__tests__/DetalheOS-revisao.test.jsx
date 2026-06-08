import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
const dispararCotacaoAposRevisao = vi.fn();
vi.mock('../../lib/ordens.js', () => ({
  cancelarOS: (...a) => cancelarOS(...a),
  dispararCotacaoAposRevisao: (...a) => dispararCotacaoAposRevisao(...a),
}));

const listarDocumentos = vi.fn();
const listarHistoricoDocumentos = vi.fn();
const getSignedUrl = vi.fn();
const anexarDocumento = vi.fn();
const removerDocumento = vi.fn();
vi.mock('../../lib/documentos.js', () => ({
  listarDocumentos: (...a) => listarDocumentos(...a),
  listarHistoricoDocumentos: (...a) => listarHistoricoDocumentos(...a),
  getSignedUrl: (...a) => getSignedUrl(...a),
  anexarDocumento: (...a) => anexarDocumento(...a),
  removerDocumento: (...a) => removerDocumento(...a),
  confiancaMedia: (docs) => {
    const v = (docs || []).filter(d => d && d.confianca_extracao != null).map(d => Number(d.confianca_extracao));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  },
  confiancaCampo: (docs, tipo, campo) => {
    const d = (docs || []).find(x => x && x.tipo === tipo);
    const v = d && d.confianca_por_campo ? Number(d.confianca_por_campo[campo]) : NaN;
    return Number.isFinite(v) ? v : null;
  },
  TIPO_LABEL: { cnh_segurado: 'CNH do segurado', cnh_condutor: 'CNH do condutor', crlv: 'CRLV' },
  TIPOS_DOC: ['cnh_segurado', 'crlv', 'cnh_condutor'],
}));

import DetalheOS from '../DetalheOS.jsx';

const ID = 'a1f3d8aa-0000-0000-0000-000000000000';

function osRevisao(over = {}) {
  return {
    id: ID,
    status: 'revisao_manual',
    placa: 'JCU9D37',
    cpf: '12345678900',
    nome: 'Ricardo Cabral',
    cep: '98700-000',
    created_at: new Date().toISOString(),
    error_message: [
      'CNH do segurado vencida em 12/03/2024',
      'Baixa confiança na extração do campo cpf',
      "Nome no formulário ('Ricardo') diferente do nome na CNH ('Ricardo Cabral')",
      'CNH do condutor principal não foi enviada pelo CRM',
    ].join('\n'),
    dados_risco: {
      ramo: 'auto',
      segurado: { nome: 'Ricardo Cabral', cpf: '12345678900', dataNascimento: '1992-12-10', sexo: 'M', estadoCivil: 'casado', cep: '98700-000', validade_cnh: '2024-03-12' },
      veiculo: { placa: 'JCU9D37', chassi: '9BWKL45U1SP009017', marca: 'Volkswagen', modelo: 'Saveiro Robust 1.6', anoFabricacao: '2024', anoModelo: '2024', fipe: '005340-7' },
      condutor: null,
    },
    ...over,
  };
}

const DOCS = [
  { id: 'd1', tipo: 'cnh_segurado', storage_path: 'a1f3/cnh_segurado-1717.jpg', storage_bucket: 'documentos-clientes', confianca_extracao: 0.64, confianca_por_campo: { nome: 0.96, cpf: 0.58, data_nascimento: 0.93, sexo: 0.91, validade_cnh: 0.94 }, created_at: new Date().toISOString() },
  { id: 'd2', tipo: 'crlv', storage_path: 'a1f3/crlv-1717.pdf', storage_bucket: 'documentos-clientes', confianca_extracao: 0.91, confianca_por_campo: { placa: 0.99, chassi: 0.67, marca: 0.95, modelo: 0.73, ano_fabricacao: 0.95, ano_modelo: 0.95, codigo_fipe: 0.88 }, created_at: new Date().toISOString() },
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

describe('DetalheOS — estado revisao_manual', () => {
  beforeEach(() => {
    carregarOS.mockReset().mockResolvedValue({ os: osRevisao(), cotacoes: [] });
    cancelarOS.mockReset().mockResolvedValue();
    dispararCotacaoAposRevisao.mockReset().mockResolvedValue();
    listarDocumentos.mockReset().mockResolvedValue(DOCS);
    listarHistoricoDocumentos.mockReset().mockResolvedValue([]);
    getSignedUrl.mockReset().mockResolvedValue('https://signed/doc');
    anexarDocumento.mockReset().mockResolvedValue({ tipo: 'cnh_condutor', dados: { nome: 'Marina Reis', cpf: '98765432100', data_nascimento: '1990-08-05', sexo: 'F' } });
    removerDocumento.mockReset().mockResolvedValue({ success: true });
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  test('renderiza banner de inconsistências com pills clicáveis', async () => {
    renderDetalhe();
    expect(await screen.findByText('4 inconsistências')).toBeInTheDocument();
    // pills (botões) por problema
    expect(screen.getByRole('button', { name: 'Validade da CNH' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CPF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nome' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CNH do condutor' })).toBeInTheDocument();
  });

  test('lista os documentos (com confiança) e o faltante', async () => {
    renderDetalhe();
    await screen.findByText('4 inconsistências');
    // documentos carregam num efeito async — aguarda o primeiro card.
    expect(await screen.findByText('CNH do segurado')).toBeInTheDocument();
    expect(screen.getByText('CRLV')).toBeInTheDocument();
    // confiança média (0.64 + 0.91)/2 = 0.775 → 78%
    expect(screen.getByText(/78% · extração da IA/)).toBeInTheDocument();
    // CNH do condutor não foi enviada
    expect(screen.getByText('Não enviado pelo CRM')).toBeInTheDocument();
  });

  test('campo com problema fica destacado e edição conta como alteração', async () => {
    renderDetalhe();
    await screen.findByText('4 inconsistências');
    expect(screen.getByText('Nenhuma alteração ainda')).toBeInTheDocument();

    const inputNome = screen.getByDisplayValue('Ricardo Cabral');
    fireEvent.change(inputNome, { target: { value: 'Ricardo de Souza Cabral' } });
    expect(await screen.findByText('1 campo alterado')).toBeInTheDocument();
  });

  test('dispara cotação quando não há pendências críticas', async () => {
    // OS sem inconsistências críticas → botão habilitado
    carregarOS.mockResolvedValue({ os: osRevisao({ error_message: '' }), cotacoes: [] });
    renderDetalhe();
    const botao = await screen.findByRole('button', { name: /disparar cotação/i });
    expect(botao).not.toBeDisabled();
    await userEvent.click(botao);
    await waitFor(() => expect(dispararCotacaoAposRevisao).toHaveBeenCalled());
    expect(dispararCotacaoAposRevisao.mock.calls[0][0]).toBe(ID);
    expect(dispararCotacaoAposRevisao.mock.calls[0][1]).toHaveProperty('dados_risco');
  });

  test('botão Disparar fica desabilitado com pendências críticas', async () => {
    renderDetalhe();
    const botao = await screen.findByRole('button', { name: /disparar cotação/i });
    expect(botao).toBeDisabled();
  });

  test('mostra badges de confiança fiéis por campo (confianca_por_campo)', async () => {
    renderDetalhe();
    await screen.findByText('CNH do segurado'); // documentos carregados
    // o chip mostra "IA · <nível> NN%"; regex evita depender do % exato/caractere ·
    // campos com confiança < 75 (cpf 58, chassi 67, modelo 73) → "IA · revisar"
    expect(screen.getAllByText(/IA.+revisar/).length).toBeGreaterThan(0);
    // campos com confiança > 85 (nome 96, placa 99, marca 95…) → "IA · alta"
    expect(screen.getAllByText(/IA.+alta/).length).toBeGreaterThan(0);
  });

  test('estado civil e sexo aparecem por extenso (select), persistindo o código', async () => {
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    // Estado civil: fixture tem o código 'casado' → select exibe "Casado(a)".
    const ecivil = screen.getByRole('combobox', { name: 'Estado civil' });
    expect(ecivil).toHaveValue('casado');
    expect(ecivil).toHaveDisplayValue('Casado(a)');
    // Sexo: código 'M' → "Masculino".
    const sexo = screen.getByRole('combobox', { name: 'Sexo' });
    expect(sexo).toHaveValue('M');
    expect(sexo).toHaveDisplayValue('Masculino');
  });

  test('modal de anexar mostra alerta de documento de tipo incorreto e não fecha', async () => {
    anexarDocumento.mockRejectedValueOnce(Object.assign(
      new Error('Documento incorreto. Esperado: cnh, Detectado: crlv.'),
      { tipoIncorreto: true, tipoDetectado: 'crlv', tipoEsperado: 'cnh' },
    ));
    renderDetalhe();
    await screen.findByText('CNH do segurado');

    // Abre o modal de anexar.
    await userEvent.click(screen.getByRole('button', { name: /anexar novo documento/i }));
    // Seleciona um arquivo (input file escondido).
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['x'], 'crlv.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    // Dispara a extração.
    await userEvent.click(screen.getByRole('button', { name: /anexar e extrair/i }));

    // Alerta de tipo incorreto aparece (com os tipos por extenso).
    expect(await screen.findByText(/documento incorreto detectado/i)).toBeInTheDocument();
    expect(screen.getByText(/anexou um CRLV/i)).toBeInTheDocument();
    expect(screen.getByText(/selecionou CNH/i)).toBeInTheDocument();
    // Modal continua aberto (botão de extrair ainda presente).
    expect(screen.getByRole('button', { name: /anexar e extrair/i })).toBeInTheDocument();
  });

  // Anexa um arquivo pelo modal "Anexar novo documento" (seleciona tipo + arquivo).
  async function anexarPeloModal(tipoSelecionado, file) {
    await userEvent.click(screen.getByRole('button', { name: /anexar novo documento/i }));
    await userEvent.selectOptions(screen.getByLabelText('Tipo de documento'), tipoSelecionado);
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await userEvent.click(screen.getByRole('button', { name: /anexar e extrair/i }));
  }

  test('anexar CNH do condutor preenche só o bloco Condutor (não toca no Segurado)', async () => {
    anexarDocumento.mockResolvedValueOnce({
      tipo: 'cnh_condutor',
      dados: { nome: 'Marina Reis', cpf: '98765432100', data_nascimento: '1990-08-05', sexo: 'F' },
    });
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    // Antes: nome do segurado é "Ricardo Cabral".
    expect(screen.getByDisplayValue('Ricardo Cabral')).toBeInTheDocument();

    await anexarPeloModal('cnh_condutor', new File(['x'], 'cnh.jpg', { type: 'image/jpeg' }));

    // Condutor preenchido com os dados extraídos…
    expect(await screen.findByDisplayValue('Marina Reis')).toBeInTheDocument();
    // …e o Segurado permanece intacto (não foi sobrescrito).
    expect(screen.getByDisplayValue('Ricardo Cabral')).toBeInTheDocument();
  });

  test('anexar CRLV preenche só o bloco Veículo (não toca no Segurado)', async () => {
    anexarDocumento.mockResolvedValueOnce({
      tipo: 'crlv',
      dados: { placa: 'XYZ9A88', chassi: '9BWAA00000A000000', marca: 'Fiat', modelo: 'Argo', ano_fabricacao: '2022', ano_modelo: '2023', codigo_fipe: '001234-5' },
    });
    renderDetalhe();
    await screen.findByText('CNH do segurado');

    await anexarPeloModal('crlv', new File(['x'], 'crlv.pdf', { type: 'application/pdf' }));

    // Veículo preenchido (placa nova)…
    expect(await screen.findByDisplayValue('XYZ9A88')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Argo')).toBeInTheDocument();
    // …e o Segurado permanece intacto.
    expect(screen.getByDisplayValue('Ricardo Cabral')).toBeInTheDocument();
  });

  test('validação cruzada: condutor = segurado mas CRLV indica outro dono', async () => {
    // OS sem inconsistências de backend → o único problema é a validação de front.
    carregarOS.mockResolvedValue({ os: osRevisao({ error_message: '' }), cotacoes: [] });
    listarDocumentos.mockResolvedValue([
      { id: 'd1', tipo: 'cnh_segurado', storage_path: 'a/cnh_seg.jpg', storage_bucket: 'documentos-clientes', confianca_extracao: 0.9, dados_extraidos: { nome: 'Ricardo Cabral', cpf: '12345678900' }, created_at: new Date().toISOString() },
      { id: 'd3', tipo: 'cnh_condutor', storage_path: 'a/cnh_cond.jpg', storage_bucket: 'documentos-clientes', confianca_extracao: 0.9, dados_extraidos: { nome: 'Ricardo Cabral', cpf: '12345678900' }, created_at: new Date().toISOString() },
      { id: 'd2', tipo: 'crlv', storage_path: 'a/crlv.pdf', storage_bucket: 'documentos-clientes', confianca_extracao: 0.9, dados_extraidos: { placa: 'JCU9D37', cpf_proprietario: '99988877766', nome_proprietario: 'Joana Dona' }, created_at: new Date().toISOString() },
    ]);
    renderDetalhe();
    await screen.findByText('CNH do segurado');

    // Pendência aparece no banner (pill "Dono do veículo" com a mensagem no title).
    const pill = await screen.findByRole('button', { name: /dono do veículo/i });
    expect(pill).toHaveAttribute('title', expect.stringContaining('Joana Dona'));
    expect(pill.getAttribute('title')).toMatch(/dono_eh_condutor=false/);
    // É contabilizada como inconsistência.
    expect(screen.getByText(/1 inconsistência/)).toBeInTheDocument();
  });

  test('clicar Remover abre o modal de confirmação (arquivo preservado)', async () => {
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    // Cada documento ativo tem um botão "Remover documento".
    const botoes = screen.getAllByRole('button', { name: /remover documento/i });
    expect(botoes.length).toBe(2); // cnh_segurado + crlv (condutor está faltando)
    await userEvent.click(botoes[0]);
    expect(await screen.findByText(/tem certeza que deseja remover/i)).toBeInTheDocument();
    expect(screen.getByText(/arquivo é preservado/i)).toBeInTheDocument();
  });

  test('confirmar remoção do CNH do segurado limpa o bloco e reabre o anexar', async () => {
    // Mount → DOCS (2); após remover, a recarga devolve só o CRLV.
    listarDocumentos.mockReset();
    listarDocumentos.mockResolvedValueOnce(DOCS).mockResolvedValue([DOCS[1]]);
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Ricardo Cabral');

    await userEvent.click(screen.getAllByRole('button', { name: /remover documento/i })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Remover' })); // botão do modal

    await waitFor(() => expect(removerDocumento).toHaveBeenCalledWith('d1'));
    // Bloco Segurado limpo.
    await waitFor(() => expect(screen.getByLabelText('Nome completo')).toHaveValue(''));
    // Reabre o anexar já com o tipo do documento removido pré-selecionado.
    expect(screen.getByLabelText('Tipo de documento')).toHaveValue('cnh_segurado');
  });

  test('histórico de documentos removidos aparece em collapse (read-only)', async () => {
    listarHistoricoDocumentos.mockResolvedValue([
      { id: 'd1', tipo: 'cnh_segurado', storage_path: 'a/cnh.jpg', created_at: new Date().toISOString(), removido_em: null },
      { id: 'dx', tipo: 'crlv', storage_path: 'a/crlv-antigo.pdf', created_at: new Date().toISOString(), removido_em: '2026-05-01T10:00:00Z' },
    ]);
    renderDetalhe();
    await screen.findByText('CNH do segurado');

    const header = await screen.findByRole('button', { name: /histórico de documentos removidos/i });
    await userEvent.click(header);
    // Item read-only do removido: arquivo + "Removido em".
    expect(await screen.findByText('crlv-antigo.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Removido em/i)).toBeInTheDocument();
  });

  // ── Card de documento (layout em 2 linhas) ──
  const docCom = (over) => ({
    id: 'd1', tipo: 'cnh_segurado', storage_bucket: 'documentos-clientes',
    confianca_extracao: 0.9, created_at: new Date().toISOString(), ...over,
  });

  test('card: nome de arquivo curto aparece inteiro e com title', async () => {
    listarDocumentos.mockResolvedValue([docCom({ storage_path: 'a1f3/cnh.jpg' })]);
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    const nome = screen.getByText('cnh.jpg');
    expect(nome).toHaveTextContent('cnh.jpg');          // nome inteiro no DOM
    expect(nome).toHaveAttribute('title', 'cnh.jpg');   // tooltip nativo
  });

  test('card: nome longo tem ellipsis e title com o nome completo', async () => {
    const longo = 'cnh_frente_guilherme_avila_2024_v2.jpg';
    listarDocumentos.mockResolvedValue([docCom({ storage_path: `a1f3/${longo}` })]);
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    const nome = screen.getByText(longo);
    expect(nome).toHaveAttribute('title', longo);       // nome completo no tooltip
    expect(nome.style.textOverflow).toBe('ellipsis');   // truncamento com "…"
    expect(nome.style.overflow).toBe('hidden');
    expect(nome.style.whiteSpace).toBe('nowrap');
  });

  test('card: badge de confiança cabe com 2 (97) e 3 (100) dígitos', async () => {
    listarDocumentos.mockResolvedValue([
      docCom({ id: 'd1', tipo: 'cnh_segurado', storage_path: 'a/cnh.jpg', confianca_extracao: 0.97 }),
      docCom({ id: 'd2', tipo: 'crlv', storage_path: 'a/crlv.pdf', confianca_extracao: 1.0 }),
    ]);
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    // O número do anel de confiança de cada doc é renderizado por inteiro.
    expect(screen.getByText('97')).toBeInTheDocument();   // 2 dígitos
    expect(screen.getByText('100')).toBeInTheDocument();  // 3 dígitos (média=99, distinta)
  });

  test('card: linha 2 (metadata + botões) não sobrepõe a linha 1 (nome)', async () => {
    listarDocumentos.mockResolvedValue([docCom({ storage_path: 'a1f3/cnh.jpg' })]);
    renderDetalhe();
    await screen.findByText('CNH do segurado');
    const nome = screen.getByText('cnh.jpg');
    const meta = screen.getByText(/^Extração/);
    const verBtn = screen.getByRole('button', { name: 'Ver' });

    const linha1 = nome.closest('.row');   // ícone + nome + badge
    const linha2 = meta.closest('.row');   // metadata + ações
    expect(linha1).not.toBe(linha2);
    expect(linha1.contains(verBtn)).toBe(false);  // botões fora da linha do nome
    expect(linha2.contains(nome)).toBe(false);    // nome fora da linha das ações
    // Empilhadas num card em coluna (linha 2 vem DEPOIS da linha 1 → sem sobreposição).
    const card = linha1.parentElement;
    expect(card).toBe(linha2.parentElement);
    expect(card.className).toMatch(/\bcol\b/);
    const kids = Array.from(card.children);
    expect(kids.indexOf(linha1)).toBeLessThan(kids.indexOf(linha2));
  });

  test('abre o documento via signed URL em nova aba', async () => {
    renderDetalhe();
    await screen.findByText('CRLV');
    const verBtns = screen.getAllByRole('button', { name: /ver/i });
    await userEvent.click(verBtns[0]);
    await waitFor(() => expect(getSignedUrl).toHaveBeenCalled());
    await waitFor(() => expect(window.open).toHaveBeenCalledWith('https://signed/doc', '_blank', 'noopener'));
  });
});
