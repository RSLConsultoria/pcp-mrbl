import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const ACAO = 'http://api.test/pcp-acao';
const SESSAO = { token: 'f'.repeat(64), nome: 'Pessoa PCP', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };
const item = {
  id: 'f1', nome: 'VIÉS TESTE', cor: '', un: 'MT', necessaria: 10, separada: 0, falta: 4, faltaG: null,
  status: 'ABERTO', baixada: 0, resta: 4, restaG: null, obsAlmox: '', obsPcp: '', previsao: '', resolvidoEm: '',
  versao: '', editavel: true, pedidoId: '', pedidoIds: []
};
const producao = [
  { dealId: '710001', os: '90001', oficinaId: '', oficina: 'ALOCAR', inicioCostura: '2026-10-01', dataCombinada: '2026-10-05', leadTime: '2026-10-08', pecas: 80, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-A', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [] },
  { dealId: '710002', os: '90002', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '2026-10-04', dataCombinada: '2026-10-12', leadTime: '2026-10-15', pecas: 120, cliente: 'CLIENTE MODELO', peca: 'COLETE TESTE', referencia: 'REF-B', versao: 'v2', faltasCostura: [item], faltasAcabamento: [{ ...item, id: 'a1', nome: 'BOTÃO TESTE' }],
    mensagens: [
      { id: 'M-ERRO', quando: '2026-10-07T11:00:00.000Z', participanteNome: 'Pessoa PCP', direcao: 'ENVIADA', texto: 'Confirma a entrega de *COLETE TESTE*?', associacao: 'MANUAL', statusEnvio: 'ERRO', tipoConteudo: 'TEXTO' },
      { id: 'M1', quando: '2026-10-07T12:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'Entregamos dia 13.', associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'TEXTO' }
    ],
    sugestoes: [{ id: 'S1', mensagemId: 'M1', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-13', resumo: 'A oficina informou nova data.', evidencia: 'dia 13', confianca: .95, status: 'PENDENTE', criadoEm: '2026-10-07T12:01:00.000Z', versao: 'v2' }], historico: [] },
  { dealId: '710003', os: '90003', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '2026-10-06', dataCombinada: '', leadTime: '2026-10-16', pecas: 50, cliente: 'CLIENTE MODELO', peca: 'CALCA TESTE', referencia: 'REF-C', versao: 'v1', faltasCostura: [], faltasAcabamento: [],
    mensagens: [
      { id: 'M-FILA', quando: '2026-10-07T10:00:00.000Z', participanteNome: 'Pessoa PCP', direcao: 'ENVIADA', texto: 'Qual a previsão de entrega de *CALCA TESTE*?', associacao: 'MANUAL', statusEnvio: 'PENDENTE', tipoConteudo: 'TEXTO', envioTentativas: 2 },
      { id: 'M-SEM-LEITURA', quando: '2026-10-07T10:30:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'Resposta que o intérprete não leu.', associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'TEXTO', interpretacao: 'ERRO' }
    ], sugestoes: [], historico: [] },
  { dealId: '710004', os: '90004', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '', dataCombinada: '2026-10-18', leadTime: '2026-10-20', pecas: 40, cliente: 'CLIENTE MODELO', peca: 'JAQUETA TESTE', referencia: 'REF-D', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [] }
];

async function entrar(page: Page, acoes: Record<string, unknown>[] = [], atrasoAcaoMs = 0) {
  const producaoAtual = structuredClone(producao);
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.route(ACAO, async (r) => {
    const corpo = r.request().postDataJSON();
    acoes.push(corpo);
    if (atrasoAcaoMs) await new Promise((resolve) => setTimeout(resolve, atrasoAcaoMs));
    if (corpo.tipo === 'aceitar_sugestao_whatsapp') {
      const itemAtual = producaoAtual.find((p) => p.dealId === corpo.dealId);
      const sugestao = itemAtual?.sugestoes.find((s) => s.id === corpo.sugestaoId);
      if (itemAtual && sugestao) {
        itemAtual.dataCombinada = sugestao.valor;
        sugestao.status = 'ACEITA';
        itemAtual.historico = [{ quando: '2026-10-07T15:01:00.000Z', usuario: 'Pessoa PCP', texto: 'Data combinada atualizada após confirmação da oficina.', ploomes: 'ENVIADO' }];
      }
    }
    await r.fulfill({ json: { ok: true, versao: corpo.versao, historico: null, historicos: [], mensagemId: corpo.tipo === 'reenviar_whatsapp' ? 'M-REENVIO' : undefined } });
  });
  await page.route(BOARD, (r) => r.fulfill({ json: { ...base, producao: producaoAtual, oficinas: [{ ploomesId: 'OF-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO MODELO' }],
    mensagensWhatsappSemAssociacao: [{ id: 'M2', quando: '2026-10-07T13:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'As duas ficam prontas amanhã.', associacao: 'SEM_ASSOCIACAO', statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', grupoNome: 'GRUPO MODELO' }],
    dealsProducaoEditaveis: ['710002'] } }));
  await page.goto('./#producao');
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00')));

test('Gantt mostra ALOCAR, prazo vencido, indicadores e filtro por falta', async ({ page }) => {
  await entrar(page);
  await expect(page).toHaveURL(/#producao$/);
  await expect(page.getByText('ALOCAR', { exact: true })).toBeVisible();
  await expect(page.getByText('Passaram do prazo').locator('..')).toContainText('1');
  await page.getByLabel('Só com falta na costura').check();
  await expect(page.getByRole('button', { name: /OS 90002/ })).toBeVisible();
  await expect(page.getByLabel('1 aviamento faltando na costura; impede finalizar a costura').first()).toBeVisible();
  await expect(page.getByLabel('1 aviamento faltando no acabamento; precisa estar pronto para a etapa seguinte').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /OS 90001/ })).toHaveCount(0);
});

test('filtros, busca e barras distinguem prazo combinado, lead time e início ausente', async ({ page }) => {
  await entrar(page);
  const grupos = page.locator('.gantt__grupo-nome strong');
  await expect(grupos.first()).toHaveText('ALOCAR');
  await expect(page.getByTitle('OS 90001 · 05/10')).toHaveClass(/gantt__barra--atrasado/);
  await expect(page.getByTitle('OS 90003 · 16/10')).toHaveClass(/gantt__barra--lead/);
  await expect(page.getByTitle('OS 90004 · 18/10')).toHaveClass(/gantt__barra--marco/);

  await page.getByLabel('Oficina').first().selectOption('OF-1');
  await expect(page.getByRole('button', { name: /OS 90001/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /OS 90003/ }).first()).toBeVisible();
  await page.getByPlaceholder('Buscar OS, peça, referência, cliente ou oficina').fill('calca');
  await expect(page.getByRole('button', { name: /OS 90003/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /OS 90002/ })).toHaveCount(0);
});

test('painel mostra a conversa e a sugestão sem responder ao grupo', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await expect(painel).toContainText('Sugestões do intérprete');
  await expect(painel).toContainText('Nova data: 13/10');
  await expect(painel).toContainText('Entregamos dia 13.');
  // A oficina conhece a peça, não o número da OS.
  await expect(painel.getByLabel('Mensagem')).toHaveValue(/\*COLETE TESTE\*, 120 peças/);
  await expect(painel.getByLabel('Mensagem')).not.toHaveValue(/OS 90002/);
  // Material enviado saiu da F4 por decisão do dono (16/10).
  await expect(painel.getByRole('combobox', { name: /^Modelo/ }).locator('option')).toHaveText(['Cobrança de prazo', 'Confirmar data']);
  await expect(painel.getByRole('button', { name: 'Colocar na fila' })).toBeVisible();
  await expect(painel.getByRole('button', { name: /^(responder|enviar)$/i })).toHaveCount(0);
});

test('altera a data com motivo e mostra o efeito otimista', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, acoes, 1_000);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await painel.getByLabel('Data combinada').fill('2026-10-14');
  await painel.getByRole('textbox', { name: 'Motivo *', exact: true }).fill('Prazo confirmado com a oficina.');
  await painel.getByRole('button', { name: 'Salvar combinado' }).click();
  await expect(painel.locator('.producao-resumo')).toContainText('14/10');
  await expect.poll(() => acoes.at(-1)).toMatchObject({
    tipo: 'alterar_producao', dealId: '710002', dataCombinada: '2026-10-14', motivo: 'Prazo confirmado com a oficina.'
  });
});

test('bloqueia mudança de data sem motivo', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, acoes);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await painel.getByLabel('Data combinada').fill('2026-10-14');
  await painel.getByRole('button', { name: 'Salvar combinado' }).click();
  await expect(painel.getByRole('alert')).toHaveText('Informe o motivo da alteração da data combinada.');
  expect(acoes).toHaveLength(0);
});

test('revisa e coloca uma cobrança padrão na fila', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, acoes);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  const mensagem = painel.getByLabel('Mensagem');
  await expect(mensagem).toHaveValue(/^Bom dia\. A entrega de \*COLETE TESTE\*/);
  await mensagem.fill('Pode confirmar o prazo atualizado de *COLETE TESTE*?');
  await painel.getByRole('button', { name: 'Colocar na fila' }).click();
  await expect.poll(() => acoes.at(-1)).toMatchObject({
    tipo: 'enviar_whatsapp', dealId: '710002', modelo: 'COBRANCA_PRAZO', texto: 'Pode confirmar o prazo atualizado de *COLETE TESTE*?',
    chave: expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/)
  });
  await expect(painel.locator('.producao-conversa p').filter({ hasText: 'Pode confirmar o prazo atualizado de *COLETE TESTE*?' })).toBeVisible();
});

