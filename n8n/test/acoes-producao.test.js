const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { carregar, limpo } = require('./carregar');

const T0 = Date.parse('2026-10-13T14:00:00.000Z');
function contexto() {
  const ctx = carregar();
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['700001'];
  const estado = {};
  const usuario = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'ADM', senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-forte'), ativo: 'SIM' }];
  const login = ctx.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-forte' }, usuario, T0);
  return { ctx, estado, cab: 'Bearer ' + login.body.token };
}

const linhas = () => ({
  producao: [
    { deal_id: '700001', os: '90001', oficina_id: 'of-1', oficina_nome: 'OFICINA A', data_combinada: '2026-10-18', atualizado_em_ploomes: 'v1' },
    { deal_id: '700002', os: '90002', oficina_id: 'of-2', oficina_nome: 'OFICINA B', data_combinada: '2026-10-19', atualizado_em_ploomes: 'v2' }
  ],
  oficinas: [{ ploomes_id: 'of-1', nome: 'OFICINA A', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE', ativo: 'SIM' }, { ploomes_id: 'of-2', nome: 'OFICINA B', ativo: 'SIM' }],
  whatsappMensagens: [{ id: 'MSG-1', deal_id: '700001', oficina_id: 'of-1', grupo_jid: 'grupo-teste@g.us' }],
  whatsappSugestoes: [{ id: 'SUG-1', mensagem_id: 'MSG-1', deal_id: '700001', os: '90001', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-20', resumo: 'Entrega dia 20.', status: 'PENDENTE', versao: 'v1' }]
});

test('associar whatsapp liga mensagem pendente somente a uma OS do mesmo grupo', () => {
  const { ctx, estado, cab } = contexto();
  const dados = linhas();
  dados.whatsappMensagens = [{
    id: 'MSG-SEM-OS', quando: '2026-10-13T13:00:00.000Z', direcao: 'RECEBIDA', associacao: 'SEM_ASSOCIACAO',
    deal_id: '', os: '', oficina_id: 'of-1', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE'
  }];
  const corpo = { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-SEM-OS', versao: 'v1' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'HIST-ASSOC'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [{
    aba: 'WHATSAPP_MENSAGENS', operacao: 'update', chave: 'id',
    linha: { id: 'MSG-SEM-OS', deal_id: '700001', os: '90001', oficina_id: 'of-1', associacao: 'MANUAL' }
  }]);
  assert.equal(r.historicos[0].acao, 'WHATSAPP_ASSOCIAR');
  assert.equal(r.ploomes, null);

  ctx.DEALS_PRODUCAO_EDITAVEIS = ['700001', '700002'];
  const outroGrupo = { ...corpo, dealId: '700002', versao: 'v2' };
  assert.equal(ctx.processarAcao(estado, cab, outroGrupo, dados, T0, () => 'X').status, 409);
  dados.oficinas[0].grupo_jid = 'outro-grupo@g.us';
  assert.equal(ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'X').status, 409);
  dados.oficinas[0].grupo_jid = 'grupo-teste@g.us';
  dados.whatsappMensagens[0].deal_id = '700001';
  dados.whatsappMensagens[0].associacao = 'MANUAL';
  assert.equal(ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'X').status, 409);
});

test('alterar_producao valida allowlist, versao e motivo e prepara planilha/Ploomes/historico', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'alterar_producao', dealId: '700001', versao: 'v1', oficinaId: 'of-2', dataCombinada: '2026-10-20', motivo: 'Oficina confirmou.' };
  assert.equal(ctx.preValidarAcao(estado, cab, corpo, T0).ok, true);
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'HIST-1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [{ aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id', linha: { deal_id: '700001', atualizado_em_ploomes: '2026-10-13T14:00:00.000Z', oficina_id: 'of-2', oficina_nome: 'OFICINA B', data_combinada: '2026-10-20' } }]);
  assert.equal(r.ploomes.dealId, '700001');
  assert.deepEqual(r.ploomes.campos, { 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4': 'of-2', 'deal_E53BDEC3-F829-413D-9421-91D5D7411349': '2026-10-20' });
  assert.equal(r.historicos[0].acao, 'PRODUCAO_ALTERAR_COMBINADO');
  // Datas no histórico (e no registro do Ploomes) em dd/mm, como nos pedidos.
  assert.equal(r.historicos[0].texto, 'Pessoa PCP alterou o combinado: oficina: OFICINA A → OFICINA B · data combinada: 18/10 → 20/10 · motivo: Oficina confirmou.');
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['outro'];
  assert.equal(ctx.preValidarAcao(estado, cab, corpo, T0).status, 403);
});

