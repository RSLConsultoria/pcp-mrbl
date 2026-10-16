// C1 (16/10): o intérprete recebe o contexto completo da OS e a conversa
// recente, sem JID, telefone ou nome de participante.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();

const PRODUCAO = [
  { deal_id: '700001', os: '90001', oficina_id: 'of-1', oficina_nome: 'OFICINA A', inicio_costura: '2026-10-01',
    data_combinada: '2026-10-10', lead_time: '2026-10-18', pecas: '160', cliente: 'CLIENTE FICTICIO', peca: 'PECA TESTE B',
    referencia: 'REF-02', em_costura: 'SIM', atualizado_em_ploomes: 'v1' },
  { deal_id: '700002', os: '90002', oficina_id: 'of-1', oficina_nome: 'OFICINA A', inicio_costura: '',
    data_combinada: '', lead_time: '', pecas: '', peca: 'PECA TESTE C', referencia: 'REF-03', em_costura: 'SIM', atualizado_em_ploomes: 'v2' }
];
const falta = (id, deal, os, secao, nome, qtd, un, extra) => Object.assign({
  id, deal_id: deal, os, secao, ciclo: 'PEDIDO', descricao_item: nome, unidade: un, qtd_falta: qtd, qtd_baixada: '', status: 'ABERTO'
}, extra);
const FALTANTES = [
  falta('f1', '810001', '90001', 'COSTURA', 'VIÉS TESTE', 4, 'MT'),
  falta('f2', '810001', '90001', 'COSTURA', 'LINHA TESTE', 2, 'UN', { nome_cor: 'AZUL' }),
  falta('f3', '810001', '90001', 'COSTURA', 'BOTÃO RESOLVIDO', 10, 'UN', { status: 'RESOLVIDO' }),
  falta('f4', '810002', '90002', 'ACABAMENTO', 'ETIQUETA TESTE', 30, 'UN')
];
const minuto = (n) => new Date(Date.parse('2026-10-13T10:00:00.000Z') + n * 60000).toISOString();
function conversa() {
  const lista = [];
  for (let i = 0; i < 12; i++) {
    lista.push({ id: 'C' + i, quando: minuto(i), deal_id: '700001', os: '90001', direcao: i % 2 ? 'RECEBIDA' : 'ENVIADA',
      status_envio: i % 2 ? '' : 'ENVIADA', texto: 'Mensagem ' + i, grupo_jid: 'grupo-ficticio@g.us',
      participante_jid: '5511999999999@s.whatsapp.net', participante_nome: 'Pessoa Ficticia' });
  }
  lista.push({ id: 'ERRO', quando: minuto(20), deal_id: '700001', direcao: 'ENVIADA', status_envio: 'ERRO', texto: 'Nunca chegou' });
  lista.push({ id: 'OUTRA', quando: minuto(21), deal_id: '700002', direcao: 'RECEBIDA', texto: 'Outra OS' });
  lista.push({ id: 'ALVO', quando: minuto(30), deal_id: '700001', direcao: 'RECEBIDA', texto: 'Entregamos dia 20.' });
  lista.push({ id: 'DEPOIS', quando: minuto(40), deal_id: '700001', direcao: 'RECEBIDA', texto: 'Mensagem posterior' });
  return lista;
}

