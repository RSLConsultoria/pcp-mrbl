import { expect, test as base, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

// F5d · Assistente contra o simulador (scripts/mock-api.mjs): respostas prontas por palavra-chave
// no lugar do Groq; as ferramentas rodam no site, sobre o board fictício. Nada sai sem o
// "Confirmar e enviar" do cartão.

const MOCK = fileURLToPath(new URL('../scripts/mock-api.mjs', import.meta.url));

function portaLivre(): Promise<number> {
  return new Promise((ok, erro) => {
    const s = createServer();
    s.once('error', erro);
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

async function subirMock(porta: number): Promise<ChildProcess> {
  const filho = spawn(process.execPath, [MOCK], { env: { ...process.env, MOCK_PORT: String(porta), MOCK_ATRASO_MS: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((ok, erro) => {
    filho.once('exit', (c) => erro(new Error(`mock saiu com ${c}`)));
    filho.stdout!.on('data', (d: Buffer) => { if (d.toString().includes('Mock da API')) ok(); });
  });
  return filho;
}

const test = base.extend<{ api: { acoes: Record<string, unknown>[]; perguntas: () => number } }>({
  // auto: todo teste fala com o simulador, mesmo sem olhar as ações.
  api: [async ({ page }, usar) => {
    const porta = await portaLivre();
    const filho = await subirMock(porta);
    const acoes: Record<string, unknown>[] = [];
    let perguntas = 0;
    await page.route('http://api.test/**', async (r) => {
      const url = new URL(r.request().url());
      if (url.pathname === '/pcp-acao') acoes.push(r.request().postDataJSON() as Record<string, unknown>);
      if (url.pathname === '/pcp-assistente') perguntas++;
      const resp = await r.fetch({ url: `http://localhost:${porta}${url.pathname}${url.search}` });
      await r.fulfill({ response: resp });
    });
    await usar({ acoes, perguntas: () => perguntas });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    filho.kill();
  }, { auto: true }]
});

// O simulador conta os dias pela data UTC: o navegador fica no meio-dia (São Paulo) desse dia,
// para "hoje" ser o mesmo dos dois lados a qualquer hora.
async function entrar(page: Page, hash = '') {
  await page.clock.setFixedTime(new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00-03:00`));
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('pcp@exemplo.test');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('header.navbar')).toBeVisible();
  await expect(page.locator('.app__principal .carregando')).toHaveCount(0);
}

const painel = (page: Page) => page.getByRole('complementary', { name: 'Assistente' });
const botao = (page: Page) => page.locator('header.navbar').getByRole('button', { name: 'Assistente' });
const conversa = (page: Page) => painel(page).getByRole('log', { name: 'Conversa com o assistente' });
async function perguntar(page: Page, texto: string) {
  await painel(page).getByLabel('Pergunta ao assistente').fill(texto);
  await painel(page).getByLabel('Pergunta ao assistente').press('Enter');
}

test('abre e fecha pelo botão e pelo X; o exemplo responde com links de OS; a conversa fica', async ({ page, api }) => {
  await entrar(page);
  await expect(painel(page)).toBeHidden();
  await botao(page).click();
  await expect(painel(page)).toBeVisible();
  await expect(botao(page)).toHaveAttribute('aria-expanded', 'true');
  // O painel empurra o conteúdo: o app termina onde o painel começa.
  const app = (await page.locator('.app').boundingBox())!;
  const lado = (await painel(page).boundingBox())!;
  expect(Math.round(lado.width)).toBe(380);
  expect(app.x + app.width).toBeLessThanOrEqual(lado.x + 1);

  await painel(page).getByRole('button', { name: 'Quais OS estão atrasadas?' }).click();
  await expect(conversa(page).getByText('pensando…')).toBeVisible();
  await expect(conversa(page)).toContainText('OS com prazo estourando');
  await expect(conversa(page)).toContainText('OS 90013 · PECA TESTE M · OFICINA MAR · venceu há 1 dia');
  expect(api.perguntas()).toBe(2); // a pergunta e a volta com o resultado da ferramenta

  await conversa(page).getByRole('link', { name: '90003', exact: true }).click();
  await expect(page).toHaveURL(/#peca\/90003$/);
  await expect(painel(page)).toBeVisible();

  await painel(page).getByRole('button', { name: 'Fechar assistente' }).click();
  await expect(painel(page)).toBeHidden();
  await botao(page).click();
  await expect(conversa(page)).toContainText('OS 90013 · PECA TESTE M');
  await botao(page).click();
  await expect(painel(page)).toBeHidden();
});

test('Shift+Enter quebra a linha e Enter envia; abrir tela navega', async ({ page }) => {
  await entrar(page);
  await botao(page).click();
  const campo = painel(page).getByLabel('Pergunta ao assistente');
  await campo.fill('abrir');
  await campo.press('Shift+Enter');
  await campo.pressSequentially('o controle de produção');
  await expect(campo).toHaveValue('abrir\no controle de produção');
  await campo.press('Enter');
  await expect(page).toHaveURL(/#producao$/);
  await expect(conversa(page)).toContainText('Abri Controle de produção.');
  await expect(campo).toHaveValue('');
});

test('cobrar as atrasadas: travadas com motivo, desmarcar uma, confirmar e ver na fila', async ({ page, api }) => {
  await entrar(page);
  await botao(page).click();
  await painel(page).getByRole('button', { name: 'Cobrar as atrasadas' }).click();
  const cartao = painel(page).getByRole('region', { name: 'Cartão de cobrança' });
  await expect(cartao).toBeVisible();
  await expect(conversa(page)).toContainText('Preparei 2 cobranças (2 OS travadas). Nada foi enviado');
  const linha = (os: string) => cartao.getByRole('listitem').filter({ hasText: `OS ${os}` });
  await expect(linha('90012')).toContainText('Oficina sem grupo de WhatsApp');
  await expect(linha('90003')).toContainText('Sem oficina alocada');
  await expect(cartao.getByRole('checkbox', { name: 'Cobrar a OS 90012' })).toBeDisabled();
  await expect(cartao.getByRole('checkbox', { name: 'Cobrar a OS 90003' })).not.toBeChecked();
  await expect(cartao.getByRole('checkbox', { name: 'Cobrar a OS 90013' })).toBeChecked();
  await expect(cartao.getByLabel('Mensagem da OS 90013')).toHaveValue(/^Olá\. A entrega de \*PECA TESTE M\*, 70 peças, estava prevista para .*Qual a nova data de entrega\?$/);
  await expect(cartao.getByRole('button', { name: 'Confirmar e enviar (2)' })).toBeEnabled();

  await cartao.getByRole('checkbox', { name: 'Cobrar a OS 90014' }).uncheck();
  await cartao.getByLabel('Mensagem da OS 90013').fill('Olá. Qual a nova data de entrega da *PECA TESTE M*?');
  expect(api.acoes).toHaveLength(0);
  await cartao.getByRole('button', { name: 'Confirmar e enviar (1)' }).click();
  await expect(cartao).toContainText('1 cobrança na fila');
  await expect(cartao.getByRole('button', { name: /Confirmar e enviar/ })).toHaveCount(0);
  await expect(cartao.getByRole('checkbox', { name: 'Cobrar a OS 90013' })).toBeDisabled();
  await expect(cartao.getByLabel('Mensagem da OS 90013')).toHaveAttribute('readonly', '');
  await expect.poll(() => api.acoes.length).toBe(1);
  expect(api.acoes[0]).toMatchObject({ tipo: 'enviar_whatsapp', dealId: '700013', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: 'Olá. Qual a nova data de entrega da *PECA TESTE M*?' });
  expect(String(api.acoes[0].chave)).toMatch(/^[A-Za-z0-9-]{8,64}$/);

  // Na fila do WhatsApp: aparece na conversa da OS no Controle de produção.
  await painel(page).getByRole('button', { name: 'Fechar assistente' }).click();
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Controle de produção' }).click();
  await page.getByRole('button', { name: /OS 90013/ }).first().click();
  await expect(page.getByRole('complementary', { name: 'Detalhes da OS 90013' })).toContainText('Olá. Qual a nova data de entrega da *PECA TESTE M*?');
  expect(api.acoes).toHaveLength(1);
});

test('cancelar não gera nada e deixa o cartão só leitura', async ({ page, api }) => {
  await entrar(page);
  await botao(page).click();
  await perguntar(page, 'Cobrar a OFICINA SOL');
  const cartao = painel(page).getByRole('region', { name: 'Cartão de cobrança' });
  await expect(cartao.getByRole('listitem').filter({ hasText: 'OS 90008' })).toContainText('Edição liberada em breve para esta OS');
  await expect(cartao.getByRole('button', { name: 'Confirmar e enviar (2)' })).toBeVisible();
  await cartao.getByRole('button', { name: 'Cancelar' }).click();
  await expect(cartao).toContainText('Cobrança cancelada. Nada foi enviado.');
  await expect(cartao.getByRole('button')).toHaveCount(0);
  await expect(cartao.getByRole('checkbox', { name: 'Cobrar a OS 90002' })).toBeDisabled();
  await page.waitForTimeout(300);
  expect(api.acoes).toHaveLength(0);
});

test('erro do servidor: aviso no chat sem perder a conversa; a próxima pergunta funciona', async ({ page }) => {
  await entrar(page);
  await botao(page).click();
  await perguntar(page, 'faltas da OS 90001');
  await expect(conversa(page)).toContainText('Faltas em aberto da OS 90001');
  await perguntar(page, 'simular erro');
  await expect(conversa(page).getByRole('alert')).toHaveText('Não consegui responder agora. Tente de novo.');
  await expect(conversa(page)).toContainText('Faltas em aberto da OS 90001');
  await expect(conversa(page)).toContainText('simular erro');
  await perguntar(page, 'limite');
  await expect(conversa(page).getByRole('alert').last()).toHaveText('Muitas perguntas seguidas. Espere alguns minutos.');
  await perguntar(page, 'caixas paradas');
  await expect(conversa(page)).toContainText('Caixas paradas');
});

test('375 px: o painel cobre a tela, sem rolagem horizontal; o link de OS leva à peça e fecha o painel', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page);
  await botao(page).click();
  const caixa = (await painel(page).boundingBox())!;
  expect(caixa.x).toBe(0);
  expect(Math.round(caixa.width)).toBe(375);
  await painel(page).getByRole('button', { name: 'Cobrar as atrasadas' }).click();
  await expect(painel(page).getByRole('region', { name: 'Cartão de cobrança' })).toBeVisible();
  await expect(conversa(page)).toContainText('Preparei 2 cobranças');
  const larguras = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, painel: document.querySelector('.assistente')!.scrollWidth }));
  expect(larguras.doc).toBeLessThanOrEqual(375);
  expect(larguras.painel).toBeLessThanOrEqual(375);
  await perguntar(page, 'atrasadas');
  await conversa(page).getByRole('link', { name: '90013', exact: true }).click();
  await expect(page).toHaveURL(/#peca\/90013$/);
  await expect(painel(page)).toBeHidden();
});