test('aceitar sugestao prepara mudanca sem resposta ao grupo; repeticao aceita e idempotente', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'aceitar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1', motivo: 'Oficina confirmou.' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'HIST-2'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes.map((o) => o.aba), ['PRODUCAO', 'WHATSAPP_SUGESTOES']);
  assert.equal(r.ploomes.dealId, '700001');
  assert.equal('mensagem' in r || 'resposta' in r, false);
  assert.equal(r.historicos[0].texto, 'Pessoa PCP aceitou a sugestão do WhatsApp: nova data 20/10 · Oficina confirmou.');
  const ja = linhas();
  ja.whatsappSugestoes[0].status = 'ACEITA';
  const outra = limpo(ctx.processarAcao(estado, cab, corpo, ja, T0, () => 'NAO-USA'));
  assert.equal(outra.status, 200);
  assert.deepEqual(outra.operacoes, []);
});

test('aceitar ou ignorar sugestao exige a versao atual da producao', () => {
  const { ctx, estado, cab } = contexto();
  const base = { dealId: '700001', sugestaoId: 'SUG-1' };
  const aceitarSemVersao = ctx.processarAcao(estado, cab, {
    ...base, tipo: 'aceitar_sugestao_whatsapp', motivo: 'Oficina confirmou.'
  }, linhas(), T0, () => 'X');
  const ignorarSemVersao = ctx.processarAcao(estado, cab, {
    ...base, tipo: 'ignorar_sugestao_whatsapp'
  }, linhas(), T0, () => 'X');
  const aceitarDesatualizada = ctx.processarAcao(estado, cab, {
    ...base, tipo: 'aceitar_sugestao_whatsapp', versao: 'antiga', motivo: 'Oficina confirmou.'
  }, linhas(), T0, () => 'X');
  assert.equal(aceitarSemVersao.status, 409);
  assert.equal(ignorarSemVersao.status, 409);
  assert.equal(aceitarDesatualizada.status, 409);
});

test('decisao de sugestao exige o grupo atual da oficina e limita o motivo', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'aceitar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1', motivo: 'Oficina confirmou.' };
  const grupoMudou = linhas();
  grupoMudou.oficinas[0].grupo_jid = 'novo-grupo@g.us';
  assert.equal(ctx.processarAcao(estado, cab, corpo, grupoMudou, T0, () => 'X').status, 409);

  const motivoLongo = { ...corpo, motivo: 'x'.repeat(501) };
  assert.equal(ctx.processarAcao(estado, cab, motivoLongo, linhas(), T0, () => 'X').status, 400);
});

test('ignorar sugestao registra decisao sem tocar no Ploomes', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'ignorar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'HIST-3'));
  assert.equal(r.status, 200);
  assert.equal(r.ploomes, null);
  assert.deepEqual(r.operacoes.map((o) => o.aba), ['WHATSAPP_SUGESTOES']);
});

test('enviar whatsapp apenas enfileira o texto para o grupo cadastrado', () => {
  const { ctx, estado, cab } = contexto();
  let seq = 0;
  const corpo = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: 'Olá. Qual a previsão de entrega de *CAMISA TESTE*?' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'ID-' + (++seq)));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.ploomes, null);
  assert.equal(r.body.mensagemId, 'ID-1');
  assert.deepEqual(r.operacoes, [{ aba: 'WHATSAPP_MENSAGENS', operacao: 'append', chave: 'id', linha: {
    id: 'ID-1', evolution_id: '', quando: '2026-10-13T14:00:00.000Z', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE',
    participante_jid: '', participante_nome: 'Pessoa PCP', direcao: 'ENVIADA', tipo: 'COBRANCA_PRAZO', tipo_conteudo: 'TEXTO',
    texto: 'Olá. Qual a previsão de entrega de *CAMISA TESTE*?', resposta_a_evolution_id: '', deal_id: '700001', os: '90001',
    oficina_id: 'of-1', associacao: 'MANUAL', status_envio: 'PENDENTE', erro: '', criado_em: '2026-10-13T14:00:00.000Z'
  } }]);
  assert.equal(r.historicos[0].acao, 'WHATSAPP_ENFILEIRAR');
  assert.equal('resposta' in r || 'envio' in r, false);
});

