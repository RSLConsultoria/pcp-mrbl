import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// Fumaça das telas da F3 (sem ações no servidor). Os fluxos completos ficam no f3.spec.ts.
const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };

async function entrar(page: Page, hash = '') {
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.route(BOARD, (r) => r.fulfill({ json: base }));
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

const guias = (page: Page) => page.getByRole('navigation', { name: 'Módulos' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00'));
});

test('guias trocam de tela e o hash mantém a guia ao recarregar', async ({ page }) => {
  await entrar(page);
  await guias(page).getByRole('button', { name: 'Saídas com falta' }).click();
  await expect(page).toHaveURL(/#saidas$/);
  const sem = page.getByRole('region', { name: 'Sem pedido' });
  await expect(sem.getByRole('button', { name: 'OS 90003' })).toContainText('saiu 18/09 · há 19 dias');
  await expect(sem.getByRole('button', { name: 'OS 90003' })).toContainText('sem pedido');
  await page.reload();
  await expect(guias(page).getByRole('button', { name: 'Saídas com falta' })).toHaveAttribute('aria-current', 'page');
  await expect(guias(page).getByRole('button', { name: 'Controle de produção' })).toBeDisabled();
});

test('Selecionar para pedido abre Solicitações com o item marcado e a janela fecha com Esc', async ({ page }) => {
  await entrar(page, '#saidas');
  await page.getByRole('button', { name: 'OS 90003' }).click();
  await page.getByRole('complementary', { name: 'Caixa da OS 90003' }).getByRole('button', { name: 'Selecionar para pedido' }).click();
  await expect(page).toHaveURL(/#pedidos$/);
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await expect(faltas.getByRole('checkbox', { name: /VIES LINEAR 6 CM/ })).toBeChecked();
  await expect(faltas).toContainText('1 selecionado');
  const gerar = page.getByRole('button', { name: 'Gerar pedido' });
  await expect(gerar).toBeEnabled();
  await gerar.click();
  const janela = page.getByRole('dialog', { name: 'Gerar pedido' });
  await expect(janela.getByLabel('Quantidade (MT) de VIES LINEAR 6 CM')).toHaveValue('450');
  await page.keyboard.press('Escape');
  await expect(janela).toHaveCount(0);
  await expect(gerar).toBeFocused();
  await faltas.getByRole('checkbox', { name: /VIES LINEAR 6 CM/ }).uncheck();
  await expect(gerar).toBeDisabled();
});
