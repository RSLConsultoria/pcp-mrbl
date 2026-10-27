// F5c · E-mails do PCP: regras puras (assunto, modelo, limpeza do texto).
// Só dados fictícios: domínio @confeccao-exemplo.com.br, OS 9000x, pessoas inventadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();

test('OS do assunto: número depois de "OS:", com ou sem espaço; sem OS → vazio', () => {
  assert.equal(ctx.osDoAssuntoEmailPcp('Caixa separada - OS:90001 | Ref: REF-01 | Desc: PECA TESTE'), '90001');
  assert.equal(ctx.osDoAssuntoEmailPcp('RE: Itens recebidos SP -OS: 90002 | Ref: R'), '90002');
  assert.equal(ctx.osDoAssuntoEmailPcp('ENC: Itens faltando pós corte - os:90003'), '90003');
  assert.equal(ctx.osDoAssuntoEmailPcp('Reunião de segunda'), '');
  assert.equal(ctx.osDoAssuntoEmailPcp('OS: sem número'), '');
  assert.equal(ctx.osDoAssuntoEmailPcp(null), '');
});

test('modelo pelo assunto, sem acento e sem diferença de caixa', () => {
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Caixa separada - OS:90001 | Ref: R'), 'CAIXA_SEPARADA');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Itens faltando pós corte - OS:90001'), 'POS_CORTE');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: ITENS FALTANDO POS CORTE - OS:90001'), 'POS_CORTE');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Itens recebidos SP -OS:90001'), 'RECEBIDOS_SP');
  assert.equal(ctx.modeloDoAssuntoEmailPcp('RE: Dúvida - OS:90001'), 'OUTRO');
});

test('limpeza: corta o histórico citado em português', () => {
  const t = 'Item verificado, quantidade 40.\n\nEm seg., 27 de out. de 2026 às 10:00, Pessoa Ficticia <pcp@confeccao-exemplo.com.br>\nescreveu:\n> Caixa separada - OS:90001';
  assert.equal(ctx.limparTextoEmailPcp(t), 'Item verificado, quantidade 40.');
  assert.equal(ctx.limparTextoEmailPcp('Chamado aberto #1234567\nDe: Equipe <x@confeccao-exemplo.com.br>\nEnviado: segunda\nAssunto: OS'), 'Chamado aberto #1234567');
  assert.equal(ctx.limparTextoEmailPcp('Ok, conferido.\n-----Mensagem original-----\nDe: alguém'), 'Ok, conferido.');
  assert.equal(ctx.limparTextoEmailPcp('Linha nova\n> citação antiga\n> outra'), 'Linha nova');
});

test('limpeza: corta o histórico citado em inglês', () => {
  assert.equal(ctx.limparTextoEmailPcp('Arrives on 30/10.\nOn Mon, Oct 27, 2026 at 10:00 AM Someone <a@confeccao-exemplo.com.br> wrote:\n> old'), 'Arrives on 30/10.');
  assert.equal(ctx.limparTextoEmailPcp('Checked.\nFrom: Team\nSent: Monday'), 'Checked.');
  assert.equal(ctx.limparTextoEmailPcp('Checked.\n-----Original Message-----\nFrom: x'), 'Checked.');
});

test('limpeza: corta a assinatura em português e em inglês', () => {
  assert.equal(ctx.limparTextoEmailPcp('Previsão de chegada 30/10.\n\nAtenciosamente,\nPessoa Ficticia\nCompras'), 'Previsão de chegada 30/10.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\nAtt.\nFulano Inventado'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\nAtt,\nFulano'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\n--\nFulano | (00) 0000-0000'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Recebido.\nEnviado do meu iPhone'), 'Recebido.');
  assert.equal(ctx.limparTextoEmailPcp('Received.\n\nBest regards,\nSomeone'), 'Received.');
  assert.equal(ctx.limparTextoEmailPcp('Received.\nRegards\nSomeone'), 'Received.');
  assert.equal(ctx.limparTextoEmailPcp('Received.\nSent from my phone'), 'Received.');
  // "Attention" e "Attached" não são assinatura.
  assert.equal(ctx.limparTextoEmailPcp('Attached the list.\nOk.'), 'Attached the list. Ok.');
});

test('limpeza: espaços, linhas em branco e limite de 1500 caracteres', () => {
  assert.equal(ctx.limparTextoEmailPcp('  Bom dia,\r\n\r\n  item   conferido.  \n'), 'Bom dia, item conferido.');
  assert.equal(ctx.limparTextoEmailPcp('a'.repeat(2000)).length, 1500);
  assert.equal(ctx.limparTextoEmailPcp(''), '');
  assert.equal(ctx.limparTextoEmailPcp(undefined), '');
  // Mensagem que começa pela citação não sobra nada.
  assert.equal(ctx.limparTextoEmailPcp('De: Equipe\nAssunto: OS:90001'), '');
  assert.deepEqual(limpo(ctx.COLUNAS_EMAILS_PCP), ['id', 'thread_id', 'quando', 'de_nome', 'assunto', 'os', 'modelo', 'texto', 'tipo', 'valor',
    'itens', 'resumo', 'evidencia', 'confianca', 'status', 'tentativas', 'decidido_em', 'decidido_por']);
});
