// Assistente (F5d): ferramentas, pedido ao Groq, validação do pedido do site e da
// resposta do modelo, limite por usuário. Dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const AGORA = Date.parse('2026-10-27T15:00:00.000Z');
const NOMES = ['buscar_os', 'listar_atrasadas', 'faltas_da_os', 'caixas_paradas', 'pedidos_abertos', 'sem_resposta', 'abrir_tela', 'preparar_cobranca'];

function sessao(email) {
  const estado = {};
  const U = [{ email: email || 'pcp@exemplo.test', nome: 'Pessoa PCP', perfil: 'PCP', senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-123'), ativo: 'SIM' }];
  const r = ctx.processarLogin(crypto, estado, { email: email || 'pcp@exemplo.test', senha: 'senha-ficticia-123' }, U, AGORA);
  return { estado, cab: 'Bearer ' + r.body.token, token: r.body.token };
}
const pergunta = (texto) => ({ hoje: '2026-10-27', mensagens: [{ papel: 'usuario', texto: texto || 'Quais OS estão atrasadas?' }] });

test('ferramentas: as 8 do spec, com esquema e nenhuma que envia ou grava', () => {
  const f = limpo(ctx.FERRAMENTAS_ASSISTENTE);
  assert.deepEqual(f.map((x) => x.function.name), NOMES);
  assert.deepEqual(limpo(ctx.NOMES_FERRAMENTAS_ASSISTENTE), NOMES);
  f.forEach((x) => {
    assert.equal(x.type, 'function');
    assert.equal(x.function.parameters.type, 'object');
    assert.ok(x.function.description.length > 10);
    assert.doesNotMatch(x.function.name, /enviar|gravar|salvar|baixa/);
  });
  const cobranca = f.find((x) => x.function.name === 'preparar_cobranca').function;
  assert.deepEqual(cobranca.parameters.properties.alvo.enum, ['atrasadas', 'todas', 'oficinas']);
  assert.deepEqual(cobranca.parameters.required, ['alvo']);
  assert.match(cobranca.description, /não envia/i);
  const tela = f.find((x) => x.function.name === 'abrir_tela').function;
  assert.deepEqual(tela.parameters.properties.tela.enum, ['no-ploomes', 'saidas', 'solicitacoes', 'producao', 'peca']);
});

test('prompt de sistema: pt-BR, só dados das ferramentas, cobrança pelo preparar_cobranca, hoje', () => {
  const p = ctx.pedidoGroqAssistente([{ papel: 'usuario', texto: 'Oi' }], '2026-10-27');
  const sistema = p.messages[0];
  assert.equal(sistema.role, 'system');
  assert.match(sistema.content, /português do Brasil/);
  assert.match(sistema.content, /preparar_cobranca/);
  assert.match(sistema.content, /Confirmar e enviar/);
  assert.match(sistema.content, /Nunca invente/);
  assert.match(sistema.content, /2026-10-27/);
  assert.equal(p.model, 'openai/gpt-oss-120b');
  assert.equal(p.tool_choice, 'auto');
  assert.equal(p.tools.length, 8);
  assert.deepEqual(limpo(p.messages[1]), { role: 'user', content: 'Oi' });
});

test('mensagens para o Groq: chamadas, resultados e cortes de texto', () => {
  const m = limpo(ctx.mensagensGroqAssistente([
    { papel: 'usuario', texto: 'Faltas da OS 90001' },
    { papel: 'assistente', chamadas: [{ id: 'c1', nome: 'faltas_da_os', argumentos: { os: '90001' } }] },
    { papel: 'ferramenta', id: 'c1', nome: 'faltas_da_os', resultado: '{"linhas":[]}' },
    { papel: 'ferramenta', id: 'c2', nome: 'buscar_os', resultado: { linhas: ['x'.repeat(7000)] } },
    { papel: 'assistente', texto: 'A OS 90001 não tem faltas.' }
  ]));
  assert.deepEqual(m[0], { role: 'user', content: 'Faltas da OS 90001' });
  assert.deepEqual(m[1], { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'faltas_da_os', arguments: '{"os":"90001"}' } }] });
  assert.deepEqual(m[2], { role: 'tool', tool_call_id: 'c1', name: 'faltas_da_os', content: '{"linhas":[]}' });
  assert.equal(m[3].content.length, 6000);
  assert.deepEqual(m[4], { role: 'assistant', content: 'A OS 90001 não tem faltas.' });
  const longa = limpo(ctx.mensagensGroqAssistente([{ papel: 'usuario', texto: 'a'.repeat(5000) }]));
  assert.equal(longa[0].content.length, 2000);
});

