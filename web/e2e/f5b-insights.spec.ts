import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// F5b · Insights do dia: faixa abaixo da navbar, em todas as telas. Hoje = 07/10/2026 (São Paulo).
const SESSAO = { token: 'f'.repeat(64), nome: 'Pessoa PCP', perfil: 'PCP', expiraEm: '2099-01-01T00:00:00.000Z' };

const prod = (o: Record<string, unknown>) => ({
  dealId: '710001', os: '91001', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '2026-10-01', dataCombinada: '2026-10-20',
  leadTime: '', pecas: 50, valorCorte: null, cliente: 'CLIENTE MODELO', peca: 'PECA TESTE', referencia: 'REF-X', versao: 'v1',
  faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [], ...o
});
const cobranca = { id: 'M9', quando: '2026-10-05T12:00:00.000Z', participanteNome: 'Pessoa PCP', direcao: 'ENVIADA', texto: 'Olá. Segue no prazo?',
  associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO' };
const PRODUCAO = [
  prod({ dealId: '710001', os: '91001', peca: 'COLETE VENCIDO', dataCombinada: '2026-10-04' }),
  prod({ dealId: '710002', os: '91002', peca: 'CALCA PERTO', oficinaId: 'OF-2', oficina: 'OFICINA OUTRA', dataCombinada: '2026-10-09', mensagens: [cobranca] }),
  prod({ dealId: '710003', os: '91003', peca: 'CAMISA LONGE', oficinaId: 'OF-2', oficina: 'OFICINA OUTRA', dataCombinada: '2026-10-30' }),
  prod({ dealId: '710004', os: '91004', peca: 'BLUSA PREVISTA', prevista: true, dataCombinada: '2026-10-01' })
];
// Caixa 90001 registrada em 01/10 (6 dias): fica fora; uma caixa a mais, de 20/09, entra.
const PARADA = { ...base.caixas[1], id: '700009', dealId: '700009', os: '90009', registradoEm: '2026-09-20' };

async function entrar(page: Page, hash = '') {
  await page.route('http://api.test/pcp-login', (r) => r.fulfill({ json: SESSAO }));
  await page.route('http://api.test/pcp-board', (r) => r.fulfill({ json: { ...base, caixas: [...base.caixas, PARADA], producao: PRODUCAO,
    oficinas: [{ ploomesId: 'OF-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO' }, { ploomesId: 'OF-2', nome: 'OFICINA OUTRA', grupoConfigurado: true, grupoNome: 'GRUPO 2' }] } }));
  await page.route(/^http:\/\/api\.test\/pcp-peca\?/, (r) => r.fulfill({ status: 404, json: { erro: 'Nenhuma OS encontrada no Ploomes.' } }));
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

const faixa = (page: Page) => page.getByRole('region', { name: 'Insights do dia' });
const cartao = (page: Page, nome: string) => faixa(page).getByRole('group', { name: nome });

test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00')));

test('recolhida por padrão com o resumo; abre, mostra os 4 cartões e fica lembrada', async ({ page }) => {
  await entrar(page);
  await expect(faixa(page)).toContainText('2 prazos estourando · 1 caixa parada · 1 oficina com atraso · 1 cobrança sem resposta');
  await expect(cartao(page, 'Prazo estourando')).toHaveCount(0);
  await faixa(page).getByRole('button', { name: 'Ver insights do dia' }).click();
  await expect(cartao(page, 'Prazo estourando')).toContainText('91001');
  await expect(cartao(page, 'Prazo estourando')).toContainText('COLETE VENCIDO · OFICINA MODELO · venceu há 3 dias');
  await expect(cartao(page, 'Prazo estourando')).toContainText('vence em 2 dias');
  await expect(cartao(page, 'Prazo estourando')).not.toContainText('91003');
  await expect(cartao(page, 'Prazo estourando')).not.toContainText('91004');
  await expect(cartao(page, 'Caixas paradas')).toContainText('90009');
  await expect(cartao(page, 'Caixas paradas')).toContainText('Costura · parada há 17 dias · 1 item em aberto');
  await expect(cartao(page, 'Caixas paradas')).not.toContainText('90001');
  await expect(cartao(page, 'Oficinas com mais atraso')).toContainText('OFICINA MODELO');
  await expect(cartao(page, 'Oficinas com mais atraso')).toContainText('1 OS atrasada · 3 dias somados');
  await expect(cartao(page, 'Cobrança sem resposta')).toContainText('CALCA PERTO · OFICINA OUTRA · sem resposta há 2 dias');

  await page.reload();
  await expect(cartao(page, 'Prazo estourando')).toBeVisible();
  await faixa(page).getByRole('button', { name: 'Recolher insights do dia' }).click();
  await expect(cartao(page, 'Prazo estourando')).toHaveCount(0);
  await page.reload();
  await expect(faixa(page)).toContainText('2 prazos estourando');
  await expect(cartao(page, 'Prazo estourando')).toHaveCount(0);
});

test('aparece em todas as telas', async ({ page }) => {
  await entrar(page);
  for (const guia of ['Saídas com falta', 'Solicitações de faltas', 'Controle de produção', 'Visão das peças']) {
    await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: guia }).click();
    await expect(faixa(page)).toContainText('2 prazos estourando');
  }
});

