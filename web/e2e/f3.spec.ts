import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const ACAO = 'http://api.test/pcp-acao';
const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };
const V_PED = '2026-10-06T09:00:00.000Z';

type Board = typeof base & { dealsEditaveis?: string[] };
type Corpo = Record<string, unknown>;
interface Mock { bodies: Corpo[]; board: Board }
interface Opcoes {
  ajustar?: (b: Board) => void;
  aoAgir?: (b: Board, corpo: Corpo) => void;
  resposta?: (corpo: Corpo) => { status: number; json: unknown } | undefined;
}

function pedido(id: string, etapa: string, itens: { itemId: string; dealId: string; os: string; nome: string; un: string; qtd: number }[], extra: Corpo = {}) {
  return {
    id, pai: '', etapa, origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-12', responsavel: 'Maria',
    criadoEm: '2026-10-05', baixadoEm: '', versao: V_PED, finalizado: false,
    itens: itens.map((i) => ({ ...i, fornecedor: '' })), ...extra
  };
}
const PED_TAG = [{ itemId: 'a2', dealId: '700001', os: '90001', nome: 'TAG CUIDADOS PADRÃO', un: 'UN', qtd: 26 }];

async function preparar(page: Page, hash: string, opts: Opcoes = {}): Promise<Mock> {
  const mock: Mock = { bodies: [], board: structuredClone(base) as Board };
  opts.ajustar?.(mock.board);
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.route(BOARD, (r) => r.fulfill({ json: mock.board }));
  await page.route(ACAO, (r) => {
    const corpo = r.request().postDataJSON() as Corpo;
    mock.bodies.push(corpo);
    const res = opts.resposta?.(corpo) ?? {
      status: 200,
      json: { ok: true, versao: 'v2', historico: { quando: '2026-10-07T12:00:00.000Z', usuario: 'Lucca', texto: 'alteração', ploomes: 'PENDENTE' }, pedidoId: 'PED-0001' }
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

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00'));
});

test('gerar pedido com 2 itens de OS diferentes envia o corpo certo', async ({ page }) => {
  const mock = await preparar(page, '#pedidos');
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await faltas.getByRole('checkbox', { name: /TAG CUIDADOS PADRÃO/ }).check();
  await faltas.getByRole('checkbox', { name: /ZÍPER METAL/ }).check();
  await expect(faltas).toContainText('2 selecionados');
  await page.getByRole('button', { name: 'Gerar pedido' }).click();
  const janela = page.getByRole('dialog', { name: 'Gerar pedido' });
  await janela.getByLabel('Quantidade (UN) de TAG CUIDADOS PADRÃO').fill('20');
  await janela.getByLabel('Fornecedor do item ZÍPER METAL MÉDIO FIXO CA 18CM').fill('ZIPERES GAMA');
  await janela.getByLabel('Solicitar a').selectOption('FORNECEDOR');
  await janela.getByLabel('Fornecedor', { exact: true }).fill('TECIDOS BETA');
  await janela.getByLabel('Local de entrega').selectOption('SAO_PAULO');
  await janela.getByLabel('Previsão de entrega').fill('2026-10-20');
  await janela.getByLabel('Responsável').selectOption('Maria');
  await janela.getByRole('button', { name: 'Confirmar e gerar' }).click();
  await expect(aviso(page, /PED-0001 gerado · 2 itens · registrado em 2 OS no Ploomes/)).toBeVisible();
  await expect(janela).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Faltas sem pedido' })).toBeFocused();
  expect(mock.bodies).toHaveLength(1);
  const corpo = mock.bodies[0] as { itens: Corpo[] } & Corpo;
  expect(corpo).toMatchObject({ tipo: 'gerar_pedido', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'SAO_PAULO', previsao: '2026-10-20', responsavel: 'Maria' });
  expect(corpo.itens).toHaveLength(2);
  expect(corpo.itens).toEqual(expect.arrayContaining([
    { itemId: 'a2', dealId: '700001', qtd: 20, fornecedor: '' },
    { itemId: 'b1', dealId: '700002', qtd: 52, fornecedor: 'ZIPERES GAMA' }
  ]));
});

test('mover um pedido por arraste envia mover_pedido', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'a_pedir', PED_TAG)] as never; b.caixas[0].itens[1].pedidoId = 'PED-0042'; },
    aoAgir: (b) => { b.pedidos[0].etapa = 'solicitado'; b.pedidos[0].versao = 'v2'; }
  });
  const origem = page.getByRole('region', { name: 'A pedir' }).getByRole('button', { name: 'Pedido PED-0042' });
  await origem.dragTo(page.getByRole('region', { name: 'Solicitado' }));
  await expect(aviso(page, 'PED-0042 movido para Solicitado')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'mover_pedido', pedidoId: 'PED-0042', versao: V_PED, etapa: 'solicitado' }]);
  await expect(page.getByRole('region', { name: 'Solicitado' }).getByRole('button', { name: 'Pedido PED-0042' })).toBeVisible();
});

