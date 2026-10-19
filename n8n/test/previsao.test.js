// Motor de previsão (src/previsao.js): casos montados à mão com a mesma regra
// do DAX do BI do dono (spec 2026-10-19, seção 3). Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();

test('faixa de volume pelas peças do corte, senão do pedido, senão 0', () => {
  assert.equal(ctx.pecasPrevisao(120, 300), 120);
  assert.equal(ctx.pecasPrevisao('', '300'), 300);
  assert.equal(ctx.pecasPrevisao('', ''), 0);
  assert.equal(ctx.faixaVolume(0), '01. Pequeno');
  assert.equal(ctx.faixaVolume(50), '01. Pequeno');
  assert.equal(ctx.faixaVolume(51), '02. Médio');
  assert.equal(ctx.faixaVolume(150), '02. Médio');
  assert.equal(ctx.faixaVolume(300), '03. Grande');
  assert.equal(ctx.faixaVolume(450), '04. Industrial');
  assert.equal(ctx.faixaVolume(451), '05. Industrial+');
});

test('percentil INC, IQR, média e mediana como no Excel/DAX', () => {
  assert.equal(ctx.percentilInc([10, 20, 30, 40], 0.25), 17.5);
  assert.equal(ctx.percentilInc([10, 20, 30, 40], 0.75), 32.5);
  assert.equal(ctx.percentilInc([], 0.5), null);
  // Q1 = 2, Q3 = 4, IQR = 2: limites −1 … 7 tiram o 100.
  assert.deepEqual(limpo(ctx.filtrarIqr([1, 2, 3, 4, 100])), [1, 2, 3, 4]);
  assert.equal(ctx.mediaSimples(ctx.filtrarIqr([1, 2, 3, 4, 100])), 2.5);
  assert.equal(ctx.mediaSimples([]), null);
  assert.equal(ctx.mediana([3, 1, 2]), 2);
  assert.equal(ctx.mediana([4, 1, 3, 2]), 2.5);
});

test('datas: dia com fração cortada para baixo e hoje no fuso de São Paulo', () => {
  assert.equal(ctx.isoDoDia(ctx.diaNumero('2026-10-21') + 0.5), '2026-10-21');
  assert.equal(ctx.isoDoDia(ctx.diaNumero('2026-10-31') + 7.5), '2026-11-07');
  // 01:30 UTC de 20/10 ainda é 19/10 em São Paulo.
  assert.equal(ctx.hojeSaoPaulo(Date.parse('2026-10-20T01:30:00Z')), '2026-10-19');
  assert.equal(ctx.dataSaoPaulo('2026-10-25T03:00:00Z'), '2026-10-25');
  assert.equal(ctx.dataSaoPaulo('2026-10-25T00:00:00-03:00'), '2026-10-25');
  assert.equal(ctx.dataSaoPaulo('25/10/2026'), '2026-10-25');
  assert.equal(ctx.dataSaoPaulo('25/10'), '');
  assert.equal(ctx.dataSaoPaulo(''), '');
});

test('etapa: número antes do ponto no nome do estágio', () => {
  assert.equal(ctx.numeroEtapa('12. Encaixe'), 12);
  assert.equal(ctx.numeroEtapa('17.Costura'), 17);
  assert.equal(ctx.numeroEtapa('Costura'), null);
});

const HOJE = '2026-10-19';