test('aceita sugestão com motivo e atualiza a data', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, acoes);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await painel.getByLabel('Motivo da nova data').fill('Data informada pela oficina.');
  await painel.getByRole('button', { name: 'Aceitar' }).click();
  await expect.poll(() => acoes.at(-1)).toMatchObject({
    tipo: 'aceitar_sugestao_whatsapp', dealId: '710002', sugestaoId: 'S1', motivo: 'Data informada pela oficina.'
  });
  await expect(painel.locator('.producao-resumo')).toContainText('13/10');
  await expect(painel).toContainText('Data combinada atualizada após confirmação da oficina.');
  await expect(painel.getByRole('button', { name: 'Aceitar' })).toHaveCount(0);
});

test('ignora sugestão sem mudar a data', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, acoes);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await painel.getByRole('button', { name: 'Ignorar' }).click();
  await expect.poll(() => acoes.at(-1)).toMatchObject({ tipo: 'ignorar_sugestao_whatsapp', dealId: '710002', sugestaoId: 'S1' });
  await expect(painel.locator('.producao-resumo')).toContainText('12/10');
  await expect(painel.getByRole('button', { name: 'Ignorar' })).toHaveCount(0);
});

test('OS fora da allowlist não mostra controles de escrita', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: /OS 90001/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90001' });
  await expect(painel.getByText('Edição liberada em breve para esta OS.')).toBeVisible();
  await expect(painel.getByRole('button', { name: 'Salvar combinado' })).toHaveCount(0);
  await expect(painel.getByRole('button', { name: 'Colocar na fila' })).toHaveCount(0);
});

