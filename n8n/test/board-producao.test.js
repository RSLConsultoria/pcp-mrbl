const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const T0 = Date.parse('2026-10-13T12:00:00.000Z');

function extras() {
  return {
    producao: [{
      deal_id: '700001', os: '90001', oficina_id: 'of-1', oficina_nome: 'OFICINA MODELO',
      inicio_costura: '2026-10-01', data_combinada: '2026-10-20', lead_time: '2026-10-18',
      pecas: 120, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-001',
      em_costura: 'SIM', atualizado_em_ploomes: 'v1'
    }, {
      deal_id: '700002', os: '90002', oficina_id: 'of-2', oficina_nome: 'OFICINA ANTIGA',
      em_costura: 'NAO', atualizado_em_ploomes: 'v2'
    }],
    oficinas: [
      { ploomes_id: 'of-1', nome: 'OFICINA MODELO', grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO MODELO', ativo: 'SIM' },
      { ploomes_id: 'of-2', nome: 'OFICINA INATIVA', grupo_jid: 'inativo@g.us', grupo_nome: 'INATIVO', ativo: 'NAO' },
      { ploomes_id: 'of-3', nome: 'OFICINA SEM GRUPO', grupo_jid: '', grupo_nome: '', ativo: '' }
    ],
    whatsappMensagens: [{
      id: 'MSG-1', evolution_id: 'evo-privado', quando: '2026-10-13T10:00:00.000Z',
      grupo_jid: 'grupo-ficticio@g.us', participante_jid: 'pessoa@s.whatsapp.net', participante_nome: 'Pessoa Teste',
      direcao: 'RECEBIDA', texto: 'A OS 90001 fica pronta dia 20/10', deal_id: '700001', os: '90001',
      associacao: 'OS_NO_TEXTO', status_envio: '', tipo_conteudo: 'TEXTO'
    }, {
      id: 'MSG-2', evolution_id: 'evo-sem-associacao', quando: '2026-10-13T11:00:00.000Z',
      grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO MODELO', participante_jid: 'outra@s.whatsapp.net', participante_nome: 'Outra Pessoa',
      direcao: 'RECEBIDA', texto: 'As duas ficam prontas amanhã.', deal_id: '', os: '', oficina_id: 'of-1',
      associacao: 'SEM_ASSOCIACAO', status_envio: '', tipo_conteudo: 'TEXTO'
    }],
    whatsappSugestoes: [{
      id: 'SUG-1', mensagem_id: 'MSG-1', deal_id: '700001', os: '90001', tipo: 'NOVA_DATA_COMBINADA',
      valor: '2026-10-20', resumo: 'Oficina informou nova data.', evidencia: 'dia 20/10', confianca: 0.93,
      status: 'PENDENTE', criado_em: '2026-10-13T10:01:00.000Z', versao: 'v1'
    }],
    historico: [{ deal_id: '700001', quando: '2026-10-12T09:00:00.000Z', usuario: 'PCP Teste', texto: 'Data combinada ajustada.', ploomes_status: 'ENVIADO' }]
  };
}

test('board inclui somente producao em Costura e relaciona conversa, sugestao e historico', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, extras())).body;
  assert.equal(r.producao.length, 1);
  assert.deepEqual(r.producao[0], {
    dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA MODELO',
    inicioCostura: '2026-10-01', dataCombinada: '2026-10-20', leadTime: '2026-10-18',
    pecas: 120, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-001', versao: 'v1',
    faltasCostura: [], faltasAcabamento: [],
    mensagens: [{ reenviada: false, id: 'MSG-1', quando: '2026-10-13T10:00:00.000Z', participanteNome: 'Pessoa Teste', direcao: 'RECEBIDA', texto: 'A OS 90001 fica pronta dia 20/10', associacao: 'OS_NO_TEXTO', statusEnvio: '', tipoConteudo: 'TEXTO' }],
    sugestoes: [{ id: 'SUG-1', mensagemId: 'MSG-1', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-20', resumo: 'Oficina informou nova data.', evidencia: 'dia 20/10', confianca: 0.93, status: 'PENDENTE', criadoEm: '2026-10-13T10:01:00.000Z', versao: 'v1' }],
    historico: [{ quando: '2026-10-12T09:00:00.000Z', usuario: 'PCP Teste', texto: 'Data combinada ajustada.', ploomes: 'ENVIADO' }]
  });
});

