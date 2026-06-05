// Mapeamentos de enums do domínio: código persistido → rótulo por extenso.
//
// IMPORTANTE — os "códigos" aqui são os que o BACKEND já reconhece, não os
// números do briefing. Conferidos contra `src/utils/parsers.js`
// (parseEstadoCivil / parseSexo) e `admin/src/lib/cotacao.js`:
//
//   parseEstadoCivil → { solteiro:1, casado:2, divorciado:3, viuvo:4 }
//   parseSexo        → 'M' | 'F'
//
// O sistema persiste em `dados_risco.segurado` o **slug** (`'casado'`) / a letra
// (`'M'`) — NÃO o número. O parseEstadoCivil converte o slug no código numérico
// do Aggilizador só na montagem do payload final. Por isso este mapa é keyed pelo
// slug (e não por "1".."7"): usar números aqui faria o parseEstadoCivil cair no
// fallback (casado) para tudo que não fosse "casado", corrompendo a cotação.
//
// Cobrimos exatamente os 4 códigos que o backend mapeia — assim todo valor
// escolhido no painel faz round-trip correto até o Aggilizador.

export const ESTADO_CIVIL_MAP = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
};

export const SEXO_MAP = {
  M: 'Masculino',
  F: 'Feminino',
};

// Rótulo por extenso a partir do código; devolve o próprio valor se desconhecido
// (ex.: estado civil fora do padrão vindo do CRM) — não esconde nem altera o dado.
export const estadoCivilLabel = (codigo) => ESTADO_CIVIL_MAP[codigo] || codigo;
export const sexoLabel = (codigo) => SEXO_MAP[codigo] || codigo;
