// Registro de Worker Threads em execucao. Compartilhado entre a rota que dispara
// os workers (routes/quote.js) e o graceful shutdown (index.js), para saber
// quantas cotacoes ainda estao em andamento antes de encerrar o processo.

const ativos = new Set();

function registrar(worker) {
  ativos.add(worker);
  return worker;
}

function remover(worker) {
  ativos.delete(worker);
}

function contar() {
  return ativos.size;
}

function listar() {
  return Array.from(ativos);
}

// Util principalmente para testes — esvazia o registro.
function limpar() {
  ativos.clear();
}

module.exports = { registrar, remover, contar, listar, limpar };
