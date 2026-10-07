import { expect, test, type Page } from '@playwright/test';
import board from './fixtures/board.json' with { type: 'json' };

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };

async function entrar(page: Page) {
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.goto('./');
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00'));
});

test('senha errada mostra o erro e não entra', async ({ page }) => {
  await page.route(LOGIN, (r) => r.fulfill({ status: 401, json: { erro: 'E-mail ou senha incorretos.' } }));
  await page.goto('./');
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
});

test('entra e mostra as caixas nas colunas certas', async ({ page }) => {
  let auth = '';
  await page.route(BOARD, (r) => { auth = r.request().headers()['authorization']; return r.fulfill({ json: board }); });
  await entrar(page);
  const faltaPedido = page.getByRole('region', { name: 'Itens faltando · Pedido' });
  await expect(faltaPedido.getByRole('button', { name: 'OS 90001' })).toBeVisible();
  await expect(faltaPedido.getByRole('button', { name: 'OS 90002' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saiu com faltas' }).getByRole('button', { name: 'OS 90003' })).toBeVisible();
  const card = faltaPedido.getByRole('button', { name: 'OS 90001' });
  await expect(card).toContainText('2 itens faltando');
  await expect(card).toContainText('2 cones · 100 g');
  await expect(card).toContainText('+ 1 item já resolvido');
  expect(auth).toBe(`Bearer ${SESSAO.token}`);
});

test('busca ignora acentos', async ({ page }) => {
  await page.route(BOARD, (r) => r.fulfill({ json: board }));
  await entrar(page);
  await page.getByLabel('Buscar').fill('acai');
  await expect(page.getByRole('button', { name: 'OS 90001' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OS 90002' })).toHaveCount(0);
  await page.getByLabel('Buscar').fill('ziper');
  await expect(page.getByRole('button', { name: 'OS 90002' })).toBeVisible();
});

test('clicar no card abre o painel com o link do Ploomes', async ({ page }) => {
  await page.route(BOARD, (r) => r.fulfill({ json: board }));
  await entrar(page);
  await page.getByRole('button', { name: 'OS 90001' }).click();
  const painel = page.getByRole('complementary', { name: 'Caixa da OS 90001' });
  await expect(painel.getByRole('link', { name: 'Abrir card no Ploomes' })).toHaveAttribute('href', 'https://app10.ploomes.com/deal/700001');
  await expect(painel).toContainText('faltava 2 cones · 100 g · baixado 0 · resta 2 cones · 100 g');
  await painel.getByRole('button', { name: 'Fechar' }).click();
  await expect(painel).toHaveCount(0);
});

test('sessão expirada volta para o login com aviso', async ({ page }) => {
  await page.route(BOARD, (r) => r.fulfill({ status: 401, json: { erro: 'Sessão expirada.' } }));
  await entrar(page);
  await expect(page.getByText('Sua sessão expirou. Entre de novo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('sem conexão mantém o quadro e mostra a faixa', async ({ page }) => {
  let falhar = false;
  await page.route(BOARD, (r) => (falhar ? r.abort('internetdisconnected') : r.fulfill({ json: board })));
  await entrar(page);
  await expect(page.getByRole('button', { name: 'OS 90002' })).toBeVisible();
  falhar = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão desde' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OS 90002' })).toBeVisible();
});