test('dar baixa nas caixas só aparece na última etapa e envia baixar_pedido', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'a_pedir', PED_TAG), pedido('PED-0043', 'entregue', PED_TAG.map((i) => ({ ...i, itemId: 'a1', nome: 'LINHA 120 RESISTENTE 335', un: 'cones', qtd: 2 })))] as never; },
    aoAgir: (b) => { b.pedidos[1].baixadoEm = '2026-10-07'; b.pedidos[1].finalizado = true; b.pedidos[1].versao = 'v2'; }
  });
  await expect(page.getByRole('button', { name: 'Dar baixa nas caixas' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'A pedir' }).getByRole('button', { name: 'Dar baixa nas caixas' })).toHaveCount(0);
  const entregue = page.getByRole('region', { name: 'Entregue' });
  await entregue.getByRole('button', { name: 'Dar baixa nas caixas' }).click();
  const confirmacao = entregue.getByRole('group', { name: 'Confirmar baixa do PED-0043' });
  await expect(confirmacao).toContainText('Dar baixa de 1 item em 1 OS? A baixa não pode ser desfeita.');
  await expect(confirmacao.getByRole('button', { name: 'Confirmar baixa' })).toBeFocused();
  await confirmacao.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmacao).toHaveCount(0);
  await expect(entregue.getByRole('button', { name: 'Dar baixa nas caixas' })).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'Pedido PED-0043' })).toHaveCount(0); // a baixa não abre o painel
  expect(mock.bodies).toHaveLength(0);
  await entregue.getByRole('button', { name: 'Dar baixa nas caixas' }).click();
  await confirmacao.getByRole('button', { name: 'Confirmar baixa' }).click();
  await expect(aviso(page, 'Baixa do PED-0043 registrada')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'baixar_pedido', pedidoId: 'PED-0043', versao: V_PED }]);
  await expect(page.getByRole('button', { name: 'Dar baixa nas caixas' })).toHaveCount(0);
});

const VIES = { itemId: 'c1', dealId: '700003', os: '90003', nome: 'VIES LINEAR 6 CM', un: 'MT', qtd: 450 };
// Caixa 90003 (saiu com falta) com o VIÉS no PED-0042 na etapa dada.
function vies(b: Board, etapa: string) {
  b.pedidos = [pedido('PED-0042', etapa, [VIES])] as never;
  b.caixas[2].itens[0].pedidoId = 'PED-0042';
}
const nomesDasColunas = (page: Page) => page.locator('.coluna__nome').allInnerTexts();

test('Saídas: colunas seguem as etapas de Solicitações; Sem pedido só com caixa sem pedido', async ({ page }) => {
  await preparar(page, '#saidas');
  await expect(page.getByRole('region', { name: 'Sem pedido' }).getByRole('button', { name: 'OS 90003' })).toBeVisible();
  expect(await nomesDasColunas(page)).toEqual(['Sem pedido', 'A pedir', 'Solicitado', 'Aguardando entrega', 'Entregue', 'Enviado à oficina', 'Resolvido']);
});

