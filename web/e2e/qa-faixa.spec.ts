import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// Ambiente de QA (spec 2026-10-30): a faixa só aparece quando o board vem com qa (API homolog).
const SESSAO = { token: 'f'.repeat(64), nome: 'Pessoa PCP', perfil: 'PCP', expiraEm: '2099-01-01T00:00:00.000Z' };

async function entrar(page: Page, board: Record<string, unknown>) {
  await page.route('http://api.test/pcp-login', (r) => r.fulfill({ json: SESSAO }));
  await page.route('http://api.test/pcp-board', (r) => r.fulfill({ json: board }));
  await page.goto('./');
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('board da homologação: faixa fixa de QA com a data da cópia, em todas as telas', async ({ page }) => {
  await entrar(page, { ...base, qa: { copiadoEm: '2026-10-30T13:05:00.000Z' } });
  const faixa = page.getByRole('status').filter({ hasText: 'AMBIENTE DE QA' });
  await expect(faixa).toHaveText('AMBIENTE DE QA · dados copiados em 30/10 10:05 · nada altera a planilha original');
  await page.goto('./#pedidos');
  await expect(faixa).toBeVisible();
});

test('board da produção: sem faixa de QA', async ({ page }) => {
  await entrar(page, base);
  await expect(page.locator('.navbar, nav').first()).toBeVisible();
  await expect(page.getByText('AMBIENTE DE QA')).toHaveCount(0);
});
