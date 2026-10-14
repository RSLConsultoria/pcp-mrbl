import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const ACAO = 'http://api.test/pcp-acao';
const SESSAO = { token: 'f'.repeat(64), nome: 'Pessoa PCP', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };
const item = {
  id: 'f1', nome: 'VIÉS TESTE', cor: '', un: 'MT', necessaria: 10, separada: 0, falta: 4, faltaG: null,
  status: 'ABERTO', baixada: 0, resta: 4, restaG: null, obsAlmox: '', obsPcp: '', previsao: '', resolvidoEm: '',
  versao: '', editavel: true, pedidoId: '', pedidoIds: []
};
const producao = [
  { dealId: '710001', os: '90001', oficinaId: '', oficina: 'ALOCAR', inicioCostura: '2026-10-01', dataCombinada: '2026-10-05', leadTime: '2026-10-08', pecas: 80, cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-A', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [] },
  { dealId: '710002', os: '90002', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '2026-10-04', dataCombinada: '2026-10-12', leadTime: '2026-10-15', pecas: 120, cliente: 'CLIENTE MODELO', peca: 'COLETE TESTE', referencia: 'REF-B', versao: 'v2', faltasCostura: [item], faltasAcabamento: [{ ...item, id: 'a1', nome: 'BOTÃO TESTE' }],
    mensagens: [
      { id: 'M-ERRO', quando: '2026-10-07T11:00:00.000Z', participanteNome: 'Pessoa PCP', direcao: 'ENVIADA', texto: '*OS 90002* Confirma a entrega?', associacao: 'MANUAL', statusEnvio: 'ERRO', tipoConteudo: 'TEXTO' },
      { id: 'M1', quando: '2026-10-07T12:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'Entregamos dia 13.', associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'TEXTO' }
    ],
    sugestoes: [{ id: 'S1', mensagemId: 'M1', tipo: 'NOVA_DATA_COMBINADA', valor: '2026-10-13', resumo: 'A oficina informou nova data.', evidencia: 'dia 13', confianca: .95, status: 'PENDENTE', criadoEm: '2026-10-07T12:01:00.000Z', versao: 'v2' }], historico: [] }
];

async function entrar(page: Page) {
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.route(ACAO, async (r) => {
    const corpo = r.request().postDataJSON();
    await r.fulfill({ json: { ok: true, versao: corpo.versao, historico: null, historicos: [], mensagemId: corpo.tipo === 'reenviar_whatsapp' ? 'M-REENVIO' : undefined } });
  });
  await page.route(BOARD, (r) => r.fulfill({ json: { ...base, producao, oficinas: [{ ploomesId: 'OF-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO MODELO' }],
    mensagensWhatsappSemAssociacao: [{ id: 'M2', quando: '2026-10-07T13:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'As duas ficam prontas amanhã.', associacao: 'SEM_ASSOCIACAO', statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', grupoNome: 'GRUPO MODELO' }],
    dealsProducaoEditaveis: ['710002'] } }));
  await page.goto('./#producao');
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00')));

test('Gantt mostra ALOCAR, prazo vencido, indicadores e filtro por falta', async ({ page }) => {
  await entrar(page);
  await expect(page).toHaveURL(/#producao$/);
  await expect(page.getByText('ALOCAR', { exact: true })).toBeVisible();
  await expect(page.getByText('Passaram do prazo').locator('..')).toContainText('1');
  await page.getByLabel('Só com falta na costura').check();
  await expect(page.getByRole('button', { name: /OS 90002/ })).toBeVisible();
  await expect(page.getByLabel('Aviamentos faltando: 1 na costura e 1 no acabamento').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /OS 90001/ })).toHaveCount(0);
});

test('painel mostra a conversa e a sugestão sem responder ao grupo', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await expect(painel).toContainText('Sugestões do intérprete');
  await expect(painel).toContainText('Nova data: 13/10');
  await expect(painel).toContainText('Entregamos dia 13.');
  await expect(painel.getByLabel('Mensagem')).toHaveValue(/\*OS 90002\*/);
  await expect(painel.getByRole('button', { name: 'Colocar na fila' })).toBeVisible();
  await expect(painel.getByRole('button', { name: /^(responder|enviar)$/i })).toHaveCount(0);
});

test('mensagem ambigua aparece para conferência sem expor identificadores do WhatsApp', async ({ page }) => {
  await entrar(page);
  const pendentes = page.getByText('1 mensagem aguardando associação');
  await expect(pendentes).toBeVisible();
  await pendentes.click();
  await expect(page.getByText('As duas ficam prontas amanhã.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('@g.us');
  await expect(page.locator('body')).not.toContainText('@s.whatsapp.net');
});

test('associa manualmente uma mensagem a uma OS do mesmo grupo', async ({ page }) => {
  await entrar(page);
  await page.getByText('1 mensagem aguardando associação').click();
  await page.getByRole('button', { name: 'Associar', exact: true }).click();
  await expect(page.getByText('1 mensagem aguardando associação')).toHaveCount(0);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  await expect(page.getByRole('complementary', { name: 'Detalhes da OS 90002' })).toContainText('As duas ficam prontas amanhã.');
});

test('reenvio exige confirmação e mantém a tentativa com erro', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  page.once('dialog', (dialog) => dialog.accept());
  await painel.getByRole('button', { name: 'Reenviar' }).click();
  await expect(painel.getByText('*OS 90002* Confirma a entrega?', { exact: true })).toHaveCount(2);
});
