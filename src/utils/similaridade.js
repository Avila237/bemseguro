// Comparacao de nomes tolerante a variacoes comuns (acentos, caixa, espacos e
// conectivos "da/de/do/..."). Usada na validacao cruzada do worker de cotacao
// com documentos (nome do formulario vs nome extraido da CNH pela IA).

const LIMIAR = 0.8;

// Conectivos de nome ignorados na comparacao (um "Joao da Silva" deve casar com
// "Joao Silva"). Sao removidos como TOKENS inteiros, nunca como letras soltas.
const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'di', 'du', 'e']);

// lowercase + remove acentos + remove pontuacao + colapsa espacos + remove
// conectivos. Resultado: tokens significativos do nome, separados por 1 espaco.
function normalizar(s) {
  const base = String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .replace(/[^a-z0-9\s]/g, ' ')     // pontuacao
    .replace(/\s+/g, ' ')
    .trim();
  return base
    .split(' ')
    .filter((t) => t && !CONECTIVOS.has(t))
    .join(' ');
}

// Distancia de Levenshtein (numero minimo de edicoes). DP com duas linhas.
function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
    }
    prev = cur;
  }
  return prev[n];
}

// Compara dois nomes. Retorna { similaridade: 0.0-1.0, igual: bool }.
// similaridade = 1 - distancia/maxLength (Levenshtein normalizado) sobre os
// nomes ja normalizados. "igual" quando similaridade >= LIMIAR (0.8).
function compararNomes(a, b) {
  const na = normalizar(a);
  const nb = normalizar(b);

  if (na === '' || nb === '') {
    const ambosVazios = na === '' && nb === '';
    return { similaridade: ambosVazios ? 1 : 0, igual: ambosVazios };
  }
  if (na === nb) return { similaridade: 1, igual: true };

  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length) || 1;
  const similaridade = Math.max(0, 1 - dist / maxLen);
  return { similaridade, igual: similaridade >= LIMIAR };
}

module.exports = { compararNomes, normalizar, levenshtein, LIMIAR };
