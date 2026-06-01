const { createLogger } = require('../utils/logger');

const AGGER_API = 'https://api-prod.aggilizador.com.br';
const MULTICALCULO_API = 'https://api.multicalculo.net';

const FIPE_MAP = [
  { keywords: ['jeep', 'compass'], fipe: '0170461', fabricante: 29, modelo: 'COMPASS LONGITUDE 2.0 4x2 Flex 16V Aut.', valReferenciado: 89147 },
  { keywords: ['jeep', 'renegade'], fipe: '1580030', fabricante: 583, modelo: 'JEEP RENEGADE LONGITUDE 1.8' },
  { keywords: ['toyota', 'corolla'], fipe: '0053400', fabricante: 56, modelo: 'TOYOTA COROLLA XEI 2.0' },
  { keywords: ['toyota', 'hilux'], fipe: '0053583', fabricante: 56, modelo: 'TOYOTA HILUX CD SRV 4X4' },
  { keywords: ['toyota', 'yaris'], fipe: '0053710', fabricante: 56, modelo: 'TOYOTA YARIS XL 1.3' },
  { keywords: ['honda', 'hr-v'], fipe: '0152411', fabricante: 76, modelo: 'HONDA HR-V EXL 1.8' },
  { keywords: ['honda', 'hrv'], fipe: '0152411', fabricante: 76, modelo: 'HONDA HR-V EXL 1.8' },
  { keywords: ['honda', 'civic'], fipe: '0152225', fabricante: 76, modelo: 'HONDA CIVIC EXL 2.0' },
  { keywords: ['honda', 'fit'], fipe: '0152209', fabricante: 76, modelo: 'HONDA FIT EX 1.5' },
  { keywords: ['volkswagen', 'polo'], fipe: '0059549', fabricante: 59, modelo: 'VW POLO COMFORTLINE 1.0' },
  { keywords: ['volkswagen', 't-cross'], fipe: '0059611', fabricante: 59, modelo: 'VW T-CROSS HIGHLINE 1.4' },
  { keywords: ['volkswagen', 'tcross'], fipe: '0059611', fabricante: 59, modelo: 'VW T-CROSS HIGHLINE 1.4' },
  { keywords: ['volkswagen', 'virtus'], fipe: '0059603', fabricante: 59, modelo: 'VW VIRTUS COMFORTLINE 1.6' },
  { keywords: ['volkswagen', 'tiguan'], fipe: '0059565', fabricante: 59, modelo: 'VW TIGUAN ALLSPACE 1.4' },
  { keywords: ['volkswagen', 'voyage'], fipe: '0052833', fabricante: 59, modelo: 'VOYAGE 1.0/1.0 City Mi Total Flex 8V 4p', valReferenciado: 30458 },
  { keywords: ['vw', 'voyage'], fipe: '0052833', fabricante: 59, modelo: 'VOYAGE 1.0/1.0 City Mi Total Flex 8V 4p', valReferenciado: 30458 },
  { keywords: ['chevrolet', 'onix'], fipe: '0045020', fabricante: 23, modelo: 'ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.', valReferenciado: 83070 },
  { keywords: ['chevrolet', 'tracker'], fipe: '0030914', fabricante: 23, modelo: 'CHEVROLET TRACKER PREMIER 1.2T' },
  { keywords: ['chevrolet', 'cruze'], fipe: '0030760', fabricante: 23, modelo: 'CHEVROLET CRUZE LTZ 1.4T' },
  { keywords: ['hyundai', 'hb20'], fipe: '1530249', fabricante: 190, modelo: 'HYUNDAI HB20 COMFORT 1.0' },
  { keywords: ['hyundai', 'creta'], fipe: '1530311', fabricante: 190, modelo: 'HYUNDAI CRETA PRESTIGE 2.0' },
  { keywords: ['ford', 'ranger'], fipe: '0212610', fabricante: 35, modelo: 'FORD RANGER XLT 3.2 CD 4X4' },
  { keywords: ['ford', 'ka'], fipe: '0212556', fabricante: 35, modelo: 'FORD KA SE 1.0' },
  { keywords: ['nissan', 'kicks'], fipe: '0972627', fabricante: 106, modelo: 'NISSAN KICKS SV 1.6' },
  { keywords: ['nissan', 'frontier'], fipe: '0972520', fabricante: 106, modelo: 'NISSAN FRONTIER LE 2.3 CD 4X4' },
  { keywords: ['fiat', 'argo'], fipe: '0033182', fabricante: 34, modelo: 'FIAT ARGO DRIVE 1.3' },
  { keywords: ['fiat', 'toro'], fipe: '0033140', fabricante: 34, modelo: 'FIAT TORO VOLCANO 2.0 4WD' },
  { keywords: ['fiat', 'strada'], fipe: '0032933', fabricante: 34, modelo: 'FIAT STRADA ADVENTURE 1.8' },
  { keywords: ['fiat', 'pulse'], fipe: '0033328', fabricante: 34, modelo: 'FIAT PULSE IMPETUS 1.0T' },
  { keywords: ['renault', 'kwid'], fipe: '0442617', fabricante: 45, modelo: 'RENAULT KWID ZEN 1.0' },
  { keywords: ['renault', 'duster'], fipe: '0442447', fabricante: 45, modelo: 'RENAULT DUSTER DYNAMIQUE 1.6' },
  { keywords: ['renault', 'sandero'], fipe: '0442404', fabricante: 45, modelo: 'RENAULT SANDERO STEPWAY 1.6' },
  { keywords: ['mitsubishi', 'outlander'], fipe: '1160097', fabricante: 110, modelo: 'MITSUBISHI OUTLANDER GT 3.0' },
  { keywords: ['mitsubishi', 'eclipse'], fipe: '1160160', fabricante: 110, modelo: 'MITSUBISHI ECLIPSE CROSS HPE-S' },
  { keywords: ['kia', 'sportage'], fipe: '1030248', fabricante: 102, modelo: 'KIA SPORTAGE EX 2.0' },
  { keywords: ['kia', 'seltos'], fipe: '1030337', fabricante: 102, modelo: 'KIA SELTOS EX 1.6T' },
];