test('montarContextoInterpretacao junta OS, prazo, faltas e conversa recente', () => {
  const c = limpo(ctx.montarContextoInterpretacao(
    { producao: PRODUCAO, mensagens: conversa(), faltantes: FALTANTES, ganhas: [] },
    { mensagemId: 'ALVO', dealId: '700001', texto: 'Entregamos dia 20.', quando: minuto(30) },
    '2026-10-13'));
  assert.deepEqual(Object.assign({}, c, { conversa: undefined, faltasCostura: undefined }), {
    texto: 'Entregamos dia 20.', quando: minuto(30),
    os: '90001', peca: 'PECA TESTE B', referencia: 'REF-02', pecas: 160, oficina: 'OFICINA A',
    inicioCostura: '2026-10-01', dataCombinada: '2026-10-10', leadTime: '2026-10-18',
    prazoVigente: '2026-10-10', origemPrazo: 'COMBINADA', statusPrazo: 'ATRASADO', diasParaPrazo: -3,
    faltasAcabamento: { quantidade: 0, itens: [] },
    conversa: undefined, faltasCostura: undefined
  });
  assert.deepEqual(c.faltasCostura, { quantidade: 2, itens: ['VIÉS TESTE: falta 4 MT', 'LINHA TESTE AZUL: falta 2 UN'] });
  // Últimas 10 anteriores, em ordem cronológica; sem a própria mensagem, sem a futura,
  // sem tentativa com erro (a oficina nunca viu) e sem outra OS.
  assert.deepEqual(c.conversa.map((m) => m.texto), ['Mensagem 2', 'Mensagem 3', 'Mensagem 4', 'Mensagem 5', 'Mensagem 6',
    'Mensagem 7', 'Mensagem 8', 'Mensagem 9', 'Mensagem 10', 'Mensagem 11']);
  assert.deepEqual(c.conversa[0], { direcao: 'ENVIADA', quando: minuto(2), texto: 'Mensagem 2' });
  const json = JSON.stringify(c);
  assert.doesNotMatch(json, /@g\.us|s\.whatsapp\.net|5511999999999|Pessoa Ficticia|grupo|participante/);
});

test('contexto sem prazo e com falta de acabamento; textos longos são cortados em 500', () => {
  const longo = 'x'.repeat(800);
  const mensagens = [{ id: 'A1', quando: minuto(1), deal_id: '700002', direcao: 'RECEBIDA', texto: longo }];
  const c = limpo(ctx.montarContextoInterpretacao(
    { producao: PRODUCAO, mensagens, faltantes: FALTANTES, ganhas: [] },
    { mensagemId: 'A2', dealId: '700002', texto: longo, quando: minuto(5) }, '2026-10-13'));
  assert.equal(c.texto.length, 500);
  assert.equal(c.conversa[0].texto.length, 500);
  assert.equal(c.pecas, null);
  assert.equal(c.prazoVigente, '');
  assert.equal(c.origemPrazo, 'SEM_PRAZO');
  assert.equal(c.statusPrazo, 'SEM_PRAZO');
  assert.equal(c.diasParaPrazo, null);
  assert.deepEqual(c.faltasAcabamento, { quantidade: 1, itens: ['ETIQUETA TESTE: falta 30 UN'] });
  assert.deepEqual(c.faltasCostura, { quantidade: 0, itens: [] });
});

test('mensagem não textual entra na conversa como marcador, sem conteúdo', () => {
  const mensagens = [{ id: 'N1', quando: minuto(1), deal_id: '700001', direcao: 'RECEBIDA', tipo_conteudo: 'NAO_TEXTUAL', texto: '' }];
  const c = ctx.montarContextoInterpretacao({ producao: PRODUCAO, mensagens, faltantes: [], ganhas: [] },
    { mensagemId: 'X', dealId: '700001', texto: 'Ok', quando: minuto(5) }, '2026-10-13');
  assert.deepEqual(limpo(c.conversa), [{ direcao: 'RECEBIDA', quando: minuto(1), texto: '[conteúdo não textual]' }]);
});

test('entrada do intérprete leva o contexto, as instruções e o schema; as mensagens citam a peça', () => {
  const contexto = { texto: 'Entregamos dia 20.', quando: minuto(30), os: '90001', peca: 'PECA TESTE B' };
  const e = limpo(ctx.entradaInterpreteWhatsapp(contexto));
  assert.equal(e.texto, 'Entregamos dia 20.');
  assert.equal(e.peca, 'PECA TESTE B');
  assert.match(e.instrucoes, /sem responder ao grupo/);
  assert.match(e.instrucoes, /citam a peça/);
  assert.match(e.instrucoes, /não o número da OS/);
  assert.deepEqual(e.schema.tipo, ['NOVA_DATA_COMBINADA', 'PRAZO_CONFIRMADO', 'MOTIVO_ATRASO', 'OBSERVACAO']);
});