test('enviar whatsapp exige grupo, modelo valido e versao atual', () => {
  const { ctx, estado, cab } = contexto();
  const base = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: 'Olá. A entrega de *CAMISA TESTE* segue no prazo?' };
  const semGrupo = linhas();
  semGrupo.oficinas[0].grupo_jid = '';
  assert.equal(ctx.processarAcao(estado, cab, base, semGrupo, T0, () => 'X').status, 409);
  assert.equal(ctx.processarAcao(estado, cab, { ...base, modelo: 'INVENTADO' }, linhas(), T0, () => 'X').status, 400);
  assert.equal(ctx.processarAcao(estado, cab, { ...base, versao: 'antiga' }, linhas(), T0, () => 'X').status, 409);
});

test('enviar whatsapp aceita texto sem o número da OS: a oficina conhece a peça', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'CONFIRMAR_DATA', texto: 'Olá. Confirmando a entrega de *CAMISA TESTE* para 18/10. Segue combinado?' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'ID-1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.operacoes[0].linha.texto, corpo.texto);
  assert.equal(r.operacoes[0].linha.os, '90001');
});

test('reenviar whatsapp exige confirmação e cria nova tentativa sem apagar o erro', () => {
  const { ctx, estado, cab } = contexto();
  const dados = linhas();
  dados.whatsappMensagens = [{
    id: 'MSG-ERRO', evolution_id: '', quando: '2026-10-13T12:00:00.000Z', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE',
    participante_jid: '', participante_nome: 'Pessoa PCP', direcao: 'ENVIADA', tipo: 'COBRANCA_PRAZO', tipo_conteudo: 'TEXTO',
    texto: 'Qual a previsão de entrega de *CAMISA TESTE*?', resposta_a_evolution_id: '', deal_id: '700001', os: '90001', oficina_id: 'of-1',
    associacao: 'MANUAL', status_envio: 'ERRO', erro: 'Falha simulada', criado_em: '2026-10-13T12:00:00.000Z'
  }];
  const corpo = { tipo: 'reenviar_whatsapp', dealId: '700001', mensagemId: 'MSG-ERRO', versao: 'v1', confirmou: true };
  let seq = 0;
  const r = limpo(ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'ID-R-' + (++seq)));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mensagemId, 'WA-RE-MSG-ERRO');
  assert.equal(r.operacoes.length, 1);
  assert.equal(r.operacoes[0].operacao, 'append');
  assert.equal(r.operacoes[0].linha.status_envio, 'PENDENTE');
  assert.equal(r.operacoes[0].linha.texto, dados.whatsappMensagens[0].texto);
  assert.equal(r.historicos[0].acao, 'WHATSAPP_REENFILEIRAR');
  assert.equal(dados.whatsappMensagens[0].status_envio, 'ERRO');

  assert.equal(ctx.processarAcao(estado, cab, { ...corpo, confirmou: false }, dados, T0, () => 'X').status, 400);
  dados.whatsappMensagens[0].status_envio = 'ENVIADA';
  assert.equal(ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'X').status, 409);
});