test('board lista oficinas ativas e informa grupo configurado sem expor JIDs ou IDs da Evolution', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, extras())).body;
  assert.deepEqual(r.oficinas, [
    { ploomesId: 'of-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO MODELO' },
    { ploomesId: 'of-3', nome: 'OFICINA SEM GRUPO', grupoConfigurado: false, grupoNome: '' }
  ]);
  assert.deepEqual(r.mensagensWhatsappSemAssociacao, [{
    id: 'MSG-2', quando: '2026-10-13T11:00:00.000Z', participanteNome: 'Outra Pessoa', direcao: 'RECEBIDA',
    texto: 'As duas ficam prontas amanhã.', associacao: 'SEM_ASSOCIACAO', statusEnvio: '', tipoConteudo: 'TEXTO',
    oficinaId: 'of-1', oficina: 'OFICINA MODELO', grupoNome: 'GRUPO MODELO'
  }]);
  const serializado = JSON.stringify({ producao: r.producao, oficinas: r.oficinas, semAssociacao: r.mensagensWhatsappSemAssociacao });
  assert.doesNotMatch(serializado, /grupo-ficticio@g\.us|pessoa@s\.whatsapp\.net|outra@s\.whatsapp\.net|evo-privado|evo-sem-associacao/);
});

test('board vazio mantem o contrato da F4', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, {})).body;
  assert.deepEqual(r.producao, []);
  assert.deepEqual(r.oficinas, []);
  assert.deepEqual(r.mensagensWhatsappSemAssociacao, []);
  assert.ok(Array.isArray(r.dealsProducaoEditaveis));
});

test('board consolida duplicatas concorrentes pelo ID e prefere sugestão já decidida', () => {
  const e = extras();
  e.whatsappMensagens.push(Object.assign({}, e.whatsappMensagens[0]));
  e.whatsappSugestoes.push(Object.assign({}, e.whatsappSugestoes[0], { status: 'ACEITA', decidido_em: '2026-10-13T12:00:00.000Z' }));
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, e)).body;
  assert.equal(r.producao[0].mensagens.length, 1);
  assert.equal(r.producao[0].sugestoes.length, 1);
  assert.equal(r.producao[0].sugestoes[0].status, 'ACEITA');
});

test('board mostra a nova tentativa de envio e o erro definitivo de interpretação só quando existem', () => {
  const e = extras();
  e.whatsappMensagens.push({
    id: 'MSG-FILA', quando: '2026-10-13T11:30:00.000Z', direcao: 'ENVIADA', texto: 'Cobrança de *CAMISA TESTE*', deal_id: '700001',
    associacao: 'MANUAL', status_envio: 'PENDENTE', envio_tentativas: 2, envio_proxima: '2026-10-13T12:20:00.000Z', tipo_conteudo: 'TEXTO'
  }, {
    id: 'MSG-SEM-INTERPRETACAO', quando: '2026-10-13T11:40:00.000Z', direcao: 'RECEBIDA', texto: 'Resposta ficticia', deal_id: '700001',
    associacao: 'CITACAO', status_envio: '', tipo_conteudo: 'TEXTO', interpretacao_status: 'ERRO', interpretacao_tentativas: 5
  }, {
    id: 'MSG-INTERPRETANDO', quando: '2026-10-13T11:45:00.000Z', direcao: 'RECEBIDA', texto: 'Outra resposta', deal_id: '700001',
    associacao: 'CITACAO', status_envio: '', tipo_conteudo: 'TEXTO', interpretacao_status: 'PENDENTE', interpretacao_tentativas: 2
  });
  const msgs = limpo(ctx.montarRespostaBoard({}, [], [], T0, e)).body.producao[0].mensagens;
  const por = (id) => msgs.find((m) => m.id === id);
  assert.equal(por('MSG-FILA').envioTentativas, 2);
  assert.equal(por('MSG-FILA').statusEnvio, 'PENDENTE');
  assert.equal(por('MSG-SEM-INTERPRETACAO').interpretacao, 'ERRO');
  assert.equal('interpretacao' in por('MSG-INTERPRETANDO'), false);
  assert.equal('envioTentativas' in por('MSG-1'), false);
});