test('mensagens para o Groq: só as últimas 12, começando numa do usuário', () => {
  const lista = [];
  for (let i = 0; i < 8; i++) {
    lista.push({ papel: 'usuario', texto: 'P' + i });
    lista.push({ papel: 'assistente', chamadas: [{ id: 'c' + i, nome: 'buscar_os', argumentos: { texto: String(i) } }] });
    lista.push({ papel: 'ferramenta', id: 'c' + i, nome: 'buscar_os', resultado: '{}' });
  }
  lista.push({ papel: 'usuario', texto: 'Última' });
  const m = limpo(ctx.mensagensGroqAssistente(lista));
  assert.ok(m.length <= 12);
  assert.equal(m[0].role, 'user');
  assert.equal(m[m.length - 1].content, 'Última');
  assert.equal(m[0].content, 'P5');
});

test('mensagens para o Groq: a pergunta atual fica inteira mesmo passando de 12', () => {
  const lista = [{ papel: 'usuario', texto: 'Antiga' }, { papel: 'assistente', texto: 'Resposta antiga' }, { papel: 'usuario', texto: 'Atual' }];
  for (let i = 0; i < 7; i++) {
    lista.push({ papel: 'assistente', chamadas: [{ id: 'c' + i, nome: 'buscar_os', argumentos: { texto: String(i) } }] });
    lista.push({ papel: 'ferramenta', id: 'c' + i, nome: 'buscar_os', resultado: '{}' });
  }
  const m = limpo(ctx.mensagensGroqAssistente(lista));
  assert.equal(m.length, 15);
  assert.equal(m[0].content, 'Atual');
});

test('mensagens para o Groq: resultados e respostas de perguntas anteriores vão cortados (800); os da atual inteiros (até 6000)', () => {
  const m = limpo(ctx.mensagensGroqAssistente([
    { papel: 'usuario', texto: 'Antes' },
    { papel: 'assistente', chamadas: [{ id: 'c1', nome: 'buscar_os', argumentos: {} }] },
    { papel: 'ferramenta', id: 'c1', nome: 'buscar_os', resultado: 'r'.repeat(7000) },
    { papel: 'assistente', texto: 'a'.repeat(1900) },
    { papel: 'usuario', texto: 'Agora' },
    { papel: 'assistente', chamadas: [{ id: 'c2', nome: 'buscar_os', argumentos: {} }] },
    { papel: 'ferramenta', id: 'c2', nome: 'buscar_os', resultado: 's'.repeat(7000) }
  ]));
  assert.equal(m[2].content.length, 800);
  assert.equal(m[3].content.length, 800);
  assert.equal(m[6].content.length, 6000);
});

test('tamanho do pedido ao Groq: enxuto, mesmo com conversa longa', () => {
  const base = JSON.stringify(ctx.pedidoGroqAssistente([{ papel: 'usuario', texto: 'Oi' }], '2026-10-28'));
  assert.ok(base.length <= 3500, 'prompt + ferramentas: ' + base.length);
  const lista = [];
  for (let i = 0; i < 4; i++) {
    lista.push({ papel: 'usuario', texto: 'Pergunta ' + i });
    lista.push({ papel: 'assistente', chamadas: [{ id: 'c' + i, nome: 'faltas_da_os', argumentos: { os: '9000' + i } }] });
    lista.push({ papel: 'ferramenta', id: 'c' + i, nome: 'faltas_da_os', resultado: 'r'.repeat(7000) });
    lista.push({ papel: 'assistente', texto: 'a'.repeat(1500) });
  }
  lista.push({ papel: 'usuario', texto: 'Atual' });
  lista.push({ papel: 'assistente', chamadas: [{ id: 'cx', nome: 'faltas_da_os', argumentos: { os: '90009' } }] });
  lista.push({ papel: 'ferramenta', id: 'cx', nome: 'faltas_da_os', resultado: 'r'.repeat(7000) });
  const corpo = JSON.stringify(ctx.pedidoGroqAssistente(lista, '2026-10-28'));
  // ~4 caracteres por token: cabe com folga em 8.000 tokens por minuto.
  assert.ok(corpo.length <= 14000, 'pedido com histórico: ' + corpo.length);
});