test('versão da produção: duas alterações seguidas com a versão devolvida passam e versão antiga dá 409', () => {
  const { ctx, estado, cab } = contexto();
  const dados = linhas();
  // Aplica as operações devolvidas nas linhas, como a planilha faria.
  const aplicar = (r) => r.operacoes.filter((o) => o.aba === 'PRODUCAO').forEach((o) => {
    const linha = dados.producao.find((p) => p.deal_id === o.linha.deal_id);
    Object.assign(linha, o.linha);
  });
  const T1 = T0 + 60000;
  const primeira = limpo(ctx.processarAcao(estado, cab, { tipo: 'alterar_producao', dealId: '700001', versao: 'v1', oficinaId: 'of-1', dataCombinada: '2026-10-20', motivo: 'Oficina pediu.' }, dados, T1, () => 'H1'));
  assert.equal(primeira.status, 200, JSON.stringify(primeira.body));
  assert.equal(primeira.operacoes[0].linha.atualizado_em_ploomes, primeira.body.versao);
  aplicar(primeira);
  const segunda = limpo(ctx.processarAcao(estado, cab, { tipo: 'alterar_producao', dealId: '700001', versao: primeira.body.versao, oficinaId: 'of-1', dataCombinada: '2026-10-22', motivo: 'Mudou de novo.' }, dados, T1 + 60000, () => 'H2'));
  assert.equal(segunda.status, 200, JSON.stringify(segunda.body));
  aplicar(segunda);
  // Edição concorrente com a versão vista antes da primeira alteração.
  const antiga = ctx.processarAcao(estado, cab, { tipo: 'alterar_producao', dealId: '700001', versao: 'v1', oficinaId: 'of-2', dataCombinada: '2026-10-22', motivo: 'Outra pessoa.' }, dados, T1 + 120000, () => 'H3');
  assert.equal(antiga.status, 409);
  const ultrapassada = ctx.processarAcao(estado, cab, { tipo: 'enviar_whatsapp', dealId: '700001', versao: primeira.body.versao, modelo: 'COBRANCA_PRAZO', texto: 'Cobrança de *CAMISA TESTE*.' }, dados, T1 + 120000, () => 'H4');
  assert.equal(ultrapassada.status, 409);
});

test('versão da produção: aceitar nova data grava a versão; ignorar mantém a versão atual', () => {
  const { ctx, estado, cab } = contexto();
  const aceitar = limpo(ctx.processarAcao(estado, cab, { tipo: 'aceitar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1', motivo: 'Oficina confirmou.' }, linhas(), T0, () => 'H'));
  assert.equal(aceitar.status, 200, JSON.stringify(aceitar.body));
  const prod = aceitar.operacoes.find((o) => o.aba === 'PRODUCAO');
  assert.equal(prod.linha.atualizado_em_ploomes, aceitar.body.versao);
  assert.notEqual(aceitar.body.versao, 'v1');
  const ignorar = limpo(ctx.processarAcao(estado, cab, { tipo: 'ignorar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1' }, linhas(), T0, () => 'H'));
  assert.equal(ignorar.status, 200);
  assert.equal(ignorar.body.versao, 'v1');
});

test('enviar whatsapp com chave deriva o id e não cria segunda linha no reenvio da mesma ação', () => {
  const { ctx, estado, cab } = contexto();
  const dados = linhas();
  const chave = '0b7c2f1e-1111-4222-8333-944455556666';
  const corpo = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: 'Cobrança de *CAMISA TESTE*.', chave };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'ALEATORIO'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mensagemId, 'WA-E-' + chave);
  assert.equal(r.operacoes[0].linha.id, 'WA-E-' + chave);
  dados.whatsappMensagens.push(r.operacoes[0].linha);

  const repetida = limpo(ctx.processarAcao(estado, cab, corpo, dados, T0 + 5000, () => 'OUTRO'));
  assert.equal(repetida.status, 200, JSON.stringify(repetida.body));
  assert.equal(repetida.body.mensagemId, 'WA-E-' + chave);
  assert.deepEqual(repetida.operacoes, []);
  assert.deepEqual(repetida.historicos, []);

  // A mesma chave em outra OS não pode reaproveitar a linha.
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['700001', '700002'];
  dados.oficinas[1].grupo_jid = 'grupo-b@g.us';
  const outra = ctx.processarAcao(estado, cab, { ...corpo, dealId: '700002', versao: 'v2', texto: 'Cobrança de *CALÇA TESTE*.' }, dados, T0, () => 'X');
  assert.equal(outra.status, 409);
  assert.equal(ctx.processarAcao(estado, cab, { ...corpo, chave: 'x' }, dados, T0, () => 'X').status, 400);
  assert.equal(ctx.processarAcao(estado, cab, { ...corpo, chave: "a'b<c>defgh" }, dados, T0, () => 'X').status, 400);
});

test('enviar whatsapp sem chave continua gerando id como antes', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: 'Cobrança de *CAMISA TESTE*.' };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'UUID-1'));
  assert.equal(r.body.mensagemId, 'UUID-1');
});