test('linha leva à Visão da peça da OS', async ({ page }) => {
  await entrar(page);
  await faixa(page).getByRole('button', { name: 'Ver insights do dia' }).click();
  await cartao(page, 'Cobrança sem resposta').getByRole('link', { name: /91002/ }).click();
  await expect(page).toHaveURL(/#peca\/91002$/);
  await expect(page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Visão das peças' })).toHaveAttribute('aria-current', 'page');
});

test('cartão de oficina abre o Controle de produção filtrado', async ({ page }) => {
  await entrar(page);
  await faixa(page).getByRole('button', { name: 'Ver insights do dia' }).click();
  await cartao(page, 'Oficinas com mais atraso').getByRole('button', { name: /OFICINA MODELO/ }).click();
  await expect(page).toHaveURL(/#producao$/);
  await expect(page.locator('.producao-filtros').getByLabel('Oficina')).toHaveValue('OF-1');
  await expect(page.getByRole('button', { name: /OS 91001/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /OS 91002/ })).toHaveCount(0);
});

test('com a produção já aberta, o cartão de oficina troca o filtro e limpa os outros', async ({ page }) => {
  await entrar(page, '#producao');
  const filtros = page.locator('.producao-filtros');
  await filtros.getByLabel('Oficina').selectOption('OF-2');
  await filtros.getByLabel('Situação do prazo').selectOption('NO_PRAZO');
  await faixa(page).getByRole('button', { name: 'Ver insights do dia' }).click();
  await cartao(page, 'Oficinas com mais atraso').getByRole('button', { name: /OFICINA MODELO/ }).click();
  await expect(filtros.getByLabel('Oficina')).toHaveValue('OF-1');
  await expect(filtros.getByLabel('Situação do prazo')).toHaveValue('');
  await expect(page.getByRole('button', { name: /OS 91001/ }).first()).toBeVisible();
});

test('"ver todas" expande o cartão além de 5 linhas', async ({ page }) => {
  const muitas = Array.from({ length: 7 }, (_, i) => prod({ dealId: `72000${i}`, os: `9200${i}`, dataCombinada: '2026-10-05' }));
  await page.route('http://api.test/pcp-board', (r) => r.fulfill({ json: { ...base, producao: muitas } }));
  await page.route('http://api.test/pcp-login', (r) => r.fulfill({ json: SESSAO }));
  await page.goto('./');
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await faixa(page).getByRole('button', { name: 'Ver insights do dia' }).click();
  await expect(cartao(page, 'Prazo estourando').getByRole('link')).toHaveCount(5);
  await cartao(page, 'Prazo estourando').getByRole('button', { name: 'ver todas (7)' }).click();
  await expect(cartao(page, 'Prazo estourando').getByRole('link')).toHaveCount(7);
});

test('375 px: cartões empilhados, sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page);
  await faixa(page).getByRole('button', { name: 'Ver insights do dia' }).click();
  await expect(cartao(page, 'Cobrança sem resposta')).toBeAttached();
  const larguras = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, faixa: document.querySelector('.insights')!.scrollWidth }));
  expect(larguras.doc).toBeLessThanOrEqual(375);
  expect(larguras.faixa).toBeLessThanOrEqual(375);
  const a = (await cartao(page, 'Prazo estourando').boundingBox())!;
  const b = (await cartao(page, 'Caixas paradas').boundingBox())!;
  expect(b.y).toBeGreaterThan(a.y);
  expect(a.x + a.width).toBeLessThanOrEqual(375);
});
