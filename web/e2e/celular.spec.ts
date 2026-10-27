import { expect, test, type Locator, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// Celular (375 px): a barra de guias e a janela Gerar pedido inteiras na tela.

const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };

const PRODUCAO = Array.from({ length: 12 }, (_, i) => ({
  dealId: `71${String(i).padStart(4, '0')}`, os: `9${String(i).padStart(4, '0')}`, oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '2026-10-01',
  dataCombinada: '2026-10-12', leadTime: '2026-10-15', pecas: 80, cliente: 'CLIENTE FICTICIO', peca: `PECA TESTE ${i}`, referencia: 'REF-A', versao: 'v1',
  faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: []
}));

async function entrar(page: Page, hash: string) {
  await page.route('http://api.test/pcp-login', (r) => r.fulfill({ json: SESSAO }));
  await page.route('http://api.test/pcp-board', (r) => r.fulfill({ json: { ...base, producao: PRODUCAO,
    oficinas: [{ ploomesId: 'OF-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO MODELO' }], dealsProducaoEditaveis: ['710000'] } }));
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

// O elemento aparece na tela e é ele (não a navbar por cima) que recebe o toque.
async function tocavel(page: Page, el: Locator) {
  await expect(el).toBeVisible();
  const c = (await el.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(c.y).toBeGreaterThanOrEqual(0);
  expect(c.y + c.height).toBeLessThanOrEqual(vp.height);
  const noPonto = await el.evaluate((e, [x, y]) => {
    const alvo = document.elementFromPoint(x, y);
    return !!alvo && (alvo === e || e.contains(alvo));
  }, [c.x + c.width / 2, c.y + c.height / 2]);
  expect(noPonto).toBe(true);
}

// A caixa do elemento cabe (inteira) entre as bordas de dentro.
async function dentro(el: Locator, de: Locator) {
  const a = (await el.boundingBox())!;
  const b = (await de.boundingBox())!;
  expect(a.x).toBeGreaterThanOrEqual(b.x - 0.5);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
}

test.use({ viewport: { width: 375, height: 812 } });

test('as guias ficam todas à vista, com o nome inteiro, sem rolar de lado', async ({ page }) => {
  await entrar(page, '#pedidos');
  const nav = page.getByRole('navigation', { name: 'Módulos' });
  await expect(nav).toBeVisible();
  const corpo = page.locator('body');
  for (const nome of ['No Ploomes', 'Saídas com falta', 'Solicitações de faltas']) {
    const guia = nav.getByRole('button', { name: nome });
    await expect(guia).toBeVisible();
    await dentro(guia, corpo);
    // o texto não é cortado com reticências nem escondido
    expect(await guia.evaluate((b) => b.scrollWidth <= b.clientWidth + 1)).toBe(true);
  }
  expect(await nav.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  await expect(nav.getByRole('button', { name: 'Solicitações de faltas' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: 'Saídas com falta' }).click();
  await expect(page).toHaveURL(/#saidas$/);
});

test('Gerar pedido: quantidade, fornecedor e previsão do item inteiros dentro da janela', async ({ page }) => {
  await entrar(page, '#pedidos');
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await faltas.getByRole('checkbox', { name: /LINHA 120/ }).check();
  await page.getByRole('button', { name: 'Gerar pedido' }).click();
  const janela = page.getByRole('dialog', { name: 'Gerar pedido' });
  const linha = janela.getByRole('listitem').filter({ hasText: 'LINHA 120' });
  for (const campo of [
    linha.getByLabel(/^Quantidade/),
    linha.getByLabel(/^Fornecedor do item/),
    linha.getByLabel(/^Previsão de/),
    linha.getByRole('button', { name: /^Remover/ })
  ]) {
    await campo.scrollIntoViewIfNeeded();
    await dentro(campo, linha);
    await dentro(campo, janela);
  }
  // o select mostra o texto inteiro ("Igual ao do pedido"), não "Igu…"
  const forn = linha.getByLabel(/^Fornecedor do item/);
  expect((await forn.boundingBox())!.width).toBeGreaterThan(200);
});

test('painel da OS no Controle de produção: título e fechar à vista e clicáveis', async ({ page }) => {
  await entrar(page, '#producao');
  // A última OS fica no pé da tela: o toque nela não pode empurrar o painel para baixo da busca.
  await page.getByRole('button', { name: /OS 90011/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90011' });
  await tocavel(page, painel.getByText('Controle de produção', { exact: true }));
  await tocavel(page, painel.getByRole('heading', { name: 'OS 90011' }));
  await tocavel(page, painel.getByRole('button', { name: 'Fechar painel' }));
  await painel.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(painel).toHaveCount(0);
});

test('painéis das caixas (No Ploomes e Saídas): fechar à vista e clicável', async ({ page }) => {
  await entrar(page, '#saidas');
  for (const guia of ['Saídas com falta', 'No Ploomes']) {
    await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: guia }).click();
    await page.locator('.card[role=button]').last().click();
    const painel = page.locator('aside.painel');
    await tocavel(page, painel.getByRole('button', { name: 'Fechar' }).first());
    await painel.getByRole('button', { name: 'Fechar' }).first().click();
    await expect(painel).toHaveCount(0);
  }
});

test('Gantt no celular: coluna fixa estreita (cerca de 45%) sem cortar o número da OS', async ({ page }) => {
  await entrar(page, '#producao');
  const fixo = (await page.locator('.gantt__cabecalho').boundingBox())!;
  expect(fixo.width).toBeLessThanOrEqual(375 * 0.5);
  expect(fixo.width).toBeGreaterThanOrEqual(375 * 0.4);
  const os = page.locator('.gantt__os').first();
  const numero = os.locator('strong');
  await expect(numero).toHaveText('OS 90000');
  const n = (await numero.boundingBox())!;
  const b = (await os.boundingBox())!;
  expect(n.x + n.width).toBeLessThanOrEqual(b.x + b.width);
  expect(await numero.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  // A coluna de hoje continua alinhada com a régua.
  const hoje = (await page.locator('.gantt__dia--hoje').boundingBox())!;
  const col = (await page.getByTestId('gantt-hoje-coluna').boundingBox())!;
  expect(Math.abs(hoje.x - col.x)).toBeLessThan(1.5);
});