test('Saídas: caixa na etapa do pedido mais atrasado; enviar à oficina escondido até a última etapa', async ({ page }) => {
  await preparar(page, '#saidas', {
    ajustar: (b) => {
      b.pedidos = [pedido('PED-0042', 'solicitado', [VIES]), pedido('PED-0043', 'entregue', [{ ...VIES, itemId: 'c2', nome: 'LINHA 120', un: 'cones', qtd: 4 }])] as never;
      const c = b.caixas[2];
      c.itens[0].pedidoId = 'PED-0042';
      c.itens.push({ ...c.itens[0], id: 'c2', nome: 'LINHA 120', un: 'cones', pedidoId: 'PED-0043' });
    }
  });
  expect(await nomesDasColunas(page)).toEqual(['A pedir', 'Solicitado', 'Aguardando entrega', 'Entregue', 'Enviado à oficina', 'Resolvido']);
  const card = page.getByRole('region', { name: 'Solicitado' }).getByRole('button', { name: 'OS 90003' });
  await expect(card).toContainText('PED-0042 · Solicitado');
  await expect(card).toContainText('PED-0043 · Entregue');
  await expect(card).toContainText('pedidos em etapas diferentes');
  await card.click();
  const painel = page.getByRole('complementary', { name: 'Caixa da OS 90003' });
  await expect(painel.getByRole('button', { name: 'Enviar à oficina' })).toHaveCount(0);
  await expect(painel).toContainText('Para enviar à oficina, todo o material precisa estar na última etapa (Entregue).');
});

test('Saídas: enviar à oficina recusado pelo servidor mostra a mensagem dele', async ({ page }) => {
  const mock = await preparar(page, '#saidas', {
    ajustar: (b) => vies(b, 'entregue'),
    resposta: () => ({ status: 409, json: { erro: 'O material desta caixa ainda não chegou (etapa Entregue).' } })
  });
  await page.getByRole('region', { name: 'Entregue' }).getByRole('button', { name: 'OS 90003' }).click();
  await page.getByRole('complementary', { name: 'Caixa da OS 90003' }).getByRole('button', { name: 'Enviar à oficina' }).click();
  await expect(aviso(page, 'O material desta caixa ainda não chegou (etapa Entregue).')).toBeVisible();
  expect(mock.bodies).toHaveLength(1);
});

test('Saídas: enviar à oficina e depois confirmar que a oficina recebeu', async ({ page }) => {
  const mock = await preparar(page, '#saidas', {
    ajustar: (b) => vies(b, 'entregue'),
    aoAgir: (b, corpo) => {
      const c = b.caixas[2] as Corpo & { tratativa: string; versao: string; itens: { resta: number; falta: number; baixada: number; status: string }[] };
      c.versao = 'v2';
      if (corpo.tipo === 'enviar_oficina') c.tratativa = 'ENVIADO';
      else { c.tratativa = 'RECEBIDO'; c.itens[0].resta = 0; c.itens[0].baixada = c.itens[0].falta; c.itens[0].status = 'RESOLVIDO'; }
    }
  });
  await page.getByRole('region', { name: 'Entregue' }).getByRole('button', { name: 'OS 90003' }).click();
  const painel = page.getByRole('complementary', { name: 'Caixa da OS 90003' });
  await expect(painel.getByRole('button', { name: 'Enviar à oficina' })).toHaveClass(/botao--signal/);
  await painel.getByRole('button', { name: 'Enviar à oficina' }).click();
  await expect(aviso(page, 'Caixa enviada à oficina')).toBeVisible();
  expect(mock.bodies[0]).toEqual({ tipo: 'enviar_oficina', dealId: '700003', versao: '2026-10-06T09:00:00.000Z' });
  await expect(page.getByRole('region', { name: 'Enviado à oficina' }).getByRole('button', { name: 'OS 90003' })).toBeVisible();

  await painel.getByRole('button', { name: 'Oficina recebeu' }).click();
  const confirmacao = painel.getByRole('group', { name: 'Confirmar recebimento da oficina' });
  await expect(confirmacao).toContainText('A oficina recebeu o material? Isso dá baixa total no item aberto desta caixa.');
  expect(mock.bodies).toHaveLength(1); // a confirmação fica dentro do painel e ainda não gravou
  await confirmacao.getByRole('button', { name: 'Confirmar recebimento' }).click();
  await expect(aviso(page, 'Recebimento da oficina registrado')).toBeVisible();
  expect(mock.bodies[1]).toEqual({ tipo: 'oficina_recebeu', dealId: '700003', versao: 'v2' });
  await expect(page.getByRole('region', { name: 'Resolvido' }).getByRole('button', { name: 'OS 90003' })).toBeVisible();
});