const MEDIAS = ctx.tabelaMedias([
  { tipo: 'DURACAO_PCP', etapa: 12, faixa: '', oficina_id: '', valor: 2, amostra: 9 },
  { tipo: 'DURACAO_GERAL', etapa: 13, faixa: '', oficina_id: '', valor: 1.5, amostra: 9 },
  { tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 3.5, amostra: 9 },
  { tipo: 'DURACAO', etapa: 17, faixa: '02. Médio', oficina_id: '', valor: 8, amostra: 9 },
  { tipo: 'DURACAO_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 7, amostra: 9 },
  { tipo: 'FILA', etapa: 14, faixa: '03. Grande', oficina_id: '', valor: 9, amostra: 3 },
  { tipo: 'FILA_GERAL', etapa: 14, faixa: '', oficina_id: '', valor: 4, amostra: 12 },
  { tipo: 'FILA', etapa: 17, faixa: '02. Médio', oficina_id: '', valor: 2.5, amostra: 6 },
  { tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 3, amostra: 20 },
  { tipo: 'COSTURA_OFICINA', etapa: 17, faixa: '02. Médio', oficina_id: 'of-1', valor: 6.2, amostra: 4 },
  { tipo: 'DURACAO', etapa: 18, faixa: '02. Médio', oficina_id: '', valor: '', amostra: 0 }
]);

test('duração e fila usadas: faixa, geral, PCP, marcos e mínimo de 5 cards', () => {
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 12, '03. Grande'), 2);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 13, '03. Grande'), 1.5);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 14, '02. Médio'), 1);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 15, '02. Médio'), 3.5);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 15, '03. Grande'), 1);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 18, '02. Médio'), 1);  // valor vazio não conta
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 13, '03. Grande'), 0);
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 14, '03. Grande'), 4);  // 3 cards < 5: vale o geral
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 17, '02. Médio'), 2.5);
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 15, '02. Médio'), 0);
  assert.equal(ctx.temMedias(MEDIAS), true);
  assert.equal(ctx.temMedias(ctx.tabelaMedias([])), false);
});

test('projeção: OS na Preparação com oficina e média de Costura da oficina', () => {
  // FimBase = max(15/10 + 3,5; 19/10) = 19/10; Início(17) = 19/10 + 2,5 = 21,5/10; Fim = 21,5 + 6,2 = 27,7/10.
  const p = ctx.projetarOs({ etapa: 15, dtInicio: '2026-10-15', pecas: 100, oficinaId: 'of-1' }, MEDIAS, HOJE);
  assert.deepEqual(limpo(p), { inicioCostura: '2026-10-21', fimCostura: '2026-10-27' });
  // Sem oficina (ALOCAR): Fim = 21,5 + duração da Costura da faixa (8) = 29,5/10.
  const sem = ctx.projetarOs({ etapa: 15, dtInicio: '2026-10-15', pecas: 100, oficinaId: 'ALOCAR' }, MEDIAS, HOJE);
  assert.deepEqual(limpo(sem), { inicioCostura: '2026-10-21', fimCostura: '2026-10-29' });
});

test('projeção: OS no Encaixe soma as etapas do meio sem a 16', () => {
  // Início efetivo = hoje (fila 12 = 0); FimBase = 19 + 2 = 21/10.
  // Meio: 13 (1,5 + 0) + 14 (1 + 4) + 15 (1 + 0) = 7,5. Início(17) = 21 + 7,5 + 3 = 31,5/10.
  // Fim = 31,5 + 7 (geral da Costura) = 07,5/11.
  const p = ctx.projetarOs({ etapa: 12, dtInicio: '', pecas: 200, oficinaId: '' }, MEDIAS, HOJE);
  assert.deepEqual(limpo(p), { inicioCostura: '2026-10-31', fimCostura: '2026-11-07' });
});

test('projeção sem médias usa o fallback do BI (duração 1, fila 0); sem peças não prevê', () => {
  const vazio = ctx.tabelaMedias([]);
  assert.deepEqual(limpo(ctx.projetarOs({ etapa: 16, dtInicio: '', pecas: 30, oficinaId: '' }, vazio, HOJE)),
    { inicioCostura: '2026-10-20', fimCostura: '2026-10-21' });
  assert.equal(ctx.projetarOs({ etapa: 14, dtInicio: '', pecas: 0, oficinaId: '' }, vazio, HOJE), null);
  assert.equal(ctx.projetarOs({ etapa: 17, dtInicio: '', pecas: 30, oficinaId: '' }, vazio, HOJE), null);
  assert.equal(ctx.projetarOs({ etapa: 11, dtInicio: '', pecas: 30, oficinaId: '' }, vazio, HOJE), null);
});
