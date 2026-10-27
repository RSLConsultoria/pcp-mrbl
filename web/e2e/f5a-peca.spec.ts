import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const ACAO = 'http://api.test/pcp-acao';
const PECA = /^http:\/\/api\.test\/pcp-peca\?/;
const SESSAO = { token: 'f'.repeat(64), nome: 'Pessoa PCP', perfil: 'PCP', expiraEm: '2099-01-01T00:00:00.000Z' };

const PRODUCAO = [{
  dealId: '710002', os: '90002', oficinaId: 'OF-1', oficina: 'OFICINA MODELO', inicioCostura: '2026-10-04', dataCombinada: '2026-10-12',
  leadTime: '2026-10-15', pecas: 120, valorCorte: 12345.67, cliente: 'CLIENTE MODELO', peca: 'COLETE TESTE', referencia: 'REF-B', versao: 'v2',
  faltasCostura: [], faltasAcabamento: [], sugestoes: [],
  mensagens: [{ id: 'M1', quando: '2026-10-07T12:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'Entregamos dia 13.', associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'TEXTO' }],
  historico: [{ id: 'P1', acao: 'PRODUCAO_ALTERAR_COMBINADO', quando: '2026-10-05T12:00:00.000Z', usuario: 'Pessoa PCP', texto: 'Pessoa PCP alterou o combinado: data combinada: 10/10 → 12/10', ploomes: 'ENVIADO' }]
}];
const ANOTACOES = [{ id: 'A1', quando: '2026-10-05T15:00:00.000Z', usuario: 'Pessoa PCP', texto: 'Pessoa PCP anotou: "Conferir etiqueta."', ploomes: 'ENVIADO', dealId: '710002', os: '90002' }];
const cardPeca = (o: Record<string, unknown>) => ({
  dealId: '710002', funilId: 60015827, funil: 'Produção', etapaId: 60105, etapa: '17. Costura', etapaOrdem: 6, titulo: 'OS 90002',
  cliente: 'CLIENTE MODELO', peca: 'COLETE TESTE', referencia: 'REF-B', os: '90002', atualizadoEm: '2026-10-07T10:00:00.000Z',
  link: 'https://app10.ploomes.com/deal/710002', ...o
});
const DOSSIE = {
  geradoEm: '2026-10-07T15:00:00.000Z', os: '90002',
  cards: [cardPeca({}), cardPeca({ dealId: '700002', funilId: 60011710, funil: 'PCP', etapaId: 60200, etapa: 'Concluído', etapaOrdem: 9, atualizadoEm: '2026-10-01T10:00:00.000Z', link: 'https://app10.ploomes.com/deal/700002' })],
  trilha: { funil: 'Produção', dealId: '710002', atualId: '60105', etapas: [
    { id: '60104', nome: '16. 1ª Peça', ordem: 5 }, { id: '60105', nome: '17. Costura', ordem: 6 }, { id: '60106', nome: '18. Acabamento', ordem: 7 }] },
  eventos: [
    { quando: '2026-10-06T13:00:00.000Z', fonte: 'PLOOMES', texto: 'Cliente pediu para conferir a cor do viés.', autor: 'Pessoa Comercial', dealId: '710002' },
    { quando: '2026-10-04T12:00:00.000Z', fonte: 'ETAPA', texto: 'Produção: 16. 1ª Peça → 17. Costura', autor: '', dealId: '710002' },
    { quando: '2026-10-03T12:00:00.000Z', fonte: 'ETAPA', texto: 'Produção: 15. Preparação 1 → 16. 1ª Peça', autor: '', dealId: '710002', desfeita: true }
  ]
};
// Um pedido aberto com itens de duas OS (link por OS no painel do pedido).
const PEDIDOS = [{
  id: 'PED-0042', pai: '', etapa: 'a_pedir', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-12', responsavel: 'Maria',
  criadoEm: '2026-10-05', baixadoEm: '', concluidoEm: '', versao: 'v-ped', finalizado: false,
  itens: [
    { itemId: 'a2', dealId: '700001', os: '90001', nome: 'TAG CUIDADOS PADRÃO', un: 'UN', qtd: 26, fornecedor: '' },
    { itemId: 'b1', dealId: '700002', os: '90002', nome: 'ZÍPER METAL MÉDIO FIXO CA 18CM', un: 'UN', qtd: 52, fornecedor: '' }
  ]
}];
const lista = (candidatos: { os: string; peca: string }[]) => ({
  geradoEm: '', os: '', cards: [], trilha: null, eventos: [],
  candidatos: candidatos.map((c) => ({ ...c, etapa: '17. Costura', funil: 'Produção', dealId: '7' + c.os.slice(1) }))
});

async function entrar(page: Page, hash: string, acoes: Record<string, unknown>[] = [], atrasoMs = 0) {
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.route(BOARD, (r) => r.fulfill({ json: { ...base, producao: PRODUCAO, anotacoes: ANOTACOES, pedidos: PEDIDOS,
    oficinas: [{ ploomesId: 'OF-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO MODELO' }] } }));
  await page.route(PECA, (r) => {
    const q = new URL(r.request().url()).searchParams.get('q');
    if (q === '90002') return r.fulfill({ json: DOSSIE });
    if (q === 'REF-COMUM') return r.fulfill({ json: lista([{ os: '90002', peca: 'COLETE TESTE' }, { os: '90003', peca: 'CALCA TESTE' }]) });
    if (q === 'REF-B') return r.fulfill({ json: lista([{ os: '90002', peca: 'COLETE TESTE' }]) });
    if (q === '90003') return r.fulfill({ status: 502, json: { erro: 'Não foi possível ler o Ploomes agora.' } });
    if (q === '91234') return r.fulfill({ json: { ...DOSSIE, os: '91234', cards: [cardPeca({ os: '91234' })], eventos: [] } });
    return r.fulfill({ status: 404, json: { erro: 'Nenhuma OS encontrada no Ploomes.' } });
  });
  await page.route(ACAO, async (r) => {
    acoes.push(r.request().postDataJSON());
    if (atrasoMs) await new Promise((ok) => setTimeout(ok, atrasoMs));
    await r.fulfill({ json: { ok: true, versao: '2026-10-07T15:00:00.000Z', anotacaoId: 'A2',
      historico: { quando: '2026-10-07T15:00:00.000Z', usuario: 'Pessoa PCP', texto: 'Pessoa PCP anotou: "x"', ploomes: 'PENDENTE' } } });
  });
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

const dossie = (page: Page, os: string) => page.getByRole('article', { name: `Visão da peça da OS ${os}` });

test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00')));

test('guia abre a busca; OS abre o dossiê com Ploomes, trilha e links', async ({ page }) => {
  await entrar(page, '');
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Visão das peças' }).click();
  await expect(page).toHaveURL(/#peca$/);
  await page.getByLabel('OS ou referência').fill('90002');
  await page.getByLabel('OS ou referência').press('Enter');
  await expect(page).toHaveURL(/#peca\/90002$/);
  const d = dossie(page, '90002');
  await expect(d.getByRole('heading', { name: '90002' })).toBeVisible();
  await expect(d).toContainText('COLETE TESTE');
  await expect(d.getByRole('link', { name: 'Abrir card no Ploomes · Produção' })).toHaveAttribute('href', 'https://app10.ploomes.com/deal/710002');
  await expect(d.getByRole('link', { name: 'Abrir card no Ploomes · PCP' })).toHaveAttribute('href', 'https://app10.ploomes.com/deal/700002');
  await expect(d.getByRole('link', { name: 'Ficha técnica no HUB de Peças' })).toHaveAttribute('href', 'https://rslconsultoria.github.io/hub-pecas-catalogo/#REF-B');
  await expect(d.getByRole('list', { name: 'Etapas do funil Produção' }).locator('[aria-current="step"]')).toHaveText('17. Costura');
  const lateral = page.getByRole('complementary', { name: 'Resumo da OS' });
  await expect(lateral).toContainText('No prazo · 5 dias');
  await expect(lateral).toContainText('PED-0042 · A pedir');
  await expect(lateral).toContainText('OFICINA MODELO');
  await expect(lateral).toContainText('1 de 1 com falta');
  await expect(lateral).toContainText('Entregamos dia 13.');
  const tempo = d.getByRole('tabpanel');
  await expect(tempo).toContainText('Cliente pediu para conferir a cor do viés.');
  await expect(tempo).toContainText('Pessoa PCP anotou: "Conferir etiqueta."');
  await expect(tempo).toContainText('enviado ao Ploomes');
  await expect(tempo).toContainText('(desfeita)');
  await expect(tempo).toContainText('Entregamos dia 13.');
});

test('referência com várias OS mostra a lista; uma OS abre direto; nada encontrado avisa', async ({ page }) => {
  await entrar(page, '#peca');
  await page.getByLabel('OS ou referência').fill('REF-COMUM');
  await page.getByRole('button', { name: 'Abrir' }).click();
  const lista = page.getByRole('region', { name: 'OS encontradas' });
  await expect(lista.getByRole('link')).toHaveCount(2);
  await lista.getByRole('link', { name: /OS 90002/ }).click();
  await expect(page).toHaveURL(/#peca\/90002$/);
  await expect(dossie(page, '90002')).toBeVisible();
  await page.getByLabel('OS ou referência').fill('REF-B');
  await page.getByLabel('OS ou referência').press('Enter');
  await expect(page).toHaveURL(/#peca\/90002$/);
  await page.getByLabel('OS ou referência').fill('XYZ');
  await page.getByLabel('OS ou referência').press('Enter');
  await expect(page.getByText('Nenhuma OS encontrada no Ploomes.')).toBeVisible();
});

test('abas: caixas e faltas, oficina e prazos, WhatsApp e e-mails', async ({ page }) => {
  await entrar(page, '#peca/90002');
  const d = dossie(page, '90002');
  await d.getByRole('tab', { name: 'Caixas e faltas' }).click();
  await expect(d.getByRole('tabpanel')).toContainText('Caixa de Costura');
  await expect(d.getByRole('tabpanel')).toContainText('ZÍPER METAL MÉDIO FIXO CA 18CM');
  await expect(d.getByRole('tabpanel')).toContainText('Sem pedido');
  await d.getByRole('tab', { name: 'Oficina e prazos' }).click();
  await expect(d.getByRole('tabpanel')).toContainText('Alterações do combinado');
  await expect(d.getByRole('tabpanel')).toContainText('data combinada: 10/10 → 12/10');
  await d.getByRole('tab', { name: 'WhatsApp' }).click();
  await expect(d.getByRole('tabpanel')).toContainText('Entregamos dia 13.');
  await expect(d.getByRole('tabpanel').getByRole('button')).toHaveCount(0);
  await d.getByRole('tab', { name: 'E-mails do PCP' }).click();
  await expect(d.getByRole('tabpanel')).toHaveText('Chega na próxima parte da F5.');
});

test('anotação aparece na hora e vai ao servidor com o card de Produção', async ({ page }) => {
  const acoes: Record<string, unknown>[] = [];
  await entrar(page, '#peca/90002', acoes, 1500);
  const d = dossie(page, '90002');
  await d.getByRole('button', { name: 'Anotar' }).click();
  await expect(d.getByRole('alert')).toHaveText('Escreva a anotação.');
  await d.getByLabel('Anotar algo no histórico').fill('Ligar para a oficina');
  await d.getByRole('button', { name: 'Anotar' }).click();
  await expect(d.getByText('Você anotou: "Ligar para a oficina"')).toBeVisible();
  await expect(page.getByText('Salvando…')).toBeVisible();
  await expect(d.getByLabel('Anotar algo no histórico')).toHaveValue('');
  await expect.poll(() => acoes.length).toBe(1);
  expect(acoes[0]).toEqual({ tipo: 'anotar_peca', os: '90002', dealId: '710002', texto: 'Ligar para a oficina' });
});

test('Ploomes fora: aviso no topo e o resto do dossiê pelo board', async ({ page }) => {
  await entrar(page, '#peca/90003');
  const d = dossie(page, '90003');
  await expect(d.getByRole('alert')).toContainText('Não foi possível ler o Ploomes agora.');
  await d.getByRole('tab', { name: 'Caixas e faltas' }).click();
  await expect(d.getByRole('tabpanel')).toContainText('Caixa de Costura');
});

test('OS sem nada no app mostra só o Ploomes com o aviso', async ({ page }) => {
  await entrar(page, '#peca/91234');
  const d = dossie(page, '91234');
  await expect(d).toContainText('Esta OS ainda não tem caixas, pedidos ou mensagens no app.');
  await expect(d.getByRole('link', { name: 'Abrir card no Ploomes' })).toBeVisible();
});
