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
  { dealId: '710001', os: '90001', oficinaId: '', oficina: 'ALOCAR', inicioCostura: '2026-10-01', dataCombinada: '2026-10-05', leadTime: '2026-10-08', pecas: 80, valorCorte: 6400, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-A', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [] },
  { dealId: '710002', os: '90002', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '2026-10-04', dataCombinada: '2026-10-12', leadTime: '2026-10-15', pecas: 120, valorCorte: 12345.67, cliente: 'CLIENTE MODELO', peca: 'COLETE TESTE', referencia: 'REF-B', versao: 'v2', faltasCostura: [item], faltasAcabamento: [{ ...item, id: 'a1', nome: 'BOTÃO TESTE' }],
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
  { dealId: '710004', os: '90004', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '', dataCombinada: '2026-10-18', leadTime: '2026-10-20', pecas: 40, valorCorte: 3200, cliente: 'CLIENTE MODELO', peca: 'JAQUETA TESTE', referencia: 'REF-D', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [] }
];

async function entrar(page: Page, acoes: Record<string, unknown>[] = [], atrasoAcaoMs = 0, extras: typeof producao = [],
  editaveis: string[] = ['710002'], pendentesExtras: Record<string, unknown>[] = []) {
  const producaoAtual = structuredClone([...producao, ...extras]);
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
    mensagensWhatsappSemAssociacao: [{ id: 'M2', quando: '2026-10-07T13:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'As duas ficam prontas amanhã.', associacao: 'SEM_ASSOCIACAO', statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', grupoNome: 'GRUPO MODELO' }, ...pendentesExtras],
    dealsProducaoEditaveis: editaveis } }));
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
  const legenda = page.getByLabel('Legenda do Gantt');
  await expect(legenda).toContainText('Prazo combinado');
  await expect(legenda).toContainText('Falta na costura');
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
  // Dentro da barra: peças e valor do corte, sem o número da OS (que já aparece à esquerda).
  const barra = page.getByTitle('OS 90002 · 12/10 · 120 pç · R$ 12.346');
  await expect(barra).toContainText('120 pç · R$ 12.346');
  await expect(barra).not.toContainText('90002');
  await expect(page.getByTitle('OS 90003 · 16/10 · 50 pç')).toHaveText('50 pç');

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
  await expect(painel.getByRole('link', { name: 'Abrir card no Ploomes' })).toHaveAttribute('href', 'https://app10.ploomes.com/deal/710002');
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
  await expect(mensagem).toHaveValue(/^Olá\. A entrega de \*COLETE TESTE\*/);
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

const linhasTabela = (page: Page) => page.locator('.producao-tabela tbody tr');
const osDaTabela = (page: Page) => linhasTabela(page).locator('td:first-child');

