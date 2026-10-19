// URLs das leituras do Ploomes (Costura, previstas e médias de previsão). O $expand de
// OtherProperties é filtrado pelas FieldKeys que o código realmente lê: a lista vem de
// fieldKeysConsulta (src/previsao.js), nunca digitada aqui. Espaços como %20, aspas simples literais.
const { carregar } = require('../test/carregar');

const lote = carregar();
const PLOOMES = 'https://public-api2.ploomes.com/';

const expandir = (consulta) => 'OtherProperties($filter=' +
  lote.fieldKeysConsulta(consulta).map((c) => "FieldKey%20eq%20'" + c + "'").join('%20or%20') + ')';

const FUNIS_PREVISAO = '(PipelineId%20eq%20' + lote.FUNIL_PCP + '%20or%20PipelineId%20eq%20' + lote.FUNIL_PRODUCAO + ')';
// Etapas 12 a 16 (previstas): OS em aberto, filtradas na consulta pelos 5 StageIds
// (Encaixe, Estratégico 2, Corte, Preparação 1 e 1ª Peça). A etapa sai do nome do
// estágio ("12. Encaixe"); o filtro 12–16 no Code node (separarPrevistas) é a segunda proteção.
const ESTAGIOS_PREVISTAS = [60054173, 60054175, 60073485, 60073486, 60073487];
const FILTRO_ESTAGIOS_PREVISTAS = '(' + ESTAGIOS_PREVISTAS.map((id) => 'StageId%20eq%20' + id).join('%20or%20') + ')';

const urlsPloomes = {
  costura: PLOOMES + 'Deals?$filter=PipelineId%20eq%2060015827%20and%20StageId%20eq%2060073488&$expand=' + expandir('costura') + '&$select=Id,Title,ContactName,LastUpdateDate&$orderby=Id&$top=100',
  previstas: PLOOMES + 'Deals?$filter=' + FUNIS_PREVISAO + '%20and%20' + FILTRO_ESTAGIOS_PREVISTAS + '%20and%20StatusId%20eq%201&$expand=' + expandir('previstas') + ',Stage($select=Id,Name)&$select=Id,Title,ContactName,LastUpdateDate,StageId&$orderby=Id&$top=100',
  registrosPrevisao: PLOOMES + 'InteractionRecords?$filter=Tags/any(t:%20t/TagId%20eq%20' + lote.MARCADOR_HISTORICO_PREVISAO + ')&$expand=' + expandir('registros_previsao') + '&$select=Id,DealId,Content&$orderby=Id&$top=100',
  negociosPrevisao: PLOOMES + 'Deals?$filter=' + FUNIS_PREVISAO + '&$expand=' + expandir('negocios_previsao') + '&$select=Id&$orderby=Id&$top=100'
};

module.exports = { urlsPloomes, FUNIS_PREVISAO };