test('Etapas: renomear e adicionar enviam salvar_etapas com os ids existentes', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    aoAgir: (b) => { b.etapasPedido = [{ id: 'a_pedir', nome: 'Compras', ordem: 1 }, ...b.etapasPedido.slice(1), { id: 'em_transito', nome: 'Em trânsito', ordem: 5 }]; }
  });
  await page.getByRole('button', { name: 'Etapas do quadro' }).click();
  const janela = page.getByRole('dialog', { name: 'Etapas do quadro' });
  await janela.getByRole('textbox', { name: 'Nome da etapa 1' }).fill('Compras');
  await janela.getByRole('button', { name: '+ Adicionar etapa' }).click();
  await janela.getByRole('textbox', { name: 'Nome da etapa 5' }).fill('Em trânsito');
  await janela.getByRole('button', { name: 'Salvar etapas' }).click();
  await expect(aviso(page, 'Etapas do quadro salvas')).toBeVisible();
  expect(mock.bodies).toEqual([{
    tipo: 'salvar_etapas',
    etapas: [{ id: 'a_pedir', nome: 'Compras' }, { id: 'solicitado', nome: 'Solicitado' }, { id: 'aguardando', nome: 'Aguardando entrega' }, { id: 'entregue', nome: 'Entregue' }, { nome: 'Em trânsito' }]
  }]);
  await expect(page.getByRole('region', { name: 'Em trânsito' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Compras' })).toBeVisible();
});

test('Etapas: etapa com pedido aberto não pode ser removida e o mínimo é 2', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'solicitado', PED_TAG)] as never; b.caixas[0].itens[1].pedidoId = 'PED-0042'; }
  });
  await page.getByRole('button', { name: 'Etapas do quadro' }).click();
  const janela = page.getByRole('dialog', { name: 'Etapas do quadro' });
  await expect(janela.getByRole('button', { name: 'Remover etapa Solicitado' })).toBeDisabled();
  await expect(janela).toContainText('Tem 1 pedido aberto nesta etapa');
  await janela.getByRole('button', { name: 'Remover etapa A pedir' }).click();
  await janela.getByRole('button', { name: 'Remover etapa Entregue' }).click();
  await expect(janela.getByRole('button', { name: 'Remover etapa Aguardando entrega' })).toBeDisabled();
  await expect(janela.getByRole('button', { name: 'Remover etapa Solicitado' })).toBeDisabled();
  await expect(janela.getByRole('button', { name: 'Remover etapa Aguardando entrega' })).toHaveAttribute('title', 'O quadro precisa de pelo menos 2 etapas');
  expect(mock.bodies).toHaveLength(0);
});