test('prompt: listas de até 10 itens com o total, sem repetir nem "(continua)"; resposta com folga de tokens', () => {
  const p = ctx.pedidoGroqAssistente([{ papel: 'usuario', texto: 'Oi' }], '2026-10-28');
  assert.match(p.messages[0].content, /no máximo 10 itens/);
  assert.match(p.messages[0].content, /total/);
  assert.match(p.messages[0].content, /nunca repita/i);
  assert.match(p.messages[0].content, /\(continua\)/);
  assert.ok(p.max_completion_tokens >= 1500);
});

test('pedido do site: sessão pelo cabeçalho ou pelo token do corpo; sem sessão 401', () => {
  const s = sessao();
  assert.deepEqual(limpo(ctx.validarPedidoAssistente(s.estado, '', pergunta(), AGORA)),
    { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } });
  assert.equal(ctx.validarPedidoAssistente(s.estado, 'Bearer ' + 'a'.repeat(64), pergunta(), AGORA).status, 401);
  const r = limpo(ctx.validarPedidoAssistente(s.estado, s.cab, pergunta(), AGORA));
  assert.equal(r.pronto, false);
  assert.equal(r.corpo.messages[1].content, 'Quais OS estão atrasadas?');
  const r2 = limpo(ctx.validarPedidoAssistente(s.estado, '', Object.assign({ token: s.token }, pergunta()), AGORA));
  assert.equal(r2.pronto, false);
});

test('pedido do site: corpo inválido dá 400 sem contar no limite', () => {
  const s = sessao();
  const ruins = [
    {}, { mensagens: [] }, { mensagens: 'oi' },
    { mensagens: [{ papel: 'sistema', texto: 'x' }] },
    { mensagens: [{ papel: 'usuario', texto: '   ' }] },
    { mensagens: [{ papel: 'usuario', texto: 'oi' }, { papel: 'assistente', texto: 'olá' }] },
    { mensagens: [{ papel: 'usuario', texto: 'oi' }, { papel: 'assistente', chamadas: [{ id: 'c1', nome: 'enviar_whatsapp', argumentos: {} }] }, { papel: 'ferramenta', id: 'c1', nome: 'enviar_whatsapp', resultado: '{}' }] },
    { mensagens: [{ papel: 'usuario', texto: 'oi' }, { papel: 'assistente', chamadas: [{ id: '', nome: 'buscar_os', argumentos: {} }] }, { papel: 'ferramenta', id: '', nome: 'buscar_os', resultado: '{}' }] },
    { mensagens: [{ papel: 'usuario', texto: 'oi' }, { papel: 'ferramenta', id: 'c1', nome: 'buscar_os' }] }
  ];
  ruins.forEach((c, i) => {
    const r = limpo(ctx.validarPedidoAssistente(s.estado, s.cab, c, AGORA));
    assert.equal(r.status, 400, 'caso ' + i);
    assert.equal(r.pronto, true);
  });
  assert.equal(ctx.validarPedidoAssistente(s.estado, s.cab, pergunta(), AGORA).pronto, false);
  assert.equal((s.estado.assistente['pcp@exemplo.test'] || []).length, 1);
});

test('limite: 120 pedidos por hora por usuário; a 121ª dá 429 e a janela anda', () => {
  const s = sessao();
  for (let i = 0; i < 120; i++) assert.equal(ctx.validarPedidoAssistente(s.estado, s.cab, pergunta(), AGORA + i * 1000).pronto, false, 'pedido ' + i);
  assert.deepEqual(limpo(ctx.validarPedidoAssistente(s.estado, s.cab, pergunta(), AGORA + 121000)),
    { pronto: true, status: 429, body: { erro: 'Muitas perguntas seguidas. Espere alguns minutos.' } });
  // Uma hora depois do primeiro, abre uma vaga.
  assert.equal(ctx.validarPedidoAssistente(s.estado, s.cab, pergunta(), AGORA + 3600 * 1000 + 1).pronto, false);
});

test('limite é por usuário', () => {
  const a = sessao('a@exemplo.test');
  const b = sessao('b@exemplo.test');
  b.estado.sessoes = Object.assign(a.estado.sessoes, b.estado.sessoes);
  for (let i = 0; i < 120; i++) ctx.validarPedidoAssistente(b.estado, a.cab, pergunta(), AGORA);
  assert.equal(ctx.validarPedidoAssistente(b.estado, a.cab, pergunta(), AGORA).status, 429);
  assert.equal(ctx.validarPedidoAssistente(b.estado, b.cab, pergunta(), AGORA).pronto, false);
});

