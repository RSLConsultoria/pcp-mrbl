import { expect, test, type Page } from '@playwright/test';
import base from './fixtures/board.json' with { type: 'json' };

// F5c · E-mails do PCP: faixa azul, bloco no painel da caixa (Aceitar/Ignorar, otimista), selo no
// card e aba da Visão da peça. Dados fictícios. Hoje = 07/10/2026 (São Paulo).
const SESSAO = { token: 'f'.repeat(64), nome: 'Pessoa PCP', perfil: 'PCP', expiraEm: '2099-01-01T00:00:00.000Z' };

type Email = Record<string, unknown> & { id: string; status: string };
const email = (o: Partial<Email> & { id: string }): Email => ({
  quando: '2026-10-07T12:00:00.000Z', de: 'Pessoa Compras', assunto: 'RE: Caixa separada - OS:90001 | Ref: REF-A', os: '90001', modelo: 'CAIXA_SEPARADA',
  texto: 'A tag de cuidados chega dia 09/10.', tipo: 'PREVISAO', valor: '2026-10-09', itens: ['a2'], resumo: 'Tag chega 09/10.',
  evidencia: 'chega dia 09/10', confianca: 0.9, status: 'PENDENTE', ...o
});

async function entrar(page: Page, emails: Email[], hash = '') {
  const estado = { emails: emails.map((e) => ({ ...e })), acoes: [] as Record<string, unknown>[] };
  const caixas = structuredClone(base.caixas) as typeof base.caixas;
  await page.route('http://api.test/pcp-login', (r) => r.fulfill({ json: SESSAO }));
  await page.route('http://api.test/pcp-board', (r) => r.fulfill({ json: { ...base, caixas, emailsPcp: estado.emails } }));
  await page.route(/^http:\/\/api\.test\/pcp-peca\?/, (r) => r.fulfill({ status: 502, json: { erro: 'Não foi possível ler o Ploomes agora.' } }));
  await page.route('http://api.test/pcp-acao', async (r) => {
    const corpo = r.request().postDataJSON() as { id: string; decisao: string };
    estado.acoes.push(corpo);
    const e = estado.emails.find((x) => x.id === corpo.id)!;
    e.status = corpo.decisao === 'ACEITAR' ? 'ACEITA' : 'IGNORADA';
    if (corpo.decisao === 'ACEITAR' && e.tipo === 'PREVISAO') {
      const it = caixas.flatMap((c) => c.itens).find((i) => (e.itens as string[]).includes(i.id));
      if (it) it.previsao = e.valor as string;
    }
    await r.fulfill({ json: { ok: true, versao: '2026-10-07T15:00:00.000Z', historico: null, emailId: corpo.id } });
  });
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
  return estado;
}

const faixa = (page: Page) => page.getByRole('region', { name: 'Sugestões dos e-mails do PCP' });
const painel = (page: Page, os: string) => page.getByRole('complementary', { name: `Caixa da OS ${os}` });
const card = (page: Page, os: string) => page.getByRole('button', { name: `OS ${os}`, exact: true });
const EMAILS = [
  email({ id: 'G1' }),
  email({ id: 'G2', quando: '2026-10-07T13:00:00.000Z', os: '90002', de: 'Pessoa Suporte', assunto: 'RE: Itens faltando pós corte - OS:90002', modelo: 'POS_CORTE',
    texto: 'Chamado aberto #1234567 para o zíper.', tipo: 'CHAMADO', valor: '1234567', itens: [], evidencia: 'Chamado aberto #1234567' }),
  email({ id: 'G3', quando: '2026-10-06T10:00:00.000Z', texto: 'Recebemos a etiqueta.', tipo: 'OBSERVACAO', valor: '', itens: [], resumo: 'Etiqueta recebida.', status: 'ACEITA' })
];

