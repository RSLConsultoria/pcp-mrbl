const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const GRUPOS = [{ ploomes_id: 'of-1', nome: 'OFICINA A', grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO TESTE', ativo: 'SIM' }];
const PRODUCOES = [
  { dealId: '700001', os: '90001', oficinaId: 'of-1' },
  { dealId: '700002', os: '90002', oficinaId: 'of-1' }
];

function evento(extra) {
  const base = {
    event: 'messages.upsert', instance: 'pcp-teste',
    data: {
      key: { remoteJid: 'grupo-ficticio@g.us', fromMe: false, id: 'MSG-1', participant: 'participante@s.whatsapp.net' },
      pushName: 'Pessoa Teste', messageTimestamp: 1791897600,
      message: { extendedTextMessage: { text: 'A OS 90001 fica pronta amanhã.' } }
    }
  };
  if (extra) Object.assign(base.data, extra);
  return base;
}

test('normalizarEventoWhatsapp extrai texto, grupo, participante e mensagem citada', () => {
  const e = evento();
  e.data.message.extendedTextMessage.contextInfo = { stanzaId: 'EV-SAIDA-1' };
  assert.deepEqual(limpo(ctx.normalizarEventoWhatsapp(e, GRUPOS)), {
    ok: true,
    mensagem: {
      evolutionId: 'MSG-1', quando: '2026-10-13T13:20:00.000Z', grupoJid: 'grupo-ficticio@g.us',
      grupoNome: 'GRUPO TESTE', participanteJid: 'participante@s.whatsapp.net', participanteNome: 'Pessoa Teste',
      fromMe: false, texto: 'A OS 90001 fica pronta amanhã.', respostaA: 'EV-SAIDA-1', tipoConteudo: 'TEXTO', oficinaId: 'of-1'
    }
  });
});

test('normalizarEventoWhatsapp ignora grupo não cadastrado, fromMe e evento irrelevante', () => {
  const fora = evento();
  fora.data.key.remoteJid = 'outro@g.us';
  assert.equal(ctx.normalizarEventoWhatsapp(fora, GRUPOS).motivo, 'GRUPO_NAO_CADASTRADO');
  const proprio = evento();
  proprio.data.key.fromMe = true;
  assert.equal(ctx.normalizarEventoWhatsapp(proprio, GRUPOS).motivo, 'MENSAGEM_PROPRIA');
  const outro = evento();
  outro.event = 'connection.update';
  assert.equal(ctx.normalizarEventoWhatsapp(outro, GRUPOS).motivo, 'EVENTO_IGNORADO');
});

test('normalizarEventoWhatsapp aceita data em lista e valida a instância configurada', () => {
  const emLista = evento();
  emLista.data = [emLista.data];
  assert.equal(ctx.normalizarEventoWhatsapp(emLista, GRUPOS, { instancia: 'pcp-teste' }).ok, true);

  const outraInstancia = evento();
  outraInstancia.instance = 'outra-instancia';
  assert.equal(ctx.normalizarEventoWhatsapp(outraInstancia, GRUPOS, { instancia: 'pcp-teste' }).motivo, 'INSTANCIA_IGNORADA');

  const semId = evento();
  semId.data.key.id = '';
  assert.equal(ctx.normalizarEventoWhatsapp(semId, GRUPOS, { instancia: 'pcp-teste' }).motivo, 'MENSAGEM_SEM_ID');
});

test('normalizarEventoWhatsapp registra conteúdo não textual sem inventar texto', () => {
  const e = evento({ message: { audioMessage: { mimetype: 'audio/ogg' } } });
  const m = ctx.normalizarEventoWhatsapp(e, GRUPOS).mensagem;
  assert.equal(m.tipoConteudo, 'NAO_TEXTUAL');
  assert.equal(m.texto, '');
});

test('mensagemWhatsappDuplicada usa somente evolution_id preenchido', () => {
  const linhas = [{ id: 'interno-1', evolution_id: 'MSG-1' }, { id: 'interno-2', evolution_id: '' }];
  assert.equal(ctx.mensagemWhatsappDuplicada('MSG-1', linhas), true);
  assert.equal(ctx.mensagemWhatsappDuplicada('MSG-2', linhas), false);
  assert.equal(ctx.mensagemWhatsappDuplicada('', linhas), false);
});

test('associação por citação prevalece sobre OS escrita no texto', () => {
  const msg = { grupoJid: 'grupo-ficticio@g.us', texto: 'Também vi a OS 90002.', respostaA: 'EV-SAIDA-1', quando: '2026-10-13T13:20:00.000Z' };
  const anteriores = [{ evolution_id: 'EV-SAIDA-1', direcao: 'ENVIADA', deal_id: '700001', os: '90001', grupo_jid: 'grupo-ficticio@g.us' }];
  assert.deepEqual(limpo(ctx.associarMensagemWhatsapp(msg, PRODUCOES, anteriores)),
    { dealId: '700001', os: '90001', associacao: 'CITACAO' });
});

test('associação usa uma OS no texto e recusa texto com duas OS', () => {
  const uma = ctx.associarMensagemWhatsapp({ grupoJid: 'grupo-ficticio@g.us', texto: 'A 90001 entrega sexta.', quando: '2026-10-13T13:20:00.000Z' }, PRODUCOES, []);
  assert.deepEqual(limpo(uma), { dealId: '700001', os: '90001', associacao: 'OS_NO_TEXTO' });
  const duas = ctx.associarMensagemWhatsapp({ grupoJid: 'grupo-ficticio@g.us', texto: '90001 e 90002 ficam prontas.', quando: '2026-10-13T13:20:00.000Z' }, PRODUCOES, []);
  assert.deepEqual(limpo(duas), { dealId: '', os: '', associacao: 'SEM_ASSOCIACAO' });
});

test('associação usa somente uma cobrança pendente recente do grupo', () => {
  const msg = { grupoJid: 'grupo-ficticio@g.us', texto: 'Fica pronta amanhã.', quando: '2026-10-13T13:20:00.000Z' };
  const base = { direcao: 'ENVIADA', tipo: 'COBRANCA_PRAZO', grupo_jid: 'grupo-ficticio@g.us', quando: '2026-10-13T12:00:00.000Z', respondida: '' };
  assert.deepEqual(limpo(ctx.associarMensagemWhatsapp(msg, PRODUCOES, [Object.assign({}, base, { deal_id: '700001', os: '90001' })])),
    { dealId: '700001', os: '90001', associacao: 'ULTIMA_COBRANCA' });
  const duas = [Object.assign({}, base, { deal_id: '700001', os: '90001' }), Object.assign({}, base, { deal_id: '700002', os: '90002' })];
  assert.deepEqual(limpo(ctx.associarMensagemWhatsapp(msg, PRODUCOES, duas)), { dealId: '', os: '', associacao: 'SEM_ASSOCIACAO' });
});

test('resolverDataInterpretada entende ISO, dd/mm, amanhã e rejeita data impossível', () => {
  assert.equal(ctx.resolverDataInterpretada('2026-10-20', '2026-10-13T13:20:00.000Z'), '2026-10-20');
  assert.equal(ctx.resolverDataInterpretada('20/10', '2026-10-13T13:20:00.000Z'), '2026-10-20');
  assert.equal(ctx.resolverDataInterpretada('amanhã', '2026-10-13T13:20:00.000Z'), '2026-10-14');
  assert.equal(ctx.resolverDataInterpretada('31/02', '2026-10-13T13:20:00.000Z'), '');
});

test('data relativa usa o dia de America/Sao_Paulo, inclusive perto da meia-noite', () => {
  assert.equal(ctx.resolverDataInterpretada('amanhã', '2026-10-14T02:30:00.000Z'), '2026-10-14');
});

test('validarInterpretacaoWhatsapp aplica schema e confiança baixa vira observação', () => {
  const alta = ctx.validarInterpretacaoWhatsapp({ tipo: 'NOVA_DATA_COMBINADA', valor: 'amanhã', resumo: 'Entrega amanhã', evidencia: 'fica pronta amanhã', confianca: 0.91 }, '2026-10-13T13:20:00.000Z');
  assert.deepEqual(limpo(alta), { ok: true, tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-14', resumo: 'Entrega amanhã', evidencia: 'fica pronta amanhã', confianca: 0.91 });
  const baixa = ctx.validarInterpretacaoWhatsapp({ tipo: 'NOVA_DATA_COMBINADA', valor: 'amanhã', resumo: 'Talvez amanhã', evidencia: 'acho que amanhã', confianca: 0.4 }, '2026-10-13T13:20:00.000Z');
  assert.equal(baixa.tipo, 'OBSERVACAO');
  assert.equal(baixa.valor, '');
  assert.equal(ctx.validarInterpretacaoWhatsapp({ tipo: 'INVENTADO', confianca: 1 }, '2026-10-13T13:20:00.000Z').ok, false);
  assert.equal(ctx.validarInterpretacaoWhatsapp('{quebrado', '2026-10-13T13:20:00.000Z').ok, false);
});

test('decidir sugestao exige vinculo com a mesma OS/oficina e motivo para nova data', () => {
  const sugestao = { id: 'SUG-1', mensagem_id: 'MSG-1', deal_id: '700001', os: '90001', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-20', resumo: 'Entrega dia 20.', status: 'PENDENTE', versao: 'v1' };
  const producao = { deal_id: '700001', os: '90001', oficina_id: 'of-1', data_combinada: '2026-10-18', atualizado_em_ploomes: 'v1' };
  const mensagem = { id: 'MSG-1', deal_id: '700001', oficina_id: 'of-1' };
  assert.deepEqual(limpo(ctx.decidirSugestaoWhatsapp({ decisao: 'ACEITAR', versao: 'v1', motivo: '' }, sugestao, producao, mensagem, {})),
    { ok: false, status: 400, erro: 'Informe o motivo da alteração da data combinada.' });
  const errada = Object.assign({}, mensagem, { oficina_id: 'of-2' });
  assert.equal(ctx.decidirSugestaoWhatsapp({ decisao: 'ACEITAR', versao: 'v1', motivo: 'Combinado' }, sugestao, producao, errada, {}).status, 409);
});

test('aceitar e ignorar sugestao sao idempotentes e nunca criam resposta ao grupo', () => {
  const sugestao = { id: 'SUG-1', mensagem_id: 'MSG-1', deal_id: '700001', os: '90001', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-20', resumo: 'Entrega dia 20.', status: 'PENDENTE', versao: 'v1' };
  const producao = { deal_id: '700001', os: '90001', oficina_id: 'of-1', data_combinada: '2026-10-18', atualizado_em_ploomes: 'v1' };
  const mensagem = { id: 'MSG-1', deal_id: '700001', oficina_id: 'of-1' };
  const aceita = ctx.decidirSugestaoWhatsapp({ decisao: 'ACEITAR', versao: 'v1', motivo: 'Oficina confirmou.' }, sugestao, producao, mensagem, { usuario: 'Pessoa PCP', agora: '2026-10-13T14:00:00.000Z' });
  assert.equal(aceita.ok, true);
  assert.deepEqual(limpo(aceita.operacoes), [
    { aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id', linha: { deal_id: '700001', data_combinada: '2026-10-20' } },
    { aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id', linha: { id: 'SUG-1', status: 'ACEITA', decidido_em: '2026-10-13T14:00:00.000Z', decidido_por: 'Pessoa PCP' } }
  ]);
  assert.equal(aceita.ploomes.dealId, '700001');
  assert.deepEqual(limpo(aceita.ploomes.campos), { 'deal_E53BDEC3-F829-413D-9421-91D5D7411349': '2026-10-20' });
  assert.equal('mensagem' in aceita || 'resposta' in aceita, false);
  assert.equal(ctx.decidirSugestaoWhatsapp({ decisao: 'ACEITAR', versao: 'v1', motivo: 'x' }, Object.assign({}, sugestao, { status: 'ACEITA' }), producao, mensagem, {}).idempotente, true);
  assert.equal(ctx.decidirSugestaoWhatsapp({ decisao: 'IGNORAR' }, Object.assign({}, sugestao, { status: 'IGNORADA' }), producao, mensagem, {}).idempotente, true);
});

test('entrada associada grava a mensagem e a sugestao, sem criar resposta ao grupo', () => {
  let sequencia = 0;
  const resultado = ctx.processarEntradaWhatsapp(evento(), {
    oficinas: GRUPOS,
    producao: [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', atualizado_em_ploomes: 'v1', em_costura: 'SIM' }],
    mensagens: []
  }, { tipo: 'NOVA_DATA_COMBINADA', valor: 'amanhã', resumo: 'Entrega amanhã.', evidencia: 'fica pronta amanhã', confianca: 0.94 }, {
    agora: '2026-10-13T13:21:00.000Z',
    gerarId: () => 'ID-' + (++sequencia)
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.precisaInterpretar, true);
  assert.deepEqual(limpo(resultado.operacoes), [
    { aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id', linha: {
      id: 'ID-1', evolution_id: 'MSG-1', quando: '2026-10-13T13:20:00.000Z', grupo_jid: 'grupo-ficticio@g.us', grupo_nome: 'GRUPO TESTE',
      participante_jid: 'participante@s.whatsapp.net', participante_nome: 'Pessoa Teste', direcao: 'RECEBIDA', tipo: 'RESPOSTA',
      tipo_conteudo: 'TEXTO', texto: 'A OS 90001 fica pronta amanhã.', resposta_a_evolution_id: '', deal_id: '700001', os: '90001', oficina_id: 'of-1',
      associacao: 'OS_NO_TEXTO', status_envio: '', erro: '', criado_em: '2026-10-13T13:21:00.000Z'
    } },
    { aba: 'WHATSAPP_SUGESTOES', operacao: 'append', chave: 'id', linha: {
      id: 'ID-2', mensagem_id: 'ID-1', deal_id: '700001', os: '90001', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-14',
      resumo: 'Entrega amanhã.', evidencia: 'fica pronta amanhã', confianca: 0.94, status: 'PENDENTE', criado_em: '2026-10-13T13:21:00.000Z',
      decidido_em: '', decidido_por: '', versao: 'v1'
    } }
  ]);
  assert.equal('resposta' in resultado || 'envio' in resultado, false);
});

test('preparação da entrada entrega ao intérprete somente o contexto necessário', () => {
  const preparada = ctx.prepararEntradaWhatsapp(evento(), {
    oficinas: GRUPOS,
    producao: [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', data_combinada: '2026-10-18', atualizado_em_ploomes: 'v1', em_costura: 'SIM' }],
    mensagens: []
  }, { instancia: 'pcp-teste', agora: '2026-10-13T13:21:00.000Z', gerarId: () => 'MSG-INTERNA' });

  assert.equal(preparada.ok, true);
  assert.equal(preparada.precisaInterpretar, true);
  assert.deepEqual(limpo(preparada.contextoInterpretacao), {
    texto: 'A OS 90001 fica pronta amanhã.', quando: '2026-10-13T13:20:00.000Z',
    dealId: '700001', os: '90001', dataCombinada: '2026-10-18'
  });
  assert.equal(JSON.stringify(preparada.contextoInterpretacao).includes('participante'), false);
  assert.equal(JSON.stringify(preparada.contextoInterpretacao).includes('grupo-ficticio'), false);
});

test('conclusão inválida preserva a mensagem e não cria sugestão', () => {
  const preparada = ctx.prepararEntradaWhatsapp(evento(), {
    oficinas: GRUPOS, producao: [{ deal_id: '700001', os: '90001', oficina_id: 'of-1', atualizado_em_ploomes: 'v1', em_costura: 'SIM' }], mensagens: []
  }, { agora: '2026-10-13T13:21:00.000Z', gerarId: () => 'MSG-INTERNA' });
  const concluida = ctx.concluirEntradaWhatsapp(preparada, '{json inválido', { gerarId: () => 'SUG-1' });
  assert.equal(concluida.erroInterpretacao, 'Interpretação inválida.');
  assert.equal(concluida.operacoes.length, 1);
  assert.equal(concluida.operacoes[0].aba, 'WHATSAPP_MENSAGENS');
});

test('ID da sugestão é determinístico a partir da mensagem recebida', () => {
  assert.equal(ctx.idSugestaoWhatsapp('WA-R-abc123'), 'WA-S-abc123');
  assert.equal(ctx.idSugestaoWhatsapp('MSG-1'), 'WA-S-MSG-1');
});

test('subworkflow do intérprete exige exatamente a propriedade interpretacao', () => {
  const valor = { tipo: 'PRAZO_CONFIRMADO', valor: '', resumo: 'Prazo confirmado.', evidencia: 'confirmado', confianca: 0.95 };
  assert.deepEqual(limpo(ctx.respostaDoInterpreteWhatsapp({ interpretacao: valor })), { ok: true, interpretacao: valor });
  assert.equal(ctx.respostaDoInterpreteWhatsapp({ output: valor }).ok, false);
  assert.equal(ctx.respostaDoInterpreteWhatsapp(valor).ok, false);
  assert.equal(ctx.respostaDoInterpreteWhatsapp({ interpretacao: null }).ok, false);
});

test('entrada duplicada nao grava; ambigua grava sem chamar o interprete', () => {
  const duplicada = ctx.processarEntradaWhatsapp(evento(), { oficinas: GRUPOS, producao: PRODUCOES, mensagens: [{ evolution_id: 'MSG-1' }] }, null, { gerarId: () => 'X' });
  assert.deepEqual(limpo(duplicada), { ok: true, ignorada: true, motivo: 'DUPLICADA', operacoes: [] });

  const e = evento();
  e.data.message.extendedTextMessage.text = 'As OS 90001 e 90002 ficam prontas amanhã.';
  const ambigua = ctx.processarEntradaWhatsapp(e, { oficinas: GRUPOS, producao: PRODUCOES, mensagens: [] }, null, {
    agora: '2026-10-13T13:21:00.000Z', gerarId: () => 'MSG-INTERNA'
  });
  assert.equal(ambigua.ok, true);
  assert.equal(ambigua.precisaInterpretar, false);
  assert.equal(ambigua.operacoes.length, 1);
  assert.equal(ambigua.operacoes[0].linha.associacao, 'SEM_ASSOCIACAO');
  assert.equal(ambigua.operacoes[0].linha.deal_id, '');
});

test('processar entrada repassa a instância esperada para a normalização', () => {
  const rejeitada = ctx.processarEntradaWhatsapp(evento(), { oficinas: GRUPOS, producao: PRODUCOES, mensagens: [] }, null, {
    instancia: 'instancia-diferente', gerarId: () => 'X'
  });
  assert.deepEqual(limpo(rejeitada), { ok: true, ignorada: true, motivo: 'INSTANCIA_IGNORADA', operacoes: [] });
});