test('hoje inválido: usa a data de São Paulo', () => {
  const s = sessao();
  const r = limpo(ctx.validarPedidoAssistente(s.estado, s.cab, { hoje: 'ontem', mensagens: pergunta().mensagens }, Date.parse('2026-10-28T02:00:00.000Z')));
  assert.match(r.corpo.messages[0].content, /2026-10-27/);
});

const groq = (message, statusCode) => ({ statusCode: statusCode || 200, body: { choices: [{ message }] } });

test('resposta do Groq: texto', () => {
  assert.deepEqual(limpo(ctx.respostaGroqAssistente(groq({ role: 'assistant', content: '  A OS 90001 venceu ontem.  ' }))),
    { status: 200, body: { texto: 'A OS 90001 venceu ontem.' } });
  // Sem embrulho (resposta direta do corpo) também vale.
  assert.equal(ctx.respostaGroqAssistente({ choices: [{ message: { content: 'Oi' } }] }).body.texto, 'Oi');
});

test('resposta do Groq: chamadas validadas, até 5', () => {
  const chamadas = [];
  for (let i = 0; i < 7; i++) chamadas.push({ id: 'call_' + i, type: 'function', function: { name: 'buscar_os', arguments: '{"texto":"9000' + i + '"}' } });
  const r = limpo(ctx.respostaGroqAssistente(groq({ content: null, tool_calls: chamadas })));
  assert.equal(r.status, 200);
  assert.equal(r.body.chamadas.length, 5);
  assert.deepEqual(r.body.chamadas[0], { id: 'call_0', nome: 'buscar_os', argumentos: { texto: '90000' } });
  const vazio = limpo(ctx.respostaGroqAssistente(groq({ tool_calls: [{ id: 'c', function: { name: 'sem_resposta', arguments: '' } }] })));
  assert.deepEqual(vazio.body.chamadas[0].argumentos, {});
});

test('resposta do Groq: nome desconhecido, JSON inválido, vazio ou falha → 502 amigável', () => {
  const erro = { status: 502, body: { erro: 'Não consegui responder agora. Tente de novo.' } };
  const casos = [
    groq({ tool_calls: [{ id: 'c', function: { name: 'enviar_whatsapp', arguments: '{}' } }] }),
    groq({ tool_calls: [{ id: 'c', function: { name: 'buscar_os', arguments: '{texto' } }] }),
    groq({ tool_calls: [{ id: 'c', function: { name: 'buscar_os', arguments: '[1,2]' } }] }),
    groq({ tool_calls: [{ id: '', function: { name: 'buscar_os', arguments: '{}' } }] }),
    groq({ content: '   ' }),
    groq({ content: 'oi' }, 503),
    { statusCode: 500, body: {} },
    { error: { message: 'timeout' } },
    {}, null
  ];
  casos.forEach((c, i) => assert.deepEqual(limpo(ctx.respostaGroqAssistente(c)), erro, 'caso ' + i));
});

test('resposta do Groq: texto longo é cortado', () => {
  assert.equal(ctx.respostaGroqAssistente(groq({ content: 'a'.repeat(9000) })).body.texto.length, 4000);
});

test('resposta do Groq: 429 (limite de tokens do Groq) vira 429 próprio com o tempo para tentar de novo', () => {
  const limite = (headers, code) => ({ statusCode: 429, headers, body: { error: { message: 'Rate limit reached', type: 'tokens', code: code || 'rate_limit_exceeded' } } });
  const esperado = (n) => ({ status: 429, body: { erro: 'Muita procura agora. Tentando de novo…', tentarEmSegundos: n } });
  assert.deepEqual(limpo(ctx.respostaGroqAssistente(limite({ 'retry-after': '4' }))), esperado(4));
  assert.deepEqual(limpo(ctx.respostaGroqAssistente(limite({ 'Retry-After': '2.3' }))), esperado(3));
  assert.deepEqual(limpo(ctx.respostaGroqAssistente(limite({ 'retry-after': '0' }))), esperado(1));
  assert.deepEqual(limpo(ctx.respostaGroqAssistente(limite({ 'retry-after': '90' }))), esperado(20));
  assert.deepEqual(limpo(ctx.respostaGroqAssistente(limite({}))), esperado(5));
  assert.deepEqual(limpo(ctx.respostaGroqAssistente(limite(undefined))), esperado(5));
  // Distinto do limite por usuário (sem tentarEmSegundos: o site não repete sozinho).
  assert.equal(ctx.ERRO_ASSISTENTE_LIMITE, 'Muitas perguntas seguidas. Espere alguns minutos.');
});
