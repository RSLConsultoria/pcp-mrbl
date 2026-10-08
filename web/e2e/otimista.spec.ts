import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// Tela que responde na hora: a mudança aparece antes de o servidor responder, a fila manda
// uma ação por vez e o board é relido uma vez só, quando a fila esvazia. Aqui o mock segura
// cada resposta da pcp-acao até o teste soltar.

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const ACAO = 'http://api.test/pcp-acao';
const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };
const V_PED = '2026-10-06T09:00:00.000Z';

type Board = typeof base & { dealsEditaveis?: string[] };
type Corpo = Record<string, unknown>;
interface Mock {
  bodies: Corpo[];
  board: Board;
  boardGets: () => number;
  soltar: () => void; // responde a ação mais antiga que está segura
}
interface Opcoes {
  ajustar?: (b: Board) => void;
  aoAgir?: (b: Board, corpo: Corpo) => void;
  resposta?: (corpo: Corpo) => { status: number; json: unknown } | undefined;
}

function pedido(id: string, etapa: string) {
  return {
    id, pai: '', etapa, origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-12', responsavel: 'Maria',
    criadoEm: '2026-10-05', baixadoEm: '', versao: V_PED, finalizado: false,
    itens: [{ itemId: 'a2', dealId: '700001', os: '90001', nome: 'TAG CUIDADOS PADRÃO', un: 'UN', qtd: 26, fornecedor: '' }]
  };
}
const comPedido = (etapa: string) => (b: Board) => {
  b.pedidos = [pedido('PED-0042', etapa)] as never;
  b.caixas[0].itens[1].pedidoId = 'PED-0042';
};

async function preparar(page: Page, hash: string, opts: Opcoes = {}): Promise<Mock> {
  let gets = 0;
  const seguras: (() => void)[] = [];
  const mock: Mock = {
    bodies: [], board: structuredClone(base) as Board, boardGets: () => gets,
    soltar: () => seguras.shift()?.()
  };
  opts.ajustar?.(mock.board);
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.route(BOARD, (r) => { gets++; return r.fulfill({ json: mock.board }); });
  await page.route(ACAO, async (r) => {
    const corpo = r.request().postDataJSON() as Corpo;
    mock.bodies.push(corpo);
    await new Promise<void>((ok) => seguras.push(ok));
    const res = opts.resposta?.(corpo) ?? {
      status: 200,
      json: { ok: true, versao: `v${mock.bodies.length + 1}`, historico: null, historicos: [], pedidoId: 'PED-0042' }
    };
    if (res.status === 200) opts.aoAgir?.(mock.board, corpo);
    return r.fulfill({ status: res.status, json: res.json });
  });
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
  return mock;
}

const aviso = (page: Page, texto: string | RegExp) => page.getByRole('status').filter({ hasText: texto });
const card = (page: Page, coluna: string) => page.getByRole('region', { name: coluna }).getByRole('article', { name: 'Pedido PED-0042' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00'));
});

test('mover um pedido: o card vai para a coluna nova antes de o servidor responder', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: comPedido('a_pedir'),
    aoAgir: (b) => { b.pedidos[0].etapa = 'solicitado'; b.pedidos[0].versao = 'v2'; }
  });
  await page.getByRole('region', { name: 'A pedir' }).getByRole('button', { name: 'Pedido PED-0042' }).dragTo(page.getByRole('region', { name: 'Solicitado' }));
  await expect(card(page, 'Solicitado')).toBeVisible();
  await expect(card(page, 'A pedir')).toHaveCount(0);
  await expect(page.getByText('Salvando…')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'mover_pedido', pedidoId: 'PED-0042', versao: V_PED, etapa: 'solicitado' }]);
  await expect(aviso(page, 'PED-0042 movido para Solicitado')).toHaveCount(0);

  mock.soltar();
  await expect(aviso(page, 'PED-0042 movido para Solicitado')).toBeVisible();
  await expect(page.getByText('Salvando…')).toHaveCount(0);
  await expect(card(page, 'Solicitado')).toBeVisible();
});