test('caixa fora de dealsEditaveis: Saídas sem botões e pedido que não arrasta nem edita', async ({ page }) => {
  await preparar(page, '#saidas', {
    ajustar: (b) => {
      b.dealsEditaveis = ['700001'];
      b.pedidos = [pedido('PED-0042', 'a_pedir', [{ itemId: 'c1', dealId: '700003', os: '90003', nome: 'VIES LINEAR 6 CM', un: 'MT', qtd: 450 }])] as never;
      b.caixas[2].itens[0].pedidoId = 'PED-0042';
    }
  });
  await page.getByRole('button', { name: 'OS 90003' }).click();
  const painel = page.getByRole('complementary', { name: 'Caixa da OS 90003' });
  await expect(painel.getByText('Edição liberada em breve para esta caixa.')).toBeVisible();
  await expect(painel.getByRole('button', { name: 'Enviar à oficina' })).toHaveCount(0);
  await expect(painel.getByRole('button', { name: 'Oficina recebeu' })).toHaveCount(0);
  await expect(painel.getByRole('button', { name: 'Selecionar para pedido' })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Solicitações de faltas' }).click();
  await expect(page.getByRole('article', { name: 'Pedido PED-0042' })).toHaveAttribute('draggable', 'false');
  await page.getByRole('button', { name: 'Pedido PED-0042' }).click();
  const pedidoPainel = page.getByRole('complementary', { name: 'Pedido PED-0042' });
  await expect(pedidoPainel.getByText('Edição liberada em breve para esta caixa.')).toBeVisible();
  await expect(pedidoPainel.getByRole('button', { name: /Salvar alterações|Nada alterado/ })).toHaveCount(0);
});

test('gerar pedido recusado com 409: mostra a mensagem do servidor, tira o item que entrou em outro pedido e permite remover', async ({ page }) => {
  let tentativas = 0;
  const box: { mock?: Mock } = {};
  box.mock = await preparar(page, '#pedidos', {
    resposta: () => {
      if (tentativas++ > 0) return undefined;
      const b = box.mock!.board;
      b.caixas[1].itens[0].pedidoId = 'PED-0003';
      b.pedidos = [pedido('PED-0003', 'solicitado', [{ itemId: 'b1', dealId: '700002', os: '90002', nome: 'ZÍPER METAL MÉDIO FIXO CA 18CM', un: 'UN', qtd: 52 }])] as never;
      return { status: 409, json: { erro: 'Item já está no PED-0003.' } };
    }
  });
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await faltas.getByRole('checkbox', { name: 'Todos os itens da OS 90001' }).check();
  await faltas.getByRole('checkbox', { name: /ZÍPER METAL/ }).check();
  await page.getByRole('button', { name: 'Gerar pedido' }).click();
  const janela = page.getByRole('dialog', { name: 'Gerar pedido' });
  await janela.getByRole('button', { name: 'Confirmar e gerar' }).click();
  await expect(aviso(page, 'Item já está no PED-0003.')).toBeVisible();
  await expect(janela).toContainText('1 item saiu da lista porque já está em pedido ou foi resolvido.');
  await expect(janela.getByLabel('Quantidade (UN) de ZÍPER METAL MÉDIO FIXO CA 18CM')).toHaveCount(0);
  await janela.getByRole('button', { name: 'Remover LINHA 120 RESISTENTE 335 da lista' }).click();
  await expect(janela.getByLabel(/Quantidade .* de LINHA 120/)).toHaveCount(0);
  await expect(janela).toContainText('1 item saiu da lista'); // o removido à mão não entra na nota
  await janela.getByRole('button', { name: 'Confirmar e gerar' }).click();
  await expect(janela).toHaveCount(0);
  const { bodies } = box.mock!;
  expect(bodies).toHaveLength(2);
  expect((bodies[1] as { itens: Corpo[] }).itens).toEqual([{ itemId: 'a2', dealId: '700001', qtd: 26, fornecedor: '' }]);
});

test('contagem de Faltas sem pedido conta os marcados fora da busca', async ({ page }) => {
  await preparar(page, '#pedidos');
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await faltas.getByRole('checkbox', { name: /TAG CUIDADOS PADRÃO/ }).check();
  await faltas.getByRole('checkbox', { name: /ZÍPER METAL/ }).check();
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('90002');
  await expect(faltas).toContainText('2 selecionados (1 fora da busca)');
});

test('pedido com etapa que saiu do quadro aparece em Outra etapa', async ({ page }) => {
  await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'conferencia', PED_TAG)] as never; b.caixas[0].itens[1].pedidoId = 'PED-0042'; }
  });
  await expect(page.getByRole('region', { name: 'Outra etapa' }).getByRole('button', { name: 'Pedido PED-0042' })).toBeVisible();
});

