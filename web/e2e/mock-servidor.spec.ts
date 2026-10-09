import { expect, test as base, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

// Edições de pedido contra o mock da API (scripts/mock-api.mjs), com estado e com atraso nas
// respostas da pcp-acao, como o servidor lento: a tela tem de mostrar a mudança na hora,
// mantê-la enquanto grava e continuar mostrando depois que a recarga traz o board novo.

const ATRASO_MS = Number(process.env.E2E_ATRASO ?? 1500);
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
  const filho = spawn(process.execPath, [MOCK], {
    env: { ...process.env, MOCK_PORT: String(porta), MOCK_ATRASO_MS: String(ATRASO_MS) },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise<void>((ok, erro) => {
    filho.once('exit', (c) => erro(new Error(`mock saiu com ${c}`)));
    filho.stdout!.on('data', (d: Buffer) => { if (d.toString().includes('Mock da API')) ok(); });
  });
  return filho;
}

const test = base.extend<{ api: { boardGets: () => number; acoes: Record<string, unknown>[] } }>({
  api: async ({ page }, usar) => {
    const porta = await portaLivre();
    const filho = await subirMock(porta);
    let gets = 0;
    const acoes: Record<string, unknown>[] = [];
    // o build de e2e chama http://api.test; aqui cada chamada vai para o mock
    await page.route('http://api.test/**', async (r) => {
      const url = new URL(r.request().url());
      if (url.pathname === '/pcp-board') gets++;
      if (url.pathname === '/pcp-acao') acoes.push(r.request().postDataJSON() as Record<string, unknown>);
      const resp = await r.fetch({ url: `http://localhost:${porta}${url.pathname}${url.search}` });
      await r.fulfill({ response: resp });
    });
    await usar({ boardGets: () => gets, acoes });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    filho.kill();
  }
});

async function entrar(page: Page, hash: string) {
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

const card = (page: Page, coluna: string, id: string) =>
  page.getByRole('region', { name: coluna }).getByRole('article', { name: `Pedido ${id}` });
const salvando = (page: Page) => page.getByText('Salvando…');

// Confere que o card está só na coluna esperada agora, quando o servidor termina de gravar
// e depois da recarga (sem voltar para a coluna antiga em nenhum momento).
async function ficaNaColuna(page: Page, api: { boardGets: () => number }, id: string, nova: string, antiga: string) {
  await expect(card(page, nova, id)).toBeVisible();
  await expect(card(page, antiga, id)).toHaveCount(0);
  await expect(salvando(page)).toBeVisible();
  const gets = api.boardGets();
  // enquanto grava: o card não pode piscar de volta
  for (let k = 0; k < 5; k++) {
    await page.waitForTimeout(200);
    await expect(card(page, nova, id)).toHaveCount(1);
    await expect(card(page, antiga, id)).toHaveCount(0);
  }
  await expect(salvando(page)).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => api.boardGets()).toBeGreaterThan(gets);
  await page.waitForTimeout(300);
  await expect(card(page, nova, id)).toHaveCount(1);
  await expect(card(page, antiga, id)).toHaveCount(0);
  // a próxima leitura (volta para a aba) também traz o pedido na coluna nova
  const depois = api.boardGets();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => api.boardGets()).toBeGreaterThan(depois);
  await page.waitForTimeout(300);
  await expect(card(page, nova, id)).toHaveCount(1);
  await expect(card(page, antiga, id)).toHaveCount(0);
}

test('editar a etapa no painel e salvar: o card vai para a coluna nova e fica lá', async ({ page, api }) => {
  await entrar(page, '#pedidos');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0001' });
  await painel.getByLabel('Etapa').selectOption('aguardando');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await ficaNaColuna(page, api, 'PED-0001', 'Aguardando entrega', 'Solicitado');
  // o painel continua aberto e mostra a etapa gravada
  await expect(painel.getByLabel('Etapa')).toHaveValue('aguardando');
  expect(api.acoes.map((a) => a.tipo)).toEqual(['editar_pedido']);
});

test('editar a etapa duas vezes seguidas sem esperar o servidor: fica na última escolhida', async ({ page, api }) => {
  await entrar(page, '#pedidos');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0001' });
  await painel.getByLabel('Etapa').selectOption('aguardando');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(card(page, 'Aguardando entrega', 'PED-0001')).toBeVisible();
  await painel.getByLabel('Etapa').selectOption('a_pedir');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await ficaNaColuna(page, api, 'PED-0001', 'A pedir', 'Aguardando entrega');
  await expect(card(page, 'Solicitado', 'PED-0001')).toHaveCount(0);
});

test('arrastar o pedido para outra etapa: o card fica na coluna nova depois da recarga', async ({ page, api }) => {
  await entrar(page, '#pedidos');
  await card(page, 'Aguardando entrega', 'PED-0003').getByRole('button', { name: 'Pedido PED-0003' })
    .dragTo(page.getByRole('region', { name: 'A pedir' }));
  await ficaNaColuna(page, api, 'PED-0003', 'A pedir', 'Aguardando entrega');
});

test('editar a previsão do pedido: a data nova aparece na hora e continua depois da recarga', async ({ page, api }) => {
  await entrar(page, '#pedidos');
  const c = card(page, 'Aguardando entrega', 'PED-0003');
  await c.getByRole('button', { name: 'Pedido PED-0003' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0003' });
  const nova = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  const ddmm = `${nova.slice(8, 10)}/${nova.slice(5, 7)}`;
  await painel.getByLabel('Previsão de entrega').fill(nova);
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(c).toContainText(`previsão ${ddmm}`);
  await expect(salvando(page)).toBeVisible();
  await expect(salvando(page)).toHaveCount(0, { timeout: 10_000 });
  const gets = api.boardGets();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => api.boardGets()).toBeGreaterThan(gets);
  await page.waitForTimeout(300);
  await expect(c).toContainText(`previsão ${ddmm}`);
  await expect(painel.getByLabel('Previsão de entrega')).toHaveValue(nova);
});

// O caso do relato: com o painel aberto, o pedido muda de etapa (arrastado, ou por outra ação
// ainda na fila). O formulário não pode guardar a etapa antiga: salvar outra alteração depois
// mandaria o pedido de volta para ela.
test('painel aberto e o card arrastado: o painel acompanha a etapa e salvar não devolve o pedido', async ({ page, api }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  await entrar(page, '#pedidos');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0001' });
  await expect(painel.getByLabel('Etapa')).toHaveValue('solicitado');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' })
    .dragTo(page.getByRole('region', { name: 'Aguardando entrega' }));
  await expect(card(page, 'Aguardando entrega', 'PED-0001')).toBeVisible();
  // ainda antes de o servidor responder ao arraste (o mock segura ${ATRASO_MS} ms)
  await expect(salvando(page)).toBeVisible();
  await expect(painel.getByLabel('Etapa')).toHaveValue('aguardando', { timeout: 300 });
  await expect(painel.getByRole('button', { name: 'Nada alterado' })).toBeDisabled({ timeout: 300 });
  // muda outra coisa e salva ainda com o arraste na fila
  await painel.getByLabel('Responsável').selectOption('Lucca');
  await expect(salvando(page)).toBeVisible();
  await expect(painel).not.toContainText('Etapa:');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await ficaNaColuna(page, api, 'PED-0001', 'Aguardando entrega', 'Solicitado');
  expect(api.acoes.map((a) => a.tipo)).toEqual(['mover_pedido', 'editar_pedido']);
  expect(api.acoes[1].campos).toEqual({ responsavel: 'Lucca' });
  await expect(painel.getByLabel('Responsável')).toHaveValue('Lucca');
});

test('digitando no painel quando a recarga chega: o que foi digitado continua lá', async ({ page, api }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  await entrar(page, '#pedidos');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0001' });
  await painel.getByLabel('Etapa').selectOption('aguardando');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  // enquanto grava, começa outra alteração
  await painel.getByLabel('Responsável').selectOption('Lucca');
  const gets = api.boardGets();
  await expect(salvando(page)).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => api.boardGets()).toBeGreaterThan(gets);
  await page.waitForTimeout(300);
  await expect(painel.getByLabel('Responsável')).toHaveValue('Lucca');
  await expect(painel.getByLabel('Etapa')).toHaveValue('aguardando');
  await expect(painel.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
});

test('pedido em etapa que saiu do quadro: escolher a primeira etapa no painel conta como mudança', async ({ page, api }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  await entrar(page, '#pedidos');
  await card(page, 'Outra etapa', 'PED-0005').getByRole('button', { name: 'Pedido PED-0005' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0005' });
  await expect(painel.getByLabel('Etapa')).toHaveValue('conferencia');
  await painel.getByLabel('Etapa').selectOption('a_pedir');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await ficaNaColuna(page, api, 'PED-0005', 'A pedir', 'Outra etapa');
});

// Como o servidor (n8n/src/montarCaixas.js): só item de caixa ganha (fora da FALTANTES) vem
// com editavel false. Item resolvido e item de caixa somente leitura são da FALTANTES.
test('mock: item resolvido e caixa somente leitura não dizem "lido da planilha de caixas ganhas"', async ({ page, api }) => {
  void api;
  await entrar(page, '');
  await page.getByRole('button', { name: 'OS 90001' }).click();
  const p1 = page.getByRole('complementary', { name: 'Caixa da OS 90001' });
  const etiqueta = p1.getByRole('listitem').filter({ hasText: 'ETIQUETA COMPOSICAO' }).filter({ hasNotText: 'deu baixa' });
  await expect(etiqueta).toContainText('Item resolvido.');
  await expect(p1.getByText(/lido da planilha de caixas ganhas/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'OS 90002' }).click();
  const p2 = page.getByRole('complementary', { name: 'Caixa da OS 90002' });
  await expect(p2.getByText('Edição liberada em breve para esta caixa.')).toBeVisible();
  await expect(p2.getByText(/lido da planilha de caixas ganhas/)).toHaveCount(0);
});
