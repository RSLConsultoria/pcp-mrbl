import { expect, test as base, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

// Edições de pedido contra o mock da API (scripts/mock-api.mjs), com estado e com atraso nas
// respostas da pcp-acao, como o servidor lento: a tela tem de mostrar a mudança na hora,
// mantê-la enquanto grava e continuar mostrando depois que a recarga traz o board novo.

const ATRASO_MS = Number(process.env.E2E_ATRASO ?? 1500);
const MOCK = fileURLToPath(new URL('../scripts/mock-api.mjs', import.meta.url));

function portaLivre(): Promise<number> {
  return new Promise((ok, erro) => {
    const s = createServer();
    s.once('error', erro);
    s.listen(0, () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

async function subirMock(porta: number): Promise<ChildProcess> {
  const filho = spawn(process.execPath, [MOCK], {
    env: { ...process.env, MOCK_PORT: String(porta), MOCK_ATRASO_MS: String(ATRASO_MS) },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise<void>((ok, erro) => {
    filho.once('exit', (c) => erro(new Error(`mock saiu com ${c}`)));
    filho.stdout!.on('data', (d: Buffer) => { if (d.toString().includes('Mock da API')) ok(); });
  });
  return filho;
}

const test = base.extend<{ api: { boardGets: () => number; acoes: Record<string, unknown>[] } }>({
  api: async ({ page }, usar) => {
    const porta = await portaLivre();
    const filho = await subirMock(porta);
    let gets = 0;
    const acoes: Record<string, unknown>[] = [];
    // o build de e2e chama http://api.test; aqui cada chamada vai para o mock
    await page.route('http://api.test/**', async (r) => {
      const url = new URL(r.request().url());
      if (url.pathname === '/pcp-board') gets++;
      if (url.pathname === '/pcp-acao') acoes.push(r.request().postDataJSON() as Record<string, unknown>);
      const resp = await r.fetch({ url: `http://localhost:${porta}${url.pathname}${url.search}` });
      await r.fulfill({ response: resp });
    });
    await usar({ boardGets: () => gets, acoes });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    filho.kill();
  }
});

async function entrar(page: Page, hash: string) {
  await page.goto(`./${hash}`);
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

const card = (page: Page, coluna: string, id: string) =>
  page.getByRole('region', { name: coluna }).getByRole('article', { name: `Pedido ${id}`, exact: true });
const salvando = (page: Page) => page.getByText('Salvando…');

// Confere que o card está só na coluna esperada agora, quando o servidor termina de gravar
// e depois da recarga (sem voltar para a coluna antiga em nenhum momento).
async function ficaNaColuna(page: Page, api: { boardGets: () => number }, id: string, nova: string, antiga: string) {
  await expect(card(page, nova, id)).toBeVisible();
  await expect(card(page, antiga, id)).toHaveCount(0);
  await expect(salvando(page)).toBeVisible();
  const gets = api.boardGets();
  // enquanto grava: o card não pode piscar de volta
  for (let k = 0; k < 5; k++) {
    await page.waitForTimeout(200);
    await expect(card(page, nova, id)).toHaveCount(1);
    await expect(card(page, antiga, id)).toHaveCount(0);
  }
  await expect(salvando(page)).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => api.boardGets()).toBeGreaterThan(gets);
  await page.waitForTimeout(300);
  await expect(card(page, nova, id)).toHaveCount(1);
  await expect(card(page, antiga, id)).toHaveCount(0);
  // a próxima leitura (volta para a aba) também traz o pedido na coluna nova
  const depois = api.boardGets();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => api.boardGets()).toBeGreaterThan(depois);
  await page.waitForTimeout(300);
  await expect(card(page, nova, id)).toHaveCount(1);
  await expect(card(page, antiga, id)).toHaveCount(0);
}

test('arrastar o pedido para outra etapa: o card fica na coluna nova depois da recarga', async ({ page, api }) => {
  await entrar(page, '#pedidos');
  await card(page, 'Aguardando entrega', 'PED-0003').getByRole('button', { name: 'Pedido PED-0003' })
    .dragTo(page.getByRole('region', { name: 'A pedir' }));
  await ficaNaColuna(page, api, 'PED-0003', 'A pedir', 'Aguardando entrega');
});

// O mock recusa (409 "Atualize a página") a baixa sem confirmouBaixa, como a API: o site novo
// só manda o campo depois da confirmação, e o card fica na coluna da baixa depois da recarga.
test('arrastar para Enviado ao destino final e confirmar: o mock aceita a baixa (confirmouBaixa) e o card fica', async ({ page, api }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  await entrar(page, '#pedidos');
  const enviado = page.getByRole('region', { name: 'Enviado ao destino final' });
  await card(page, 'Aguardando entrega', 'PED-0003').getByRole('button', { name: 'Pedido PED-0003' }).dragTo(enviado);
  await enviado.getByRole('group', { name: 'Confirmar Enviado ao destino final do PED-0003' }).getByRole('button', { name: 'Confirmar' }).click();
  await ficaNaColuna(page, api, 'PED-0003', 'Enviado ao destino final', 'Aguardando entrega');
  expect(api.acoes).toEqual([{ tipo: 'mover_pedido', pedidoId: 'PED-0003', versao: '2026-01-01T00:00:00.000Z', etapa: 'entregue', confirmouBaixa: true }]);
  await expect(page.getByText('Atualize a página: o site mudou.')).toHaveCount(0);
});

test('editar a previsão do pedido: a data nova aparece na hora e continua depois da recarga', async ({ page, api }) => {
  await entrar(page, '#pedidos');
  const c = card(page, 'Aguardando entrega', 'PED-0003');
  await c.getByRole('button', { name: 'Pedido PED-0003' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0003' });
  const nova = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  const ddmm = `${nova.slice(8, 10)}/${nova.slice(5, 7)}`;
  await painel.getByLabel('Previsão de entrega').fill(nova);
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(c).toContainText(`previsão ${ddmm}`);
  await expect(salvando(page)).toBeVisible();
  await expect(salvando(page)).toHaveCount(0, { timeout: 10_000 });
  const gets = api.boardGets();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => api.boardGets()).toBeGreaterThan(gets);
  await page.waitForTimeout(300);
  await expect(c).toContainText(`previsão ${ddmm}`);
  await expect(painel.getByLabel('Previsão de entrega')).toHaveValue(nova);
});

// O caso do relato: com o painel aberto, o pedido muda de etapa (arrastado, ou por outra ação
// ainda na fila). O formulário não pode guardar a etapa antiga: salvar outra alteração depois
// mandaria o pedido de volta para ela.
test('painel aberto e o card arrastado: o painel acompanha a etapa e salvar não devolve o pedido', async ({ page, api }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  await entrar(page, '#pedidos');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0001' });
  await expect(painel.locator('.painel__meta').first()).toContainText('Solicitado');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' })
    .dragTo(page.getByRole('region', { name: 'Aguardando entrega' }));
  await expect(card(page, 'Aguardando entrega', 'PED-0001')).toBeVisible();
  // ainda antes de o servidor responder ao arraste (o mock segura ${ATRASO_MS} ms)
  await expect(salvando(page)).toBeVisible();
  await expect(painel.locator('.painel__meta').first()).toContainText('Aguardando entrega', { timeout: 300 });
  await expect(painel.getByRole('button', { name: 'Nada alterado' })).toBeDisabled({ timeout: 300 });
  // muda outra coisa e salva ainda com o arraste na fila
  await painel.getByLabel('Responsável').selectOption('Lucca');
  await expect(salvando(page)).toBeVisible();
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  await ficaNaColuna(page, api, 'PED-0001', 'Aguardando entrega', 'Solicitado');
  expect(api.acoes.map((a) => a.tipo)).toEqual(['mover_pedido', 'editar_pedido']);
  expect(api.acoes[1].campos).toEqual({ responsavel: 'Lucca' });
  await expect(painel.getByLabel('Responsável')).toHaveValue('Lucca');
});

test('digitando no painel quando a recarga chega: o que foi digitado continua lá', async ({ page, api }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  await entrar(page, '#pedidos');
  await card(page, 'Solicitado', 'PED-0001').getByRole('button', { name: 'Pedido PED-0001' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0001' });
  await painel.getByLabel('Responsável').selectOption('Lucca');
  await painel.getByRole('button', { name: 'Salvar alterações' }).click();
  // enquanto grava, começa outra alteração
  await painel.getByLabel('Local de entrega').selectOption('OFICINA');
  const gets = api.boardGets();
  await expect(salvando(page)).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => api.boardGets()).toBeGreaterThan(gets);
  await page.waitForTimeout(300);
  await expect(painel.getByLabel('Local de entrega')).toHaveValue('OFICINA');
  await expect(painel.getByLabel('Responsável')).toHaveValue('Lucca');
  await expect(painel.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
});

// Como o servidor (n8n/src/montarCaixas.js): só item de caixa ganha (fora da FALTANTES) vem
// com editavel false. Item resolvido e item de caixa somente leitura são da FALTANTES.
test('mock: item resolvido e caixa somente leitura não dizem "lido da planilha de caixas ganhas"', async ({ page, api }) => {
  void api;
  await entrar(page, '');
  await page.getByRole('button', { name: 'OS 90001' }).click();
  const p1 = page.getByRole('complementary', { name: 'Caixa da OS 90001' });
  const etiqueta = p1.getByRole('listitem').filter({ hasText: 'ETIQUETA COMPOSICAO' }).filter({ hasNotText: 'deu baixa' });
  await expect(etiqueta).toContainText('Item resolvido.');
  await expect(p1.getByText(/lido da planilha de caixas ganhas/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'OS 90002' }).filter({ hasText: 'ZIPER METAL' }).click();
  const p2 = page.getByRole('complementary', { name: 'Caixa da OS 90002' });
  await expect(p2.getByText('Edição liberada em breve para esta caixa.')).toBeVisible();
  await expect(p2.getByText(/lido da planilha de caixas ganhas/)).toHaveCount(0);
});

// Fetch pela página: o route do fixture leva a chamada ao mock (sem passar pela fila do site).
async function acaoNoMock(page: Page, corpo: Record<string, unknown>) {
  return page.evaluate(async (c) => {
    const r = await fetch('http://api.test/pcp-acao?atraso=0', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${'m'.repeat(64)}` }, body: JSON.stringify(c)
    });
    return { status: r.status, corpo: await r.json() };
  }, corpo);
}

test('mock: produção só oferece cobrança e confirmação; material enviado é recusado como no servidor', async ({ page, api }) => {
  void api;
  await entrar(page, '#producao');
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await expect(painel.getByRole('combobox', { name: /^Modelo/ }).locator('option')).toHaveText(['Cobrança de prazo', 'Confirmar data']);
  await expect(painel.getByLabel('Mensagem')).toHaveValue(/^Olá\. A entrega de \*PECA TESTE B\*, 160 peças, está prevista para/);
  const r = await acaoNoMock(page, { tipo: 'enviar_whatsapp', dealId: '700002', versao: 'v2', modelo: 'MATERIAL_ENVIADO', texto: 'Material enviado.', chave: 'c-material-0001' });
  expect(r).toEqual({ status: 400, corpo: { erro: 'Modelo de mensagem inválido.' } });
});

test('mock: associar mensagem com data gera a sugestão do intérprete; sem data, não gera', async ({ page, api }) => {
  void api;
  await entrar(page, '#producao');
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  await expect(painel.getByText(/Nova data:/)).toHaveCount(1);
  await painel.getByRole('button', { name: 'Fechar painel' }).click();

  // 3 pendentes: as duas sem associação e a que a IA perguntou à oficina (22/10).
  await page.getByText('3 mensagens aguardando associação').click();
  const comData = page.getByRole('listitem').filter({ hasText: 'A PECA TESTE B fica pronta dia' });
  // A OFICINA SOL tem duas OS editáveis (90002 e 90011): escolhe a 90002.
  await comData.getByLabel('Associar à OS').selectOption('700002');
  await comData.getByRole('button', { name: 'Associar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mensagem associada. A interpretação aparece em até 1 minuto.' })).toBeVisible();
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  await expect(painel.getByText(/Nova data:/)).toHaveCount(2);
  await painel.getByRole('button', { name: 'Fechar painel' }).click();

  // A outra mensagem (sem data) é associada sem sugestão nova.
  // A lista de pendentes continua aberta, agora com duas mensagens.
  await expect(page.getByText('2 mensagens aguardando associação')).toBeVisible();
  const semData = page.getByRole('listitem').filter({ hasText: 'As duas ordens ficam prontas na sexta.' });
  await semData.getByLabel('Associar à OS').selectOption('700002');
  await semData.getByRole('button', { name: 'Associar', exact: true }).click();
  // Fica só a que a IA perguntou à oficina.
  await expect(page.getByText('1 mensagem aguardando associação')).toBeVisible();
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  await expect(painel).toContainText('As duas ordens ficam prontas na sexta.');
  await expect(painel.getByText(/Nova data:/)).toHaveCount(2);
});

test('mock: conversa mostra envio aguardando nova tentativa e interpretação que falhou de vez', async ({ page, api }) => {
  void api;
  await entrar(page, '#producao');
  await page.getByRole('button', { name: /OS 90008/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90008' });
  await expect(painel.getByText('Aguardando nova tentativa (2 de 5)')).toBeVisible();
  await expect(painel.getByText('Não foi possível interpretar esta mensagem.')).toBeVisible();
});

test('mock: Carga com as previstas e capacidade gravada pelo ADM continua depois da recarga', async ({ page, api }) => {
  await entrar(page, '#producao');
  await page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Carga' }).click();
  await expect(page.getByText('300 pç/semana')).toBeVisible();
  await page.getByRole('button', { name: 'Editar capacidade de OFICINA LUA' }).click();
  await page.getByLabel('Capacidade de OFICINA LUA (peças por semana)').fill('250');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('250 pç/semana')).toBeVisible();
  await expect.poll(() => api.acoes.length).toBe(1);
  // Só recarrega depois que o mock respondeu (a resposta demora ATRASO_MS).
  await expect(page.getByRole('status').filter({ hasText: 'Capacidade da oficina atualizada' })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByText('250 pç/semana')).toBeVisible();
  // A prevista sem oficina entra em "A alocar".
  await expect(page.locator('.carga__alocar')).toContainText('1 OS · 120 pç');
  expect(await acaoNoMock(page, { tipo: 'alterar_capacidade_oficina', oficinaId: 'OF-02', capacidade: -3 }))
    .toEqual({ status: 400, corpo: { erro: 'Informe a capacidade em peças por semana: número inteiro, 0 ou mais.' } });
});

test('mock: conversa da mais nova para a mais antiga e sugestão de exemplo com a evidência da mesma data', async ({ page, api }) => {
  void api;
  await entrar(page, '#producao');
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  // Como o servidor (n8n/src/producao.js, mensagensDaProducao): mais nova primeiro.
  await expect(painel.locator('.producao-conversa > li > p')).toHaveText([
    'A camisa sai amanhã cedo.', /^Conseguimos entregar/, 'Olá. A entrega de *PECA TESTE B* segue para esta semana?', 'Olá. Pode confirmar a data de entrega de *PECA TESTE B*?'
  ]);
  const sugestao = painel.locator('.producao-sugestoes li').first();
  const data = (await sugestao.locator('span').first().textContent())!.replace('Nova data: ', '');
  expect(data).toMatch(/^\d{2}\/\d{2}$/);
  await expect(sugestao.locator('small').first()).toContainText(data);
  await expect(painel.locator('.producao-conversa > li > p').nth(1)).toContainText(data);
});

test('mock: trocar a OS de uma mensagem da IA interpreta a mensagem na OS nova', async ({ page, api }) => {
  void api;
  await entrar(page, '#producao');
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 90002' });
  const daIa = painel.locator('.producao-conversa > li').filter({ hasText: 'A camisa sai amanhã cedo.' });
  await daIa.getByLabel('Trocar para a OS').selectOption('700011');
  await daIa.getByRole('button', { name: 'Trocar OS' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mensagem movida para a OS escolhida.' })).toBeVisible();
  await painel.getByRole('button', { name: 'Fechar painel' }).click();
  await page.getByRole('button', { name: /OS 90011/ }).first().click();
  const destino = page.getByRole('complementary', { name: 'Detalhes da OS 90011' });
  await expect(destino).toContainText('A camisa sai amanhã cedo.');
  await expect(destino.getByText(/Nova data:/)).toHaveCount(1, { timeout: 10_000 });
});

test('Visão da peça no simulador: dossiê da OS 90002 e anotação que continua depois da gravação', async ({ page, api }) => {
  await entrar(page, '#peca/90002');
  const dossie = page.getByRole('article', { name: 'Visão da peça da OS 90002' });
  await expect(dossie.getByRole('link', { name: 'Abrir card no Ploomes · PCP' })).toHaveAttribute('href', 'https://app10.ploomes.com/deal/790002');
  await expect(dossie).toContainText('Cliente pediu para conferir a cor do viés antes do corte.');
  await expect(dossie).not.toContainText('[PCP · OS');
  await expect(dossie).toContainText('(desfeita)');
  await dossie.getByLabel('Anotar algo no histórico').fill('Teste no simulador');
  await dossie.getByRole('button', { name: 'Anotar' }).click();
  await expect(dossie.getByText('Você anotou: "Teste no simulador"')).toBeVisible();
  await expect(salvando(page)).toBeVisible();
  await expect(salvando(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(dossie.getByText('Lucca anotou: "Teste no simulador"')).toBeVisible({ timeout: 10_000 });
  await expect(dossie.getByText('Você anotou: "Teste no simulador"')).toHaveCount(0);
  expect(api.acoes).toContainEqual(expect.objectContaining({ tipo: 'anotar_peca', os: '90002', dealId: '700002', texto: 'Teste no simulador' }));
});

test('Visão da peça no simulador: Ploomes fora na OS 90005 mostra o aviso e o board', async ({ page, api }) => {
  await entrar(page, '#peca/90005');
  const dossie = page.getByRole('article', { name: 'Visão da peça da OS 90005' });
  await expect(dossie.getByRole('alert')).toContainText('Não foi possível ler o Ploomes agora.');
  await expect(dossie).toContainText('PECA TESTE E');
  expect(api.acoes).toEqual([]);
});

test('mock: os 4 cartões dos Insights do dia acendem com os dados fictícios', async ({ page, api }) => {
  void api;
  await entrar(page, '');
  const faixa = page.getByRole('region', { name: 'Insights do dia' });
  await faixa.getByRole('button', { name: 'Ver insights do dia' }).click();
  for (const nome of ['Prazo estourando', 'Caixas paradas', 'Oficinas com mais atraso', 'Cobrança sem resposta']) {
    await expect(faixa.getByRole('group', { name: nome }).locator('li').first()).toBeVisible();
  }
  await expect(faixa.getByRole('group', { name: 'Oficinas com mais atraso' })).toContainText('OFICINA LUA');
  await expect(faixa.getByRole('group', { name: 'Cobrança sem resposta' })).toContainText('90012');
});
