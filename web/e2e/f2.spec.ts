import { expect, test, type Locator, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const ACAO = 'http://api.test/pcp-acao';
const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };
const VERSAO_CAIXA = '2026-10-06T09:00:00.000Z';

type Board = typeof base;
type Corpo = Record<string, unknown>;
const copia = (): Board => structuredClone(base);

interface Mock { bodies: Corpo[]; board: Board; boardGets: () => number }
interface Opcoes {
  perfil?: string;
  resposta?: (corpo: Corpo) => { status: number; json: unknown };
  aoAgir?: (b: Board, corpo: Corpo) => void;
}

// Mocka login, board (mutável pelo teste) e ação.
async function preparar(page: Page, opts: Opcoes = {}): Promise<Mock> {
  let gets = 0;
  const mock: Mock = { bodies: [], board: copia(), boardGets: () => gets };
  await page.route(LOGIN, (r) => r.fulfill({ json: { ...SESSAO, perfil: opts.perfil ?? 'ADM' } }));
  await page.route(BOARD, (r) => { gets++; return r.fulfill({ json: mock.board }); });
  await page.route(ACAO, (r) => {
    const corpo = r.request().postDataJSON() as Corpo;
    mock.bodies.push(corpo);
    const res = opts.resposta?.(corpo) ?? {
      status: 200,
      json: { ok: true, versao: 'v2', historico: { quando: '2026-10-07T12:00:00.000Z', usuario: 'Lucca', texto: 'alteração', ploomes: 'PENDENTE' } }
    };
    if (res.status === 200) opts.aoAgir?.(mock.board, corpo);
    return r.fulfill({ status: res.status, json: res.json });
  });
  await page.goto('./');
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
  return mock;
}

async function abrir(page: Page, os = '90001') {
  await page.getByRole('button', { name: `OS ${os}` }).click();
  return page.getByRole('complementary', { name: `Caixa da OS ${os}` });
}

const itemDe = (painel: Locator, nome: string) => painel.getByRole('listitem').filter({ hasText: nome }).first();

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00'));
});

test('baixa válida envia o corpo certo, avisa e mostra o resta novo', async ({ page }) => {
  const mock = await preparar(page, {
    aoAgir: (b) => {
      const it = b.caixas[0].itens[0];
      it.baixada = 1; it.resta = 1; it.falta = 1; it.versao = 'v2';
    }
  });
  const painel = await abrir(page);
  const item = itemDe(painel, 'LINHA 120');
  await item.getByLabel('Chegou (cones)').fill('1');
  await item.getByRole('button', { name: 'Registrar baixa' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Baixa registrada · 1 cone/ })).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'baixa', dealId: '700001', itemId: 'a1', valor: 1, versao: '' }]);
  await expect(painel).toContainText('baixado 1 · resta 1 cone');
});

test('baixa maior que o que falta mostra o erro e não chama o servidor', async ({ page }) => {
  const mock = await preparar(page);
  const painel = await abrir(page);
  const item = itemDe(painel, 'LINHA 120');
  await item.getByLabel('Chegou (cones)').fill('5');
  await item.getByRole('button', { name: 'Registrar baixa' }).click();
  await expect(item.getByText('Falta só 2 cones')).toBeVisible();
  await item.getByLabel('Chegou (cones)').fill('0');
  await item.getByRole('button', { name: 'Registrar baixa' }).click();
  await expect(item.getByText('Informe uma quantidade maior que zero')).toBeVisible();
  expect(mock.bodies).toHaveLength(0);
});

test('trocar o responsável envia o tipo responsavel', async ({ page }) => {
  const mock = await preparar(page, { aoAgir: (b) => { b.caixas[0].responsavel = 'Lucca'; b.caixas[0].versao = 'v2'; } });
  const painel = await abrir(page);
  await painel.getByLabel('Responsável').selectOption('Lucca');
  await expect(page.getByRole('status').filter({ hasText: 'Responsável: Lucca' })).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'responsavel', dealId: '700001', valor: 'Lucca', versao: VERSAO_CAIXA }]);
});

test('ADM move a caixa na hora', async ({ page }) => {
  const mock = await preparar(page, { perfil: 'ADM' });
  const painel = await abrir(page);
  await painel.getByRole('button', { name: 'Caixa completa · Pedido' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Caixa movida para Caixa completa · Pedido' })).toBeVisible();
  await expect(painel.getByLabel('Justificativa (obrigatória)')).toHaveCount(0);
  expect(mock.bodies).toEqual([{ tipo: 'mover', dealId: '700001', valor: 'completa_pedido', versao: VERSAO_CAIXA }]);
});

test('não-ADM só confirma o move com 15 caracteres de justificativa', async ({ page }) => {
  const mock = await preparar(page, { perfil: 'PCP' });
  const painel = await abrir(page);
  await painel.getByRole('button', { name: 'Caixa completa · Pedido' }).click();
  expect(mock.bodies).toHaveLength(0);
  const confirmar = painel.getByRole('button', { name: 'Confirmar e mover' });
  await expect(confirmar).toBeDisabled();
  await painel.getByLabel('Justificativa (obrigatória)').fill('curta demais');
  await expect(painel.getByText('12/15')).toBeVisible();
  await expect(confirmar).toBeDisabled();
  const texto = 'material conferido na mesa';
  await painel.getByLabel('Justificativa (obrigatória)').fill(texto);
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(page.getByRole('status').filter({ hasText: 'Caixa movida para Caixa completa · Pedido' })).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'mover', dealId: '700001', valor: 'completa_pedido', versao: VERSAO_CAIXA, justificativa: texto }]);
});

test('resposta 409 mostra o aviso de conflito e recarrega o board', async ({ page }) => {
  const mock = await preparar(page, { resposta: () => ({ status: 409, json: { erro: 'Conflito de versão.' } }) });
  const painel = await abrir(page);
  const antes = mock.boardGets();
  await painel.getByLabel('Responsável').selectOption('Lucca');
  await expect(page.getByRole('status').filter({ hasText: 'Alguém alterou esta caixa agora há pouco. Recarreguei os dados.' })).toBeVisible();
  await expect.poll(() => mock.boardGets()).toBeGreaterThan(antes);
  expect(mock.bodies).toHaveLength(1);
});

test('o histórico mostra os selos do Ploomes', async ({ page }) => {
  const mock = await preparar(page);
  await expect(page.getByRole('button', { name: 'OS 90001' })).toBeVisible();
  mock.board.caixas[0].historico = [
    { quando: '2026-10-05T10:00:00.000Z', usuario: 'Maria', texto: 'primeira entrada', ploomes: 'ENVIADO' },
    { quando: '2026-10-06T10:00:00.000Z', usuario: 'Maria', texto: 'segunda entrada', ploomes: 'PENDENTE' },
    { quando: '2026-10-07T10:00:00.000Z', usuario: 'Lucca', texto: 'terceira entrada', ploomes: 'ERRO' }
  ] as never;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const painel = await abrir(page);
  await expect(painel.getByText('enviado ao Ploomes')).toBeVisible();
  await expect(painel.getByText('aguardando Ploomes')).toBeVisible();
  await expect(painel.getByText('falhou no Ploomes')).toBeVisible();
});