test.beforeEach(async ({ page }) => page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00')));

test('faixa com as pendentes, selo nos cards e a lista abre a caixa', async ({ page }) => {
  await entrar(page, EMAILS);
  await expect(faixa(page)).toContainText('2 sugestões novas dos e-mails do PCP');
  await expect(card(page, '90001')).toContainText('e-mail do PCP');
  await expect(card(page, '90002')).toContainText('e-mail do PCP');
  await expect(card(page, '90003')).not.toContainText('e-mail do PCP');
  await faixa(page).getByRole('button', { name: /sugestões novas/ }).click();
  await expect(faixa(page).getByRole('button', { name: /OS 90002/ })).toContainText('Chamado #1234567');
  await faixa(page).getByRole('button', { name: /OS 90001/ }).click();
  const p = painel(page, '90001');
  await expect(p).toBeVisible();
  const bloco = p.getByRole('region', { name: /Sugestão do e-mail do PCP/ });
  await expect(bloco).toContainText('Pessoa Compras');
  await expect(bloco).toContainText('RE: Caixa separada - OS:90001');
  await expect(bloco).toContainText('“chega dia 09/10”');
  await expect(bloco).toContainText('A IA entendeu: Previsão 09/10 para TAG CUIDADOS PADRÃO');
});

test('aceitar previsão: o bloco some, a data aparece no item na hora e a ação vai ao servidor', async ({ page }) => {
  const estado = await entrar(page, EMAILS);
  await card(page, '90001').click();
  const p = painel(page, '90001');
  await p.getByRole('button', { name: 'Aceitar' }).click();
  await expect(p.getByRole('region', { name: /Sugestão do e-mail do PCP/ })).toHaveCount(0);
  await expect(card(page, '90001')).toContainText('previsão 09/10');
  await expect(card(page, '90001')).not.toContainText('e-mail do PCP');
  await expect(faixa(page)).toContainText('1 sugestão nova dos e-mails do PCP');
  await expect.poll(() => estado.acoes).toEqual([{ tipo: 'decidir_email_pcp', id: 'G1', decisao: 'ACEITAR' }]);
  await expect(page.getByText('Sugestão do e-mail aceita')).toBeVisible();
});

test('ignorar: só marca; sem pendentes a faixa some', async ({ page }) => {
  const estado = await entrar(page, [EMAILS[1]]);
  await card(page, '90002').click();
  await painel(page, '90002').getByRole('button', { name: 'Ignorar' }).click();
  await expect(painel(page, '90002').getByRole('region', { name: /Sugestão do e-mail do PCP/ })).toHaveCount(0);
  await expect(faixa(page)).toHaveCount(0);
  await expect.poll(() => estado.acoes).toEqual([{ tipo: 'decidir_email_pcp', id: 'G2', decisao: 'IGNORAR' }]);
});

test('caixa fora da edição: Aceitar e Ignorar desabilitados', async ({ page }) => {
  await page.route('http://api.test/pcp-board', (r) => r.fulfill({ json: { ...base, dealsEditaveis: ['700001'], emailsPcp: [EMAILS[1]] } }));
  await page.route('http://api.test/pcp-login', (r) => r.fulfill({ json: SESSAO }));
  await page.goto('./');
  await page.getByLabel('E-mail').fill('pcp@teste.local');
  await page.getByLabel('Senha').fill('senha-ficticia');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await card(page, '90002').click();
  await expect(painel(page, '90002').getByRole('button', { name: 'Aceitar' })).toBeDisabled();
  await expect(painel(page, '90002').getByRole('button', { name: 'Ignorar' })).toBeDisabled();
});

test('OS sem caixa no app: a lista leva à Visão da peça', async ({ page }) => {
  await entrar(page, [email({ id: 'G9', os: '90009', itens: [], assunto: 'RE: Caixa separada - OS:90009' })]);
  await faixa(page).getByRole('button', { name: /sugestão nova/ }).click();
  await faixa(page).getByRole('button', { name: /OS 90009/ }).click();
  await expect(page).toHaveURL(/#peca\/90009$/);
});

test('Visão da peça: aba E-mails do PCP com o texto limpo, a sugestão e o status', async ({ page }) => {
  await entrar(page, EMAILS, '#peca/90001');
  const d = page.getByRole('article', { name: 'Visão da peça da OS 90001' });
  await d.getByRole('tab', { name: 'E-mails do PCP' }).click();
  const aba = d.getByRole('tabpanel');
  await expect(aba.getByRole('listitem')).toHaveCount(2);
  await expect(aba.getByRole('listitem').first()).toContainText('aguardando decisão');
  await expect(aba.getByRole('listitem').first()).toContainText('A tag de cuidados chega dia 09/10.');
  await expect(aba.getByRole('listitem').first()).toContainText('Previsão 09/10 para TAG CUIDADOS PADRÃO');
  await expect(aba.getByRole('listitem').first()).toContainText('Pessoa Compras · Caixa separada');
  await expect(aba.getByRole('listitem').nth(1)).toContainText('aceita');
  await expect(aba.getByRole('listitem').nth(1)).toContainText('Observação: Etiqueta recebida.');
});

test('375 px: faixa e lista sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page, EMAILS);
  await faixa(page).getByRole('button', { name: /sugestões novas/ }).click();
  await expect(faixa(page).getByRole('button', { name: /OS 90001/ })).toBeVisible();
  const larguras = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, faixa: document.querySelector('.emails-faixa')!.scrollWidth }));
  expect(larguras.doc).toBeLessThanOrEqual(375);
  expect(larguras.faixa).toBeLessThanOrEqual(375);
});
