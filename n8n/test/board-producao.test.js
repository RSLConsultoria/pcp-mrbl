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
    faltasCostura: [],
    mensagens: [{ id: 'MSG-1', quando: '2026-10-13T10:00:00.000Z', participanteNome: 'Pessoa Teste', direcao: 'RECEBIDA', texto: 'A OS 90001 fica pronta dia 20/10', associacao: 'OS_NO_TEXTO', statusEnvio: '', tipoConteudo: 'TEXTO' }],
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
