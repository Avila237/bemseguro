function parseDataNasc(valor) {
  if (!valor) return null;
  const match = String(valor).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`).toISOString();
  if (String(valor).match(/^\d{4}-\d{2}-\d{2}/)) return new Date(valor).toISOString();
  return null;
}

function parseEstadoCivil(valor) {
  if (!valor) return 2;
  const map = { solteiro: 1, casado: 2, divorciado: 3, viuvo: 4 };
  if (typeof valor === 'number') return valor;
  return map[String(valor).toLowerCase().trim()] || 2;
}

function parseSexo(valor) {
  if (!valor) return 'M';
  return String(valor).toUpperCase().trim() === 'F' ? 'F' : 'M';
}

function parseRelacaoSegurado(valor) {
  if (!valor) return 1;
  if (typeof valor === 'number') return valor;
  const map = {
    segurado: 1,
    proprio: 1,
    proprietario: 1,
    conjuge: 2,
    filho: 3,
    filha: 3,
    pai: 4,
    mae: 4,
    outro: 5,
  };
  const norm = String(valor).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return map[norm] || 1;
}

function extrairAnoVeiculo(descricao) {
  if (!descricao) return null;
  const match = String(descricao).match(/(\d{4})\s*$/);
  return match ? parseInt(match[1]) : null;
}

function extrairNomeCondutor(valor) {
  if (!valor) return '';
  return String(valor).split(',')[0].trim();
}

function extrairDataNascCondutor(valor) {
  if (!valor) return null;
  const partes = String(valor).split(',');
  if (partes.length < 2) return null;
  return parseDataNasc(partes[1].trim());
}

module.exports = {
  parseDataNasc,
  parseEstadoCivil,
  parseSexo,
  parseRelacaoSegurado,
  extrairAnoVeiculo,
  extrairNomeCondutor,
  extrairDataNascCondutor,
};