test('abaixo de 1366px, com o painel do pedido aberto, Faltas sem pedido vira trilho', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'a_pedir', PED_TAG)] as never; b.caixas[0].itens[1].pedidoId = 'PED-0042'; }
  });
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await expect(faltas.getByRole('checkbox', { name: /ZÍPER METAL/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pedido PED-0042' }).click();
  await expect(faltas.getByRole('checkbox', { name: /ZÍPER METAL/ })).toBeHidden();
  expect((await faltas.boundingBox())!.width).toBeLessThanOrEqual(49);
  await expect(page.getByRole('region', { name: 'Solicitado' })).toBeInViewport({ ratio: 1 });
  await faltas.getByRole('button', { name: 'Mostrar faltas sem pedido' }).click();
  await expect(faltas.getByRole('checkbox', { name: /ZÍPER METAL/ })).toBeVisible();
  await faltas.getByRole('button', { name: 'Recolher' }).click();
  await expect(faltas.getByRole('checkbox', { name: /ZÍPER METAL/ })).toBeHidden();
});

const ZIPER = 'ZÍPER METAL MÉDIO FIXO CA 18CM';
const PED_DOIS = [...PED_TAG, { itemId: 'b1', dealId: '700002', os: '90002', nome: ZIPER, un: 'UN', qtd: 52 }];

test('dividir pedido com quantidade parcial cria a parte PED-xxxx.1 na etapa escolhida', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => {
      b.pedidos = [pedido('PED-0042', 'solicitado', PED_DOIS)] as never;
      b.caixas[0].itens[1].pedidoId = 'PED-0042';
      b.caixas[1].itens[0].pedidoId = 'PED-0042';
    },
    resposta: (corpo) => corpo.tipo === 'dividir_pedido'
      ? { status: 200, json: { ok: true, versao: 'v2', historico: null, historicos: [], pedidoId: 'PED-0042.1' } }
      : undefined,
    aoAgir: (b) => {
      const pai = b.pedidos[0] as unknown as { versao: string; itens: { itemId: string; qtd: number }[] };
      pai.versao = 'v2';
      pai.itens[1].qtd = 32;
      b.pedidos.push(pedido('PED-0042.1', 'aguardando', [{ ...PED_DOIS[1], qtd: 20 }], { pai: 'PED-0042', versao: 'v2' }) as never);
    }
  });
  await page.getByRole('region', { name: 'Solicitado' }).getByRole('button', { name: 'Pedido PED-0042' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0042' });
  await painel.getByRole('button', { name: 'Dividir pedido' }).click();
  const divisao = painel.getByRole('region', { name: 'Dividir PED-0042' });
  await expect(divisao.getByLabel('Mover para')).toHaveValue('aguardando');
  await expect(divisao.getByRole('button', { name: 'Confirmar divisão' })).toBeDisabled();
  await divisao.getByRole('checkbox', { name: `Chegou ${ZIPER}` }).check();
  await expect(divisao.getByLabel(`Quantidade que chegou de ${ZIPER}`)).toHaveValue('52');
  await divisao.getByLabel(`Quantidade que chegou de ${ZIPER}`).fill('20');
  await expect(divisao).toContainText(
    `PED-0042.1 vai para Aguardando entrega com: 20 UN de ${ZIPER}; o PED-0042 fica com: 26 UN de TAG CUIDADOS PADRÃO; 32 UN de ${ZIPER}`);
  await divisao.getByRole('button', { name: 'Confirmar divisão' }).click();
  await expect(aviso(page, 'PED-0042 dividido · PED-0042.1 em Aguardando entrega')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'dividir_pedido', pedidoId: 'PED-0042', versao: V_PED, etapa: 'aguardando', itens: [{ itemId: 'b1', qtd: 20 }] }]);
  const pai = page.getByRole('region', { name: 'Solicitado' }).getByRole('article', { name: 'Pedido PED-0042' });
  await expect(pai).toContainText('dividido em 1 parte');
  await expect(pai).toContainText('32 UN');
  const parte = page.getByRole('region', { name: 'Aguardando entrega' }).getByRole('article', { name: 'Pedido PED-0042.1' });
  await expect(parte).toContainText('parte de PED-0042');
  await expect(parte).toContainText('20 UN');
});

test('dividir pedido: quantidade acima da do pedido mostra o erro no painel e não envia', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'solicitado', PED_DOIS)] as never; }
  });
  await page.getByRole('button', { name: 'Pedido PED-0042' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0042' });
  await painel.getByRole('button', { name: 'Dividir pedido' }).click();
  const divisao = painel.getByRole('region', { name: 'Dividir PED-0042' });
  await divisao.getByRole('checkbox', { name: `Chegou ${ZIPER}` }).check();
  await divisao.getByLabel(`Quantidade que chegou de ${ZIPER}`).fill('60');
  await expect(divisao.getByText(`O pedido tem só 52 UN de ${ZIPER}.`)).toBeVisible();
  await expect(divisao.getByRole('button', { name: 'Confirmar divisão' })).toBeDisabled();
  await divisao.getByLabel(`Quantidade que chegou de ${ZIPER}`).fill('52');
  await divisao.getByRole('checkbox', { name: 'Chegou TAG CUIDADOS PADRÃO' }).check();
  await expect(divisao.getByText('Para mover o pedido inteiro, arraste o card.')).toBeVisible();
  await expect(divisao.getByRole('button', { name: 'Confirmar divisão' })).toBeDisabled();
  await divisao.getByRole('button', { name: 'Cancelar' }).click();
  await expect(painel.getByRole('button', { name: 'Dividir pedido' })).toBeFocused();
  expect(mock.bodies).toHaveLength(0);
});