test('visão em tabela: alterna, ordena pela data combinada e lembra a escolha', async ({ page }) => {
  await entrar(page);
  await expect(page.getByRole('button', { name: 'Gantt' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Tabela' }).click();
  await expect(page.getByRole('button', { name: 'Tabela' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('4 OS', { exact: true })).toBeVisible();
  await expect(page.getByText('290 peças · R$ 21.946')).toBeVisible();
  await expect(linhasTabela(page).nth(1)).toContainText('R$ 12.346');
  // Ordem padrão = a do Gantt: ALOCAR primeiro.
  await expect(osDaTabela(page)).toHaveText(['90001', '90002', '90003', '90004']);
  await expect(linhasTabela(page).first()).toContainText('05/10/2026');
  await expect(linhasTabela(page).first()).toContainText('Atrasada · 2 dias');

  const cabecalho = page.getByRole('columnheader', { name: 'Data combinada' });
  await cabecalho.getByRole('button').click();
  await expect(cabecalho).toHaveAttribute('aria-sort', 'ascending');
  await expect(osDaTabela(page)).toHaveText(['90001', '90002', '90004', '90003']);
  await cabecalho.getByRole('button').click();
  await expect(cabecalho).toHaveAttribute('aria-sort', 'descending');
  // Sem data combinada fica no fim nas duas direções.
  await expect(osDaTabela(page)).toHaveText(['90004', '90002', '90001', '90003']);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Tabela' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.producao-tabela')).toBeVisible();
});

test('visão em tabela: filtro por coluna, filtro de situação e colunas escolhidas', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: 'Tabela' }).click();
  await page.getByLabel('Filtrar Peça', { exact: true }).fill('colete');
  await expect(osDaTabela(page)).toHaveText(['90002']);
  await expect(page.getByText('1 OS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(osDaTabela(page)).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Limpar filtros' })).toHaveCount(0);
  await page.getByLabel('Filtrar Situação').selectOption('ATRASADA');
  await expect(osDaTabela(page)).toHaveText(['90001']);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();

  // Filtro geral vale para as duas visões.
  await page.getByLabel('Situação do prazo').selectOption('ATRASADA');
  await expect(osDaTabela(page)).toHaveText(['90001']);
  await page.getByRole('button', { name: 'Gantt' }).click();
  await expect(page.getByRole('button', { name: /OS 90001/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /OS 90002/ })).toHaveCount(0);
  await page.getByLabel('Situação do prazo').selectOption('');
  await page.getByRole('button', { name: 'Tabela' }).click();

  await page.getByText('Colunas', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'OS', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Cliente' }).uncheck();
  await expect(page.getByRole('columnheader', { name: 'Cliente' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'Peça', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Cliente' })).toHaveCount(0);
});

test('visão em tabela: clique ou Enter na linha abre o painel da OS', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: 'Tabela' }).click();
  await linhasTabela(page).filter({ hasText: '90002' }).click();
  await expect(page.getByRole('complementary', { name: 'Detalhes da OS 90002' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await linhasTabela(page).filter({ hasText: '90003' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Detalhes da OS 90003' })).toBeVisible();
});

test('Gantt agrupado por entrega: prazo mais cedo primeiro, sem prazo no fim, filtros e preferência lembrada', async ({ page }) => {
  const extras = [
    { ...producao[3], dealId: '710005', os: '90000', inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 10, valorCorte: 500, peca: 'BERMUDA TESTE', referencia: 'REF-E' },
    { ...producao[3], dealId: '710006', os: '90006', oficinaId: 'OF-2', oficina: 'OFICINA BETA', inicioCostura: '2026-10-02', dataCombinada: '2026-10-10', leadTime: '', pecas: 30, valorCorte: 900, peca: 'SAIA TESTE', referencia: 'REF-F' }
  ];
  await entrar(page, [], 0, extras);
  const linhasOs = page.locator('.gantt__os strong');
  const agrupar = page.getByRole('group', { name: 'Agrupar' });
  await expect(agrupar.getByRole('button', { name: 'Oficina' })).toHaveAttribute('aria-pressed', 'true');
  await expect(linhasOs).toHaveText(['OS 90001', 'OS 90002', 'OS 90003', 'OS 90004', 'OS 90000', 'OS 90006']);

  await agrupar.getByRole('button', { name: 'Entrega' }).click();
  await expect(agrupar.getByRole('button', { name: 'Entrega' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.gantt__grupo-nome')).toHaveCount(0);
  await expect(linhasOs).toHaveText(['OS 90001', 'OS 90006', 'OS 90002', 'OS 90003', 'OS 90004', 'OS 90000']);
  // Etiqueta da oficina em cada linha; ALOCAR destacada.
  const etiquetas = page.locator('.gantt__os .gantt__oficina');
  await expect(etiquetas).toHaveText(['ALOCAR', 'OFICINA BETA', 'OFICINA MODELO', 'OFICINA MODELO', 'OFICINA MODELO', 'OFICINA MODELO']);
  await expect(etiquetas.first()).toHaveClass(/gantt__oficina--alocar/);
  // Barra e clique continuam iguais.
  await expect(page.getByTitle('OS 90002 · 12/10 · 120 pç · R$ 12.346')).toContainText('120 pç · R$ 12.346');
  await page.getByRole('button', { name: /OS 90006/ }).first().click();
  await expect(page.getByRole('complementary', { name: 'Detalhes da OS 90006' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar painel' }).click();

  // Filtro de oficina continua valendo, na ordem de entrega.
  await page.getByRole('combobox', { name: /^Oficina/ }).selectOption('OF-1');
  await expect(linhasOs).toHaveText(['OS 90002', 'OS 90003', 'OS 90004', 'OS 90000']);

  // O seletor só existe no Gantt.
  await page.getByRole('button', { name: 'Tabela' }).click();
  await expect(page.getByRole('group', { name: 'Agrupar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gantt' }).click();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Agrupar' }).getByRole('button', { name: 'Entrega' })).toHaveAttribute('aria-pressed', 'true');
  await expect(linhasOs).toHaveText(['OS 90001', 'OS 90006', 'OS 90002', 'OS 90003', 'OS 90004', 'OS 90000']);
});

test('Gantt destaca a coluna inteira de hoje atrás das barras, que continuam clicáveis', async ({ page }) => {
  await entrar(page);
  const coluna = page.getByTestId('gantt-hoje-coluna');
  await expect(coluna).toHaveCount(1);
  const cab = await page.locator('.gantt__dia--hoje').boundingBox();
  const col = await coluna.boundingBox();
  const ultima = await page.locator('.gantt__linha').last().boundingBox();
  expect(Math.abs(col!.x - cab!.x)).toBeLessThan(1.5);
  expect(Math.abs(col!.width - cab!.width)).toBeLessThan(1.5);
  expect(col!.y + col!.height).toBeGreaterThanOrEqual(ultima!.y + ultima!.height - 1);
  // Os dois agrupamentos mantêm o destaque.
  await page.getByRole('button', { name: 'Entrega', exact: true }).click();
  await expect(coluna).toHaveCount(1);
  // A barra segue por cima e abre o painel.
  await page.getByTitle('OS 90002 · 12/10 · 120 pç · R$ 12.346').click();
  await expect(page.getByRole('complementary', { name: 'Detalhes da OS 90002' })).toBeVisible();
});

test('Gantt mantém o cabeçalho e a régua de dias congelados ao rolar, alinhados ao dia de hoje', async ({ page }) => {
  const extras = Array.from({ length: 30 }, (_, i) => ({ ...producao[0], dealId: `72${String(i).padStart(4, '0')}`, os: `91${String(i).padStart(3, '0')}` }));
  await entrar(page, [], 0, extras);
  const rolagem = page.locator('.gantt__rolagem');
  const topo = page.locator('.gantt__topo');
  await expect(topo).toBeVisible();
  const antes = await topo.boundingBox();
  const area = await rolagem.boundingBox();
  await rolagem.evaluate((el) => { el.scrollTop = 600; });
  expect(await rolagem.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  const depois = await topo.boundingBox();
  expect(Math.abs(depois!.y - antes!.y)).toBeLessThan(1.5);
  expect(depois!.y).toBeGreaterThanOrEqual(area!.y - 1);
  const hojeCab = await page.locator('.gantt__dia--hoje').boundingBox();
  expect(hojeCab!.y).toBeGreaterThanOrEqual(area!.y - 1);
  expect(hojeCab!.y + hojeCab!.height).toBeLessThanOrEqual(area!.y + 60);
  // Rolagem horizontal: a régua e a coluna de hoje seguem juntas e o título fica fixo.
  await rolagem.evaluate((el) => { el.scrollLeft = 120; });
  const cab = await page.locator('.gantt__dia--hoje').boundingBox();
  const col = await page.getByTestId('gantt-hoje-coluna').boundingBox();
  expect(Math.abs(col!.x - cab!.x)).toBeLessThan(1.5);
  const titulo = await page.locator('.gantt__cabecalho').boundingBox();
  expect(Math.abs(titulo!.x - area!.x)).toBeLessThan(3);
  expect(Math.abs(titulo!.y - antes!.y)).toBeLessThan(1.5);
  await page.getByRole('button', { name: 'Entrega', exact: true }).click();
  await rolagem.evaluate((el) => { el.scrollTop = 400; });
  expect(Math.abs((await topo.boundingBox())!.y - antes!.y)).toBeLessThan(1.5);
});

// Associador por IA (22/10).
test('mensagem ligada pela IA mostra o selo e pode trocar de OS', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  const comIa = { ...producao[3], dealId: '710005', os: '90005', peca: 'BLUSA TESTE',
    mensagens: [{ id: 'M-IA', quando: '2026-10-07T14:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'A blusa sai amanhã.',
      associacao: 'IA', associacaoMotivo: 'A oficina fala da BLUSA TESTE.', statusEnvio: '', tipoConteudo: 'TEXTO' }] } as (typeof producao)[number];
  await entrar(page, acoes, 0, [comIa], ['710002', '710005']);
  await page.getByRole('button', { name: /OS 90005/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90005' });
  await expect(painel.getByText('ligada pela IA')).toBeVisible();
  await painel.getByLabel('Trocar para a OS').selectOption('710002');
  await painel.getByRole('button', { name: 'Trocar OS' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mensagem movida para a OS escolhida.' })).toBeVisible();
  await expect.poll(() => acoes.find((a) => a.tipo === 'associar_whatsapp')).toMatchObject({ dealId: '710002', mensagemId: 'M-IA' });
});

test('pendente perguntada à oficina aparece com a etiqueta', async ({ page }) => {
  await entrar(page, [], 0, [], ['710002'], [{ id: 'M-DUVIDA', quando: '2026-10-07T13:30:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA',
    texto: 'Essa vai atrasar.', associacao: 'IA_DUVIDA', perguntado: true, statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', grupoNome: 'GRUPO MODELO' }]);
  await page.getByText('2 mensagens aguardando associação').click();
  await expect(page.getByText('perguntado à oficina')).toBeVisible();
});