test('dois movimentos seguidos: um por vez, o segundo com a versão nova, e o board relido uma vez', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  const mock = await preparar(page, '#pedidos', {
    ajustar: comPedido('a_pedir'),
    aoAgir: (b, corpo) => { b.pedidos[0].etapa = corpo.etapa as string; b.pedidos[0].versao = `v${mock.bodies.length + 1}`; }
  });
  await expect.poll(() => mock.boardGets()).toBe(1);
  await page.getByRole('region', { name: 'A pedir' }).getByRole('button', { name: 'Pedido PED-0042' }).dragTo(page.getByRole('region', { name: 'Solicitado' }));
  // o card já está em Solicitado: dá para arrastar de novo sem esperar o servidor
  await page.getByRole('region', { name: 'Solicitado' }).getByRole('button', { name: 'Pedido PED-0042' }).dragTo(page.getByRole('region', { name: 'Aguardando entrega' }));
  await expect(card(page, 'Aguardando entrega')).toBeVisible();
  expect(mock.bodies).toHaveLength(1); // o segundo espera na fila

  mock.soltar();
  await expect.poll(() => mock.bodies.length).toBe(2);
  expect(mock.bodies[1]).toEqual({ tipo: 'mover_pedido', pedidoId: 'PED-0042', versao: 'v2', etapa: 'aguardando' });
  expect(mock.boardGets()).toBe(1); // nada de recarga entre uma ação e outra
  await expect(card(page, 'Aguardando entrega')).toBeVisible();

  mock.soltar();
  await expect(aviso(page, 'PED-0042 movido para Aguardando entrega')).toBeVisible();
  await expect.poll(() => mock.boardGets()).toBe(2);
  await expect(page.getByText('Salvando…')).toHaveCount(0);
  await expect(card(page, 'Aguardando entrega')).toBeVisible();
  await page.waitForTimeout(300);
  expect(mock.boardGets()).toBe(2);
});

test('recusa do servidor desfaz a mudança: o card volta e aparece o aviso', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: comPedido('a_pedir'),
    resposta: () => ({ status: 500, json: { erro: 'Erro interno.' } })
  });
  await page.getByRole('region', { name: 'A pedir' }).getByRole('button', { name: 'Pedido PED-0042' }).dragTo(page.getByRole('region', { name: 'Solicitado' }));
  await expect(card(page, 'Solicitado')).toBeVisible();
  mock.soltar();
  await expect(aviso(page, 'Não foi possível salvar. Tente de novo.')).toBeVisible();
  await expect(card(page, 'A pedir')).toBeVisible();
  await expect(card(page, 'Solicitado')).toHaveCount(0);
  await expect(page.getByText('Salvando…')).toHaveCount(0);
});

test('a recarga do minuto não apaga o que ainda está na fila', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', { ajustar: comPedido('a_pedir') });
  await page.getByRole('region', { name: 'A pedir' }).getByRole('button', { name: 'Pedido PED-0042' }).dragTo(page.getByRole('region', { name: 'Solicitado' }));
  await expect(card(page, 'Solicitado')).toBeVisible();
  // a volta para a aba relê o board (ainda sem a ação, que não foi confirmada)
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => mock.boardGets()).toBe(2);
  await page.waitForTimeout(200);
  await expect(card(page, 'Solicitado')).toBeVisible();
  mock.soltar();
  await expect(aviso(page, 'PED-0042 movido para Solicitado')).toBeVisible();
});

test('baixa: o resta novo aparece na hora e o campo libera para a próxima', async ({ page }) => {
  const mock = await preparar(page, '');
  await page.getByRole('button', { name: 'OS 90001' }).click();
  const painel = page.getByRole('complementary', { name: 'Caixa da OS 90001' });
  const item = painel.getByRole('listitem').filter({ hasText: 'TAG CUIDADOS PADRÃO' }).first();
  await item.getByLabel('Chegou (UN)').fill('10');
  await item.getByRole('button', { name: 'Registrar baixa' }).click();
  await expect(item).toContainText('baixado 10 · resta 16 UN');
  await expect(item.getByLabel('Chegou (UN)')).toHaveValue('');
  expect(mock.bodies).toEqual([{ tipo: 'baixa', dealId: '700001', itemId: 'a2', valor: 10, versao: '' }]);
  mock.soltar();
  await expect(aviso(page, /Baixa registrada · 10 UN/)).toBeVisible();
});

test('gerar pedido: a janela fecha na hora e o pedido entra como "salvando…"', async ({ page }) => {
  const mock = await preparar(page, '#pedidos');
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await faltas.getByRole('checkbox', { name: /TAG CUIDADOS PADRÃO/ }).check();
  await page.getByRole('button', { name: 'Gerar pedido' }).click();
  await page.getByRole('dialog', { name: 'Gerar pedido' }).getByRole('button', { name: 'Confirmar e gerar' }).click();
  await expect(page.getByRole('dialog', { name: 'Gerar pedido' })).toHaveCount(0);
  const novo = page.getByRole('region', { name: 'A pedir' }).getByRole('article', { name: 'Pedido Novo pedido' });
  await expect(novo).toContainText('salvando…');
  await expect(novo.getByRole('button', { name: 'Pedido Novo pedido' })).toBeDisabled();
  await expect(faltas.getByRole('checkbox', { name: /TAG CUIDADOS PADRÃO/ })).toHaveCount(0);
  expect(mock.bodies).toHaveLength(1);
  mock.soltar();
  await expect(aviso(page, /PED-0042 gerado · 1 item/)).toBeVisible();
});