test('mensagem ambigua aparece para conferência sem expor identificadores do WhatsApp', async ({ page }) => {
  await entrar(page);
  const pendentes = page.getByText('1 mensagem aguardando associação');
  await expect(pendentes).toBeVisible();
  await pendentes.click();
  await expect(page.getByText('As duas ficam prontas amanhã.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('@g.us');
  await expect(page.locator('body')).not.toContainText('@s.whatsapp.net');
});

test('associa manualmente uma mensagem a uma OS do mesmo grupo', async ({ page }) => {
  await entrar(page);
  await page.getByText('1 mensagem aguardando associação').click();
  await page.getByRole('button', { name: 'Associar', exact: true }).click();
  await expect(page.getByText('1 mensagem aguardando associação')).toHaveCount(0);
  // A interpretação roda em segundo plano no servidor (workflow Interpretar WhatsApp).
  await expect(page.getByRole('status').filter({ hasText: 'Mensagem associada. A interpretação aparece em até 1 minuto.' })).toBeVisible();
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  await expect(page.getByRole('complementary', { name: 'Detalhes da OS 90002' })).toContainText('As duas ficam prontas amanhã.');
});

test('reenvio exige confirmação e mantém a tentativa com erro', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  page.once('dialog', (dialog) => dialog.accept());
  await painel.getByRole('button', { name: 'Reenviar' }).click();
  await expect(painel.getByText('Confirma a entrega de *COLETE TESTE*?', { exact: true })).toHaveCount(2);
  await expect(painel.getByRole('button', { name: 'Reenviar' })).toHaveCount(0);
});

test('colocar na fila fica desabilitado enquanto o envio está em andamento', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, acoes, 1_500);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  const botao = painel.getByRole('button', { name: 'Colocar na fila' });
  await botao.click();
  await expect(botao).toBeDisabled();
  await botao.click({ force: true });
  await expect(botao).toBeEnabled({ timeout: 5_000 });
  expect(acoes.filter((a) => a.tipo === 'enviar_whatsapp')).toHaveLength(1);
});

test('conversa mostra nova tentativa automática de envio e interpretação que falhou de vez', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: /OS 90003/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90003' });
  await expect(painel.getByText('Aguardando nova tentativa (2 de 5)')).toBeVisible();
  await expect(painel.getByText('Não foi possível interpretar esta mensagem.')).toBeVisible();
  await expect(painel.getByRole('button', { name: 'Reenviar' })).toHaveCount(0);
});
