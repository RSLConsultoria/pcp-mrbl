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

test('etapa no texto do registro de interação (parser tolerante; formato real a confirmar)', () => {
  assert.equal(ctx.etapaDoTextoRegistro('<p>Etapa: 17</p><p>Início 01/10</p>'), 17);
  assert.equal(ctx.etapaDoTextoRegistro('Passagem pelo estágio 14 concluída'), 14);
  assert.equal(ctx.etapaDoTextoRegistro('Mudou para 15. Preparação 1 em 02/10/2026'), 15);
  assert.equal(ctx.etapaDoTextoRegistro('Sem número de etapa'), null);
  assert.equal(ctx.etapaDoTextoRegistro('Etapa 99'), null);
});

test('FieldKeys por configurar são lidas como vazias', () => {
  assert.equal(ctx.campoConfigurado('CONFIGURAR_CAMPO_PCP_COMPLETO'), false);
  assert.equal(ctx.campoConfigurado('deal_00000000-0000-0000-0000-000000000000'), true);
  const deal = { Id: 1, OtherProperties: [{ FieldKey: 'CONFIGURAR_CAMPO_PECAS_PEDIDO', IntegerValue: 999 }] };
  assert.equal(ctx.normalizarDealPrevisao(deal).pecas, 0);
  assert.equal(ctx.normalizarDealPrevisao(deal).pcpCompleto, false);
});

// Histórico fictício: hoje = 19/10/2026, janela a partir de 22/04/2026.
const DEALS = {
  800001: { dealId: '800001', pecas: 100, oficinaId: 'of-1', pcpCompleto: true },
  800002: { dealId: '800002', pecas: 120, oficinaId: 'of-1', pcpCompleto: false },
  800003: { dealId: '800003', pecas: 40, oficinaId: 'of-2', pcpCompleto: true }
};
const r = (dealId, etapa, inicio, termino) => ({ dealId, etapa, inicio, termino });
const REGISTROS = [
  r('800001', 15, '2026-10-01', '2026-10-04'),  // 3 dias
  r('800002', 15, '2026-09-01', '2026-09-06'),  // 5 dias
  r('800003', 13, '2026-09-10', '2026-09-11'),  // 1 dia (Pequeno); 13 não é produção
  r('800001', 15, '2026-03-01', '2026-03-11'),  // fora da janela
  r('800002', 15, '2026-10-10', ''),            // em aberto: entra só como destino de fila
  r('800001', 16, '2026-10-04', '2026-10-05'),  // 16 não conta como etapa anterior na fila
  r('800001', 17, '2026-10-05', '2026-10-11'),  // 6 dias; fila 17 = 1 (desde 04/10)
  r('800002', 17, '2026-09-08', '2026-09-16'),  // 8 dias; fila 17 = 2 (desde 06/09)
  r('800001', 17, '2025-12-01', '2025-12-05'),  // fora da janela, mas entra na média da oficina
  r('800001', 19, '2026-10-12', '2026-10-12'),  // marco: 0 dia entra; fila 19 = 1
  r('800003', 19, '2026-09-12', '2026-09-12'),  // não passou pela produção: fora
  r('800001', 18, '2026-09-20', '2026-09-20')   // 0 dia fora; fila negativa fora
];

test('médias por etapa/faixa, gerais, só PCP, filas e Costura por oficina', () => {
  const linhas = limpo(ctx.calcularMediasPrevisao(REGISTROS, DEALS, HOJE));
  const l = (tipo, etapa, faixa, oficina_id, valor, amostra) => ({ tipo, etapa, faixa, oficina_id, valor, amostra });
  assert.deepEqual(linhas, [
    l('COSTURA_OFICINA', 17, '02. Médio', 'of-1', 6, 3),
    l('DURACAO', 13, '01. Pequeno', '', 1, 1),
    l('DURACAO', 15, '02. Médio', '', 4, 2),
    l('DURACAO', 16, '02. Médio', '', 1, 1),
    l('DURACAO', 17, '02. Médio', '', 7, 2),
    l('DURACAO', 19, '02. Médio', '', 0, 1),
    l('DURACAO_GERAL', 13, '', '', 1, 1),
    l('DURACAO_GERAL', 15, '', '', 4, 2),
    l('DURACAO_GERAL', 16, '', '', 1, 1),
    l('DURACAO_GERAL', 17, '', '', 7, 2),
    l('DURACAO_GERAL', 19, '', '', 0, 1),
    l('DURACAO_PCP', 13, '', '', 1, 1),
    l('DURACAO_PCP', 15, '', '', 3, 1),
    l('DURACAO_PCP', 16, '', '', 1, 1),
    l('DURACAO_PCP', 17, '', '', 6, 1),
    l('DURACAO_PCP', 19, '', '', 0, 1),
    l('FILA', 17, '02. Médio', '', 1.5, 2),
    l('FILA', 19, '02. Médio', '', 1, 1),
    l('FILA_GERAL', 17, '', '', 1.5, 2),
    l('FILA_GERAL', 19, '', '', 1, 1)
  ]);
});