function buscarFipeLocal(descricao, ano) {
  if (!descricao) return null;
  const lower = descricao.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matches = FIPE_MAP.filter(entry => entry.keywords.every(k => lower.includes(k)));
  if (matches.length === 0) return null;
  if (ano) {
    const matchAno = matches.find(e => e.ano === ano);
    if (matchAno) return matchAno;
  }
  return matches.find(e => !e.ano) || matches[0];
}

async function buscarFipePorPlaca(placa, mcToken, log) {
  const res = await fetch(`${MULTICALCULO_API}/calculo/buscaPlaca?placa=${placa.toUpperCase()}`, {
    method: 'GET',
    headers: {
      'Authorization': mcToken,
      'Origin': 'https://aggilizador.com.br',
      'Referer': 'https://aggilizador.com.br/',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw Object.assign(new Error('Token expirado'), { status: 401 });
    return null;
  }

  const data = await res.json();
  const fipeRaw = data.fipe || (data.veiculos && data.veiculos[0] && data.veiculos[0].codigoFipe) || '';

  if (!fipeRaw) return null;

  return {
    success: true,
    placa: placa.toUpperCase(),
    fipe: fipeRaw.replace(/-/g, ''),
    fabricante: data.codFabr || null,
    modelo: data.modelo || null,
    anoFabricacao: parseInt(data.anoMod) || null,
    anoModelo: parseInt(data.anoMod) || null,
    chassi: data.chassi || null,
    valReferenciado: 0,
  };
}

async function buscarFipePorModelo(descricao, aggerToken) {
  try {
    const palavras = descricao
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\d{4}/g, '')
      .trim()
      .split(/\s+/)
      .filter(p => p.length > 2);

    if (palavras.length === 0) return null;

    const queries = [palavras.slice(0, 2).join(' '), palavras[0]];

    for (const q of queries) {
      const res = await fetch(
        `${AGGER_API}/fipeModelo?tipo=v&modelo=${encodeURIComponent(q)}&limit=5`,
        { headers: { 'Authorization': aggerToken } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const item = data[0];
      const fipeValores = item.fipeValores || [];
      return {
        fipe: item.id ? item.id.replace(/-/g, '') : null,
        fabricante: parseInt(item.fipeFabricante && item.fipeFabricante.id) || null,
        modelo: item.modelo || descricao,
        valReferenciado: fipeValores.length > 0 ? fipeValores[fipeValores.length - 1].valor : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function resolverFipe({ dados_risco, placa, mcToken, aggerToken, log }) {
  const descricaoOriginal = dados_risco.veiculo || '';
  // Ano do veiculo: o formato v2 traz anoModelo/anoFabricacao explicitos no bloco
  // veiculo (preferenciais). Fallback (formato legado): extrai do final da
  // descricao (ex.: "... Compass 2023"). Sem isso, modelos v2 sem ano no texto
  // (ex.: "VOLKSWAGEN - SAVEIRO - ROBUST 1.6") logavam ano=null.
  const anoExplicito =
    parseInt(dados_risco.anoModelo, 10) ||
    parseInt(dados_risco.anoFabricacao, 10) ||
    parseInt(dados_risco.ano, 10) ||
    null;
  const anoVeiculo = anoExplicito || require('../utils/parsers').extrairAnoVeiculo(descricaoOriginal);

  // 1) Explicito
  if (dados_risco.fipe) {
    log.info(`FIPE explicito: ${dados_risco.fipe}`);
    return {
      fipe: dados_risco.fipe,
      fabricante: dados_risco.fabricante || null,
      modelo: descricaoOriginal,
      valReferenciado: dados_risco.valReferenciado || 0,
      chassi: dados_risco.chassi || null,
      anoVeiculo,
    };
  }

  // 2) Lookup por placa
  if (placa && mcToken) {
    try {
      const result = await buscarFipePorPlaca(placa, mcToken, log);
      if (result && result.fipe) {
        log.info(`FIPE via placa: ${result.fipe} ${result.modelo}`);
        return { ...result, anoVeiculo: result.anoModelo || anoVeiculo };
      }
    } catch (e) {
      if (e.status === 401) throw e;
      log.warn(`Lookup placa falhou: ${e.message}`);
    }
  }

  // 3) Mapa local
  const local = buscarFipeLocal(descricaoOriginal, anoVeiculo);
  if (local) {
    log.info(`FIPE local: ${local.fipe}`);
    return { ...local, anoVeiculo };
  }

  // 4) API dinamica
  if (descricaoOriginal && aggerToken) {
    const dinamico = await buscarFipePorModelo(descricaoOriginal, aggerToken);
    if (dinamico && dinamico.fipe) {
      log.info(`FIPE API: ${dinamico.fipe}`);
      return { ...dinamico, anoVeiculo };
    }
  }

  log.warn('Nenhum FIPE encontrado');
  return { fipe: null, fabricante: null, modelo: descricaoOriginal, valReferenciado: 0, anoVeiculo };
}

module.exports = {
  FIPE_MAP,
  buscarFipeLocal,
  buscarFipePorPlaca,
  buscarFipePorModelo,
  resolverFipe,
};