test('reenviar whatsapp só uma vez por mensagem original e o board marca a original como reenviada', () => {
  const { ctx, estado, cab } = contexto();
  const dados = linhas();
  dados.whatsappMensagens = [{
    id: 'MSG-ERRO', evolution_id: '', quando: '2026-10-13T12:00:00.000Z', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE',
    participante_jid: '', participante_nome: 'Pessoa PCP', direcao: 'ENVIADA', tipo: 'COBRANCA_PRAZO', tipo_conteudo: 'TEXTO',
    texto: 'Qual a previsão de entrega de *CAMISA TESTE*?', resposta_a_evolution_id: '', deal_id: '700001', os: '90001', oficina_id: 'of-1',
    associacao: 'MANUAL', status_envio: 'ERRO', erro: 'Falha simulada', criado_em: '2026-10-13T12:00:00.000Z'
  }];
  const corpo = { tipo: 'reenviar_whatsapp', dealId: '700001', mensagemId: 'MSG-ERRO', versao: 'v1', confirmou: true };
  const r = limpo(ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'ALEATORIO'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.mensagemId, ctx.idReenvioWhatsapp('MSG-ERRO'));
  assert.notEqual(r.body.mensagemId, 'ALEATORIO');
  dados.whatsappMensagens.push(r.operacoes[0].linha);

  const segunda = limpo(ctx.processarAcao(estado, cab, corpo, dados, T0 + 1000, () => 'OUTRO'));
  assert.equal(segunda.status, 409);
  assert.match(segunda.body.erro, /já foi reenviada/);

  const board = limpo(ctx.mensagensDaProducao(dados.whatsappMensagens, '700001'));
  assert.equal(board.find((m) => m.id === 'MSG-ERRO').reenviada, true);
  assert.equal(board.find((m) => m.id === r.body.mensagemId).reenviada, false);
});

test('modelo de material enviado saiu da F4 por decisão do dono e é recusado', () => {
  const { ctx, estado, cab } = contexto();
  const corpo = { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'MATERIAL_ENVIADO', texto: 'Olá. O material foi enviado.' };
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'X')), { status: 400, body: { erro: 'Modelo de mensagem inválido.' } });
  assert.equal(ctx.modeloWhatsapp('MATERIAL_ENVIADO', { peca: 'CAMISA TESTE' }, '2026-10-13'), '');
});

test('OS prevista (ainda não chegou na Costura): todas as ações de produção recusam com 409', () => {
  const { ctx, estado, cab } = contexto();
  ctx.DEALS_PRODUCAO_EDITAVEIS = [];
  const dados = linhas();
  dados.producao[0].em_costura = 'NAO';
  dados.producao[0].prevista = 'SIM';
  dados.whatsappMensagens = [
    { id: 'MSG-ERRO', deal_id: '700001', oficina_id: 'of-1', grupo_jid: 'grupo-teste@g.us', direcao: 'ENVIADA', status_envio: 'ERRO' },
    { id: 'MSG-LIVRE', direcao: 'RECEBIDA', associacao: 'SEM_ASSOCIACAO', deal_id: '', oficina_id: 'of-1', grupo_jid: 'grupo-teste@g.us' }
  ];
  const acoes = [
    { tipo: 'alterar_producao', dealId: '700001', versao: 'v1', oficinaId: 'of-2', dataCombinada: '2026-10-20', motivo: 'Teste.' },
    { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: 'Olá.' },
    { tipo: 'reenviar_whatsapp', dealId: '700001', mensagemId: 'MSG-ERRO', versao: 'v1', confirmou: true },
    { tipo: 'aceitar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1', motivo: 'Teste.' },
    { tipo: 'ignorar_sugestao_whatsapp', dealId: '700001', sugestaoId: 'SUG-1', versao: 'v1', motivo: 'Teste.' },
    { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-LIVRE', versao: 'v1' }
  ];
  for (const corpo of acoes) {
    const r = ctx.processarAcao(estado, cab, corpo, dados, T0, () => 'X');
    assert.equal(r.status, 409, corpo.tipo + ' ' + JSON.stringify(r.body));
    assert.match(JSON.stringify(r.body), /ainda não chegou na Costura/, corpo.tipo);
  }
});