test('médias tiram outliers por IQR antes da média da faixa', () => {
  const regs = [3, 4, 5, 4, 60].map((d, i) => r('80000' + (i + 1), 15, '2026-09-01', ctx.isoDoDia(ctx.diaNumero('2026-09-01') + d)));
  const deals = {};
  regs.forEach((x) => { deals[x.dealId] = { dealId: x.dealId, pecas: 100, oficinaId: '', pcpCompleto: false }; });
  const linha = limpo(ctx.calcularMediasPrevisao(regs, deals, HOJE)).find((x) => x.tipo === 'DURACAO');
  assert.deepEqual(linha, { tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 4, amostra: 4 });
});

test('operações da PREVISAO_MEDIAS: atualiza valores, anexa chave nova e esvazia a que sumiu, sem apagar', () => {
  const novas = [
    { tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 4, amostra: 2 },
    { tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 1.5, amostra: 2 }
  ];
  const atuais = [
    { row_number: 2, tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 3, amostra: 1, chave: 'DURACAO|15|02. Médio|' },
    { row_number: 3, tipo: 'DURACAO', etapa: 18, faixa: '02. Médio', oficina_id: '', valor: 2, amostra: 1, chave: 'DURACAO|18|02. Médio|' },
    { row_number: 4, tipo: 'DURACAO', etapa: 13, faixa: '02. Médio', oficina_id: '', valor: '', amostra: 0, chave: 'DURACAO|13|02. Médio|' }
  ];
  assert.deepEqual(limpo(ctx.operacoesMediasPrevisao(novas, atuais, 'T1')), [
    { aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave', linha: { chave: 'DURACAO|15|02. Médio|', valor: 4, amostra: 2, calculado_em: 'T1' } },
    { aba: 'PREVISAO_MEDIAS', operacao: 'append', chave: 'chave', linha: { tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 1.5, amostra: 2, calculado_em: 'T1', chave: 'FILA_GERAL|17||' } },
    { aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave', linha: { chave: 'DURACAO|18|02. Médio|', valor: '', amostra: 0, calculado_em: 'T1' } }
  ]);
});

test('montarAtualizacaoMedias: sem registro reconhecido não grava nada', () => {
  const r0 = limpo(ctx.montarAtualizacaoMedias([{ DealId: 1, Content: 'Etapa: 17' }], [], [], HOJE, 'T1'));
  assert.equal(r0.ok, false);
  assert.match(r0.erro, /Nenhum registro de etapa reconhecido/);
});

test('montarAtualizacaoMedias: com as FieldKeys configuradas lê registros e negócios do Ploomes', () => {
  const c = carregar();
  c.CAMPO_REGISTRO_INICIO = 'record_INICIO_FICTICIO';
  c.CAMPO_REGISTRO_TERMINO = 'record_TERMINO_FICTICIO';
  const reg = (dealId, etapa, ini, fim) => ({
    DealId: dealId, Content: `<p>Etapa: ${etapa}</p>`,
    OtherProperties: [
      { FieldKey: 'record_INICIO_FICTICIO', DateTimeValue: ini + 'T03:00:00Z' },
      { FieldKey: 'record_TERMINO_FICTICIO', DateTimeValue: fim + 'T03:00:00Z' }
    ]
  });
  const deal = { Id: 800001, OtherProperties: [
    { FieldKey: 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', IntegerValue: 100 },
    { FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4', UserValueId: 501, UserValueName: 'OFICINA FICTÍCIA' }
  ] };
  const r1 = limpo(c.montarAtualizacaoMedias([reg(800001, 17, '2026-10-05', '2026-10-11')], [deal], [], HOJE, 'T1'));
  assert.equal(r1.ok, true);
  assert.equal(r1.registros, 1);
  assert.deepEqual(r1.operacoes.map((o) => o.linha.chave), ['COSTURA_OFICINA|17|02. Médio|501', 'DURACAO|17|02. Médio|', 'DURACAO_GERAL|17||']);
});
