import { expect, test, type Locator, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// Celular (375 px): a barra de guias e a janela Gerar pedido inteiras na tela.

const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };

async function entrar(page: Page, hash: string) {
  await page.route('http://api.test/pcp-login', (r) => r.fulfill({ json: SESSAO }));
  await page.route('http://api.test/pcp-board', (r) => r.fulfill({ json: base }));
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
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
