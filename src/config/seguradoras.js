const { createLogger } = require('../utils/logger');

const log = createLogger({ scope: 'config' });
const CORRETORA_ID = 'd256d28a-b6ac-4077-b183-71f3780f0192';

let _calculos = [];

async function carregarSeguradoras(supabase) {
  const { data, error } = await supabase
    .from('seguradoras')
    .select('*')
    .eq('ativa', true);

  if (error) {
    log.error('Erro ao carregar seguradoras:', error.message);
    throw error;
  }

  _calculos = data.map(seg => {
    const cred = seg.credenciais || {};
    const cfg = seg.config || {};

    return {
      ativo: true,
      nome: seg.nome,
      nomeSeguradora: seg.nome_seguradora,
      seguradora: seg.seguradora_id,
      aplicacaoId: 3,
      configsGlobais: true,
      credenciaisValidas: true,
      cargaIniciada: false,
      customStatusRamo: [],
      parcelasBaixar: cfg.parcelasBaixar || false,
      login: cred.login,
      senha: cred.senha,
      percComissao: cfg.percComissao ?? 15,
      percDesconto: cfg.percDesconto ?? 0,
      ...cred,
      ...cfg,
      idIntegracao: `_seguradora_${seg.seguradora_id}_corretora_${CORRETORA_ID}_`,
      idIntegracaoCfg: `_seguradora_${seg.seguradora_id}_corretora_${CORRETORA_ID}_`,
      idIntegracaoCfgSeg: `_seguradora_${seg.seguradora_id}_corretora_${CORRETORA_ID}_`,
      tipoCobertura: 2,
      tipoFranquia: 1,
      isDanosMateriais: 200000,
      isDanosCorporais: 400000,
      isDanosMorais: 100000,
      isAppMorte: 10000,
      isBlindagemValor: 0,
      carroReserva: 3,
      carroReservaAr: false,
      despesasExtra: false,
      protecaoPneuRodas: false,
      reparoRapido: false,
      vidros: 2,
      assist24hs: 1,
      valorDeNovo: 0,
      apolicesBaixar: cfg.apolicesBaixar || false,
      libertyCodigoEstabelecimento: cred.libertyCodigoEstabelecimento || null,
      libertyDescontoRegional: cred.libertyDescontoRegional ?? 1,
    };
  });

  log.info(`${_calculos.length} seguradoras carregadas`);
  return _calculos;
}

function getCalculos() {
  return _calculos;
}

module.exports = { carregarSeguradoras, getCalculos, CORRETORA_ID };
