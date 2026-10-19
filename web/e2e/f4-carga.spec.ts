import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// Visão de futuro e carga das oficinas (19/10). Quarta, 21/10/2026: a semana atual começa em 19/10.
const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const ACAO = 'http://api.test/pcp-acao';
const sessao = (perfil: string) => ({ token: 'f'.repeat(64), nome: 'Pessoa PCP', perfil, expiraEm: '2099-01-01T00:00:00.000Z' });
const os = (o: Record<string, unknown>) => ({
  oficinaId: 'OF-1', oficina: 'OFICINA ALFA', inicioCostura: '', dataCombinada: '', leadTime: '', valorCorte: null,
  cliente: 'CLIENTE FICTICIO', referencia: 'REF', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [], ...o
});
const producao = [
  // 100 peças de 19 a 30/10 (10 dias úteis): 50 + 50.
  os({ dealId: '720001', os: '20001', peca: 'CAMISA REAL', pecas: 100, inicioCostura: '2026-10-19', dataCombinada: '2026-10-30' }),
  // 200 peças de 02 a 06/11: estoura a capacidade dessa semana.
  os({ dealId: '720002', os: '20002', peca: 'CALCA REAL', pecas: 200, inicioCostura: '2026-11-02', dataCombinada: '2026-11-06' }),
  // prevista: 60 peças em 5 dias úteis (28/10 a 03/11): 36 + 24.
  os({ dealId: '720015', os: '10015', peca: 'COLETE PREVISTO', pecas: 60, prevista: true, etapaOrdem: 15, etapaNome: '15. Preparação 1',
    etapaInicio: '2026-10-20', inicioCosturaPrevisto: '2026-10-28', fimCosturaPrevisto: '2026-11-03' }),
  // prevista sem oficina: vai para "A alocar" na semana de 26/10.
  os({ dealId: '720013', os: '10013', oficinaId: '', oficina: 'ALOCAR', peca: 'JAQUETA PREVISTA', pecas: 40, prevista: true, etapaOrdem: 13,
    etapaNome: '13. Estratégico 2', etapaInicio: '', inicioCosturaPrevisto: '2026-10-27', fimCosturaPrevisto: '2026-10-29' })
];
const oficinas = [
  { ploomesId: 'OF-2', nome: 'OFICINA BETA', grupoConfigurado: false, grupoNome: '', capacidadeSemana: null },
  { ploomesId: 'OF-1', nome: 'OFICINA ALFA', grupoConfigurado: false, grupoNome: '', capacidadeSemana: 100 }
];

async function entrar(page: Page, opcoes: { perfil?: string; acoes?: Record<string, unknown>[]; semHistorico?: boolean } = {}) {
  await page.route(LOGIN, (r) => r.fulfill({ json: sessao(opcoes.perfil ?? 'ADM') }));
  await page.route(ACAO, async (r) => {
    const corpo = r.request().postDataJSON();
    opcoes.acoes?.push(corpo);
    await r.fulfill({ json: { ok: true, versao: '2026-10-21T15:00:00.000Z', historico: null, historicos: [] } });
  });
  await page.route(BOARD, (r) => r.fulfill({ json: { ...base, producao, oficinas, mensagensWhatsappSemAssociacao: [],
    dealsProducaoEditaveis: ['0'], previsaoSemHistorico: !!opcoes.semHistorico } }));
  await page.goto('./#producao');
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-21T12:00:00-03:00')));

const celula = (page: Page, nome: string) => page.getByRole('button', { name: nome, exact: true });

test('Carga: oficinas por semana com cor da capacidade, A alocar e escolha lembrada', async ({ page }) => {
  await entrar(page);
  await page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Carga' }).click();
  await expect(page.getByRole('columnheader', { name: 'Semana 19/10' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Semana 14/12' })).toBeVisible();
  await expect(page.locator('.carga__tabela tbody th strong, .carga__tabela tbody th .carga__oficina')).toHaveText(['OFICINA ALFA', 'OFICINA BETA', 'A alocar']);
  await expect(celula(page, 'OFICINA ALFA, semana 19/10: 50 / 100 peças')).toHaveClass(/carga__celula--verde/);
  await expect(celula(page, 'OFICINA ALFA, semana 26/10: 86 / 100 peças')).toHaveClass(/carga__celula--amarelo/);
  await expect(celula(page, 'OFICINA ALFA, semana 02/11: 224 / 100 peças')).toHaveClass(/carga__celula--vermelho/);
  await expect(celula(page, 'OFICINA BETA, semana 19/10: 0 peças')).toHaveClass(/carga__celula--sem_capacidade/);
  await expect(celula(page, 'A alocar, semana 26/10: 1 OS, 40 peças')).toHaveText('1 OS · 40 pç');
  // "Incluir previstas" é do Gantt e da Tabela; a Carga sempre soma as previstas.
  await expect(page.getByLabel('Incluir previstas')).toHaveCount(0);
  // Filtro geral de oficina vale aqui: só a linha dela (e A alocar).
  await page.getByRole('combobox', { name: /^Oficina/ }).selectOption('OF-2');
  await expect(page.locator('.carga__tabela tbody th strong, .carga__tabela tbody th .carga__oficina')).toHaveText(['OFICINA BETA', 'A alocar']);
  await page.reload();
  await expect(page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Carga' })).toHaveAttribute('aria-pressed', 'true');
});

test('Carga: clique na célula lista as OS (real e prevista) e abre o painel', async ({ page }) => {
  await entrar(page);
  await page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Carga' }).click();
  await celula(page, 'OFICINA ALFA, semana 26/10: 86 / 100 peças').click();
  const lista = page.getByRole('region', { name: 'OS da célula' });
  await expect(lista).toContainText('OFICINA ALFA · semana 26/10');
  await expect(lista.getByRole('listitem')).toHaveCount(2);
  await expect(lista.getByRole('listitem').nth(0)).toContainText('OS 20001');
  await expect(lista.getByRole('listitem').nth(0)).toContainText('50 pç no período');
  await expect(lista.getByRole('listitem').nth(0)).toContainText('real');
  await expect(lista.getByRole('listitem').nth(1)).toContainText('OS 10015');
  await expect(lista.getByRole('listitem').nth(1)).toContainText('36 pç no período');
  await expect(lista.getByRole('listitem').nth(1)).toContainText('prevista');
  await lista.getByRole('button', { name: /OS 10015/ }).click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 10015' });
  await expect(painel).toBeVisible();
});

test('Carga: ADM edita a capacidade pelo nome da oficina; valor inválido é recusado', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, { acoes });
  await page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Carga' }).click();
  await page.getByRole('button', { name: 'Editar capacidade de OFICINA BETA' }).click();
  const campo = page.getByLabel('Capacidade de OFICINA BETA (peças por semana)');
  await campo.fill('1,5');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('número inteiro');
  await campo.fill('300');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(celula(page, 'OFICINA BETA, semana 19/10: 0 / 300 peças')).toHaveClass(/carga__celula--verde/);
  await expect.poll(() => acoes).toEqual([{ tipo: 'alterar_capacidade_oficina', oficinaId: 'OF-2', capacidade: 300 }]);
});

test('Carga: perfil sem ADM vê a capacidade mas não edita', async ({ page }) => {
  await entrar(page, { perfil: 'PCP' });
  await page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Carga' }).click();
  await expect(page.getByText('100 pç/semana')).toBeVisible();
  await expect(page.getByRole('button', { name: /Editar capacidade/ })).toHaveCount(0);
});
