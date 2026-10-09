# F3: etapas novas, saídas divididas e demanda pós-saída (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o rabo "Resolvido/oficina" pelas etapas A pedir → Solicitado → Aguardando entrega → Enviado ao destino final (dá a baixa) → Concluído (finaliza), dividir as caixas de Saídas por etapa e criar a "Nova demanda" pós-saída.

**Architecture:** As regras ficam no servidor (`n8n/src/pedidos.js`, testadas com `node:test`) e são espelhadas no site (`web/src/regras/*`, incluindo o quadro otimista em `regras/otimista.ts`). A etapa da baixa é a **penúltima** e a final é a **última**, pela ordem; o pedido ganha `concluido_em` (finalizado = concluído), e `baixado_em` continua sendo só "a baixa foi dada" (o pedido com baixa não prende mais o item). A demanda pós-saída é uma ação nova (`nova_demanda`) que grava linhas novas na FALTANTES por `values:append` (destino novo em `planilhaLote.js`), com `ciclo` e `origem` = `POS_SAIDA`, que o Sync Faltantes não toca.

**Tech Stack:** n8n Code nodes em JS ES5 (sem import/export, carregados num `vm` por `n8n/test/carregar.js`), `node:test`; React 19 + TypeScript estrito + Vite, Vitest, Playwright (servidor simulado `web/scripts/mock-api.mjs` e rotas falsas com `web/e2e/fixtures/board.json`).

**Spec:** `docs/superpowers/specs/2026-10-09-f3-etapas-saidas-demanda-design.md` (vale por cima de `2026-10-08-f3-pedidos-e-saidas-design.md` onde houver conflito).

## Global Constraints

- O repositório é **público**: só dados fictícios, nenhum segredo.
- Etapas padrão, exatamente: `a_pedir` "A pedir" (1), `solicitado` "Solicitado" (2), `aguardando` "Aguardando entrega" (3), `entregue` "Enviado ao destino final" (4), `concluido` "Concluído" (5). O id `entregue` e a ordem 4 ficam (pedidos que estavam em Resolvido passam a contar como enviados).
- As duas últimas etapas são fixas: não podem ser apagadas nem reordenadas em "Etapas do quadro"; a penúltima dá a baixa (com confirmação), a última finaliza. Pode renomear.
- Somem o nome "Resolvido" e as ações `enviar_oficina`/`oficina_recebeu` ("Resolvido (Enviar à oficina)", "Enviado à oficina").
- Painel do pedido sem o campo **Etapa**: a etapa muda só arrastando o card. **Dividir pedido** só em **Aguardando entrega**, sem "Mover para"; a parte vai para **Enviado ao destino final** com a baixa e a mesma confirmação. "Dividir por previsão" continua igual.
- Saídas: colunas **Sem pedido** + as etapas dos pedidos; a caixa se divide sozinha por etapa ("90004 · 1 de 2"); regra dos 30 dias de inatividade para esconder concluídas continua.
- Nova demanda: OS, tipo de caixa (Costura/preta ou Acabamento/azul) e itens (nome, cor opcional, quantidade, unidade). Caixa achada em CAIXAS GANHAS pela OS + tipo; sem caixa ou caixa que não saiu = recusa sem criar nada. Linhas na FALTANTES com `origem` = `POS_SAIDA`; selo **pós-saída** em Faltas sem pedido; caixa aparece em Saídas (Sem pedido) e **não** no No Ploomes. Histórico: `Lucca criou demanda pós-saída: ...`.
- Edição só nos deals de `DEALS_EDITAVEIS` (403 `Edição liberada em breve para esta caixa.` para qualquer outro). Teste real só na OS de teste (negócio 607479158); **não mexer em cards de produção**.
- n8n: `n8n/src` é JS puro ES5, sem import/export. Testes: `cd n8n && npm test`. Build: `cd n8n && npm run build` regenera `n8n/build/`, `n8n/workflows/*.sdk.js` e `n8n/workflows/json/*.json` (commitar junto). **Não publicar** workflow nenhum: o deploy é um passo manual do dono, homolog primeiro.
- Web: `cd web && npm test` (Vitest), `npm run build` (tsc estrito com `noUnusedLocals`/`noUnusedParameters`, que também checa os `*.test.ts`), `CI=1 npx playwright test` (e2e com o simulado). O quadro otimista (`web/src/regras/otimista.ts`) espelha o servidor em toda ação mudada.
- Textos e comentários em pt-BR. Visual de `web/src/styles` (direção do No Ploomes): ouro (`botao--signal`) só no botão principal de cada tela/janela; nada de monoespaçada.
- Commits em português, terminando com uma linha em branco e `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ordem: 1 e 2 → 3 → 4. Tudo conferido no simulado antes de produção.

## Decisões deste plano (o que a spec não fixou)

1. **`concluido_em` na PEDIDOS.** `finalizado` (board) = `concluido_em` preenchido. `baixado_em` continua sendo "baixa dada" e é o que solta o item: pedido com baixa (em Enviado ao destino final) não prende o item, então o resto que falta volta para Faltas sem pedido.
2. **Pedido com baixa só vai para a etapa final** (409 `Pedido com baixa só pode ir para Concluído.` para mover para outra etapa, editar, dividir ou baixar). **A etapa final só aceita pedido com baixa** (400 `Mova o pedido primeiro para Enviado ao destino final.`). Concluído não muda mais (409 `Pedido finalizado não pode ser alterado.`).
3. **`editar_pedido` não aceita `etapa`** (400 `Para mudar a etapa, arraste o card.`).
4. **"Aguardando entrega" = a antepenúltima etapa** (a anterior à da baixa), para valer com etapas renomeadas. `dividir_pedido` ignora `etapa` no corpo; fora dela: 400 `Dividir só com o pedido em Aguardando entrega.`
5. **Mínimo de 3 etapas** (uma antes das duas fixas).
6. **Saídas:** um item entra em cada coluna onde tem pedido (original e partes, inclusive com baixa ou concluídos), com a quantidade daquele pedido; item aberto sem pedido aberto vai para Sem pedido (com o que resta); item fechado sem pedido vai para a última etapa. Pedido com baixa → coluna da baixa; concluído → coluna final; etapa que saiu do quadro → primeira etapa.
7. **Linhas da demanda pós-saída:** `id` = `<deal_id>|POS_SAIDA|<uuid>`, `ciclo` = `POS_SAIDA`, `origem` = `POS_SAIDA`, `secao` = COSTURA/ACABAMENTO, `data_separacao` = agora em Brasília (`aaaa-mm-dd hh:mm`). Conferido no "Sync Faltantes - Google Sheets" (id `s4mbblVXykIvkA8M`, leitura feita em 09/10/2026, ver Tarefa 5): o node "Diff" só fecha linhas órfãs com o **mesmo `deal_id` e o mesmo `ciclo`** (PEDIDO/CORTE), a reconciliação com o corte só mexe em `ciclo` = PEDIDO e o "Gravar FALTANTES" é appendOrUpdate por `id` com colunas fixas (não toca `origem`). Com `ciclo` = `POS_SAIDA` e id próprio, o sync não apaga nem sobrescreve essas linhas: **não é preciso mudar o Sync**.
8. **No Ploomes ignora os itens pós-saída** (a caixa fica como estava antes da demanda: em geral "Saiu sem faltas" pelos 30 dias de sempre). Em Saídas, a caixa aparece se saiu com falta **ou** tem item pós-saída.
9. **Item pós-saída otimista** entra na caixa com `editavel: false` (id provisório `novo:n.k`) até a recarga trazer o id gravado; só então aparece em Faltas sem pedido.

## Estrutura de arquivos

**n8n**
- `n8n/src/pedidos.js` (modificar): etapas padrão, helpers `etapaDaBaixa`/`etapaFinal`/`etapaDeDividir`/`pedidoBaixado`/`pedidoConcluido`, `concluidoEm`/`finalizado` no board, regras de mover/baixar/editar/dividir/salvar_etapas, remoção da tratativa, ação `nova_demanda`.
- `n8n/src/montarCaixas.js` (modificar): sem `tratativa`; item com `posSaida`; item pós-saída sempre entra na caixa.
- `n8n/src/planilhaLote.js` (modificar): destino `FALTANTES append`.
- `n8n/test/etapas-novas.test.js` (criar), `n8n/test/demanda-pos-saida.test.js` (criar); ajustes em `pedidos.test.js`, `resolvido-previsao.test.js`, `dividir.test.js`, `board-f3.test.js`, `montarCaixas.test.js`, `planilha-lote.test.js`.
- `n8n/build/*`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json` (regenerados).
- `n8n/workflows/README.md` (seção de deploy nova).

**web**
- `web/src/api/tipos.ts`: `Pedido.concluidoEm`, `Item.posSaida`, sem `Caixa.tratativa*`, ações mudadas.
- `web/src/regras/pedidos.ts`: `etapaFinal`/`etapaDaBaixa`/`etapaDeDividir`, `EstadoEditavel` sem etapa, `validarEtapas`.
- `web/src/regras/pedidosQuadro.ts`: `etapaNoQuadro`, `entraNaEtapaDaBaixa`, `textoConfirmarBaixa`, `motivoMoverPedido`, `pedidoArrastavel`/`pedidoEditavel`, `podeDividir`, `vazioDaEtapa`, `motivoTravaEtapa`.
- `web/src/regras/otimista.ts`: espelho das regras novas e da `nova_demanda`.
- `web/src/regras/saidas.ts` (reescrever): partes por etapa.
- `web/src/regras/demanda.ts` (criar): caixa da demanda, validação, corpo da ação.
- `web/src/regras/colunas.ts`: `semPosSaida`.
- `web/src/regras/acoes.ts`: mensagens e chave das ações.
- Componentes: `pedidos/QuadroPedidos.tsx`, `pedidos/PainelPedido.tsx`, `pedidos/CamposPedido.tsx`, `pedidos/JanelaEtapas.tsx`, `pedidos/CardPedido.tsx`, `pedidos/DividirPedido.tsx`, `pedidos/AcoesPedidos.tsx`, `pedidos/FaltasSemPedido.tsx`, `pedidos/JanelaNovaDemanda.tsx` (criar), `saidas/CardSaida.tsx`, `saidas/PainelSaida.tsx`, `saidas/ItemSaida.tsx`, `saidas/AcoesSaida.tsx` (apagar); telas `Pedidos.tsx`, `Saidas.tsx`, `NoPloomes.tsx`; `App.tsx`; `styles/f3.css`.
- Testes: `regras/etapas.test.ts` (criar), `regras/previsao.test.ts` (renomeado de `resolvido.test.ts`), `regras/saidas.test.ts` (reescrever), `regras/demanda.test.ts` (criar); ajustes em `pedidos.test.ts`, `pedidosQuadro.test.ts`, `otimista.test.ts`, `divisao.test.ts`, `teste-util.ts`.
- `web/scripts/mock-api.mjs`, `web/e2e/fixtures/board.json`, `web/e2e/f3.spec.ts`, `web/e2e/mock-servidor.spec.ts`.

---

### Task 1: n8n — etapas novas, concluir, dividir para a baixa e fim da oficina

**Files:**
- Modify: `n8n/src/pedidos.js`
- Modify: `n8n/src/montarCaixas.js:171-185` (`marcarExtras`)
- Create: `n8n/test/etapas-novas.test.js`
- Modify: `n8n/test/pedidos.test.js`, `n8n/test/resolvido-previsao.test.js`, `n8n/test/dividir.test.js`, `n8n/test/board-f3.test.js`
- Regenerate: `n8n/build/*`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json`

**Interfaces:**
- Produces (servidor): board `pedidos[]` com `concluidoEm: string` e `finalizado = concluidoEm !== ''`; `etapasPedido` padrão com 5 etapas; ações `mover_pedido`, `baixar_pedido`, `editar_pedido`, `dividir_pedido { pedidoId, versao, itens }`, `salvar_etapas` com as regras das Decisões 1–5; `caixa` sem `tratativa`/`tratativaEm`; `enviar_oficina`/`oficina_recebeu` respondem 400 `Tipo de ação inválido.`
- Produces (funções em `pedidos.js`, usadas na Tarefa 5): `etapaDaBaixa(etapas)`, `etapaFinal(etapas)`, `etapaDeDividir(etapas)`, `pedidoBaixado(p)`, `pedidoConcluido(p)`.

- [ ] **Step 1: Escrever o teste novo (falha)**

Crie `n8n/test/etapas-novas.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

// 09/10/2026: etapas novas. A penultima (Enviado ao destino final, id entregue) da a
// baixa; a ultima (Concluido) finaliza o pedido. Sem enviar_oficina/oficina_recebeu.
const ctx = carregar();
const T0 = Date.UTC(2026, 9, 9, 15, 0, 0);
const ISO = new Date(T0).toISOString();
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'lucca@exemplo.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' }];

function sessao() {
  const e = {};
  const r = ctx.processarLogin(crypto, e, { email: 'lucca@exemplo.com', senha: 'senha-forte-123' }, USUARIOS, T0);
  return { e, cab: 'Bearer ' + r.body.token };
}
function falt(o) {
  return Object.assign({
    id: 'a', os: '90001', deal_id: '600001', ciclo: 'PEDIDO', descricao_item: 'VIÉS', unidade: 'MT',
    qtd_falta: 100, qtd_baixada: '', status: 'ABERTO', atualizado_em_app: '', responsavel: ''
  }, o);
}
const FALT = [falt({ id: 'a' }), falt({ id: 'c', os: '90002', deal_id: '600002', descricao_item: 'BOTÃO', unidade: 'UN', qtd_falta: 50 })];
function ped(o) {
  return Object.assign({
    id: 'PED-0044', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA',
    previsao: '2026-10-15', responsavel: 'Renata', criado_em: '2026-10-01T10:00:00.000Z', criado_por: 'Lucca',
    baixado_em: '', concluido_em: '', atualizado_em: 'P1', pai: ''
  }, o);
}
function pit(o) {
  return Object.assign({
    id: 'PED-0044|a', pedido_id: 'PED-0044', item_id: 'a', deal_id: '600001', os: '90001',
    nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', previsao: ''
  }, o);
}
const ITENS = [pit({}), pit({ id: 'PED-0044|c', item_id: 'c', deal_id: '600002', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 30 })];
function linhas(extra) {
  return Object.assign({ faltantes: FALT, caixasPcp: [], ganhas: [], pedidos: [ped({})], pedidosItens: ITENS.slice(), etapas: [] }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  let n = 0;
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, () => 'h-' + (++n)));
}
const ENVIADO = { etapa: 'entregue', baixado_em: '2026-10-08T10:00:00.000Z' };
const ETAPAS5 = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 },
  { id: 'concluido', nome: 'Concluído', ordem: 5 }
];
const FIM = [{ id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }];
const salvar = (etapas, lin) => acao({ tipo: 'salvar_etapas', etapas }, lin || linhas({ pedidos: [], etapas: ETAPAS5 }));

test('etapas padrao: Enviado ao destino final (id entregue) e Concluido no fim', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, {}));
  assert.deepEqual(r.body.etapasPedido, ETAPAS5);
});

test('mover para Enviado ao destino final da a baixa, mas nao finaliza', () => {
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 20, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'c', qtd_baixada: 30, atualizado_em_app: ISO } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'entregue', baixado_em: ISO, atualizado_em: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => h.texto), [
    'Lucca moveu PED-0044 para Enviado ao destino final e deu baixa: 20 MT de VIÉS (resta 80 MT)',
    'Lucca moveu PED-0044 para Enviado ao destino final e deu baixa: 30 UN de BOTÃO (resta 20 UN)'
  ]);
  const b = limpo(ctx.montarRespostaBoard({}, FALT, [], T0, { pedidos: [ped(ENVIADO)], pedidosItens: ITENS }));
  const p = b.body.pedidos[0];
  assert.deepEqual([p.finalizado, p.baixadoEm, p.concluidoEm], [false, ENVIADO.baixado_em, '']);
});

test('mover para Concluido: so com a baixa dada; grava concluido_em e finaliza', () => {
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'concluido' }, linhas({ pedidos: [ped(ENVIADO)] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [{ aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'concluido', concluido_em: ISO, atualizado_em: ISO } }]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca moveu PED-0044 para Concluído'], ['600002', 'Lucca moveu PED-0044 para Concluído']
  ]);
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'concluido' }),
    { status: 400, body: { erro: 'Mova o pedido primeiro para Enviado ao destino final.' } });
  const fim = ped(Object.assign({}, ENVIADO, { etapa: 'concluido', concluido_em: ISO }));
  const b = limpo(ctx.montarRespostaBoard({}, FALT, [], T0, { pedidos: [fim], pedidosItens: ITENS }));
  assert.equal(b.body.pedidos[0].finalizado, true);
  assert.equal(b.body.pedidos[0].concluidoEm, ISO);
});

test('pedido com baixa so vai para Concluido; concluido nao muda mais', () => {
  const lin = linhas({ pedidos: [ped(ENVIADO)] });
  const erro = { status: 409, body: { erro: 'Pedido com baixa só pode ir para Concluído.' } };
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'aguardando' }, lin), erro);
  assert.deepEqual(acao({ tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', campos: { quem: 'X' } }, lin), erro);
  assert.deepEqual(acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', qtd: 1 }] }, lin), erro);
  assert.deepEqual(acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: 'P1' }, lin), erro);
  const fim = linhas({ pedidos: [ped(Object.assign({}, ENVIADO, { etapa: 'concluido', concluido_em: ISO }))] });
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'entregue' }, fim),
    { status: 409, body: { erro: 'Pedido finalizado não pode ser alterado.' } });
});

test('pedido com baixa nao prende o item: o resto pode ir para outro pedido', () => {
  const lin = linhas({ pedidos: [ped(ENVIADO)], faltantes: [falt({ id: 'a', qtd_baixada: 20 }), FALT[1]] });
  const r = acao({ tipo: 'gerar_pedido', itens: [{ itemId: 'a', dealId: '600001', qtd: 80 }], origem: 'FORNECEDOR',
    quem: 'TECIDOS BETA', local: 'BRAGANCA', responsavel: 'Gi' }, lin);
  assert.equal(r.status, 200);
  assert.equal(r.body.pedidoId, 'PED-0045');
});

test('editar_pedido nao muda etapa: so arrastando o card (pre e processar)', () => {
  const s = sessao();
  const corpo = { tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'P1', campos: { etapa: 'solicitado' } };
  const erro = { status: 400, body: { erro: 'Para mudar a etapa, arraste o card.' } };
  assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0)), Object.assign({ ok: false }, erro));
  assert.deepEqual(acao(corpo), erro);
});

test('baixar_pedido (compatibilidade): so na etapa da baixa', () => {
  assert.deepEqual(acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: 'P1' }),
    { status: 400, body: { erro: 'Dar baixa só na etapa Enviado ao destino final.' } });
  const r = acao({ tipo: 'baixar_pedido', pedidoId: 'PED-0044', versao: 'P1' }, linhas({ pedidos: [ped({ etapa: 'entregue' })] }));
  assert.equal(r.status, 200);
  assert.equal(r.operacoes[r.operacoes.length - 1].linha.baixado_em, ISO);
});

test('salvar_etapas: as duas ultimas ficam no fim, nessa ordem (podem ser renomeadas)', () => {
  const erro = { status: 400, body: { erro: 'As etapas Enviado ao destino final e Concluído precisam continuar no fim, nessa ordem.' } };
  assert.deepEqual(salvar([{ id: 'a_pedir', nome: 'A pedir' }, FIM[1], FIM[0]]), erro);
  assert.deepEqual(salvar([{ id: 'a_pedir', nome: 'A pedir' }, FIM[0], FIM[1], { nome: 'Depois' }]), erro);
  assert.deepEqual(salvar([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'Outra' }, FIM[1]]), erro);
  const ok = salvar([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'Em trânsito' }, { id: 'entregue', nome: 'Enviado' }, { id: 'concluido', nome: 'Recebido' }]);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.operacoes.slice(0, 4).map((o) => [o.linha.id, o.linha.nome, o.linha.ordem]), [
    ['a_pedir', 'A pedir', 1], ['em_transito', 'Em trânsito', 2], ['entregue', 'Enviado', 3], ['concluido', 'Recebido', 4]
  ]);
});

test('salvar_etapas: minimo de 3; pedido concluido nao segura etapa, pedido aberto segura', () => {
  assert.deepEqual(salvar(FIM), { status: 400, body: { erro: 'O quadro precisa de pelo menos 3 etapas.' } });
  const comPedido = (o) => linhas({ etapas: ETAPAS5, pedidos: [ped(Object.assign({ etapa: 'solicitado' }, o))] });
  const sem = [{ id: 'a_pedir', nome: 'A pedir' }].concat(FIM);
  assert.deepEqual(salvar(sem, comPedido({})), { status: 409, body: { erro: 'A etapa Solicitado tem pedidos abertos.' } });
  assert.equal(salvar(sem, comPedido({ baixado_em: 'X', concluido_em: 'Y' })).status, 200);
});

test('dividir_pedido: so em Aguardando entrega; a parte vai para Enviado ao destino final com a baixa', () => {
  // "etapa" no corpo (cliente antigo) e ignorada
  const r = acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'solicitado', itens: [{ itemId: 'a', qtd: 5 }] });
  assert.equal(r.status, 200);
  assert.deepEqual([r.operacoes[0].linha.id, r.operacoes[0].linha.etapa, r.operacoes[0].linha.baixado_em], ['PED-0044.1', 'entregue', ISO]);
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'FALTANTES'), [
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 5, atualizado_em_app: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => h.texto), [
    'Lucca dividiu PED-0044: 5 MT de VIÉS foram para PED-0044.1 (Enviado ao destino final) e deu baixa: 5 MT de VIÉS (resta 95 MT)'
  ]);
  assert.deepEqual(acao({ tipo: 'dividir_pedido', pedidoId: 'PED-0044', versao: 'P1', itens: [{ itemId: 'a', qtd: 5 }] },
    linhas({ pedidos: [ped({ etapa: 'solicitado' })] })),
    { status: 400, body: { erro: 'Dividir só com o pedido em Aguardando entrega.' } });
});

test('enviar_oficina e oficina_recebeu sairam; o board nao traz mais tratativa', () => {
  for (const tipo of ['enviar_oficina', 'oficina_recebeu']) {
    assert.deepEqual(acao({ tipo, dealId: '600001', versao: '' }), { status: 400, body: { erro: 'Tipo de ação inválido.' } });
    assert.equal(ctx.TIPOS_PEDIDO.indexOf(tipo), -1);
  }
  const cx = limpo(ctx.montarRespostaBoard({}, [falt({})], [], T0, {
    caixasPcp: [{ deal_id: '600001', os: '90001', tratativa: 'ENVIADO', atualizado_em: 'C1' }]
  })).body.caixas[0];
  assert.equal('tratativa' in cx, false);
  assert.equal('tratativaEm' in cx, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd n8n && node --test test/etapas-novas.test.js`
Expected: FAIL (etapas padrão com 4 itens, mover para `entregue` grava `baixado_em` mas o board diz `finalizado: true`, mensagens novas inexistentes etc.).

- [ ] **Step 3: Implementar em `n8n/src/pedidos.js`**

3a. Troque o cabeçalho e as constantes do topo (linhas 1–22) por:

```js
// ===== src/pedidos.js =====
// F3: solicitacoes de faltas (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO) e a demanda
// pos-saida (itens novos na FALTANTES depois que a caixa saiu). As duas ultimas
// etapas (pela ordem) sao fixas: a penultima ("Enviado ao destino final") da a baixa
// do pedido nas caixas; a ultima ("Concluido": o destino confirmou que recebeu)
// finaliza o pedido. Funcoes puras; sem import/export. Depende de util.js,
// montarCaixas.js e acoes.js.
// Cada acao devolve { operacoes: [{ aba, operacao, chave, linha }], historicos }.

var TIPOS_PEDIDO = ['gerar_pedido', 'editar_pedido', 'mover_pedido', 'baixar_pedido',
  'dividir_pedido', 'dividir_por_previsao', 'salvar_etapas'];
var ETAPAS_PADRAO = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 },
  { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 },
  // id 'entregue' mantido para os dados existentes: e a etapa que da a baixa.
  { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 },
  { id: 'concluido', nome: 'Concluído', ordem: 5 }
];
var ORIGENS = { FORNECEDOR: 'Fornecedor', CLIENTE: 'Cliente' };
var LOCAIS = { BRAGANCA: 'Bragança', SAO_PAULO: 'São Paulo', OFICINA: 'Oficina', CLIENTE: 'Cliente' };
var ERRO_VERSAO_PEDIDO = 'Alguém alterou este pedido agora há pouco.';
var ERRO_ETAPA_PELO_CARD = 'Para mudar a etapa, arraste o card.';
var CAMPOS_PEDIDO = ['origem', 'quem', 'local', 'previsao', 'responsavel'];
var NOMES_CAMPO = { origem: 'Origem', quem: 'Quem', local: 'Local', previsao: 'Previsão', responsavel: 'Responsável' };
```

(`ERRO_VERSAO` sai: só a tratativa usava. Confira com `grep -n ERRO_VERSAO n8n/src/*.js` que só sobra `ERRO_VERSAO_PEDIDO`.)

3b. Logo depois de `pedidoAberto(p)` (linha ~149), acrescente:

```js
// Pedido com baixa dada (entrou na etapa da baixa). Nao prende mais o item.
function pedidoBaixado(p) {
  return texto(p.linha.baixado_em) !== '';
}

// Pedido concluido (o destino confirmou o recebimento): finalizado, nao muda mais.
function pedidoConcluido(p) {
  return texto(p.linha.concluido_em) !== '';
}

// Etapas ja ordenadas (lerEtapas). Penultima: entrar nela da a baixa.
function etapaDaBaixa(etapas) {
  return etapas.length >= 2 ? etapas[etapas.length - 2] : null;
}

// Ultima: o destino confirmou o recebimento.
function etapaFinal(etapas) {
  return etapas[etapas.length - 1];
}

// Antepenultima ("Aguardando entrega"): so dela se divide um pedido.
function etapaDeDividir(etapas) {
  return etapas.length >= 3 ? etapas[etapas.length - 3] : null;
}
```

3c. Em `montarPedidos`, troque o trecho que monta o objeto do pedido (`var baixadoEm = ...` até `finalizado: baixadoEm !== ''`) para incluir `concluidoEm`:

```js
      var l = p.linha;
      var baixadoEm = texto(l.baixado_em);
      var concluidoEm = texto(l.concluido_em);
```

e, no objeto devolvido, troque as linhas `baixadoEm: baixadoEm,` … `finalizado: baixadoEm !== '',` por:

```js
        baixadoEm: baixadoEm,
        concluidoEm: concluidoEm,
        versao: texto(l.atualizado_em),
        // finalizado = concluido (o destino confirmou); com so a baixa o pedido segue aberto
        finalizado: concluidoEm !== '',
```

3d. Em `campoPedido`, apague o ramo `if (nome === 'etapa') { ... }` (a etapa não é mais campo editável).

3e. Em `dealsDoCorpo`, apague o ramo `if (corpo.tipo === 'enviar_oficina' || corpo.tipo === 'oficina_recebeu') { ... }`.

3f. Em `validarAcaoPedido`:
- apague o bloco `if (tipo === 'enviar_oficina' || tipo === 'oficina_recebeu') { ... }`;
- no bloco `salvar_etapas`, troque `if (acao.etapas.length < 2) return erroAcao(400, 'O quadro precisa de pelo menos 2 etapas.');` por `if (acao.etapas.length < 3) return erroAcao(400, 'O quadro precisa de pelo menos 3 etapas.');`;
- troque o ramo `else if (tipo === 'dividir_pedido') { acao.etapa = ...; if (!acao.etapa) ...;` para começar assim (sem exigir etapa):

```js
  } else if (tipo === 'dividir_pedido') {
    // A parte vai sempre para a etapa da baixa; "etapa" no corpo (cliente antigo) e ignorada.
    if (corpo.itens !== undefined && !Array.isArray(corpo.itens)) return erroAcao(400, 'Itens inválidos.');
```

(o resto do ramo, com `Marque ao menos um item que chegou.` e o laço dos itens, fica igual);
- no ramo `editar_pedido`, logo depois de `var campos = ...;`, acrescente:

```js
    if (Object.prototype.hasOwnProperty.call(campos, 'etapa')) return erroAcao(400, ERRO_ETAPA_PELO_CARD);
```

3g. Em `aplicarAcaoPedido`:
- apague a linha `if (tipo === 'enviar_oficina' || tipo === 'oficina_recebeu') return aplicarTratativa(...);`;
- troque o trecho de "pedido existente" (de `// editar / mover / baixar: pedido existente` até o fim do bloco `if (tipo === 'baixar_pedido') { ... }`) por:

```js
  // editar / mover / baixar / dividir: pedido existente
  var p = lista.filter(function (x) { return x.id === acao.pedidoId; })[0];
  if (!p) return erroAcao(404, 'Pedido não encontrado.');
  if (!p.itens.length) return erroAcao(409, 'Pedido sem itens válidos.');
  var dealsP = p.itens.map(function (x) { return texto(x.deal_id); });
  if (primeiroNaoEditavel(dealsP) !== null) return erroAcao(403, ERRO_NAO_EDITAVEL);
  if (pedidoConcluido(p)) return erroAcao(409, 'Pedido finalizado não pode ser alterado.');
  var baixa = etapaDaBaixa(etapas);
  var final = etapaFinal(etapas);
  // Com a baixa dada o pedido so anda para a etapa final (o destino confirmou).
  if (pedidoBaixado(p) && !(tipo === 'mover_pedido' && acao.etapa === final.id)) {
    return erroAcao(409, 'Pedido com baixa só pode ir para ' + final.nome + '.');
  }
  if (acao.versao !== texto(p.linha.atualizado_em)) return erroAcao(409, ERRO_VERSAO_PEDIDO);
  var grupos = porOS(p.itens, function (x) { return texto(x.deal_id); }, function (x) { return texto(x.os); });
  function existeEtapa(id) { return etapas.some(function (e) { return e.id === id; }); }

  if (tipo === 'dividir_pedido') return aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId);
  if (tipo === 'dividir_por_previsao') return aplicarDivisaoPorPrevisao(acao, linhas, ctx, p);

  if (tipo === 'mover_pedido') {
    if (!existeEtapa(acao.etapa)) return erroAcao(400, 'Etapa inválida.');
    if (acao.etapa === texto(p.linha.etapa)) return erroAcao(400, 'O pedido já está nessa etapa.');
    var nomeEtapa = mostrarCampo('etapa', acao.etapa, etapas);
    var linhaMov = { id: p.id, etapa: acao.etapa, atualizado_em: agora };
    var bxM = { operacoes: [], partes: {} };
    if (acao.etapa === final.id) {
      // Etapa final: o destino confirmou. A baixa ja foi dada na etapa anterior.
      if (!pedidoBaixado(p)) return erroAcao(400, 'Mova o pedido primeiro para ' + (baixa ? baixa.nome : final.nome) + '.');
      linhaMov = { id: p.id, etapa: acao.etapa, concluido_em: agora, atualizado_em: agora };
    } else if (baixa && acao.etapa === baixa.id) {
      // Entrar na etapa da baixa (Enviado ao destino final) da a baixa nas caixas.
      bxM = baixaDosItens(p.itens, faltantesPorId, agora);
      if (!bxM.ok) return bxM;
      linhaMov = { id: p.id, etapa: acao.etapa, baixado_em: agora, atualizado_em: agora };
    }
    return {
      ok: true,
      operacoes: bxM.operacoes.concat([op('PEDIDOS', 'update', 'id', linhaMov)]),
      historicos: grupos.map(function (g) {
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' moveu ' + p.id + ' para ' + nomeEtapa + textoBaixa(bxM.partes[g.dealId]));
      }),
      versao: agora,
      pedidoId: p.id
    };
  }

  if (tipo === 'baixar_pedido') {
    // Mantido por compatibilidade; o app da baixa movendo para a etapa da baixa.
    if (!baixa || texto(p.linha.etapa) !== baixa.id) return erroAcao(400, 'Dar baixa só na etapa ' + (baixa ? baixa.nome : final.nome) + '.');
    var bx = baixaDosItens(p.itens, faltantesPorId, agora);
    if (!bx.ok) return bx;
    return {
      ok: true,
      operacoes: bx.operacoes.concat([op('PEDIDOS', 'update', 'id', { id: p.id, baixado_em: agora, atualizado_em: agora })]),
      historicos: grupos.filter(function (g) { return bx.partes[g.dealId]; }).map(function (g) {
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' deu baixa do ' + p.id + ': ' + bx.partes[g.dealId].join('; '));
      }),
      versao: agora,
      pedidoId: p.id
    };
  }
```

- no `editar_pedido` (mesma função, logo abaixo): apague a linha `if (mudPedido.etapa !== undefined && !existeEtapa(mudPedido.etapa)) return erroAcao(400, 'Etapa inválida.');`, apague o bloco `var bxE = ...; if (mudPedido.etapa === ultima.id) { ... }` e troque o `return` final por:

```js
  return {
    ok: true,
    operacoes: [op('PEDIDOS', 'update', 'id', Object.assign({ id: p.id }, mudPedido, { atualizado_em: agora }))].concat(opsItens),
    historicos: grupos.map(function (g) {
      var resumo = resumoPedido.concat(resumoItens[g.dealId] || []);
      return resumo.length ? linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' alterou ' + p.id + ': ' + resumo.join(', ')) : null;
    }).filter(function (h) { return h; }),
    versao: agora,
    pedidoId: p.id
  };
```

(apague também a linha `var linhaPed = ...` que ficou sem uso).

3h. Troque o começo de `aplicarDivisao` (da linha `var etapa = etapas.filter(...)` até `if (!sobra) return ...;` inclusive, e o bloco `naUltima`) por esta versão completa da função:

```js
// dividir_pedido: o que chegou (itens ou parte da quantidade) vira um pedido novo da
// mesma familia (PED-0002 -> PED-0002.k), ja na etapa da baixa e com a baixa nas caixas.
// So da etapa anterior a da baixa ("Aguardando entrega"). O pedido dividido fica com o
// resto; linha com qtd 0 e ignorada na leitura. Dividir uma parte cria outra parte da raiz.
function aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId) {
  var u = ctx.usuario;
  var agora = ctx.agora;
  var de = etapaDeDividir(etapas);
  var baixa = etapaDaBaixa(etapas);
  if (!de || !baixa || texto(p.linha.etapa) !== de.id) {
    return erroAcao(400, 'Dividir só com o pedido em ' + (de ? de.nome : 'Aguardando entrega') + '.');
  }
  var porItem = {};
  p.itens.forEach(function (x) { if (!porItem[texto(x.item_id)]) porItem[texto(x.item_id)] = x; });
  var movidos = [];
  for (var i = 0; i < acao.itens.length; i++) {
    var mi = acao.itens[i];
    var li = porItem[mi.itemId];
    if (!li) return erroAcao(400, 'Item não está no pedido.');
    var q = numero(li.qtd);
    if (q === null || isNaN(q)) return erroAcao(400, 'Item sem quantidade no pedido.');
    if (mi.qtd > q) return erroAcao(400, 'O pedido tem só ' + formatarQtd(q) + ' ' + texto(li.un) + ' de ' + texto(li.nome) + '.');
    movidos.push({ linha: li, qtd: mi.qtd, resta: arredondar(q - mi.qtd) });
  }
  var sobra = p.itens.some(function (x) {
    var m = movidos.filter(function (y) { return y.linha === x; })[0];
    return !m || m.resta > 0;
  });
  if (!sobra) return erroAcao(400, 'Para mover o pedido inteiro, arraste o card.');

  var bx = baixaDosItens(movidos.map(function (m) { return Object.assign({}, m.linha, { qtd: m.qtd }); }), faltantesPorId, agora);
  if (!bx.ok) return bx;
  var raiz = raizDoPedido(p.id);
  var filho = proximoIdFilho(linhas.pedidos, raiz);
  var ano = new Date(agora).getFullYear();
  var operacoes = [linhaParte(p, filho, raiz, baixa.id, valorAtualCampo(p.linha, 'previsao', ano), agora, u, true)];
  movidos.forEach(function (m) { operacoes.push(linhaItemParte(m.linha, filho, m.qtd, ano)); });
  movidos.forEach(function (m) {
    operacoes.push(op('PEDIDOS_ITENS', 'update', 'id', { id: texto(m.linha.id) || p.id + '|' + texto(m.linha.item_id), qtd: m.resta }));
  });
  operacoes.push(op('PEDIDOS', 'update', 'id', { id: p.id, atualizado_em: agora }));
  operacoes = operacoes.concat(bx.operacoes);
  var historicos = porOS(movidos, function (m) { return texto(m.linha.deal_id); }, function (m) { return texto(m.linha.os); })
    .map(function (g) {
      var partes = g.itens.map(function (m) { return formatarQtd(m.qtd) + ' ' + texto(m.linha.un) + ' de ' + texto(m.linha.nome); });
      return linhaHistorico(ctx, g.dealId, g.os, '', acao.tipo,
        u + ' dividiu ' + p.id + ': ' + partes.join('; ') + ' foram para ' + filho + ' (' + baixa.nome + ')' + textoBaixa(bx.partes[g.dealId]));
    });
  return { ok: true, operacoes: operacoes, historicos: historicos, versao: agora, pedidoId: filho };
}
```

3i. Em `aplicarEtapas`, troque o bloco `// A ultima etapa (Resolvido...) fica sempre por ultimo.` (as 4 linhas com `ultimaAtual`) por:

```js
  // As duas ultimas (a da baixa e a final) ficam sempre no fim, nessa ordem.
  var n = acao.etapas.length;
  if (atuais.length >= 2) {
    var baixaAtual = atuais[atuais.length - 2];
    var finalAtual = atuais[atuais.length - 1];
    if (acao.etapas[n - 2].id !== baixaAtual.id || acao.etapas[n - 1].id !== finalAtual.id) {
      return erroAcao(400, 'As etapas ' + baixaAtual.nome + ' e ' + finalAtual.nome + ' precisam continuar no fim, nessa ordem.');
    }
  }
```

e, no laço das removidas, troque `pedidoAberto(p) && texto(p.linha.etapa) === rid` por `!pedidoConcluido(p) && texto(p.linha.etapa) === rid`.

3j. Apague as funções `materialNaUltimaEtapa` e `aplicarTratativa` inteiras (fim do arquivo).

- [ ] **Step 4: Tirar a tratativa do board em `n8n/src/montarCaixas.js`**

Em `marcarExtras`, apague as duas linhas:

```js
    caixa.tratativa = cp ? semAcento(cp.tratativa) : '';
    caixa.tratativaEm = cp ? texto(cp.tratativa_em) : '';
```

- [ ] **Step 5: Rodar o teste novo**

Run: `cd n8n && node --test test/etapas-novas.test.js`
Expected: PASS (11 testes).

- [ ] **Step 6: Ajustar os testes antigos às regras novas**

`n8n/test/board-f3.test.js`:
- no `PEDIDOS`, na linha do `PED-0007`, acrescente `concluido_em: '2026-09-11T10:00:00.000Z'` (é ele que continua finalizado);
- no `deepEqual` do `PED-0044`, acrescente `concluidoEm: ''` depois de `baixadoEm: ''`;
- no teste `board: etapasPedido padrao ...`, troque o `deepEqual` do `vazio.body.etapasPedido` por:

```js
  assert.deepEqual(vazio.body.etapasPedido, [
    { id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
    { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 },
    { id: 'concluido', nome: 'Concluído', ordem: 5 }
  ]);
```

  e troque o comentário `// finalizado = baixado_em preenchido, independente da etapa` por `// finalizado = concluido_em preenchido, independente da etapa`;
- substitua o teste `board: item.pedidoId so de pedido aberto; caixa.tratativa e tratativaEm` por:

```js
test('board: item.pedidoId so de pedido aberto', () => {
  const r = limpo(ctx.montarRespostaBoard({}, [falt({ id: 'a' }), falt({ id: 'b' }), falt({ id: 'c' })], [], T0, { pedidos: PEDIDOS, pedidosItens: ITENS }));
  assert.deepEqual(r.body.caixas[0].itens.map((i) => [i.id, i.pedidoId]), [['a', 'PED-0044'], ['b', ''], ['c', '']]);
  const sem = limpo(ctx.montarRespostaBoard({}, [falt({})], [], T0, {})).body.caixas[0];
  assert.equal(sem.itens[0].pedidoId, '');
});
```

`n8n/test/pedidos.test.js`:
- no teste `preValidarAcao: 400 das acoes novas ...`, troque o item `{ tipo: 'enviar_oficina' }` da lista por `{ tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1', campos: { etapa: 'b' } }`;
- substitua o teste `editar_pedido: resumo com nomes amigaveis e itens por OS` por:

```js
test('editar_pedido: resumo com nomes amigaveis e itens por OS', () => {
  const r = acao({
    tipo: 'editar_pedido', pedidoId: 'PED-0043', versao: 'P1',
    campos: { origem: 'CLIENTE', quem: 'TECIDOS BETA', local: 'SAO_PAULO', previsao: '2026-10-18', responsavel: 'Gi' },
    itens: [{ itemId: 'a', qtd: 15, fornecedor: 'FITAS DELTA' }, { itemId: 'c', qtd: 30 }]
  }, LIN_P());
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043', origem: 'CLIENTE', local: 'SAO_PAULO', previsao: '2026-10-18', responsavel: 'Gi', atualizado_em: ISO } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0043|a', qtd: 15, fornecedor: 'FITAS DELTA' } }
  ]);
  const comum = 'Origem: Fornecedor → Cliente, Local: Bragança → São Paulo, Previsão: 15/10 → 18/10, Responsável: Renata → Gi';
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.texto]), [
    ['600001', 'Lucca alterou PED-0043: ' + comum + ', qtd de VIÉS: 20 → 15, fornecedor de VIÉS: — → FITAS DELTA'],
    ['600002', 'Lucca alterou PED-0043: ' + comum]
  ]);
});
```

- no teste `editar_pedido: so item de uma OS ...`, troque `assert.equal(etapa.body.erro, 'Etapa inválida.');` por `assert.equal(etapa.body.erro, 'Para mudar a etapa, arraste o card.');`;
- no teste `baixar_pedido: so na ultima etapa ...`, troque `{ status: 400, body: { erro: 'Dar baixa só na última etapa.' } }` por `{ status: 400, body: { erro: 'Dar baixa só na etapa Enviado ao destino final.' } }`;
- substitua os dois testes de `salvar_etapas` (`regrava com ordem, cria ids, remove sem pedido aberto` e `validacoes e bloqueio de etapa com pedido aberto`) por:

```js
test('salvar_etapas: regrava com ordem, cria ids, remove sem pedido aberto', () => {
  const ETAPAS = [{ id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
    { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 }, { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 },
    { id: 'concluido', nome: 'Concluído', ordem: 5 }];
  const r = acao({ tipo: 'salvar_etapas', etapas: [
    { id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Pedido feito' }, { nome: 'Em trânsito' },
    { id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }
  ] }, linhas({ etapas: ETAPAS, pedidos: [ped({})], pedidosItens: [pit({})] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'a_pedir', nome: 'A pedir', ordem: 1 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'solicitado', nome: 'Pedido feito', ordem: 2 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'em_transito', nome: 'Em trânsito', ordem: 3 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'appendOrUpdate', chave: 'id', linha: { id: 'concluido', nome: 'Concluído', ordem: 5 } },
    { aba: 'ETAPAS_PEDIDO', operacao: 'update', chave: 'id', linha: { id: 'aguardando', nome: '', ordem: '' } }
  ]);
  assert.deepEqual(r.historicos, []);
  assert.equal(r.body.historico, null);
  assert.equal(r.historico, null);
});

test('salvar_etapas: validacoes e bloqueio de etapa com pedido aberto', () => {
  const s = (etapas, lin) => acao({ tipo: 'salvar_etapas', etapas }, lin);
  const FIM = [{ id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }];
  assert.equal(s([{ nome: 'Uma' }, { nome: 'Duas' }]).body.erro, 'O quadro precisa de pelo menos 3 etapas.');
  assert.equal(s([{ nome: 'Uma' }, { nome: '  ' }, { nome: 'Tres' }]).status, 400);
  assert.equal(s([{ nome: 'Uma' }, { nome: 'UMA' }, { nome: 'Tres' }]).status, 400);
  assert.equal(s('x').status, 400);
  assert.equal(s([{ id: 'nao_existe', nome: 'X' }].concat(FIM)).body.erro, 'Etapa inválida.');
  const lin = linhas({ pedidos: [ped({})], pedidosItens: [pit({})] });
  assert.deepEqual(s([{ id: 'a_pedir', nome: 'A pedir' }].concat(FIM), lin),
    { status: 409, body: { erro: 'A etapa Solicitado tem pedidos abertos.' } });
  // pedido concluido nao bloqueia; aba vazia (padrao) nao gera update de remocao
  const fin = linhas({ pedidos: [ped({ baixado_em: 'X', concluido_em: 'Y' })], pedidosItens: [pit({})] });
  const ok = s([{ id: 'a_pedir', nome: 'A pedir' }].concat(FIM), fin);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.operacoes.map((o) => o.operacao), ['appendOrUpdate', 'appendOrUpdate', 'appendOrUpdate']);
  // id gerado nao colide com existente
  const col = s([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'A-pedir!' }].concat(FIM));
  assert.equal(col.status, 200);
  assert.equal(col.operacoes[1].linha.id, 'a_pedir_2');
});
```

- apague a seção `// ---------- oficina ----------` inteira: a constante `NA_ULTIMA` e os testes `enviar_oficina: CAIXAS_PCP appendOrUpdate ...`, `enviar_oficina: 409 enquanto o material nao esta todo na ultima etapa`, `oficina_recebeu: baixa total dos itens abertos e tratativa RECEBIDO`, `oficina: 403 fora de DEALS_EDITAVEIS`; apague também `oficina_recebeu: qtd_baixada ilegivel -> 400`;
- no teste `ACOES_F3_ATIVAS=false ...`, troque `{ tipo: 'enviar_oficina', dealId: '600001', versao: '' }` por `{ tipo: 'mover_pedido', pedidoId: 'PED-0043', versao: 'P1', etapa: 'aguardando' }`.

`n8n/test/resolvido-previsao.test.js`:
- troque o comentário do topo por `// 08/10/2026: previsao por item (PEDIDOS_ITENS.previsao, dividir_por_previsao) e a baixa ao entrar na etapa da baixa (desde 09/10/2026 a penultima: Enviado ao destino final).`;
- apague os testes `etapas padrao: a ultima tem id entregue e nome Resolvido`, `editar_pedido com etapa = ultima tambem da a baixa (com as qtds novas)`, `dividir_pedido para a ultima etapa da a baixa so da parte nova` e `salvar_etapas: a ultima etapa (Resolvido) precisa continuar por ultimo` (cobertos em `etapas-novas.test.js`);
- nos testes `mover_pedido para a ultima etapa da a baixa e finaliza o pedido` (renomeie para `mover_pedido para a etapa da baixa da a baixa`) e `mover_pedido para a ultima etapa: SUBSTITUIDO e item ja resolvido ficam sem baixa`, troque `para Resolvido` por `para Enviado ao destino final` nos textos esperados;
- substitua o teste `mover_pedido: etapas configuradas, a ultima pela ordem e a que da baixa` por:

```js
test('mover_pedido: etapas configuradas, a penultima pela ordem e a que da baixa', () => {
  const etapas = [{ id: 'x', nome: 'Pedir', ordem: 1 }, { id: 'fim', nome: 'Recebido', ordem: 4 }, { id: 'y', nome: 'Chegou', ordem: 3 }, { id: 'z', nome: 'Meio', ordem: 2 }];
  const lin = linhas({ etapas, pedidos: [ped({ etapa: 'x' })] });
  const r = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'y' }, lin);
  assert.equal(r.operacoes[r.operacoes.length - 1].linha.baixado_em, ISO);
  assert.match(r.historicos[0].texto, /^Lucca moveu PED-0044 para Chegou e deu baixa: /);
  const meio = acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'z' }, lin);
  assert.deepEqual(meio.operacoes, [{ aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0044', etapa: 'z', atualizado_em: ISO } }]);
  assert.deepEqual(acao({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'P1', etapa: 'fim' }, lin),
    { status: 400, body: { erro: 'Mova o pedido primeiro para Chegou.' } });
});
```

- no teste `mover_pedido: sair da ultima etapa depois da baixa -> 409`, troque a mensagem por `'Pedido com baixa só pode ir para Concluído.'`;
- no teste `dividir_por_previsao: item sem data vai por ultimo; validacoes`, troque `'Pedido finalizado não pode ser alterado.'` por `'Pedido com baixa só pode ir para Concluído.'`;
- no teste `salvar_etapas: so administradores`, troque o `corpo` por `{ tipo: 'salvar_etapas', etapas: [{ id: 'a_pedir', nome: 'A pedir' }, { id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }] }`.

`n8n/test/dividir.test.js` (etapas do teste: A pedir · Solicitado · Recebidos · Entregue; logo, divide-se de Solicitado e a parte vai para Recebidos, com a baixa):
- troque o comentário do topo por `// F3: dividir_pedido (parte de um pedido chegou e vira PED-xxxx.n na etapa da baixa, com a baixa).`;
- substitua o teste `dividir_pedido: operacoes, historico por OS envolvida e pedidoId do filho` por:

```js
test('dividir_pedido: operacoes, baixa da parte, historico por OS envolvida e pedidoId do filho', () => {
  const r = div({ itens: [{ itemId: 'a', qtd: 20 }, { itemId: 'b', qtd: 10 }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.operacoes, [
    { aba: 'PEDIDOS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0002.1', etapa: 'recebidos', origem: 'FORNECEDOR', quem: 'METAIS GAMA', local: 'BRAGANCA', previsao: '2026-10-15',
      responsavel: 'Renata', criado_em: ISO, criado_por: 'Lucca', baixado_em: ISO, atualizado_em: ISO, pai: 'PED-0002' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0002.1|a', pedido_id: 'PED-0002.1', item_id: 'a', deal_id: '600001', os: '90001', nome: 'ZÍPER METAL', un: 'UN', qtd: 20, fornecedor: 'METAIS GAMA', previsao: '' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'append', chave: 'id', linha: {
      id: 'PED-0002.1|b', pedido_id: 'PED-0002.1', item_id: 'b', deal_id: '600001', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 10, fornecedor: '', previsao: '' } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0002|a', qtd: 32 } },
    { aba: 'PEDIDOS_ITENS', operacao: 'update', chave: 'id', linha: { id: 'PED-0002|b', qtd: 0 } },
    { aba: 'PEDIDOS', operacao: 'update', chave: 'id', linha: { id: 'PED-0002', atualizado_em: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'a', qtd_baixada: 20, atualizado_em_app: ISO } },
    { aba: 'FALTANTES', operacao: 'update', chave: 'id', linha: { id: 'b', qtd_baixada: 10, atualizado_em_app: ISO } }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.os, h.acao, h.texto]), [
    ['600001', '90001', 'dividir_pedido', 'Lucca dividiu PED-0002: 20 UN de ZÍPER METAL; 10 MT de VIÉS foram para PED-0002.1 (Recebidos)' +
      ' e deu baixa: 20 UN de ZÍPER METAL (resta 80 UN); 10 MT de VIÉS (resta 30 MT)']
  ]);
  assert.equal(r.body.pedidoId, 'PED-0002.1');
  assert.equal(r.body.versao, ISO);
  assert.equal(r.body.historicos.length, 1);
});
```

- substitua o teste `dividir_pedido: numero do filho = maior filho + 1; dividir um filho cria outro filho da raiz` por:

```js
test('dividir_pedido: numero do filho = maior filho + 1; dividir um filho cria outro filho da raiz', () => {
  const lin = linhas({
    pedidos: [ped({}), ped({ id: 'PED-0002.1', pai: 'PED-0002', etapa: 'solicitado', atualizado_em: 'F1' }),
      ped({ id: 'PED-0002.2', pai: 'PED-0002', etapa: 'recebidos', baixado_em: 'X' })],
    pedidosItens: ITENS_P.concat([pit({ id: 'PED-0002.1|a', pedido_id: 'PED-0002.1', qtd: 5 })])
  });
  const r = div({}, lin);
  assert.equal(r.body.pedidoId, 'PED-0002.3');
  assert.equal(r.operacoes[0].linha.pai, 'PED-0002');
  const f = div({ pedidoId: 'PED-0002.1', versao: 'F1', itens: [{ itemId: 'a', qtd: 2 }] }, lin);
  assert.equal(f.status, 200);
  assert.equal(f.body.pedidoId, 'PED-0002.3');
  assert.equal(f.operacoes[0].linha.pai, 'PED-0002');
  assert.deepEqual(f.operacoes[2].linha, { id: 'PED-0002.1|a', qtd: 3 });
  assert.equal(f.historicos[0].texto, 'Lucca dividiu PED-0002.1: 2 UN de ZÍPER METAL foram para PED-0002.3 (Recebidos) e deu baixa: 2 UN de ZÍPER METAL (resta 98 UN)');
  // fora da etapa anterior a da baixa nao divide
  const fora = linhas({ pedidos: [ped({ etapa: 'a_pedir' })] });
  assert.deepEqual(div({}, fora), { status: 400, body: { erro: 'Dividir só com o pedido em Solicitado.' } });
});
```

- no teste `dividir_pedido: validacoes`, troque a linha do finalizado por `assert.deepEqual(div({}, linhas({ pedidos: [ped({ baixado_em: 'X' })] })), { status: 409, body: { erro: 'Pedido com baixa só pode ir para Entregue.' } });` e apague a linha `assert.deepEqual(div({ etapa: 'nao_existe' }), ...)` (a etapa do corpo é ignorada).

- [ ] **Step 7: Rodar toda a suíte do n8n**

Run: `cd n8n && npm test`
Expected: PASS em todos os arquivos (nenhum `not ok`).

- [ ] **Step 8: Regenerar o build**

Run: `cd n8n && npm run build`
Expected: lista `build/*.js` e regrava `workflows/pcp-api.sdk.js`, `workflows/pcp-api-homolog.sdk.js`, `workflows/pcp-envio.sdk.js` e `workflows/json/*.json` sem erro. Confira com `git status` que só esses arquivos e os de `src/`/`test/` mudaram.

- [ ] **Step 9: Commit**

```bash
git add n8n/src/pedidos.js n8n/src/montarCaixas.js n8n/test n8n/build n8n/workflows
git commit -m "$(cat <<'EOF'
feat(n8n): etapas novas (Enviado ao destino final e Concluído), dividir para a baixa e fim da oficina

A penúltima etapa dá a baixa e a última finaliza (concluido_em). Pedido com baixa só
vai para a etapa final e não prende mais o item. editar_pedido não muda etapa, dividir
só de Aguardando entrega e salvar_etapas fixa as duas últimas (mínimo 3). Saem
enviar_oficina, oficina_recebeu e a tratativa do board.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Web — Solicitações com as etapas novas e painel sem o campo Etapa

**Files:**
- Modify: `web/src/api/tipos.ts`, `web/src/regras/pedidos.ts`, `web/src/regras/pedidosQuadro.ts`, `web/src/regras/otimista.ts`
- Modify: `web/src/componentes/pedidos/QuadroPedidos.tsx`, `PainelPedido.tsx`, `CamposPedido.tsx`, `JanelaEtapas.tsx`, `CardPedido.tsx`, `DividirPedido.tsx` (só imports)
- Create: `web/src/regras/etapas.test.ts`
- Rename+rewrite: `web/src/regras/resolvido.test.ts` → `web/src/regras/previsao.test.ts`
- Modify: `web/src/regras/pedidos.test.ts`, `pedidosQuadro.test.ts`, `otimista.test.ts`
- Modify: `web/scripts/mock-api.mjs`, `web/e2e/fixtures/board.json`, `web/e2e/f3.spec.ts`, `web/e2e/mock-servidor.spec.ts`

**Interfaces:**
- Consumes: board da Tarefa 1 (`concluidoEm`, `finalizado` = concluído, 5 etapas).
- Produces: `etapaFinal(etapas)`, `etapaDaBaixa(etapas)` em `regras/pedidos.ts` (`EtapaPedido | undefined`); `etapaNoQuadro(p, etapas)`, `entraNaEtapaDaBaixa(de, para, etapas)`, `textoConfirmarBaixa(itens, nomeEtapa)`, `motivoMoverPedido(p, para, etapas): string | null`, `pedidoArrastavel(board, p)`, `pedidoEditavel(board, p)` em `regras/pedidosQuadro.ts`; `resumoAlteracoes(antes, depois)` (sem o 3º argumento); `EstadoEditavel` sem `etapa`; `Pedido.concluidoEm?: string`; `editar_pedido.campos: Partial<DadosPedido>`.

- [ ] **Step 1: Escrever os testes novos (falham)**

Crie `web/src/regras/etapas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Board, EtapaPedido, ItemPedido, Pedido } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import { etapaDaBaixa, etapaFinal, validarEtapas } from './pedidos';
import {
  entraNaEtapaDaBaixa, etapaNoQuadro, motivoMoverPedido, motivoTravaEtapa, pedidoArrastavel, pedidoEditavel, textoConfirmarBaixa, vazioDaEtapa
} from './pedidosQuadro';

// 09/10/2026: A pedir · Solicitado · Aguardando entrega · Enviado ao destino final (dá a baixa) ·
// Concluído (o destino confirmou; finaliza o pedido). As duas últimas ficam fixas.
const etapas: EtapaPedido[] = [
  { id: 'concluido', nome: 'Concluído', ordem: 5 }, { id: 'a_pedir', nome: 'A pedir', ordem: 1 },
  { id: 'solicitado', nome: 'Solicitado', ordem: 2 }, { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 },
  { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 }
];
const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
const ip = (o: Partial<ItemPedido> = {}): ItemPedido => ({ itemId: 'i1', dealId: '1', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', ...o });
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0044', pai: '', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'BETA', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false, itens: [ip(), ip({ itemId: 'i2', dealId: '2', os: '90002' })], ...o
});
const livre: Pick<Board, 'dealsEditaveis'> = { dealsEditaveis: [] };

describe('etapas fixas no fim', () => {
  it('a penúltima dá a baixa e a última finaliza, pela ordem', () => {
    expect(etapaDaBaixa(etapas)?.id).toBe('entregue');
    expect(etapaFinal(etapas)?.id).toBe('concluido');
    expect(etapaDaBaixa([etapas[0]])).toBeUndefined();
    expect(etapaFinal([])).toBeUndefined();
  });
  it('coluna no quadro: concluído na final, com baixa na da baixa, senão a etapa gravada', () => {
    expect(etapaNoQuadro(ped(), etapas)).toBe('aguardando');
    expect(etapaNoQuadro(ped({ baixadoEm: '2026-10-07' }), etapas)).toBe('entregue');
    expect(etapaNoQuadro(ped({ etapa: 'entregue', baixadoEm: '2026-10-07', finalizado: true }), etapas)).toBe('concluido');
  });
  it('confirmação só ao entrar na etapa da baixa', () => {
    expect(entraNaEtapaDaBaixa('aguardando', 'entregue', etapas)).toBe(true);
    expect(entraNaEtapaDaBaixa('entregue', 'concluido', etapas)).toBe(false);
    expect(entraNaEtapaDaBaixa('a_pedir', 'solicitado', etapas)).toBe(false);
    expect(textoConfirmarBaixa(ped().itens, 'Enviado ao destino final'))
      .toBe('Mover para Enviado ao destino final dá baixa de 2 itens em 2 OS. A baixa não pode ser desfeita.');
  });
  it('com a baixa, só vai para a final; a final só aceita pedido com baixa', () => {
    expect(motivoMoverPedido(ped(), 'solicitado', etapas)).toBeNull();
    expect(motivoMoverPedido(ped(), 'entregue', etapas)).toBeNull();
    expect(motivoMoverPedido(ped(), 'concluido', etapas)).toBe('Mova o pedido primeiro para Enviado ao destino final.');
    const comBaixa = ped({ etapa: 'entregue', baixadoEm: '2026-10-07' });
    expect(motivoMoverPedido(comBaixa, 'concluido', etapas)).toBeNull();
    expect(motivoMoverPedido(comBaixa, 'aguardando', etapas)).toBe('Pedido com baixa só pode ir para Concluído.');
  });
  it('pedido com baixa arrasta mas não edita; finalizado nem arrasta', () => {
    const comBaixa = ped({ baixadoEm: '2026-10-07' });
    expect(pedidoArrastavel(livre, comBaixa)).toBe(true);
    expect(pedidoEditavel(livre, comBaixa)).toBe(false);
    expect(pedidoEditavel(livre, ped())).toBe(true);
    expect(pedidoArrastavel(livre, ped({ finalizado: true }))).toBe(false);
    expect(pedidoArrastavel({ dealsEditaveis: ['1'] }, ped())).toBe(false);
  });
  it('vazio das colunas', () => {
    expect(vazioDaEtapa('aberto', 0, 5, false)).toBe('Pedidos gerados a partir das faltas entram aqui.');
    expect(vazioDaEtapa('aberto', 2, 5, false)).toBe('Arraste um pedido para esta etapa.');
    expect(vazioDaEtapa('aberto', 3, 5, false)).toBe('Mover um pedido para cá dá baixa nas caixas.');
    expect(vazioDaEtapa('aberto', 4, 5, false)).toBe('O destino confirmou o recebimento: o pedido termina aqui.');
    expect(vazioDaEtapa('finalizado', 4, 5, false)).toBe('Nenhum pedido finalizado ainda.');
  });
  it('mensagem do mover para a etapa da baixa', () => {
    expect(mensagemSucesso({ tipo: 'mover_pedido', pedidoId: 'PED-0044', versao: 'v1', etapa: 'entregue' }, undefined, { etapa: 'Enviado ao destino final', baixa: true }))
      .toBe('PED-0044 movido para Enviado ao destino final · baixa registrada nas caixas');
  });
});

describe('validarEtapas e motivoTravaEtapa', () => {
  const FIM = [{ id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }];
  it('mínimo de 3', () => {
    expect(validarEtapas(FIM, [], ordenadas)).toBe('O quadro precisa de pelo menos 3 etapas.');
    expect(motivoTravaEtapa(undefined, 3, [])).toBe('O quadro precisa de pelo menos 3 etapas');
    expect(motivoTravaEtapa(undefined, 4, [])).toBeNull();
  });
  it('as duas últimas continuam no fim, nessa ordem (podem ser renomeadas)', () => {
    const msg = 'As etapas Enviado ao destino final e Concluído precisam continuar no fim, nessa ordem.';
    expect(validarEtapas([{ id: 'a_pedir', nome: 'A pedir' }, FIM[1], FIM[0]], [], ordenadas)).toBe(msg);
    expect(validarEtapas([{ id: 'a_pedir', nome: 'A pedir' }, ...FIM, { nome: 'Depois' }], [], ordenadas)).toBe(msg);
    expect(validarEtapas([{ id: 'a_pedir', nome: 'A pedir' }, { nome: 'Nova' }, { id: 'entregue', nome: 'Enviado' }, { id: 'concluido', nome: 'Recebido' }], [], ordenadas)).toBeNull();
  });
  it('etapa com pedido não concluído não sai', () => {
    const novas = [{ id: 'a_pedir', nome: 'A pedir' }, ...FIM];
    expect(validarEtapas(novas, [ped({ etapa: 'solicitado' })], ordenadas)).toBe('A etapa Solicitado tem pedidos abertos.');
    expect(validarEtapas(novas, [ped({ etapa: 'solicitado', finalizado: true })], ordenadas)).toBeNull();
  });
});
```

No `web/src/regras/otimista.test.ts`:
- troque a constante `etapas` por:

```ts
const etapas: EtapaPedido[] = [
  { id: 'a', nome: 'A pedir', ordem: 1 },
  { id: 'sol', nome: 'Solicitado', ordem: 2 },
  { id: 'ent', nome: 'Enviado ao destino final', ordem: 3 },
  { id: 'fim', nome: 'Concluído', ordem: 4 }
];
```

- substitua o teste `mover para a última etapa finaliza, dá a baixa e solta o item do pedido` por:

```ts
  it('mover para a etapa da baixa dá a baixa e solta o item, mas o pedido continua aberto', () => {
    const b = aplicar(quadro(), { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'ent' });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'ent', finalizado: false, baixadoEm: '2026-10-08' });
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 52, resta: 0, pedidoIds: [], pedidoId: '' });
    expect(itemDe(b, 'i2')).toMatchObject({ resta: 0 });
  });
  it('etapa final: só com a baixa; grava concluidoEm e finaliza; com baixa não muda de outro jeito', () => {
    const b0 = quadro({ pedidos: [ped({ etapa: 'ent', baixadoEm: '2026-10-07' })] });
    const b = aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'fim' });
    expect(pedidoDe(b, 'PED-0002')).toMatchObject({ etapa: 'fim', finalizado: true, concluidoEm: '2026-10-08' });
    const sem = quadro();
    expect(aplicar(sem, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'fim' })).toBe(sem);
    expect(aplicar(b0, { tipo: 'mover_pedido', pedidoId: 'PED-0002', versao: 'v1', etapa: 'a' })).toBe(b0);
    expect(aplicar(b0, { tipo: 'editar_pedido', pedidoId: 'PED-0002', versao: 'v1', campos: { quem: 'X' } })).toBe(b0);
  });
```

- substitua o teste `baixar_pedido só na última etapa` por:

```ts
  it('baixar_pedido só na etapa da baixa; dá a baixa sem finalizar', () => {
    const b0 = quadro();
    expect(aplicar(b0, { tipo: 'baixar_pedido', pedidoId: 'PED-0002', versao: 'v1' })).toBe(b0);
    const b1 = quadro({ pedidos: [ped({ etapa: 'ent' })] });
    expect(pedidoDe(aplicar(b1, { tipo: 'baixar_pedido', pedidoId: 'PED-0002', versao: 'v1' }), 'PED-0002'))
      .toMatchObject({ baixadoEm: '2026-10-08', finalizado: false });
  });
```

- apague o teste `editar_pedido para a última etapa dá a baixa com a quantidade editada`;
- no teste `dividir_pedido: parte provisória com o id previsto e o resto no original`, troque a linha do `toMatchObject` da parte e o comentário por:

```ts
    expect(parte).toMatchObject({ pai: 'PED-0002', etapa: 'ent', provisorio: true, finalizado: false, baixadoEm: '2026-10-08', criadoEm: '2026-10-08' });
    expect(parte.itens.map((i) => [i.itemId, i.qtd])).toEqual([['i1', 20], ['i2', 10]]);
    // a parte em Enviado ao destino final já deu a baixa; o i2 foi todo e saiu do PED-0002
```

- no teste `salvar_etapas: nomes, ordem e id provisório para a etapa nova`, mantenha como está (o otimista não valida).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/regras/etapas.test.ts src/regras/otimista.test.ts`
Expected: FAIL (`etapaDaBaixa`, `etapaFinal`, `motivoMoverPedido`, `pedidoArrastavel`, `entraNaEtapaDaBaixa`, `textoConfirmarBaixa` não existem; mover para `ent` finaliza).

- [ ] **Step 3: Tipos**

Em `web/src/api/tipos.ts`, no `Pedido`, troque as linhas de `baixadoEm`/`finalizado` por:

```ts
  baixadoEm: string; // baixa dada nas caixas (entrou em "Enviado ao destino final"); o pedido segue aberto
  concluidoEm?: string; // o destino confirmou o recebimento (etapa final)
  versao: string;
  finalizado: boolean; // concluído
```

e, na `Acao`, troque `campos: Partial<DadosPedido & { etapa: string }>;` por `campos: Partial<DadosPedido>; // a etapa muda só arrastando (mover_pedido)`.

- [ ] **Step 4: `web/src/regras/pedidos.ts`**

Troque `ultimaEtapa` (linhas 48–52) por:

```ts
// Etapas em ordem. As duas últimas são fixas: a penúltima dá a baixa (Enviado ao destino
// final) e a última finaliza o pedido (Concluído: o destino confirmou que recebeu).
function emOrdem(etapas: EtapaPedido[]): EtapaPedido[] {
  return [...etapas].sort((a, b) => a.ordem - b.ordem);
}

export function etapaFinal(etapas: EtapaPedido[]): EtapaPedido | undefined {
  const o = emOrdem(etapas);
  return o[o.length - 1];
}

export function etapaDaBaixa(etapas: EtapaPedido[]): EtapaPedido | undefined {
  const o = emOrdem(etapas);
  return o.length >= 2 ? o[o.length - 2] : undefined;
}
```

Em `EstadoEditavel`, apague a linha `etapa: string;`. Troque `resumoAlteracoes` por:

```ts
// Mesmas linhas que o servidor grava no histórico do editar_pedido. Vazio = "Nada alterado".
export function resumoAlteracoes(antes: EstadoEditavel, depois: EstadoEditavel): string[] {
  const dia = (s: string) => (s === '' ? '—' : ddmm(s) || s);
  const out: string[] = [];
  if (antes.origem !== depois.origem) out.push(`Origem: ${nomeOrigem(antes.origem)} → ${nomeOrigem(depois.origem)}`);
  if (antes.quem !== depois.quem) out.push(`Quem: ${ou(antes.quem)} → ${ou(depois.quem)}`);
  if (antes.local !== depois.local) out.push(`Local: ${nomeLocal(antes.local)} → ${nomeLocal(depois.local)}`);
  if (antes.previsao !== depois.previsao) out.push(`Previsão: ${dia(antes.previsao)} → ${dia(depois.previsao)}`);
  if (antes.responsavel !== depois.responsavel) out.push(`Responsável: ${ou(antes.responsavel)} → ${ou(depois.responsavel)}`);
  for (const d of depois.itens) {
    const a = antes.itens.find((i) => i.itemId === d.itemId);
    if (!a) continue;
    if (arredondar3(a.qtd) !== arredondar3(d.qtd)) out.push(`qtd de ${d.nome}: ${formatarNumero(a.qtd)} → ${formatarNumero(d.qtd)}`);
    if (a.fornecedor !== d.fornecedor) out.push(`fornecedor de ${d.nome}: ${ou(a.fornecedor)} → ${ou(d.fornecedor)}`);
    if (previsaoDoItemMudou(antes, depois, d)) out.push(`previsão de ${d.nome}: ${dia(previsaoEfetiva(antes, a))} → ${dia(previsaoEfetiva(depois, d))}`);
  }
  return out;
}
```

Troque `validarEtapas` por:

```ts
// Etapas como ficariam: ao menos 3, nomes não vazios e únicos, as duas últimas atuais no fim
// e na mesma ordem (podem ser renomeadas) e nenhuma etapa com pedido aberto (não concluído)
// sai do quadro (as atuais são comparadas pelo id). Mesmas regras do servidor.
export function validarEtapas(
  etapas: { id?: string; nome: string }[],
  pedidos: Pedido[],
  atuais: EtapaPedido[] = []
): string | null {
  if (etapas.length < 3) return 'O quadro precisa de pelo menos 3 etapas.';
  const vistos = new Set<string>();
  for (const e of etapas) {
    const n = e.nome.trim();
    if (n === '') return 'Dê um nome a todas as etapas.';
    const chave = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (vistos.has(chave)) return `Já existe uma etapa chamada ${n}.`;
    vistos.add(chave);
  }
  const o = emOrdem(atuais);
  if (o.length >= 2) {
    const baixa = o[o.length - 2];
    const final = o[o.length - 1];
    const n = etapas.length;
    if (etapas[n - 2].id !== baixa.id || etapas[n - 1].id !== final.id) {
      return `As etapas ${baixa.nome} e ${final.nome} precisam continuar no fim, nessa ordem.`;
    }
  }
  const mantidas = new Set(etapas.map((e) => e.id).filter(Boolean));
  for (const a of o) {
    if (!mantidas.has(a.id) && pedidos.some((p) => !p.finalizado && p.etapa === a.id)) {
      return `A etapa ${a.nome} tem pedidos abertos.`;
    }
  }
  return null;
}
```

- [ ] **Step 5: `web/src/regras/pedidosQuadro.ts`**

Troque o import `import { faltasSemPedido, previsaoDoItemMudou, ultimaEtapa } from './pedidos';` por `import { etapaDaBaixa, etapaFinal, faltasSemPedido, previsaoDoItemMudou } from './pedidos';` e o import de tipos para incluir `DadosPedido` (já está). Troque o bloco de `etapaNoQuadro` até `vazioDaEtapa` (linhas 36–67) por:

```ts
// Coluna do pedido no quadro: o concluído fica na etapa final; o que já tem a baixa fica na
// etapa da baixa (mesmo com outra etapa gravada); os outros, na etapa gravada.
export function etapaNoQuadro(p: Pick<Pedido, 'etapa' | 'finalizado' | 'baixadoEm'>, etapas: EtapaPedido[]): string {
  if (p.finalizado) return etapaFinal(etapas)?.id ?? p.etapa;
  if (p.baixadoEm) return etapaDaBaixa(etapas)?.id ?? p.etapa;
  return p.etapa;
}

// Mudar de `de` para `para` entra na etapa da baixa (pede confirmação: a baixa não volta).
export function entraNaEtapaDaBaixa(de: string, para: string, etapas: EtapaPedido[]): boolean {
  const b = etapaDaBaixa(etapas);
  return !!b && para === b.id && de !== b.id;
}

// "Mover para Enviado ao destino final dá baixa de 2 itens em 2 OS. A baixa não pode ser desfeita."
export function textoConfirmarBaixa(itens: Pick<ItemPedido, 'dealId'>[], nomeEtapa: string): string {
  const n = itens.length;
  const os = new Set(itens.map((i) => i.dealId)).size;
  return `Mover para ${nomeEtapa} dá baixa de ${n} ${n === 1 ? 'item' : 'itens'} em ${os} OS. A baixa não pode ser desfeita.`;
}

// Por que o pedido não pode ir para `para` (null = pode). Com a baixa dada ele só vai para a
// etapa final, e a final só aceita pedido com a baixa dada. Mesma regra do servidor.
export function motivoMoverPedido(p: Pick<Pedido, 'baixadoEm'>, para: string, etapas: EtapaPedido[]): string | null {
  const final = etapaFinal(etapas);
  if (!final) return null;
  if (p.baixadoEm && para !== final.id) return `Pedido com baixa só pode ir para ${final.nome}.`;
  if (!p.baixadoEm && para === final.id) return `Mova o pedido primeiro para ${etapaDaBaixa(etapas)?.nome ?? final.nome}.`;
  return null;
}

const osLiberadas = (board: Pick<Board, 'dealsEditaveis'>, p: Pedido): boolean =>
  p.itens.every((i) => caixaEditavelNoApp(board, { dealId: i.dealId }));

// Pedido que pode ser arrastado: não finalizado, já gravado (não provisório) e com todas as OS liberadas.
export function pedidoArrastavel(board: Pick<Board, 'dealsEditaveis'>, p: Pedido): boolean {
  return !p.finalizado && !p.provisorio && osLiberadas(board, p);
}

// Pedido editável no painel: arrastável e ainda sem a baixa (com a baixa, só vai para a etapa final).
export function pedidoEditavel(board: Pick<Board, 'dealsEditaveis'>, p: Pedido): boolean {
  return pedidoArrastavel(board, p) && !p.baixadoEm;
}

export function vazioDaEtapa(filtro: FiltroPedidos, indice: number, total: number, temBusca: boolean): string {
  if (temBusca) return 'Nenhum pedido desta etapa atende à busca.';
  const ultima = indice === total - 1;
  if (filtro === 'finalizado') return ultima ? 'Nenhum pedido finalizado ainda.' : 'Pedidos finalizados ficam na última etapa.';
  if (ultima) return 'O destino confirmou o recebimento: o pedido termina aqui.';
  if (indice === total - 2) return 'Mover um pedido para cá dá baixa nas caixas.';
  if (indice === 0) return 'Pedidos gerados a partir das faltas entram aqui.';
  return 'Arraste um pedido para esta etapa.';
}
```

Em `estadoDoPedido`, apague `etapa: p.etapa, ` (o objeto começa em `origem`). Troque `const CAMPOS = ['etapa', 'origem', ...] as const;` por `const CAMPOS = ['origem', 'quem', 'local', 'previsao', 'responsavel'] as const;` e, em `acaoEditarPedido`, troque `campos: campos as Partial<DadosPedido & { etapa: string }>,` por `campos: campos as Partial<DadosPedido>,`. Em `motivoTravaEtapa`, troque a linha do mínimo por `if (totalNoRascunho <= 3) return 'O quadro precisa de pelo menos 3 etapas';`.

- [ ] **Step 6: `web/src/regras/otimista.ts`**

Troque os imports de `./pedidos` e `./pedidosQuadro` por:

```ts
import { PREFIXO_NOVO, etapaDaBaixa, etapaFinal } from './pedidos';
import { etapasOrdenadas, motivoMoverPedido, partesPorPrevisao, proximoIdParte, raizDoPedido } from './pedidosQuadro';
```

Em `atualizarPedidosDosItens`, troque o filtro `!p.finalizado && ...` por `!p.baixadoEm && ...` e o comentário por `// pedidoIds/pedidoId dos itens tocados: só pedidos ainda sem baixa (o pedido com a baixa dada não segura mais o item).`. Troque a função `finalizar` por:

```ts
// Entrar na etapa da baixa (Enviado ao destino final) dá a baixa nas caixas e solta os itens;
// o pedido continua aberto até a etapa final.
function darBaixa(board: Board, id: string, hoje: string): Board {
  const p = pedidoDe(board, id);
  if (!p) return board;
  let b = comPedido(board, id, (x) => ({ ...x, baixadoEm: hoje }));
  b = baixaDosItens(b, p.itens);
  return atualizarPedidosDosItens(b, p.itens);
}
```

Em `aplicarOtimista`, troque `const ultima = ultimaEtapa(etapas)?.id;` por:

```ts
  const baixa = etapaDaBaixa(etapas)?.id;
  const final = etapaFinal(etapas)?.id;
```

e troque os casos `mover_pedido`, `baixar_pedido`, o começo/fim do `editar_pedido`, a última linha do `dividir_pedido` e o começo do `dividir_por_previsao` por:

```ts
    case 'mover_pedido': {
      if (motivoMoverPedido(p, acao.etapa, etapas)) return board; // o servidor recusaria
      const b = comPedido(board, p.id, (x) => ({ ...x, etapa: acao.etapa }));
      if (acao.etapa === final) return comPedido(b, p.id, (x) => ({ ...x, concluidoEm: ctx.hoje, finalizado: true }));
      return acao.etapa === baixa && !p.baixadoEm ? darBaixa(b, p.id, ctx.hoje) : b;
    }
    case 'baixar_pedido':
      return p.etapa === baixa && !p.baixadoEm ? darBaixa(board, p.id, ctx.hoje) : board;
    case 'editar_pedido': {
      if (p.baixadoEm) return board;
      const c = acao.campos;
      // ... (o corpo de hoje, igual, até `const definidos = ...`)
      return comPedido(board, p.id, (x) => comPrevisoesResumidas({ ...x, ...definidos, itens }));
    }
```

No `dividir_pedido`, acrescente `if (p.baixadoEm) return board;` na primeira linha do caso e troque `if (acao.etapa === ultima) b = finalizar(b, parteId, ctx.hoje);` por `if (acao.etapa === baixa) b = darBaixa(b, parteId, ctx.hoje);`. No `dividir_por_previsao`, acrescente `if (p.baixadoEm) return board;` na primeira linha do caso.

- [ ] **Step 7: Rodar os testes de regra**

Run: `cd web && npx vitest run src/regras/etapas.test.ts src/regras/otimista.test.ts`
Expected: PASS.

- [ ] **Step 8: Ajustar os outros testes de regra**

`web/src/regras/pedidos.test.ts`:
- no import, troque `ultimaEtapa` por `etapaFinal` e apague `validarEtapas`;
- troque `describe('ultimaEtapa / quemDoPedido', () => { it('última pela ordem', () => expect(ultimaEtapa(etapas)?.id).toBe('c'));` por `describe('etapaFinal / quemDoPedido', () => { it('última pela ordem', () => expect(etapaFinal(etapas)?.id).toBe('c'));`;
- substitua o `describe('resumoAlteracoes', ...)` por:

```ts
describe('resumoAlteracoes', () => {
  const base: EstadoEditavel = {
    origem: 'FORNECEDOR', quem: 'ALFA', local: 'BRAGANCA', previsao: '2026-10-09', responsavel: 'Renata',
    itens: [{ itemId: 'i1', nome: 'ZÍPER', un: 'UN', qtd: 10, fornecedor: '', previsao: '' }]
  };
  it('sem mudança: vazio', () => expect(resumoAlteracoes(base, structuredClone(base))).toEqual([]));
  it('linhas no formato do servidor', () => {
    const depois: EstadoEditavel = {
      ...base, previsao: '2026-10-12', responsavel: '',
      itens: [{ itemId: 'i1', nome: 'ZÍPER', un: 'UN', qtd: 8, fornecedor: 'FITAS', previsao: '' }]
    };
    expect(resumoAlteracoes(base, depois)).toEqual([
      'Previsão: 09/10 → 12/10',
      'Responsável: Renata → —',
      'qtd de ZÍPER: 10 → 8',
      'fornecedor de ZÍPER: — → FITAS'
    ]);
  });
});
```

- apague o `describe('validarEtapas', ...)` inteiro (coberto em `etapas.test.ts`).

`web/src/regras/pedidosQuadro.test.ts`:
- no `describe('vazioDaEtapa')`, troque `expect(vazioDaEtapa('aberto', 1, 3, false)).toBe('Arraste um pedido para esta etapa.');` por `expect(vazioDaEtapa('aberto', 1, 4, false)).toBe('Arraste um pedido para esta etapa.');`;
- no teste `só os campos e itens alterados`, troque `const depois: EstadoEditavel = { ...structuredClone(antes), etapa: 'b', previsao: '2026-10-20' };` por `const depois: EstadoEditavel = { ...structuredClone(antes), previsao: '2026-10-20' };` e `campos: { etapa: 'b', previsao: '2026-10-20' },` por `campos: { previsao: '2026-10-20' },`;
- no `describe('motivoTravaEtapa')`, renomeie para `'etapa com pedido aberto ou quadro com 3 etapas não sai'` e troque as duas últimas linhas por:

```ts
    expect(motivoTravaEtapa(undefined, 3, [])).toBe('O quadro precisa de pelo menos 3 etapas');
    expect(motivoTravaEtapa('z', 4, [ped()])).toBeNull();
```

`web/src/regras/resolvido.test.ts` → renomeie e reescreva só com a previsão:

Run: `cd web && git mv src/regras/resolvido.test.ts src/regras/previsao.test.ts`

e deixe `web/src/regras/previsao.test.ts` assim:

```ts
import { describe, expect, it } from 'vitest';
import type { ItemPedido, Pedido } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import { resumoAlteracoes } from './pedidos';
import {
  acaoEditarPedido, estadoDoPedido, partesPorPrevisao, previsaoMaisProxima, previsoesDiferentes, resumoDivisaoPorPrevisao
} from './pedidosQuadro';

// 08/10/2026: previsão por item (PEDIDOS_ITENS.previsao) e dividir por previsão.
const ip = (o: Partial<ItemPedido> = {}): ItemPedido => ({
  itemId: 'i1', dealId: '1', os: '90001', nome: 'VIÉS', un: 'MT', qtd: 20, fornecedor: '', ...o
});
const ped = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0044', pai: '', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'BETA', local: 'BRAGANCA', previsao: '2026-10-15',
  responsavel: '', criadoEm: '', baixadoEm: '', versao: 'v1', finalizado: false,
  itens: [ip(), ip({ itemId: 'i2', dealId: '2', os: '90002', nome: 'ZÍPER', un: 'UN', qtd: 5 })], ...o
});

describe('previsão por item', () => {
  const tres = ped({
    itens: [
      ip({ previsao: '2026-10-15' }),
      ip({ itemId: 'i2', dealId: '2', os: '90002', nome: 'BOTÃO', un: 'UN', qtd: 5, previsao: '2026-10-25' }),
      ip({ itemId: 'i3', nome: 'ZÍPER', un: 'UN', qtd: 6, previsao: '2026-10-20' })
    ]
  });
  it('mais próxima e previsões diferentes (com ou sem os campos do board)', () => {
    expect(previsaoMaisProxima(tres)).toBe('2026-10-15');
    expect(previsoesDiferentes(tres)).toBe(true);
    expect(previsoesDiferentes(ped())).toBe(false);
    expect(previsaoMaisProxima(ped({ previsao: '' }))).toBe('');
    expect(previsaoMaisProxima({ ...tres, previsaoMaisProxima: '2026-10-01' })).toBe('2026-10-01');
  });
  it('partes por previsão: a mais próxima fica; ids das partes em sequência', () => {
    const outras = [tres, ped({ id: 'PED-0044.1', pai: 'PED-0044' })];
    const partes = partesPorPrevisao(tres, outras);
    expect(partes.map((p) => [p.id, p.previsao, p.itens.map((i) => i.itemId)])).toEqual([
      ['PED-0044.2', '2026-10-20', ['i3']],
      ['PED-0044.3', '2026-10-25', ['i2']]
    ]);
    expect(resumoDivisaoPorPrevisao(tres, partes)).toEqual([
      'PED-0044.2 (previsão 20/10): 6 UN de ZÍPER',
      'PED-0044.3 (previsão 25/10): 5 UN de BOTÃO',
      'PED-0044 fica com: 20 MT de VIÉS (previsão 15/10)'
    ]);
  });
  it('estado editável guarda só a previsão própria do item; editar manda a previsão quando muda', () => {
    const p = ped({ itens: [ip({ previsao: '2026-10-15' }), ip({ itemId: 'i2', nome: 'ZÍPER', previsao: '2026-10-22' })] });
    const antes = estadoDoPedido(p);
    expect(antes.itens.map((i) => i.previsao)).toEqual(['', '2026-10-22']);
    const depois = structuredClone(antes);
    depois.itens[0].previsao = '2026-10-18';
    depois.itens[1].previsao = '';
    expect(acaoEditarPedido(p, antes, depois)).toEqual({
      tipo: 'editar_pedido', pedidoId: 'PED-0044', versao: 'v1', campos: {},
      itens: [{ itemId: 'i1', qtd: 20, fornecedor: '', previsao: '2026-10-18' }, { itemId: 'i2', qtd: 20, fornecedor: '', previsao: '' }]
    });
    expect(resumoAlteracoes(antes, depois)).toEqual(['previsão de VIÉS: 15/10 → 18/10', 'previsão de ZÍPER: 22/10 → 15/10']);
    const igual = structuredClone(antes);
    igual.itens[0].previsao = '2026-10-15';
    expect(acaoEditarPedido(p, antes, igual)).toBeNull();
    expect(resumoAlteracoes(antes, igual)).toEqual([]);
  });
  it('mensagem de sucesso do dividir por previsão', () => {
    expect(mensagemSucesso({ tipo: 'dividir_por_previsao', pedidoId: 'PED-0044', versao: 'v1' }, undefined, { partes: 2 }))
      .toBe('PED-0044 dividido por previsão · 2 partes');
  });
});
```

Run: `cd web && npm test`
Expected: PASS (os componentes ainda não compilam no `tsc`, mas o Vitest não checa tipos).

- [ ] **Step 9: Componentes**

`web/src/componentes/pedidos/CamposPedido.tsx`: apague `etapa?: string;` do `FormPedido`, o `etapas?: EtapaPedido[]` das `Props`, o `EtapaPedido` do import de tipos, o parâmetro `etapas` da função e o bloco `{etapas && (<div className="campo">…Etapa…</div>)}`. Troque o comentário da função por `// Dados do pedido: solicitar a, fornecedor/cliente, local, previsão e responsável. A etapa muda só arrastando o card. Obrigatórios (asterisco): solicitar a, fornecedor/cliente, local e responsável; vazios, os selects mostram "Selecionar".`

`web/src/componentes/pedidos/PainelPedido.tsx`: substitua o arquivo inteiro por:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { lerQuantidade, mensagemSucesso } from '../../regras/acoes';
import { ddmm } from '../../regras/datas';
import { MSG_SOMENTE_LEITURA } from '../../regras/edicao';
import {
  clientesDasCaixas, erroEdicaoPedido, etapaFinal, nomeLocal, nomeOrigem, opcoesDeQuem, quemDoPedido, resumoAlteracoes, validarGerarPedido, type EstadoEditavel
} from '../../regras/pedidos';
import {
  acaoEditarPedido, camposAlterados, comAlterados, estadoDoPedido, etapaNoQuadro, historicoDoPedido, partesDoPedido, pedidoEditavel, textoFamilia
} from '../../regras/pedidosQuadro';
import { formatarQtd, qtdComUn, quantidadeParaCampo } from '../../regras/quantidade';
import { Historico } from '../painel/Historico';
import { CamposPedido, type FormPedido } from './CamposPedido';
import { DividirPedido } from './DividirPedido';
import { LinhaItemPedido, type TextoItem } from './LinhaItemPedido';
import { ResumoAlteracoes } from './ResumoAlteracoes';

interface Props {
  pedido: Pedido;
  board: Board;
  etapas: EtapaPedido[];
  executar: Executar;
  onFechar: () => void;
}

// Painel do pedido: edição com o resumo exato do que será gravado. A etapa muda só arrastando
// o card. O formulário é o pedido como está agora mais o que o usuário mudou: se o pedido mudar
// com o painel aberto (arraste, ação na fila, recarga), os campos não mexidos acompanham e o que
// foi digitado fica. Pedido com baixa (ou finalizado) é só leitura. Salvar não espera o servidor:
// o board já mostra as alterações (e volta atrás se ele recusar).
export function PainelPedido({ pedido, board, etapas, executar, onFechar }: Props) {
  useTeclaEsc(onFechar);
  const editavel = pedidoEditavel(board, pedido);
  const antes = useMemo(() => estadoDoPedido(pedido), [pedido]);
  const textosIniciais = useMemo(
    () => Object.fromEntries(antes.itens.map((i) => [i.itemId, { qtd: quantidadeParaCampo(i.qtd), fornecedor: i.fornecedor, previsao: i.previsao }])) as Record<string, TextoItem>,
    [antes]
  );
  const formInicial: FormPedido = {
    origem: pedido.origem, quem: pedido.quem, local: pedido.local, previsao: pedido.previsao, responsavel: pedido.responsavel
  };
  // Só o que o usuário mudou; o resto vem do pedido como está agora (regras/pedidosQuadro.ts).
  const [formAlterado, setFormAlterado] = useState<Partial<FormPedido>>({});
  const [textosAlterados, setTextosAlterados] = useState<Record<string, Partial<TextoItem>>>({});
  const form = comAlterados(formInicial, formAlterado);
  const textos = Object.fromEntries(Object.entries(textosIniciais).map(([k, t]) => [k, comAlterados(t, textosAlterados[k] ?? {})])) as Record<string, TextoItem>;
  // Depois de salvar o botão vira "Nada alterado" (desabilitado) e o foco iria para o <body>:
  // vai para o título do painel.
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const [focarTitulo, setFocarTitulo] = useState(false);
  useEffect(() => {
    if (!focarTitulo) return;
    tituloRef.current?.focus();
    setFocarTitulo(false);
  }, [focarTitulo]);

  const restaDe = (dealId: string, itemId: string) =>
    board.caixas.find((c) => c.dealId === dealId)?.itens.find((i) => i.id === itemId)?.resta ?? Number.POSITIVE_INFINITY;
  const mexidos = pedido.itens.filter((i) => textos[i.itemId].qtd !== textosIniciais[i.itemId].qtd);
  const erros = validarGerarPedido(mexidos.map((i) => ({ itemId: i.itemId, un: i.un, resta: restaDe(i.dealId, i.itemId) })),
    Object.fromEntries(mexidos.map((i) => [i.itemId, textos[i.itemId].qtd])));
  const depois: EstadoEditavel = {
    // no painel origem e local sempre vêm do pedido (nunca "Selecionar")
    origem: form.origem || pedido.origem, quem: form.quem.trim(), local: form.local || pedido.local,
    previsao: form.previsao, responsavel: form.responsavel,
    itens: antes.itens.map((i) => {
      const q = erros[i.itemId] ? null : lerQuantidade(textos[i.itemId].qtd);
      return { ...i, qtd: q ?? i.qtd, fornecedor: textos[i.itemId].fornecedor.trim(), previsao: textos[i.itemId].previsao ?? '' };
    })
  };
  const linhas = resumoAlteracoes(antes, depois);
  const erroDados = erroEdicaoPedido(antes, depois); // não deixa limpar fornecedor/cliente nem responsável
  const temErro = Object.keys(erros).length > 0 || erroDados !== null;
  const clientes = clientesDasCaixas(board.caixas, pedido.itens.map((i) => i.dealId));
  const fornecedores = board.fornecedores ?? [];

  function salvar() {
    const acao = acaoEditarPedido(pedido, antes, depois);
    if (!acao || temErro) return;
    void executar(acao, mensagemSucesso(acao));
    // o pedido na tela já tem as alterações (board otimista): o formulário volta a segui-lo
    setFormAlterado({});
    setTextosAlterados({});
    setFocarTitulo(true);
  }

  const historico = historicoDoPedido(board.caixas, pedido.id);
  const nomeEtapa = etapas.find((e) => e.id === etapaNoQuadro(pedido, etapas))?.nome ?? pedido.etapa;
  const todos = board.pedidos ?? [];
  const familia = textoFamilia(pedido, partesDoPedido(todos, pedido.id).length);
  const nota = pedido.finalizado
    ? `Pedido finalizado${pedido.concluidoEm ? ` em ${ddmm(pedido.concluidoEm)}` : ''}: o destino confirmou o recebimento.`
    : pedido.baixadoEm
      ? `Baixa registrada nas caixas em ${ddmm(pedido.baixadoEm)}. Quando o destino confirmar o recebimento, arraste o card para ${etapaFinal(etapas)?.nome ?? 'a última etapa'}.`
      : MSG_SOMENTE_LEITURA;
  return (
    <aside className="painel" aria-label={`Pedido ${pedido.id}`}>
      <div className="painel__cabecalho">
        <div className="painel__linha">
          <span className="tipo"><span className="tipo__ponto" style={{ background: pedido.origem === 'CLIENTE' ? 'var(--signal)' : 'var(--navy)' }} />Pedido de itens</span>
          <button type="button" className="painel__fechar" title="Fechar" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>
        <h2 ref={tituloRef} className="painel__os painel__titulo-foco" tabIndex={-1}>{pedido.id}</h2>
        <div className="painel__peca">{[nomeOrigem(pedido.origem), quemDoPedido(pedido)].filter(Boolean).join(' · ')}</div>
        <div className="painel__meta">{[pedido.criadoEm && `criado ${ddmm(pedido.criadoEm)}`, nomeEtapa].filter(Boolean).join(' · ')}</div>
        {familia && <div className="painel__meta painel__familia">{familia}</div>}
      </div>
      <div className="painel__corpo">
        {editavel ? (
          <>
            <CamposPedido valor={form} onMudar={(v) => setFormAlterado(camposAlterados(formInicial, v))}
              fornecedores={fornecedores} clientes={clientes} responsaveis={board.responsaveis ?? []} />
            <section className="secao">
              <h3 className="secao__titulo">Itens do pedido <span>{pedido.itens.length}</span></h3>
              <ul className="linhas-itens">
                {pedido.itens.map((i) => {
                  const resta = restaDe(i.dealId, i.itemId);
                  return (
                    <LinhaItemPedido key={i.itemId} os={i.os} nome={i.nome} un={i.un}
                      detalhe={Number.isFinite(resta) ? `resta ${qtdComUn(resta, i.un)} na caixa` : ''}
                      valor={textos[i.itemId]} erro={erros[i.itemId]} fornecedores={opcoesDeQuem(form.origem, fornecedores, clientes)}
                      onMudar={(v) => setTextosAlterados((t) => ({ ...t, [i.itemId]: camposAlterados(textosIniciais[i.itemId], v) }))} />
                  );
                })}
              </ul>
            </section>
            <ResumoAlteracoes linhas={linhas} />
            <div className="acoes">
              {erroDados && <p className="campo__erro" role="alert">{erroDados}</p>}
              <button type="button" className="botao botao--navy" disabled={linhas.length === 0 || temErro} onClick={salvar}>
                {linhas.length === 0 ? 'Nada alterado' : 'Salvar alterações'}
              </button>
            </div>
            <DividirPedido pedido={pedido} pedidos={todos} etapas={etapas} executar={executar} />
          </>
        ) : (
          <>
            <p className="item__nota" role="note">{nota}</p>
            <dl className="leitura">
              <div><dt>Etapa</dt><dd>{nomeEtapa}</dd></div>
              <div><dt>Previsão de entrega</dt><dd>{pedido.previsao ? ddmm(pedido.previsao) : '—'}</dd></div>
              <div><dt>Local de entrega</dt><dd>{nomeLocal(pedido.local)}</dd></div>
              <div><dt>Responsável</dt><dd>{pedido.responsavel || '—'}</dd></div>
            </dl>
            <section className="secao">
              <h3 className="secao__titulo">Itens do pedido <span>{pedido.itens.length}</span></h3>
              <ul className="itens">
                {pedido.itens.map((i) => (
                  <li key={i.itemId} className="item">
                    <span className="item__nome">OS {i.os} · {i.nome}</span>
                    <span className="item__conta">
                      {[formatarQtd(i.qtd, i.un, null), i.fornecedor, i.previsao && `previsão ${ddmm(i.previsao)}`].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
        <Historico entradas={historico} />
      </div>
    </aside>
  );
}
```

`web/src/componentes/pedidos/QuadroPedidos.tsx`: troque os imports e o miolo da função para:

```tsx
import { useState, type DragEvent } from 'react';
import type { Acao, Board, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import { PREFIXO_NOVO, etapaDaBaixa, type FiltroPedidos } from '../../regras/pedidos';
import {
  entraNaEtapaDaBaixa, etapaNoQuadro, motivoMoverPedido, partesDoPedido, pedidoArrastavel, pedidosForaDasEtapas, textoConfirmarBaixa, vazioDaEtapa
} from '../../regras/pedidosQuadro';
import { useAviso } from '../Aviso';
import { ColunaQuadro } from '../ColunaQuadro';
import { CardPedido } from './CardPedido';
import { ConfirmarResolvido } from './ConfirmarResolvido';
```

e, dentro da função, troque o comentário de cima e o trecho de `const ultima = ...` até `function confirmar() {...}` por:

```tsx
// Quadro de pedidos por etapa, com arrastar e soltar entre as colunas. A penúltima etapa
// (Enviado ao destino final) dá a baixa nas caixas: soltar um card nela pede confirmação. Com a
// baixa, o pedido só vai para a última (Concluído: o destino confirmou), que finaliza. O card muda
// de coluna na hora (board otimista); a gravação segue na fila, sem travar o próximo arraste.
export function QuadroPedidos({ board, etapas, pedidos, filtro, temBusca, selId, executar, onAbrir }: Props) {
  const avisar = useAviso();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [pendente, setPendente] = useState<string | null>(null); // pedido aguardando a confirmação da baixa
  const baixa = etapaDaBaixa(etapas);
  const etapaDe = (p: Pedido) => etapaNoQuadro(p, etapas);
  const origem = arrastando ? pedidos.find((p) => p.id === arrastando) : undefined;
  const etapaDeOrigem = origem ? etapaDe(origem) : null;
  const pedPendente = pendente ? pedidos.find((p) => p.id === pendente) : undefined;

  function mover(id: string, etapaId: string) {
    const p = pedidos.find((x) => x.id === id);
    if (!p || etapaDe(p) === etapaId || !pedidoArrastavel(board, p)) return;
    const acao: Acao = { tipo: 'mover_pedido', pedidoId: p.id, versao: p.versao, etapa: etapaId };
    void executar(acao, mensagemSucesso(acao, undefined, { etapa: etapas.find((e) => e.id === etapaId)?.nome, baixa: etapaId === baixa?.id }));
  }

  function soltar(id: string, etapaId: string) {
    const p = pedidos.find((x) => x.id === id);
    if (!p || etapaDe(p) === etapaId || !pedidoArrastavel(board, p)) return;
    if (etapaId.startsWith(PREFIXO_NOVO)) return; // etapa nova ainda gravando: o servidor não a conhece
    const motivo = motivoMoverPedido(p, etapaId, etapas);
    if (motivo) { avisar(motivo, 'erro'); return; }
    if (entraNaEtapaDaBaixa(etapaDe(p), etapaId, etapas)) { setPendente(id); return; }
    mover(id, etapaId);
  }

  function confirmar() {
    if (!pedPendente || !baixa) return;
    mover(pedPendente.id, baixa.id);
    setPendente(null);
  }
```

No `card`, troque `arrastavel={pedidoEditavel(board, p)}` por `arrastavel={pedidoArrastavel(board, p)}`. No `etapas.map`, troque o corpo para:

```tsx
        {etapas.map((et, idx) => {
          const ps = pedidos.filter((p) => etapaDe(p) === et.id);
          const ehUltima = idx === etapas.length - 1;
          return (
            <ColunaQuadro key={et.id} nome={et.nome} cor={ehUltima ? 'var(--success)' : 'var(--navy)'} qtd={ps.length}
              vazio={vazioDaEtapa(filtro, idx, etapas.length, temBusca)}
              alvo={sobre === et.id && arrastando !== null && etapaDeOrigem !== et.id}
              soltar={soltarEm(et.id)}>
              {et.id === baixa?.id && pedPendente && (
                <ConfirmarResolvido rotulo={`Confirmar ${et.nome} do ${pedPendente.id}`}
                  texto={textoConfirmarBaixa(pedPendente.itens, et.nome)} ocupado={false}
                  onConfirmar={confirmar} onCancelar={() => setPendente(null)} />
              )}
              {ps.map(card)}
            </ColunaQuadro>
          );
        })}
```

`web/src/componentes/pedidos/ConfirmarResolvido.tsx`: troque os comentários (`"Confirmar Resolvido do PED-0044"` → `"Confirmar Enviado ao destino final do PED-0044"`; `antes de mover um pedido para a última etapa` → `antes de mover um pedido para a etapa da baixa`). O nome do componente fica.

`web/src/componentes/pedidos/CardPedido.tsx`: troque o rodapé de baixa (`{p.baixadoEm && !p.provisorio && (...)}`) por:

```tsx
      {!p.provisorio && p.finalizado && (
        <footer className="card__acoes">
          <span className="card__estado card__estado--ok">{p.concluidoEm ? `Finalizado em ${ddmm(p.concluidoEm)}` : 'Finalizado'}</span>
        </footer>
      )}
      {!p.provisorio && !p.finalizado && p.baixadoEm && (
        <footer className="card__acoes">
          <span className="card__estado card__estado--ok">Baixa registrada nas caixas em {ddmm(p.baixadoEm)}</span>
        </footer>
      )}
```

`web/src/componentes/pedidos/JanelaEtapas.tsx`: troque o comentário de cima por `// Renomear, adicionar e remover etapas do quadro de pedidos. As duas últimas ficam fixas no fim (a penúltima dá a baixa, a última finaliza): podem ser renomeadas, mas não removidas, e as etapas novas entram antes delas.`; em `adicionar`, troque `setRascunho((r) => [...r.slice(0, -1), { chave, nome: '' }, ...r.slice(-1)]);` por `setRascunho((r) => [...r.slice(0, -2), { chave, nome: '' }, ...r.slice(-2)]);`; troque o texto do `janela__ajuda` por `A primeira etapa recebe os pedidos gerados. As duas últimas ficam sempre no fim: mover um pedido para a penúltima dá baixa nas caixas, e a última é quando o destino confirma o recebimento. Etapa com pedido aberto não pode ser removida.`; e troque o corpo do `rascunho.map` por:

```tsx
        {rascunho.map((x, i) => {
          const fixa = i >= rascunho.length - 2;
          const trava = motivoTravaEtapa(x.id, rascunho.length, pedidos);
          return (
            <li key={x.chave} data-chave={x.chave} className="etapas__linha">
              <span className="etapas__n" aria-hidden="true">{i + 1}</span>
              <input type="text" maxLength={40} value={x.nome} aria-label={`Nome da etapa ${i + 1}`}
                onChange={(e) => mudar(x.chave, e.target.value)} />
              {!fixa && (
                <button type="button" className="botao botao--leve etapas__remover" disabled={trava !== null}
                  title={trava ?? 'Remover etapa'} aria-label={`Remover etapa ${x.nome.trim() || i + 1}`}
                  onClick={() => { setErro(null); setRascunho((r) => r.filter((y) => y.chave !== x.chave)); }}>
                  Remover
                </button>
              )}
              {i === rascunho.length - 2 && <span className="etapas__final">Etapa da baixa: mover um pedido para cá dá baixa nas caixas.</span>}
              {i === rascunho.length - 1 && <span className="etapas__final">Etapa final: o destino confirmou o recebimento.</span>}
              {!fixa && trava && x.id && pedidos.some((p) => !p.finalizado && p.etapa === x.id) && <span className="etapas__trava">{trava}</span>}
            </li>
          );
        })}
```

`web/src/componentes/pedidos/DividirPedido.tsx` (só para compilar; a Tarefa 3 reescreve): troque `entraNaUltimaEtapa` por `entraNaEtapaDaBaixa` e `textoConfirmarResolvido` por `textoConfirmarBaixa` no import e nos usos.

- [ ] **Step 10: Build e Vitest**

Run: `cd web && npm run build && npm test`
Expected: build sem erro de tipo; Vitest PASS.

- [ ] **Step 11: Servidor simulado (`web/scripts/mock-api.mjs`)**

- Troque o comentário do topo (linhas 7–11) por:

```js
// Etapas: A pedir · Solicitado · Aguardando entrega · Enviado ao destino final (mover para ela dá a baixa
// nas caixas) · Concluído (o destino confirmou; finaliza). Pedido com baixa só vai para Concluído.
// PED-0001 tem itens com previsões diferentes (Dividir por previsão). PED-0004 está concluído.
```

- Troque `estado.etapas` por:

```js
  etapas: [
    { id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Solicitado' }, { id: 'aguardando', nome: 'Aguardando entrega' },
    { id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }
  ],
```

- no `PED-0004`, troque `etapa: 'entregue'` por `etapa: 'concluido'` e acrescente `concluidoEm: diaIso(-2)`;
- troque `const ultimaEtapa = () => estado.etapas[estado.etapas.length - 1].id;` e `const ehUltima = ...` por:

```js
const etapaFinal = () => estado.etapas[estado.etapas.length - 1];
const etapaDaBaixa = () => estado.etapas[estado.etapas.length - 2];
```

- no `montarBoard`, troque `finalizado: !!p.baixadoEm,` por `concluidoEm: p.concluidoEm ?? '',` + `finalizado: !!p.concluidoEm,`;
- troque `pedidoEditavel(p)` por:

```js
// Como o servidor: concluído não muda; com a baixa, só mover para a etapa final.
function pedidoAlteravel(p, corpo) {
  exigirEditavel(dealsDe(p));
  if (p.concluidoEm) throw new Erro(409, 'Pedido finalizado não pode ser alterado.');
  const final = etapaFinal();
  if (p.baixadoEm && !(corpo.tipo === 'mover_pedido' && corpo.etapa === final.id)) throw new Erro(409, `Pedido com baixa só pode ir para ${final.nome}.`);
}
```

  e troque cada `pedidoEditavel(p);` (em `editarPedido`, `moverPedido`, `baixarPedido`, `dividirPedido`, `dividirPorPrevisao`) por `pedidoAlteravel(p, c);`;
- em `editarPedido`: logo depois de `const campos = c.campos ?? {};`, acrescente `if ('etapa' in campos) throw bad('Para mudar a etapa, arraste o card.');`; apague a linha `if ('etapa' in campos && ...) throw bad('Etapa inválida.');`; tire `etapa: 'Etapa', ` do `rot` e o `if (k === 'etapa') return nomeEtapa(v);` do `fmt`; apague `const resolver = ...`, `const baixas = resolver ? ... : new Map();` e `if (resolver) p.baixadoEm = diaIso();` e troque `${textoBaixa(baixas.get(d))}` por nada no `registrar`;
- troque o corpo de `moverPedido` depois do `if (p.etapa === c.etapa) ...` por:

```js
  const historicos = [];
  if (c.etapa === etapaFinal().id) {
    // o destino confirmou: só com a baixa dada
    if (!p.baixadoEm) throw bad(`Mova o pedido primeiro para ${etapaDaBaixa().nome}.`);
    p.etapa = c.etapa; p.concluidoEm = diaIso(); p.versao = agoraIso();
    for (const d of dealsDe(p)) registrar(d, usuario, `${usuario} moveu ${p.id} para ${nomeEtapa(c.etapa)}`, historicos);
    return resposta(p.versao, historicos, { pedidoId: p.id });
  }
  p.etapa = c.etapa; p.versao = agoraIso();
  // Entrar na etapa da baixa (Enviado ao destino final) dá a baixa nas caixas; o pedido segue aberto.
  const naBaixa = c.etapa === etapaDaBaixa().id;
  const baixas = naBaixa ? baixarItens(itensValidos(p)) : new Map();
  if (naBaixa) p.baixadoEm = diaIso();
  for (const d of dealsDe(p)) registrar(d, usuario, `${usuario} moveu ${p.id} para ${nomeEtapa(c.etapa)}${textoBaixa(baixas.get(d))}`, historicos);
  return resposta(p.versao, historicos, { pedidoId: p.id });
```

- em `baixarPedido`, troque `if (p.etapa !== ultimaEtapa()) throw bad('Dar baixa só na última etapa.');` por `if (p.etapa !== etapaDaBaixa().id) throw bad(\`Dar baixa só na etapa ${etapaDaBaixa().nome}.\`);`;
- em `dividirPedido`, troque `ehUltima(etapa.id)` (duas vezes) por `etapa.id === etapaDaBaixa().id`;
- em `salvarEtapas`, troque a primeira linha por `if (!Array.isArray(lista) || lista.length < 3) throw bad('O quadro precisa de pelo menos 3 etapas.');`, troque o bloco da `ultima` por:

```js
  const baixa = etapaDaBaixa();
  const final = etapaFinal();
  const n = lista.length;
  if (lista[n - 2].id !== baixa.id || lista[n - 1].id !== final.id) throw bad(`As etapas ${baixa.nome} e ${final.nome} precisam continuar no fim, nessa ordem.`);
```

  e troque `!p.baixadoEm && p.etapa === antiga.id` por `!p.concluidoEm && p.etapa === antiga.id`;
- em `oficina()` (sai na Tarefa 4), troque `ultimaEtapa()` por `etapaDaBaixa().id` (duas vezes) só para o arquivo continuar rodando.
- nos históricos de exemplo das caixas 90005 e 90007, troque `(Resolvido)` por `(Enviado ao destino final)` e `para Resolvido` por `para Enviado ao destino final`; troque os comentários `// Entrar na última etapa (Resolvido) dá a baixa ...` e `// parte que vai direto para a última etapa (Resolvido) já nasce com a baixa` por `// Entrar na etapa da baixa (Enviado ao destino final) dá a baixa nas caixas.` e `// parte que vai direto para a etapa da baixa já nasce com a baixa`.

Em `web/src/styles/f3.css`, troque o comentário `/* Confirmação de mover para a última etapa (Resolvido): dá a baixa nas caixas. */` por `/* Confirmação de mover para a etapa da baixa (Enviado ao destino final): dá a baixa nas caixas. */` (a classe `.confirmacao--resolvido` fica).

- [ ] **Step 12: e2e — fixture e testes de Solicitações**

Atualize as etapas do fixture:

Run: `cd web && node -e "const fs=require('fs');const f='e2e/fixtures/board.json';const b=JSON.parse(fs.readFileSync(f,'utf8'));b.etapasPedido=[{id:'a_pedir',nome:'A pedir',ordem:1},{id:'solicitado',nome:'Solicitado',ordem:2},{id:'aguardando',nome:'Aguardando entrega',ordem:3},{id:'entregue',nome:'Enviado ao destino final',ordem:4},{id:'concluido',nome:'Concluído',ordem:5}];fs.writeFileSync(f,JSON.stringify(b,null,2)+'\n')" && git diff --stat e2e/fixtures/board.json`
Expected: só o bloco `etapasPedido` mudou (se o `git diff` mostrar reformatação do arquivo todo, desfaça e edite o bloco à mão).

Em `web/e2e/f3.spec.ts`:
- no helper `pedido(...)`, acrescente `concluidoEm: '',` depois de `baixadoEm: '',`;
- substitua o teste `soltar o card em Resolvido pede confirmação e envia mover_pedido (a baixa)` por:

```ts
test('soltar o card em Enviado ao destino final pede confirmação e envia mover_pedido (a baixa)', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 900 }); // as 5 colunas à vista para o arraste
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'aguardando', PED_TAG)] as never; b.caixas[0].itens[1].pedidoId = 'PED-0042'; },
    aoAgir: (b) => { const p = b.pedidos[0] as unknown as Corpo; p.etapa = 'entregue'; p.baixadoEm = '2026-10-07'; p.versao = 'v2'; }
  });
  await expect(page.getByRole('button', { name: 'Dar baixa nas caixas' })).toHaveCount(0);
  const enviado = page.getByRole('region', { name: 'Enviado ao destino final' });
  const card = page.getByRole('region', { name: 'Aguardando entrega' }).getByRole('button', { name: 'Pedido PED-0042' });
  await card.dragTo(enviado);
  const confirmacao = enviado.getByRole('group', { name: 'Confirmar Enviado ao destino final do PED-0042' });
  await expect(confirmacao).toContainText('Mover para Enviado ao destino final dá baixa de 1 item em 1 OS. A baixa não pode ser desfeita.');
  // a baixa não volta: o foco começa em Cancelar, para um Enter distraído não confirmar
  await expect(confirmacao.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await expect(confirmacao.getByRole('button', { name: 'Confirmar' })).toHaveClass(/botao--signal/);
  await page.keyboard.press('Escape');
  await expect(confirmacao).toHaveCount(0);
  expect(mock.bodies).toHaveLength(0);
  await card.dragTo(enviado);
  await confirmacao.getByRole('button', { name: 'Confirmar' }).click();
  await expect(aviso(page, 'PED-0042 movido para Enviado ao destino final · baixa registrada nas caixas')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'mover_pedido', pedidoId: 'PED-0042', versao: V_PED, etapa: 'entregue' }]);
  // com a baixa o pedido continua em aberto, na coluna da baixa
  await expect(enviado.getByRole('article', { name: 'Pedido PED-0042' })).toContainText('Baixa registrada nas caixas em 07/10');
});

test('pedido com baixa: painel só leitura e só vai para Concluído, sem confirmação', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'entregue', PED_TAG, { baixadoEm: '2026-10-06' })] as never; },
    aoAgir: (b) => { const p = b.pedidos[0] as unknown as Corpo; p.etapa = 'concluido'; p.concluidoEm = '2026-10-07'; p.finalizado = true; p.versao = 'v2'; }
  });
  const card = page.getByRole('region', { name: 'Enviado ao destino final' }).getByRole('button', { name: 'Pedido PED-0042' });
  await card.click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0042' });
  await expect(painel).toContainText('Baixa registrada nas caixas em 06/10. Quando o destino confirmar o recebimento, arraste o card para Concluído.');
  await expect(painel.getByRole('button', { name: /Salvar alterações|Nada alterado/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await card.dragTo(page.getByRole('region', { name: 'Aguardando entrega' }));
  await expect(aviso(page, 'Pedido com baixa só pode ir para Concluído.')).toBeVisible();
  expect(mock.bodies).toHaveLength(0);
  await card.dragTo(page.getByRole('region', { name: 'Concluído' }));
  await expect(aviso(page, 'PED-0042 movido para Concluído')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'mover_pedido', pedidoId: 'PED-0042', versao: V_PED, etapa: 'concluido' }]);
  // finalizado: some em "Em aberto"
  await expect(page.getByRole('article', { name: 'Pedido PED-0042' })).toHaveCount(0);
});

test('soltar em Concluído sem a baixa mostra o aviso e não envia', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'aguardando', PED_TAG)] as never; b.caixas[0].itens[1].pedidoId = 'PED-0042'; }
  });
  await page.getByRole('region', { name: 'Aguardando entrega' }).getByRole('button', { name: 'Pedido PED-0042' })
    .dragTo(page.getByRole('region', { name: 'Concluído' }));
  await expect(aviso(page, 'Mova o pedido primeiro para Enviado ao destino final.')).toBeVisible();
  expect(mock.bodies).toHaveLength(0);
});
```

- apague os testes `painel: escolher Resolvido na Etapa e salvar pede a mesma confirmação` e `painel: cancelar a confirmação do Resolvido devolve o foco para Salvar`;
- substitua o teste `finalizado aparece em Resolvido com o filtro Todos e some em Em aberto` por:

```ts
test('finalizado aparece em Concluído com o filtro Todos e some em Em aberto', async ({ page }) => {
  await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0040', 'concluido', PED_TAG, { baixadoEm: '2026-10-04', concluidoEm: '2026-10-05', finalizado: true })] as never; }
  });
  await expect(page.getByRole('article', { name: 'Pedido PED-0040' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Mostrar pedidos' }).getByRole('button', { name: 'Todos' }).click();
  await expect(page.getByRole('region', { name: 'Concluído' }).getByRole('article', { name: 'Pedido PED-0040' })).toContainText('Finalizado em 05/10');
});
```

- substitua os três testes de etapas (`Etapas: renomear e adicionar (antes da última) ...`, `Etapas: etapa com pedido aberto não pode ser removida; a última fica fixa`, `Etapas: o mínimo é 2 (com a última fixa)`) por:

```ts
test('Etapas: renomear e adicionar (antes das duas últimas) enviam salvar_etapas com os ids existentes', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    aoAgir: (b) => {
      b.etapasPedido = [{ id: 'a_pedir', nome: 'Compras', ordem: 1 }, ...b.etapasPedido.slice(1, 3),
        { id: 'em_transito', nome: 'Em trânsito', ordem: 4 }, { ...b.etapasPedido[3], ordem: 5 }, { ...b.etapasPedido[4], ordem: 6 }];
    }
  });
  await page.getByRole('button', { name: 'Etapas do quadro' }).click();
  const janela = page.getByRole('dialog', { name: 'Etapas do quadro' });
  await janela.getByRole('textbox', { name: 'Nome da etapa 1' }).fill('Compras');
  await janela.getByRole('button', { name: '+ Adicionar etapa' }).click();
  await expect(janela.getByRole('textbox', { name: 'Nome da etapa 4' })).toBeFocused();
  await expect(janela.getByRole('textbox', { name: 'Nome da etapa 5' })).toHaveValue('Enviado ao destino final');
  await expect(janela.getByRole('textbox', { name: 'Nome da etapa 6' })).toHaveValue('Concluído');
  await janela.getByRole('textbox', { name: 'Nome da etapa 4' }).fill('Em trânsito');
  await janela.getByRole('button', { name: 'Salvar etapas' }).click();
  await expect(aviso(page, 'Etapas do quadro salvas')).toBeVisible();
  expect(mock.bodies).toEqual([{
    tipo: 'salvar_etapas',
    etapas: [{ id: 'a_pedir', nome: 'Compras' }, { id: 'solicitado', nome: 'Solicitado' }, { id: 'aguardando', nome: 'Aguardando entrega' },
      { nome: 'Em trânsito' }, { id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }]
  }]);
  await expect(page.getByRole('region', { name: 'Em trânsito' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Compras' })).toBeVisible();
});

test('Etapas: etapa com pedido aberto não pode ser removida; as duas últimas ficam fixas', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'solicitado', PED_TAG)] as never; b.caixas[0].itens[1].pedidoId = 'PED-0042'; }
  });
  await page.getByRole('button', { name: 'Etapas do quadro' }).click();
  const janela = page.getByRole('dialog', { name: 'Etapas do quadro' });
  await expect(janela.getByRole('button', { name: 'Remover etapa Solicitado' })).toBeDisabled();
  await expect(janela).toContainText('Tem 1 pedido aberto nesta etapa');
  await expect(janela.getByRole('button', { name: 'Remover etapa Enviado ao destino final' })).toHaveCount(0);
  await expect(janela.getByRole('button', { name: 'Remover etapa Concluído' })).toHaveCount(0);
  await expect(janela).toContainText('Etapa da baixa: mover um pedido para cá dá baixa nas caixas.');
  await expect(janela).toContainText('Etapa final: o destino confirmou o recebimento.');
  await expect(janela.getByRole('textbox', { name: 'Nome da etapa 5' })).toBeEditable();
  await janela.getByRole('button', { name: 'Remover etapa A pedir' }).click();
  await janela.getByRole('button', { name: 'Remover etapa Aguardando entrega' }).click();
  await expect(janela.getByRole('button', { name: 'Remover etapa Solicitado' })).toBeDisabled();
  expect(mock.bodies).toHaveLength(0);
});

test('Etapas: o mínimo é 3 (com as duas últimas fixas)', async ({ page }) => {
  await preparar(page, '#pedidos');
  await page.getByRole('button', { name: 'Etapas do quadro' }).click();
  const janela = page.getByRole('dialog', { name: 'Etapas do quadro' });
  await janela.getByRole('button', { name: 'Remover etapa A pedir' }).click();
  await janela.getByRole('button', { name: 'Remover etapa Solicitado' }).click();
  await expect(janela.getByRole('button', { name: 'Remover etapa Aguardando entrega' })).toBeDisabled();
  await expect(janela.getByRole('button', { name: 'Remover etapa Aguardando entrega' })).toHaveAttribute('title', 'O quadro precisa de pelo menos 3 etapas');
});
```

- apague, por ora, os cinco testes de Saídas que dependem das colunas antigas (a Tarefa 4 escreve os novos): `Saídas: colunas seguem as etapas de Solicitações; Sem pedido só com caixa sem pedido`, `Saídas: caixa na etapa do pedido mais atrasado; enviar à oficina escondido até a última etapa`, `Saídas: enviar à oficina recusado pelo servidor mostra a mensagem dele`, `Saídas: enviar à oficina e depois confirmar que a oficina recebeu`, `Saídas: caixa com toda a falta baixada fica em Resolvido e vai à oficina`. Mantenha as constantes `VIES` e `nomesDasColunas` (a Tarefa 4 usa) e apague a função `vies(...)`, que fica sem uso (os e2e não passam pelo `tsc`, mas o código morto não fica).

Em `web/e2e/mock-servidor.spec.ts`:
- apague os testes `editar a etapa no painel e salvar: ...`, `editar a etapa duas vezes seguidas sem esperar o servidor: ...` e `pedido em etapa que saiu do quadro: escolher a primeira etapa no painel conta como mudança`;
- no teste `painel aberto e o card arrastado: ...`, troque `await expect(painel.getByLabel('Etapa')).toHaveValue('solicitado');` por `await expect(painel.locator('.painel__meta').first()).toContainText('Solicitado');` e `await expect(painel.getByLabel('Etapa')).toHaveValue('aguardando', { timeout: 300 });` por `await expect(painel.locator('.painel__meta').first()).toContainText('Aguardando entrega', { timeout: 300 });`;
- substitua o corpo do teste `digitando no painel quando a recarga chega: o que foi digitado continua lá` por:

```ts
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
```

- [ ] **Step 13: Rodar tudo do web**

Run: `cd web && npm test && npm run build && CI=1 npx playwright test`
Expected: Vitest PASS, build sem erro, Playwright todos `passed` (os de Saídas apagados não rodam; `f3-smoke.spec.ts` continua passando).

- [ ] **Step 14: Commit**

```bash
git add web/src web/scripts/mock-api.mjs web/e2e
git commit -m "$(cat <<'EOF'
feat(web): etapas novas no quadro de pedidos e painel sem o campo Etapa

Enviado ao destino final dá a baixa (com confirmação) e Concluído finaliza; pedido com
baixa só vai para Concluído e o painel dele é só leitura. As duas últimas etapas ficam
fixas em Etapas do quadro (mínimo 3). O otimista e o servidor simulado seguem as regras.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Web — Dividir pedido só em Aguardando entrega, direto para a baixa

**Files:**
- Modify: `web/src/api/tipos.ts` (`dividir_pedido` sem `etapa`)
- Modify: `web/src/regras/pedidos.ts` (`etapaDeDividir`), `web/src/regras/pedidosQuadro.ts` (`podeDividir`; apagar `etapasParaDividir`), `web/src/regras/otimista.ts`, `web/src/regras/acoes.ts`
- Modify: `web/src/componentes/pedidos/DividirPedido.tsx`
- Modify: `web/src/regras/divisao.test.ts`, `web/src/regras/otimista.test.ts`
- Modify: `web/scripts/mock-api.mjs`, `web/e2e/f3.spec.ts`

**Interfaces:**
- Consumes: `etapaDaBaixa`, `textoConfirmarBaixa`, `darBaixa` (otimista) da Tarefa 2; servidor `dividir_pedido { pedidoId, versao, itens }` da Tarefa 1.
- Produces: `etapaDeDividir(etapas): EtapaPedido | undefined`; `podeDividir(p: Pick<Pedido,'etapa'|'baixadoEm'>, etapas): boolean`; `Acao` `{ tipo: 'dividir_pedido'; pedidoId; versao; itens: { itemId; qtd }[] }`; `mensagemSucesso(dividir)` = `PED dividido · <parte> em <etapa> · baixa registrada nas caixas`.

- [ ] **Step 1: Testes (falham)**

Em `web/src/regras/divisao.test.ts`:
- no import de `./pedidosQuadro`, troque `etapasParaDividir` por `podeDividir`;
- substitua o `describe('etapasParaDividir', ...)` por:

```ts
describe('podeDividir', () => {
  it('só na etapa antes da baixa (a antepenúltima) e sem a baixa', () => {
    expect(podeDividir(ped(), etapas)).toBe(true);
    expect(podeDividir(ped({ etapa: 'rec' }), etapas)).toBe(false);
    expect(podeDividir(ped({ baixadoEm: '2026-10-07' }), etapas)).toBe(false);
    expect(podeDividir(ped(), etapas.slice(0, 2))).toBe(false);
  });
});
```

- no teste `mensagem de sucesso usa o id devolvido`, troque por:

```ts
  it('mensagem de sucesso usa o id devolvido e fala da baixa', () => {
    expect(mensagemSucesso({ tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', itens: [] }, undefined,
      { pedidoId: 'PED-0002.1', etapa: 'Recebidos' })).toBe('PED-0002 dividido · PED-0002.1 em Recebidos · baixa registrada nas caixas');
  });
```

Em `web/src/regras/otimista.test.ts`:
- substitua o teste `dividir_pedido: parte provisória com o id previsto e o resto no original` por:

```ts
  it('dividir_pedido: parte provisória na etapa da baixa, com a baixa, e o resto no original', () => {
    const b = aplicar(quadro(), { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', itens: [{ itemId: 'i1', qtd: 20 }, { itemId: 'i2', qtd: 10 }] });
    expect(pedidoDe(b, 'PED-0002')!.itens.map((i) => [i.itemId, i.qtd])).toEqual([['i1', 32]]);
    const parte = pedidoDe(b, 'PED-0002.1')!;
    expect(parte).toMatchObject({ pai: 'PED-0002', etapa: 'ent', provisorio: true, finalizado: false, baixadoEm: '2026-10-08', criadoEm: '2026-10-08' });
    expect(parte.itens.map((i) => [i.itemId, i.qtd])).toEqual([['i1', 20], ['i2', 10]]);
    // a parte já deu a baixa; o i2 foi todo e saiu do PED-0002
    expect(itemDe(b, 'i1')).toMatchObject({ baixada: 20, resta: 32, pedidoIds: ['PED-0002'] });
    expect(itemDe(b, 'i2')).toMatchObject({ resta: 0, pedidoIds: [] });
  });
```

- substitua o teste `dividir_pedido para uma etapa do meio: o item fica nos dois pedidos` por:

```ts
  it('dividir_pedido fora da etapa antes da baixa: board igual (o servidor recusa)', () => {
    const b0 = quadro({ pedidos: [ped({ etapa: 'a' })] });
    expect(aplicar(b0, { tipo: 'dividir_pedido', pedidoId: 'PED-0002', versao: 'v1', itens: [{ itemId: 'i1', qtd: 20 }] })).toBe(b0);
  });
```

Run: `cd web && npx vitest run src/regras/divisao.test.ts src/regras/otimista.test.ts`
Expected: FAIL (`podeDividir` não existe; a parte vai para `acao.etapa` indefinida).

- [ ] **Step 2: Implementar**

`web/src/api/tipos.ts`: troque a linha do `dividir_pedido` por `| { tipo: 'dividir_pedido'; pedidoId: string; versao: string; itens: { itemId: string; qtd: number }[] } // a parte vai para a etapa da baixa`.

`web/src/regras/pedidos.ts`, depois de `etapaDaBaixa`:

```ts
// Antepenúltima ("Aguardando entrega"): só dela se divide um pedido.
export function etapaDeDividir(etapas: EtapaPedido[]): EtapaPedido | undefined {
  const o = emOrdem(etapas);
  return o.length >= 3 ? o[o.length - 3] : undefined;
}
```

`web/src/regras/pedidosQuadro.ts`: no import de `./pedidos`, acrescente `etapaDeDividir`; apague `etapasParaDividir` inteira e ponha no lugar:

```ts
// Dividir pedido: só com o pedido na etapa antes da baixa (Aguardando entrega) e sem a baixa.
// O que chegou vira uma parte na etapa da baixa, já com a baixa. Mesma regra do servidor.
export function podeDividir(p: Pick<Pedido, 'etapa' | 'baixadoEm'>, etapas: EtapaPedido[]): boolean {
  const de = etapaDeDividir(etapas);
  return !!de && !p.baixadoEm && p.etapa === de.id;
}
```

`web/src/regras/otimista.ts`: no import de `./pedidosQuadro`, acrescente `podeDividir`; troque o começo e o fim do caso `dividir_pedido` por:

```ts
    case 'dividir_pedido': {
      if (!baixa || !podeDividir(p, etapas)) return board;
      const parteId = proximoIdParte(pedidosDe(board), p.id);
      // ... (vao/ficam iguais)
      let b = comPedido(board, p.id, (x) => comPrevisoesResumidas({ ...x, itens: ficam }));
      b = comPedidosNovos(b, [novaParte(p, parteId, baixa, p.previsao, vao, ctx.hoje)]);
      // a parte já nasce na etapa da baixa, com a baixa
      b = darBaixa(b, parteId, ctx.hoje);
      return atualizarPedidosDosItens(b, p.itens);
    }
```

(apague a linha antiga `if (p.baixadoEm) return board;` desse caso, que `podeDividir` cobre.)

`web/src/regras/acoes.ts`, caso `dividir_pedido` do `mensagemSucesso`:

```ts
    case 'dividir_pedido':
      return `${acao.pedidoId} dividido · ${extra.pedidoId ?? 'nova parte'} em ${extra.etapa ?? 'outra etapa'} · baixa registrada nas caixas`;
```

`web/src/componentes/pedidos/DividirPedido.tsx`: substitua o arquivo por:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import type { Acao, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import { etapaDaBaixa } from '../../regras/pedidos';
import {
  partesPorPrevisao, podeDividir, previsoesDiferentes, proximoIdParte, resumoDivisao, resumoDivisaoPorPrevisao, textoConfirmarBaixa,
  validarDivisao, type LinhaDivisao
} from '../../regras/pedidosQuadro';
import { qtdComUn, quantidadeParaCampo } from '../../regras/quantidade';
import { ConfirmarResolvido } from './ConfirmarResolvido';

interface Props {
  pedido: Pedido;
  pedidos: Pedido[]; // todos do board, para prever o id da parte nova
  etapas: EtapaPedido[];
  executar: Executar;
}

type Modo = 'fechado' | 'itens' | 'previsao';

// Parte do pedido chegou (só com o pedido em Aguardando entrega): os itens marcados, com a
// quantidade que chegou, viram um pedido novo PED-xxxx.n já em Enviado ao destino final, com a
// baixa nas caixas (pede a mesma confirmação); o original fica com o resto. Atalho "Dividir por
// previsão": uma parte por data de previsão dos itens, na etapa atual (a mais próxima fica).
export function DividirPedido({ pedido, pedidos, etapas, executar }: Props) {
  const id = useId();
  const [modo, setModo] = useState<Modo>('fechado');
  const iniciais = (): LinhaDivisao[] => pedido.itens.map((i) => ({ itemId: i.itemId, chegou: false, qtd: quantidadeParaCampo(i.qtd) }));
  const [linhas, setLinhas] = useState<LinhaDivisao[]>(iniciais);
  const [confirmando, setConfirmando] = useState(false);
  const abrirRef = useRef<HTMLButtonElement>(null);
  const primeiroRef = useRef<HTMLInputElement>(null);
  const porPrevisaoRef = useRef<HTMLButtonElement>(null);
  const voltarFoco = useRef(false);
  const comPrevisoes = previsoesDiferentes(pedido);
  const dividir = podeDividir(pedido, etapas);
  const baixa = etapaDaBaixa(etapas);

  useEffect(() => {
    if (modo === 'itens') primeiroRef.current?.focus();
    else if (modo === 'previsao') porPrevisaoRef.current?.focus();
    else if (voltarFoco.current) { voltarFoco.current = false; abrirRef.current?.focus(); }
  }, [modo]);

  if (!dividir && !comPrevisoes) return null;
  const fechar = () => { voltarFoco.current = true; setConfirmando(false); setModo('fechado'); };

  if (modo === 'fechado') {
    return (
      <div className="acoes">
        {dividir && (
          <button ref={abrirRef} type="button" className="botao botao--contorno"
            onClick={() => { setLinhas(iniciais()); setConfirmando(false); setModo('itens'); }}>
            Dividir pedido
          </button>
        )}
        {comPrevisoes && (
          <button type="button" className="botao botao--contorno" onClick={() => setModo('previsao')}>
            Dividir por previsão
          </button>
        )}
      </div>
    );
  }

  if (modo === 'previsao') {
    const partes = partesPorPrevisao(pedido, pedidos);
    function confirmarPrevisao() {
      const acao: Acao = { tipo: 'dividir_por_previsao', pedidoId: pedido.id, versao: pedido.versao };
      void executar(acao, (r) => mensagemSucesso(acao, undefined, { partes: r.partes?.length ?? partes.length }));
      setModo('fechado');
    }
    return (
      <section className="secao divisao" aria-label={`Dividir ${pedido.id} por previsão`}>
        <h3 className="secao__titulo">Dividir por previsão</h3>
        <p className="divisao__ajuda">Cada data de previsão vira uma parte, na etapa atual. A data mais próxima fica no {pedido.id}.</p>
        <ul className="divisao__partes" aria-live="polite">
          {resumoDivisaoPorPrevisao(pedido, partes).map((l) => <li key={l} className="divisao__resumo">{l}</li>)}
        </ul>
        <div className="acoes">
          <button ref={porPrevisaoRef} type="button" className="botao botao--signal" onClick={confirmarPrevisao}>
            Confirmar divisão por previsão
          </button>
          <button type="button" className="botao botao--leve" onClick={fechar}>Cancelar</button>
        </div>
      </section>
    );
  }

  const v = validarDivisao(pedido, linhas);
  const temErroItem = Object.keys(v.erros).length > 0;
  const nomeBaixa = baixa?.nome ?? '';
  const parteId = proximoIdParte(pedidos, pedido.id);
  const pronto = !temErroItem && v.geral === null && !!baixa;
  const mudar = (itemId: string, m: Partial<LinhaDivisao>) => {
    setConfirmando(false);
    setLinhas((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, ...m } : l)));
  };
  const algumMarcado = linhas.some((l) => l.chegou);
  const itensDaParte = pedido.itens.filter((i) => v.itens.some((x) => x.itemId === i.itemId));

  function confirmar() {
    if (!pronto) return;
    const acao: Acao = { tipo: 'dividir_pedido', pedidoId: pedido.id, versao: pedido.versao, itens: v.itens };
    void executar(acao, (r) => mensagemSucesso(acao, undefined, { pedidoId: r.pedidoId, etapa: nomeBaixa }));
    setConfirmando(false);
    setModo('fechado');
  }

  return (
    <section className="secao divisao" aria-label={`Dividir ${pedido.id}`}>
      <h3 className="secao__titulo">Dividir pedido</h3>
      <p className="divisao__ajuda">Marque o que chegou. Esses itens viram um pedido novo em {nomeBaixa}, com a baixa nas caixas; o {pedido.id} fica com o resto.</p>
      <ul className="divisao__itens">
        {pedido.itens.map((i, idx) => {
          const l = linhas.find((x) => x.itemId === i.itemId)!;
          const erro = l.chegou ? v.erros[i.itemId] : undefined;
          const base = `${id}-${idx}`;
          return (
            <li key={i.itemId} className={l.chegou ? 'divisao__item divisao__item--marcado' : 'divisao__item'}>
              <label className="divisao__marca">
                <input ref={idx === 0 ? primeiroRef : undefined} type="checkbox" checked={l.chegou}
                  aria-label={`Chegou ${i.nome}`} onChange={(e) => mudar(i.itemId, { chegou: e.target.checked })} />
                <span className="divisao__nome">
                  <span><span className="linha-item__os">OS {i.os}</span> · {i.nome}</span>
                  <span className="linha-item__detalhe">no pedido: {i.qtd !== null ? qtdComUn(i.qtd, i.un) : '—'}</span>
                </span>
              </label>
              <div className="campo divisao__qtd">
                <label htmlFor={`${base}-qtd`}>Chegou{i.un ? ` (${i.un})` : ''}</label>
                <input id={`${base}-qtd`} type="text" inputMode="decimal" autoComplete="off" value={l.qtd} disabled={!l.chegou}
                  aria-label={`Quantidade que chegou de ${i.nome}`} aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${base}-erro` : undefined}
                  onChange={(e) => mudar(i.itemId, { qtd: e.target.value })} />
              </div>
              {erro && <p id={`${base}-erro`} className="campo__erro divisao__erro">{erro}</p>}
            </li>
          );
        })}
      </ul>
      {pronto ? (
        <p className="divisao__resumo" aria-live="polite">{resumoDivisao(pedido, v.itens, parteId, nomeBaixa)}</p>
      ) : (
        v.geral && algumMarcado && <p className="campo__erro" role="alert">{v.geral}</p>
      )}
      {confirmando ? (
        <ConfirmarResolvido rotulo={`Confirmar ${nomeBaixa} da divisão do ${pedido.id}`}
          texto={textoConfirmarBaixa(itensDaParte, nomeBaixa)} ocupado={false}
          onConfirmar={confirmar} onCancelar={() => setConfirmando(false)} />
      ) : (
        <div className="acoes">
          <button type="button" className="botao botao--signal" disabled={!pronto} onClick={() => setConfirmando(true)}>
            Confirmar divisão
          </button>
          <button type="button" className="botao botao--leve" onClick={fechar}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Testes de regra e build**

Run: `cd web && npm test && npm run build`
Expected: PASS e build sem erro.

- [ ] **Step 4: Simulado**

Em `web/scripts/mock-api.mjs`, troque o começo de `dividirPedido` (até `if (!Array.isArray(c.itens) ...`) por:

```js
function dividirPedido(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoAlteravel(p, c);
  conferirVersao(p.versao, c.versao, 'este pedido');
  // só de Aguardando entrega (a etapa antes da baixa); a parte já vai para a etapa da baixa
  const de = estado.etapas[estado.etapas.length - 3];
  if (!de || p.etapa !== de.id) throw bad(`Dividir só com o pedido em ${de ? de.nome : 'Aguardando entrega'}.`);
  const etapa = etapaDaBaixa();
```

e, mais abaixo, troque as linhas da baixa da parte por:

```js
  const baixas = baixarItens(parte.itens);
  parte.baixadoEm = diaIso();
```

- [ ] **Step 5: e2e**

Em `web/e2e/f3.spec.ts`, substitua o teste `dividir pedido com quantidade parcial cria a parte PED-xxxx.1 na etapa escolhida` por:

```ts
test('dividir pedido em Aguardando entrega: o que chegou vira PED-xxxx.1 em Enviado ao destino final, com a baixa', async ({ page }) => {
  await page.setViewportSize({ width: 1720, height: 900 });
  const mock = await preparar(page, '#pedidos', {
    ajustar: (b) => {
      b.pedidos = [pedido('PED-0042', 'aguardando', PED_DOIS)] as never;
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
      b.pedidos.push(pedido('PED-0042.1', 'entregue', [{ ...PED_DOIS[1], qtd: 20 }], { pai: 'PED-0042', versao: 'v2', baixadoEm: '2026-10-07' }) as never);
    }
  });
  await page.getByRole('region', { name: 'Aguardando entrega' }).getByRole('button', { name: 'Pedido PED-0042' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0042' });
  await painel.getByRole('button', { name: 'Dividir pedido' }).click();
  const divisao = painel.getByRole('region', { name: 'Dividir PED-0042' });
  await expect(divisao.getByLabel('Mover para')).toHaveCount(0);
  await expect(divisao.getByRole('button', { name: 'Confirmar divisão' })).toBeDisabled();
  await divisao.getByRole('checkbox', { name: `Chegou ${ZIPER}` }).check();
  await expect(divisao.getByLabel(`Quantidade que chegou de ${ZIPER}`)).toHaveValue('52');
  await divisao.getByLabel(`Quantidade que chegou de ${ZIPER}`).fill('20');
  await expect(divisao).toContainText(
    `PED-0042.1 vai para Enviado ao destino final com: 20 UN de ${ZIPER}; o PED-0042 fica com: 26 UN de TAG CUIDADOS PADRÃO; 32 UN de ${ZIPER}`);
  await divisao.getByRole('button', { name: 'Confirmar divisão' }).click();
  const confirmacao = divisao.getByRole('group', { name: 'Confirmar Enviado ao destino final da divisão do PED-0042' });
  await expect(confirmacao).toContainText('Mover para Enviado ao destino final dá baixa de 1 item em 1 OS. A baixa não pode ser desfeita.');
  expect(mock.bodies).toHaveLength(0);
  await confirmacao.getByRole('button', { name: 'Confirmar' }).click();
  await expect(aviso(page, 'PED-0042 dividido · PED-0042.1 em Enviado ao destino final · baixa registrada nas caixas')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'dividir_pedido', pedidoId: 'PED-0042', versao: V_PED, itens: [{ itemId: 'b1', qtd: 20 }] }]);
  const pai = page.getByRole('region', { name: 'Aguardando entrega' }).getByRole('article', { name: 'Pedido PED-0042' });
  await expect(pai).toContainText('dividido em 1 parte');
  await expect(pai).toContainText('32 UN');
  const parte = page.getByRole('region', { name: 'Enviado ao destino final' }).getByRole('article', { name: 'Pedido PED-0042.1' });
  await expect(parte).toContainText('parte de PED-0042');
  await expect(parte).toContainText('20 UN');
});

test('Dividir pedido só aparece em Aguardando entrega', async ({ page }) => {
  await preparar(page, '#pedidos', { ajustar: (b) => { b.pedidos = [pedido('PED-0042', 'solicitado', PED_DOIS)] as never; } });
  await page.getByRole('button', { name: 'Pedido PED-0042' }).click();
  await expect(page.getByRole('complementary', { name: 'Pedido PED-0042' }).getByRole('button', { name: 'Dividir pedido' })).toHaveCount(0);
});
```

e, no teste `dividir pedido: quantidade acima da do pedido mostra o erro no painel e não envia`, troque `pedido('PED-0042', 'solicitado', PED_DOIS)` por `pedido('PED-0042', 'aguardando', PED_DOIS)`.

- [ ] **Step 6: Rodar tudo do web**

Run: `cd web && npm test && npm run build && CI=1 npx playwright test`
Expected: tudo PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src web/scripts/mock-api.mjs web/e2e/f3.spec.ts
git commit -m "$(cat <<'EOF'
feat(web): dividir pedido só em Aguardando entrega, com a parte já em Enviado ao destino final

Sem o "Mover para": o que chegou vira PED-x.n com a baixa nas caixas, depois da mesma
confirmação da baixa. Dividir por previsão continua igual. Otimista e simulado seguem.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Web — Saídas com falta divididas por etapa (e fim da oficina no site)

**Files:**
- Rewrite: `web/src/regras/saidas.ts`, `web/src/regras/saidas.test.ts`
- Modify: `web/src/api/tipos.ts` (sem `tratativa`; sem ações de oficina), `web/src/regras/acoes.ts`, `web/src/regras/otimista.ts`, `web/src/regras/teste-util.ts`
- Rewrite: `web/src/componentes/saidas/CardSaida.tsx`, `PainelSaida.tsx`, `ItemSaida.tsx`, `web/src/telas/Saidas.tsx`
- Delete: `web/src/componentes/saidas/AcoesSaida.tsx`
- Modify: `web/src/App.tsx`, `web/src/regras/otimista.test.ts`, `web/src/regras/divisao.test.ts`, `web/src/regras/pedidos.test.ts`
- Modify: `web/scripts/mock-api.mjs`, `web/e2e/fixtures/board.json`, `web/e2e/f3.spec.ts`

**Interfaces:**
- Consumes: `Pedido.baixadoEm`/`finalizado`/`concluidoEm`, `pedidosDoItem`, `itemAberto`, `arredondar3`.
- Produces (em `regras/saidas.ts`): `type ColunaSaidaId = 'sem_pedido' | \`etapa:${string}\``; `ItemDaParte { item; pedidoIds: string[]; qtd: number | null }`; `ParteSaida { coluna; indice; total; itens: ItemDaParte[] }`; `SaidaNaTela { caixa; parte }`; `colunasSaida(etapas, comSemPedido)`, `nomeColunaSaida(id, etapas)`, `colunaDoPedido(p, etapas)`, `partesDaSaida(caixa, pedidos, etapas)`, `saiuComFalta(caixa)`, `saidasNaTela(board, hoje)`, `chaveDaSaida(x)`, `rotuloDaSaida(x)`, `textoPedidosDaParte(x)`; continuam `textoPedidoDoItem`, `textoSaiu`, `diasDesdeSaida`, `seloSaidaVermelho`, `itensParaPedido`, `DIAS_SELO_VERMELHO`, `idColunaEtapa`.

- [ ] **Step 1: Teste novo (falha)**

Substitua `web/src/regras/saidas.test.ts` por:

```ts
import { describe, expect, it } from 'vitest';
import type { Board, EtapaPedido, ItemPedido, Pedido } from '../api/tipos';
import {
  chaveDaSaida, colunaDoPedido, colunasSaida, diasDesdeSaida, itensParaPedido, nomeColunaSaida, partesDaSaida, rotuloDaSaida,
  saidasNaTela, seloSaidaVermelho, textoPedidoDoItem, textoPedidosDaParte, textoSaiu
} from './saidas';
import { caixa, item } from './teste-util';

const etapas: EtapaPedido[] = [
  { id: 'fim', nome: 'Concluído', ordem: 5 }, { id: 'a', nome: 'A pedir', ordem: 1 }, { id: 'sol', nome: 'Solicitado', ordem: 2 },
  { id: 'ag', nome: 'Aguardando entrega', ordem: 3 }, { id: 'ent', nome: 'Enviado ao destino final', ordem: 4 }
];
const pi = (itemId: string, qtd: number): ItemPedido => ({ itemId, dealId: '600001', os: '90001', nome: itemId, un: 'UN', qtd, fornecedor: '' });
const ped = (id: string, etapa: string, itens: ItemPedido[], o: Partial<Pedido> = {}): Pedido => ({
  id, pai: '', etapa, origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '',
  criadoEm: '', baixadoEm: '', versao: '', finalizado: false, itens, ...o
});
const saiu = (o = {}) => caixa({ saiu: true, saiuComFalta: true, saiuEm: '2026-10-01', ...o });

describe('colunasSaida', () => {
  it('Sem pedido (opcional) e as etapas do quadro, na ordem; cores pela posição', () => {
    const cols = colunasSaida(etapas, true);
    expect(cols.map((c) => c.nome)).toEqual(['Sem pedido', 'A pedir', 'Solicitado', 'Aguardando entrega', 'Enviado ao destino final', 'Concluído']);
    expect(cols.map((c) => c.cor)).toEqual(['var(--erro-text)', 'var(--falta)', 'var(--falta)', 'var(--falta)', 'var(--navy)', 'var(--success)']);
    expect(colunasSaida(etapas, false).map((c) => c.id)).toEqual(['etapa:a', 'etapa:sol', 'etapa:ag', 'etapa:ent', 'etapa:fim']);
  });
  it('nome da coluna', () => {
    expect(nomeColunaSaida('sem_pedido', etapas)).toBe('Sem pedido');
    expect(nomeColunaSaida('etapa:ent', etapas)).toBe('Enviado ao destino final');
    expect(nomeColunaSaida('etapa:x', etapas)).toBe('Outra etapa');
  });
});

describe('colunaDoPedido', () => {
  it('aberto na etapa dele; etapa que saiu do quadro conta como a primeira; com baixa na da baixa; finalizado na final', () => {
    expect(colunaDoPedido(ped('P', 'sol', []), etapas)).toBe('etapa:sol');
    expect(colunaDoPedido(ped('P', 'sumiu', []), etapas)).toBe('etapa:a');
    expect(colunaDoPedido(ped('P', 'ag', [], { baixadoEm: '2026-10-05' }), etapas)).toBe('etapa:ent');
    expect(colunaDoPedido(ped('P', 'fim', [], { baixadoEm: '2026-10-05', finalizado: true }), etapas)).toBe('etapa:fim');
    expect(colunaDoPedido(ped('P', 'sol', []), [])).toBeNull();
  });
});

describe('partesDaSaida', () => {
  it('uma parte por coluna, cada uma só com os itens daquela etapa, na ordem das colunas', () => {
    const c = saiu({ itens: [
      item({ id: 'a', nome: 'VIÉS', resta: 10 }),
      item({ id: 'b', nome: 'BOTÃO', pedidoId: 'PED-0001' }),
      item({ id: 'c', nome: 'ZÍPER', status: 'RESOLVIDO', resta: 0, baixada: 52 })
    ] });
    const pedidos = [ped('PED-0001', 'sol', [pi('b', 30)]), ped('PED-0002', 'ent', [pi('c', 52)], { baixadoEm: '2026-10-05' })];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => [p.coluna, p.indice, p.total, p.itens.map((x) => [x.item.id, x.pedidoIds, x.qtd])])).toEqual([
      ['sem_pedido', 1, 3, [['a', [], 10]]],
      ['etapa:sol', 2, 3, [['b', ['PED-0001'], 30]]],
      ['etapa:ent', 3, 3, [['c', ['PED-0002'], 52]]]
    ]);
  });
  it('item em pedidos de etapas diferentes (pedido dividido) aparece nas duas partes, com a quantidade de cada uma', () => {
    const c = saiu({ itens: [item({ id: 'z', baixada: 20, resta: 32, pedidoId: 'PED-0003', pedidoIds: ['PED-0003'] })] });
    const pedidos = [ped('PED-0003', 'ag', [pi('z', 32)]), ped('PED-0003.1', 'ent', [pi('z', 20)], { pai: 'PED-0003', baixadoEm: '2026-10-06' })];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => [p.coluna, p.itens.map((x) => x.qtd)])).toEqual([['etapa:ag', [32]], ['etapa:ent', [20]]]);
  });
  it('resto aberto de um pedido com baixa: a parte da baixa e o resto em Sem pedido', () => {
    const c = saiu({ itens: [item({ id: 'z', baixada: 20, resta: 32 })] });
    const pedidos = [ped('PED-0004', 'ent', [pi('z', 20)], { baixadoEm: '2026-10-06' })];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => [p.coluna, p.itens[0].qtd])).toEqual([['sem_pedido', 32], ['etapa:ent', 20]]);
  });
  it('item fechado sem pedido vai para a etapa final; pedido que o board não trouxe conta como a primeira etapa', () => {
    const c = saiu({ itens: [item({ id: 'r', status: 'RESOLVIDO', resta: 0, baixada: 52 }), item({ id: 'p', pedidoId: 'PED-0009' })] });
    expect(partesDaSaida(c, [], etapas).map((p) => [p.coluna, p.itens.map((x) => [x.item.id, x.pedidoIds])])).toEqual([
      ['etapa:a', [['p', ['PED-0009']]]], ['etapa:fim', [['r', []]]]
    ]);
  });
  it('item de mesmo id em pedido de outra caixa não entra', () => {
    const c = saiu({ itens: [item({ id: 'b', resta: 5 })] });
    const pedidos = [ped('PED-0001', 'sol', [{ ...pi('b', 5), dealId: '999' }])];
    expect(partesDaSaida(c, pedidos, etapas).map((p) => p.coluna)).toEqual(['sem_pedido']);
  });
});

describe('saidasNaTela', () => {
  const hoje = new Date(2026, 9, 9);
  const board = (caixas: Board['caixas'], pedidos: Pedido[] = []): Board => ({ geradoEm: '', avisos: [], usuarios: [], caixas, pedidos, etapasPedido: etapas });
  it('só caixas que saíram com falta', () => {
    const r = saidasNaTela(board([saiu({ id: '1' }), caixa({ id: '2' }), caixa({ id: '3', saiu: true })]), hoje);
    expect(r.map((x) => x.caixa.id)).toEqual(['1']);
  });
  it('parte em Concluído some com mais de 30 dias sem atividade (29 x 31); as outras partes se renumeram', () => {
    const fechado = (id: string, saiuEm: string) => saiu({ id, saiuEm, itens: [item({ id: 'r', status: 'RESOLVIDO', resta: 0, baixada: 52 }), item({ id: 'a' })] });
    const r = saidasNaTela(board([fechado('c29', '2026-09-10'), fechado('c31', '2026-09-08')]), hoje);
    expect(r.map((x) => [x.caixa.id, x.parte.coluna, x.parte.indice, x.parte.total])).toEqual([
      ['c29', 'sem_pedido', 1, 2], ['c29', 'etapa:fim', 2, 2], ['c31', 'sem_pedido', 1, 1]
    ]);
  });
  it('a conclusão do pedido conta como atividade', () => {
    const c = saiu({ id: 'p', saiuEm: '2026-08-01', itens: [item({ id: 'z', status: 'RESOLVIDO', resta: 0, baixada: 52 })] });
    const fim = ped('PED-0005', 'fim', [pi('z', 52)], { baixadoEm: '2026-08-02', finalizado: true, concluidoEm: '2026-10-01' });
    expect(saidasNaTela(board([c], [fim]), hoje).map((x) => x.parte.coluna)).toEqual(['etapa:fim']);
    expect(saidasNaTela(board([c], [{ ...fim, concluidoEm: '2026-08-03' }]), hoje)).toEqual([]);
  });
  it('rótulo "90001 · 1 de 2" só com mais de uma parte; chave por caixa e coluna', () => {
    const [um] = saidasNaTela(board([saiu()]), hoje);
    expect(rotuloDaSaida(um)).toBe('90001');
    expect(chaveDaSaida(um)).toBe('600001|sem_pedido');
    const duas = saidasNaTela(board([saiu({ itens: [item({ id: 'a' }), item({ id: 'b', pedidoId: 'PED-0001' })] })], [ped('PED-0001', 'sol', [pi('b', 52)])]), hoje);
    expect(duas.map(rotuloDaSaida)).toEqual(['90001 · 1 de 2', '90001 · 2 de 2']);
  });
});

describe('textos e selos', () => {
  const hoje = new Date(2026, 9, 8);
  it('pedidos da parte, pedido do item, saída e selo vermelho a partir de 7 dias', () => {
    expect(textoPedidosDaParte({ pedidoIds: ['PED-0001', 'PED-0001.1'] })).toBe('PED-0001, PED-0001.1');
    expect(textoPedidosDaParte({ pedidoIds: [] })).toBe('sem pedido');
    expect(textoPedidosDaParte({ pedidoIds: ['novo:3'] })).toBe('Novo pedido');
    expect(textoPedidoDoItem(item({ pedidoId: 'PED-0001' }), [ped('PED-0001', 'sol', [])], etapas)).toBe('PED-0001 · Solicitado');
    expect(textoSaiu({ saiuEm: '2026-09-18' }, new Date(2026, 9, 7))).toBe('saiu 18/09 · há 19 dias');
    expect(diasDesdeSaida({ saiuEm: '2026-10-01' }, hoje)).toBe(7);
    expect(diasDesdeSaida({ saiuEm: '' }, hoje)).toBeNull();
    expect(seloSaidaVermelho(6)).toBe(false);
    expect(seloSaidaVermelho(7)).toBe(true);
    expect(seloSaidaVermelho(null)).toBe(false);
  });
  it('itens para pedido: abertos, editáveis e sem pedido', () => {
    const c = saiu({ itens: [item({ id: 'a' }), item({ id: 'b', pedidoId: 'PED-0001' }), item({ id: 'c', editavel: false }), item({ id: 'd', status: 'RESOLVIDO', resta: 0 }), item({ id: 'e', resta: null })] });
    expect(itensParaPedido(c).map((i) => i.id)).toEqual(['a']);
  });
});
```

Run: `cd web && npx vitest run src/regras/saidas.test.ts`
Expected: FAIL (funções novas não existem).

- [ ] **Step 2: `web/src/regras/saidas.ts`**

Substitua o arquivo por:

```ts
import type { Board, Caixa, EtapaPedido, Item, Pedido } from '../api/tipos';
import { arredondar3 } from './acoes';
import { itemAberto, itensAbertos } from './colunas';
import { ddmm, diasEntre, textoDias } from './datas';
import { pedidosDoItem, podeEntrarEmPedido, rotuloDoPedido } from './pedidos';

// Saídas com falta: "Sem pedido" (só quando há caixa nela) e as etapas do quadro de
// Solicitações de faltas, na ordem dele. A caixa se divide sozinha por etapa: uma parte por
// coluna onde ela tem item, cada parte só com os itens daquela etapa. A coluna de uma etapa
// tem o id `etapa:<id da etapa>`.
export type ColunaSaidaId = 'sem_pedido' | `etapa:${string}`;

export interface ColunaSaida { id: ColunaSaidaId; nome: string; cor: string; vazio: string }

// Item numa parte: os pedidos dele naquela coluna e a quantidade (a soma nesses pedidos; em
// Sem pedido, o que resta; item fechado sem pedido, o que foi baixado).
export interface ItemDaParte { item: Item; pedidoIds: string[]; qtd: number | null }

export interface ParteSaida { coluna: ColunaSaidaId; indice: number; total: number; itens: ItemDaParte[] }

export interface SaidaNaTela { caixa: Caixa; parte: ParteSaida }

const DIAS_CONCLUIDO_VISIVEL = 30;
export const DIAS_SELO_VERMELHO = 7;

export const idColunaEtapa = (etapaId: string): ColunaSaidaId => `etapa:${etapaId}`;

const SEM_PEDIDO: ColunaSaida = { id: 'sem_pedido', nome: 'Sem pedido', cor: 'var(--erro-text)', vazio: 'Toda falta já tem pedido.' };

function ordenadas(etapas: EtapaPedido[]): EtapaPedido[] {
  return [...etapas].sort((a, b) => a.ordem - b.ordem);
}

// Colunas na ordem da tela. A penúltima (a da baixa) em navy e a última (concluído) em verde.
export function colunasSaida(etapas: EtapaPedido[], comSemPedido: boolean): ColunaSaida[] {
  const o = ordenadas(etapas);
  const doQuadro = o.map((e, i): ColunaSaida => {
    const final = i === o.length - 1;
    return {
      id: idColunaEtapa(e.id), nome: e.nome,
      cor: final ? 'var(--success)' : i === o.length - 2 ? 'var(--navy)' : 'var(--falta)',
      vazio: final ? 'Caixas concluídas ficam aqui por 30 dias.' : 'Nenhuma caixa com pedido nesta etapa.'
    };
  });
  return [...(comSemPedido ? [SEM_PEDIDO] : []), ...doQuadro];
}

export function nomeColunaSaida(id: ColunaSaidaId, etapas: EtapaPedido[]): string {
  if (id === 'sem_pedido') return SEM_PEDIDO.nome;
  return etapas.find((e) => idColunaEtapa(e.id) === id)?.nome ?? 'Outra etapa';
}

// Coluna de um pedido: concluído na etapa final; com a baixa, na da baixa; senão a etapa dele
// (etapa que saiu do quadro conta como a primeira). null sem etapas.
export function colunaDoPedido(p: Pick<Pedido, 'etapa' | 'finalizado' | 'baixadoEm'>, etapas: EtapaPedido[]): ColunaSaidaId | null {
  const o = ordenadas(etapas);
  if (o.length === 0) return null;
  if (p.finalizado) return idColunaEtapa(o[o.length - 1].id);
  if (p.baixadoEm && o.length >= 2) return idColunaEtapa(o[o.length - 2].id);
  return idColunaEtapa((o.find((e) => e.id === p.etapa) ?? o[0]).id);
}

// Partes da caixa, na ordem das colunas. Um item entra em cada coluna onde tem pedido (original
// e partes, com a quantidade daquele pedido); aberto sem pedido aberto vai para Sem pedido (com
// o que resta); fechado sem pedido vai para a etapa final.
export function partesDaSaida(c: Caixa, pedidos: Pedido[], etapas: EtapaPedido[]): ParteSaida[] {
  const o = ordenadas(etapas);
  const ordem: ColunaSaidaId[] = ['sem_pedido', ...o.map((e) => idColunaEtapa(e.id))];
  const porColuna = new Map<ColunaSaidaId, ItemDaParte[]>();
  const adicionar = (col: ColunaSaidaId, x: ItemDaParte) => porColuna.set(col, [...(porColuna.get(col) ?? []), x]);
  for (const i of c.itens) {
    const linhas = pedidos.flatMap((p) => p.itens.filter((x) => x.itemId === i.id && x.dealId === c.dealId).map((x) => ({ p, qtd: x.qtd ?? 0 })));
    const cols = new Map<ColunaSaidaId, ItemDaParte>();
    for (const { p, qtd } of linhas) {
      const col = colunaDoPedido(p, etapas);
      if (!col) continue;
      const g = cols.get(col) ?? { item: i, pedidoIds: [], qtd: 0 };
      if (!g.pedidoIds.includes(p.id)) g.pedidoIds.push(p.id);
      g.qtd = arredondar3((g.qtd ?? 0) + qtd);
      cols.set(col, g);
    }
    // pedido aberto que o board ainda não trouxe: conta como a primeira etapa
    const vistos = new Set(linhas.map((x) => x.p.id));
    const soltos = pedidosDoItem(i).filter((id) => !vistos.has(id));
    if (soltos.length > 0 && o.length > 0) {
      const col = idColunaEtapa(o[0].id);
      const g = cols.get(col) ?? { item: i, pedidoIds: [], qtd: null };
      g.pedidoIds.push(...soltos);
      cols.set(col, g);
    }
    for (const [col, g] of cols) adicionar(col, g);
    if (itemAberto(i) && pedidosDoItem(i).length === 0) adicionar('sem_pedido', { item: i, pedidoIds: [], qtd: i.resta });
    else if (!itemAberto(i) && cols.size === 0 && o.length > 0) adicionar(idColunaEtapa(o[o.length - 1].id), { item: i, pedidoIds: [], qtd: i.baixada });
  }
  const presentes = ordem.filter((k) => porColuna.has(k));
  return presentes.map((coluna, k) => ({ coluna, indice: k + 1, total: presentes.length, itens: porColuna.get(coluna)! }));
}

// Caixa que aparece em Saídas: saiu com falta.
export function saiuComFalta(c: Caixa): boolean {
  return c.saiu && c.saiuComFalta;
}

// A data mais recente entre a saída, o último histórico, a última baixa e a conclusão dos
// pedidos da parte.
function ultimaAtividade(c: Caixa, parte: ParteSaida, pedidos: Pedido[]): string {
  let u = c.saiuEm;
  for (const h of c.historico) if (h.quando > u) u = h.quando;
  for (const x of parte.itens) {
    if (x.item.resolvidoEm > u) u = x.item.resolvidoEm;
    for (const id of x.pedidoIds) {
      const em = pedidos.find((p) => p.id === id)?.concluidoEm ?? '';
      if (em > u) u = em;
    }
  }
  return u;
}

// Partes das caixas que saíram com falta. A parte na etapa final some 30 dias depois da última
// atividade; as que ficam são renumeradas ("1 de 2").
export function saidasNaTela(board: Board, hoje: Date): SaidaNaTela[] {
  const pedidos = board.pedidos ?? [];
  const etapas = board.etapasPedido ?? [];
  const o = ordenadas(etapas);
  const final = o.length > 0 ? idColunaEtapa(o[o.length - 1].id) : null;
  const out: SaidaNaTela[] = [];
  for (const c of board.caixas) {
    if (!saiuComFalta(c)) continue;
    const visiveis = partesDaSaida(c, pedidos, etapas).filter((p) => {
      if (p.coluna !== final) return true;
      const d = diasEntre(ultimaAtividade(c, p, pedidos), hoje);
      return d === null || d <= DIAS_CONCLUIDO_VISIVEL;
    });
    visiveis.forEach((parte, k) => out.push({ caixa: c, parte: { ...parte, indice: k + 1, total: visiveis.length } }));
  }
  return out;
}

export const chaveDaSaida = (x: SaidaNaTela): string => `${x.caixa.id}|${x.parte.coluna}`;

// "90004 · 1 de 2" quando a caixa está em mais de uma coluna; senão só a OS.
export const rotuloDaSaida = (x: SaidaNaTela): string =>
  x.parte.total > 1 ? `${x.caixa.os} · ${x.parte.indice} de ${x.parte.total}` : x.caixa.os;

export function textoPedidosDaParte(x: Pick<ItemDaParte, 'pedidoIds'>): string {
  return x.pedidoIds.length > 0 ? x.pedidoIds.map(rotuloDoPedido).join(', ') : 'sem pedido';
}

export function diasDesdeSaida(c: Pick<Caixa, 'saiuEm'>, hoje: Date): number | null {
  return diasEntre(c.saiuEm, hoje);
}

export function seloSaidaVermelho(dias: number | null): boolean {
  return dias !== null && dias >= DIAS_SELO_VERMELHO;
}

// "PED-0044 · Solicitado" quando o item está num pedido aberto; senão "sem pedido". Com
// o pedido dividido, um por parte. Pedido em etapa que não existe mais: "Outra etapa".
export function textoPedidoDoItem(i: Pick<Item, 'pedidoId'> & { pedidoIds?: string[] }, pedidos: Pedido[], etapas: EtapaPedido[]): string {
  const ids = pedidosDoItem(i);
  if (ids.length === 0) return 'sem pedido';
  return ids.map((id) => {
    const p = pedidos.find((x) => x.id === id);
    const etapa = p && etapas.find((e) => e.id === p.etapa)?.nome;
    return `${rotuloDoPedido(id)} · ${etapa ?? 'Outra etapa'}`;
  }).join(', ');
}

// "saiu 18/09 · há 19 dias".
export function textoSaiu(c: Pick<Caixa, 'saiuEm'>, hoje: Date): string {
  if (!c.saiuEm) return 'saiu';
  return `saiu ${ddmm(c.saiuEm)} · ${textoDias(diasDesdeSaida(c, hoje))}`;
}

// Itens da caixa que podem entrar num pedido novo: abertos, editáveis e sem pedido.
export function itensParaPedido(c: Caixa): Item[] {
  return itensAbertos(c).filter(podeEntrarEmPedido);
}
```

Run: `cd web && npx vitest run src/regras/saidas.test.ts`
Expected: PASS.

- [ ] **Step 3: Tirar a oficina dos tipos e das regras**

- `web/src/api/tipos.ts`: apague `tratativa` e `tratativaEm` do `Caixa` e as duas variantes `enviar_oficina`/`oficina_recebeu` da `Acao` (o `;` passa para a linha do `salvar_etapas`).
- `web/src/regras/acoes.ts`: apague os casos `enviar_oficina` e `oficina_recebeu` do `mensagemSucesso`.
- `web/src/regras/otimista.ts`: apague os casos `enviar_oficina` e `oficina_recebeu` do primeiro `switch`.
- `web/src/regras/teste-util.ts`: no `caixa()`, apague `tratativa: '', tratativaEm: '',`.
- `web/src/regras/otimista.test.ts`: troque `import { colunaSaida, textoPedidoDoItem } from './saidas';` por `import { textoPedidoDoItem } from './saidas';`; apague o `describe('aplicarOtimista: oficina', ...)`; no teste `versaoNoBoard acha item, pedido e caixa`, troque `{ tipo: 'enviar_oficina', dealId: '600001', versao: '' }` por `{ tipo: 'obs_caixa', dealId: '600001', valor: '', versao: '' }`.
- `web/src/regras/divisao.test.ts`: troque `import { colunaSaida, textoPedidoDoItem } from './saidas';` por `import { textoPedidoDoItem } from './saidas';`; no `describe('Saídas com pedidoIds')`, apague o teste `a parte mais atrasada define a coluna; ...` e, no outro, apague a linha `expect(colunaSaida(c, lista, etapas)).toEqual(...)` (renomeie o describe para `'itens com pedidoIds'`).
- `web/src/regras/pedidos.test.ts`: apague as duas linhas de `mensagemSucesso` com `enviar_oficina` e `oficina_recebeu`.

- [ ] **Step 4: Componentes e tela**

Apague `web/src/componentes/saidas/AcoesSaida.tsx`:

Run: `cd web && git rm src/componentes/saidas/AcoesSaida.tsx`

`web/src/componentes/saidas/CardSaida.tsx`:

```tsx
import type { CSSProperties } from 'react';
import type { Caixa } from '../../api/tipos';
import { formatarQtd } from '../../regras/quantidade';
import { diasDesdeSaida, rotuloDaSaida, seloSaidaVermelho, textoPedidosDaParte, textoSaiu, type ParteSaida } from '../../regras/saidas';
import { corDoTipo, nomeDoTipo } from '../../regras/texto';

const ITENS_NO_CARD = 3;

interface Props {
  caixa: Caixa;
  parte: ParteSaida;
  final: boolean; // a parte está na etapa final (o destino confirmou)
  hoje: Date;
  selecionada: boolean;
  onAbrir: () => void;
}

// Card de uma parte da caixa: só os itens daquela etapa, com a quantidade e os pedidos.
export function CardSaida({ caixa, parte, final, hoje, selecionada, onAbrir }: Props) {
  const visiveis = parte.itens.slice(0, ITENS_NO_CARD);
  const ocultos = parte.itens.length - visiveis.length;
  const atrasada = !final && seloSaidaVermelho(diasDesdeSaida(caixa, hoje));
  const rotulo = rotuloDaSaida({ caixa, parte });
  return (
    <div role="button" tabIndex={0} aria-pressed={selecionada} aria-label={`OS ${rotulo}`}
      className={selecionada ? 'card card--selecionado' : 'card'} onClick={onAbrir}
      style={{ '--cor-tipo': corDoTipo(caixa.tipo) } as CSSProperties}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}>
      <span className="card__os">{rotulo}</span>
      <div className="card__peca">{caixa.peca}</div>
      <div className="card__meta">{[caixa.cliente, nomeDoTipo(caixa.tipo)].filter(Boolean).join(' · ')}</div>
      <div className="card__selos">
        <span className={atrasada ? 'selo-dias selo-dias--atrasado' : 'selo-dias'}>{textoSaiu(caixa, hoje)}</span>
      </div>
      <ul className="card__itens">
        {visiveis.map((x) => (
          <li key={x.item.id} className="card__item card__item--duplo">
            <span className="card__item-linha">
              <span className="card__item-nome">{x.item.nome}{x.item.cor && <span className="card__item-cor"> {x.item.cor}</span>}</span>
              <span className="card__item-qtd">{formatarQtd(x.qtd, x.item.un, parte.coluna === 'sem_pedido' ? x.item.restaG : null)}</span>
            </span>
            <span className={x.pedidoIds.length > 0 ? 'card__pedido' : 'card__pedido card__pedido--sem'}>{textoPedidosDaParte(x)}</span>
          </li>
        ))}
        {ocultos > 0 && <li className="card__mais">+ {ocultos} {ocultos > 1 ? 'itens' : 'item'}</li>}
      </ul>
      {final && <div className="card__rodape"><span className="card__estado card__estado--ok">material entregue no destino</span></div>}
    </div>
  );
}
```

`web/src/componentes/saidas/ItemSaida.tsx`:

```tsx
import { itemAberto } from '../../regras/colunas';
import { contaDoItem } from '../../regras/quantidade';
import { textoPedidosDaParte, type ItemDaParte } from '../../regras/saidas';

// Item no painel de Saídas: só leitura, com os pedidos dele nesta etapa.
export function ItemSaida({ x }: { x: ItemDaParte }) {
  const { item } = x;
  const aberto = itemAberto(item);
  const comPedido = x.pedidoIds.length > 0;
  const tag = comPedido ? 'tag tag--pedido' : aberto ? 'tag tag--falta' : 'tag tag--ok';
  return (
    <li className={aberto ? 'item' : 'item item--resolvido'}>
      <div className="item__topo">
        <span className="item__nome">{item.nome}{item.cor && <span className="item__cor"> {item.cor}</span>}</span>
        <span className={tag}>{comPedido || aberto ? textoPedidosDaParte(x) : 'resolvido'}</span>
      </div>
      <span className="item__conta">{contaDoItem(item)}</span>
      {item.obsAlmox && <p className="item__almox"><span>Almoxarifado:</span> {item.obsAlmox}</p>}
      {item.obsPcp && <p className="item__obs">{item.obsPcp}</p>}
    </li>
  );
}
```

`web/src/componentes/saidas/PainelSaida.tsx`:

```tsx
import type { Caixa, EtapaPedido } from '../../api/tipos';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { MSG_SOMENTE_LEITURA } from '../../regras/edicao';
import { itensParaPedido, nomeColunaSaida, textoSaiu, type ParteSaida } from '../../regras/saidas';
import { CabecalhoCaixa } from '../painel/CabecalhoCaixa';
import { Historico } from '../painel/Historico';
import { ItemSaida } from './ItemSaida';

interface Props {
  caixa: Caixa;
  parte: ParteSaida;
  etapas: EtapaPedido[];
  hoje: Date;
  editavel: boolean;
  onSelecionarParaPedido: (c: Caixa) => void;
  onFechar: () => void;
}

// Painel de uma parte da caixa que saiu com falta: os itens daquela etapa (só leitura) e o
// histórico da caixa. Em "Sem pedido", o passo seguinte é selecionar os itens para um pedido.
export function PainelSaida({ caixa, parte, etapas, hoje, editavel, onSelecionarParaPedido, onFechar }: Props) {
  useTeclaEsc(onFechar);
  const paraPedido = parte.coluna === 'sem_pedido' ? itensParaPedido(caixa).length : 0;
  return (
    <aside className="painel" aria-label={`Caixa da OS ${caixa.os}`}>
      <CabecalhoCaixa caixa={caixa} onFechar={onFechar} />
      <div className="painel__corpo">
        {!editavel && <p className="item__nota" role="note">{MSG_SOMENTE_LEITURA}</p>}
        <dl className="leitura">
          <div><dt>Etapa</dt><dd>{nomeColunaSaida(parte.coluna, etapas)}{parte.total > 1 && ` · parte ${parte.indice} de ${parte.total}`}</dd></div>
          <div><dt>Saída</dt><dd>{textoSaiu(caixa, hoje)}</dd></div>
          <div><dt>Responsável</dt><dd>{caixa.responsavel || '—'}</dd></div>
        </dl>
        {editavel && paraPedido > 0 && (
          <section className="secao">
            <h3 className="secao__titulo">O que fazer</h3>
            <div className="acoes">
              <button type="button" className="botao botao--navy" onClick={() => onSelecionarParaPedido(caixa)}>
                Selecionar para pedido
              </button>
            </div>
          </section>
        )}
        <section className="secao">
          <h3 className="secao__titulo">Itens desta etapa <span>{parte.itens.length}</span></h3>
          <ul className="itens">
            {parte.itens.map((x) => <ItemSaida key={x.item.id} x={x} />)}
          </ul>
        </section>
        <Historico entradas={caixa.historico ?? []} />
      </div>
    </aside>
  );
}
```

`web/src/telas/Saidas.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react';
import type { Board, Caixa } from '../api/tipos';
import { ColunaQuadro } from '../componentes/ColunaQuadro';
import { CardSaida } from '../componentes/saidas/CardSaida';
import { PainelSaida } from '../componentes/saidas/PainelSaida';
import { caixaAtendeBusca } from '../regras/busca';
import { caixaEditavelNoApp } from '../regras/edicao';
import { chaveDaSaida, colunasSaida, saidasNaTela } from '../regras/saidas';

interface Props {
  board: Board;
  q: string;
  hoje: Date;
  onSelecionarParaPedido: (c: Caixa) => void;
}

// Caixas que saíram do almoxarifado com falta, pelas etapas dos pedidos (as mesmas de
// Solicitações de faltas). Cada caixa se divide por etapa: uma parte por coluna onde tem item.
export function Saidas({ board, q, hoje, onSelecionarParaPedido }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  const fechar = useCallback(() => setSelId(null), []);
  const etapas = board.etapasPedido ?? [];
  // O dia (e não o instante) entra na chave: hoje muda a cada render do App.
  const dia = hoje.toDateString();
  const todas = useMemo(() => saidasNaTela(board, new Date(dia)), [board, dia]);
  const visiveis = useMemo(() => todas.filter((x) => caixaAtendeBusca(x.caixa, q)), [todas, q]);
  const colunas = useMemo(() => colunasSaida(etapas, todas.some((x) => x.parte.coluna === 'sem_pedido')), [etapas, todas]);
  const final = colunas.filter((c) => c.id !== 'sem_pedido').at(-1)?.id;
  const sel = visiveis.find((x) => chaveDaSaida(x) === selId) ?? null;
  return (
    <div className="quadro">
      <div className="quadro__rolagem">
        <div className="quadro__trilho">
          {colunas.map((col) => {
            const cs = visiveis.filter((x) => x.parte.coluna === col.id);
            return (
              <ColunaQuadro key={col.id} nome={col.nome} cor={col.cor} qtd={cs.length}
                vazio={q ? 'Nenhuma caixa desta etapa atende à busca.' : col.vazio}>
                {cs.map((x) => {
                  const chave = chaveDaSaida(x);
                  return (
                    <CardSaida key={chave} caixa={x.caixa} parte={x.parte} final={col.id === final} hoje={hoje}
                      selecionada={chave === selId} onAbrir={() => setSelId(chave === selId ? null : chave)} />
                  );
                })}
              </ColunaQuadro>
            );
          })}
        </div>
      </div>
      {sel && (
        <PainelSaida key={chaveDaSaida(sel)} caixa={sel.caixa} parte={sel.parte} etapas={etapas} hoje={hoje}
          editavel={caixaEditavelNoApp(board, sel.caixa)} onSelecionarParaPedido={onSelecionarParaPedido} onFechar={fechar} />
      )}
    </div>
  );
}
```

`web/src/App.tsx`: troque `<Saidas board={board} q={q} hoje={hoje} executar={executar} onSelecionarParaPedido={selecionarParaPedido} />` por `<Saidas board={board} q={q} hoje={hoje} onSelecionarParaPedido={selecionarParaPedido} />`.

- [ ] **Step 5: Vitest e build**

Run: `cd web && npm test && npm run build`
Expected: PASS e build sem erro (nenhuma referência a `tratativa`, `colunaSaida`, `podeEnviarOficina`, `AcoesSaida`; confira com `grep -rn "tratativa\|oficina" web/src` — só pode sobrar o local de entrega "Oficina").

- [ ] **Step 6: Simulado e fixture**

`web/scripts/mock-api.mjs`:
- apague a função `oficina` e os dois casos `enviar_oficina`/`oficina_recebeu` do `processar`;
- no helper `caixa(...)`, apague `tratativa: '', tratativaEm: '', `; na caixa 90006 apague `tratativa: 'ENVIADO', tratativaEm: diaIso(-2)` e na 90008 `tratativa: 'RECEBIDO', tratativaEm: diaIso(-3)`;
- acrescente ao comentário do topo: `// Saídas com falta: 90003 sem pedido; 90004 dividida (A pedir pelo PED-0005 em etapa que saiu do quadro, e Solicitado pelo PED-0001); 90005 dividida (Aguardando entrega e Enviado ao destino final, PED-0003.1 com a baixa); 90006 e 90007 em Enviado ao destino final; 90008 em Concluído (tudo resolvido sem pedido).`

Fixture sem a tratativa:

Run: `cd web && node -e "const fs=require('fs');const f='e2e/fixtures/board.json';const b=JSON.parse(fs.readFileSync(f,'utf8'));for(const c of b.caixas){delete c.tratativa;delete c.tratativaEm;}fs.writeFileSync(f,JSON.stringify(b,null,2)+'\n')" && git diff --stat e2e/fixtures/board.json`
Expected: só as linhas `tratativa`/`tratativaEm` saem.

- [ ] **Step 7: e2e de Saídas**

Em `web/e2e/f3.spec.ts`, onde ficavam os testes de Saídas apagados na Tarefa 2 (depois de `const nomesDasColunas = ...`), acrescente:

```ts
const COLUNAS_SAIDA = ['A pedir', 'Solicitado', 'Aguardando entrega', 'Enviado ao destino final', 'Concluído'];

test('Saídas: colunas são Sem pedido e as etapas de Solicitações', async ({ page }) => {
  await preparar(page, '#saidas');
  await expect(page.getByRole('region', { name: 'Sem pedido' }).getByRole('button', { name: 'OS 90003' })).toBeVisible();
  expect(await nomesDasColunas(page)).toEqual(['Sem pedido', ...COLUNAS_SAIDA]);
});

test('Saídas: a caixa se divide por etapa, cada parte só com os itens dela', async ({ page }) => {
  await preparar(page, '#saidas', {
    ajustar: (b) => {
      const c = b.caixas[2];
      c.itens.push({ ...c.itens[0], id: 'c2', nome: 'LINHA 120', un: 'cones', pedidoId: 'PED-0043' } as never);
      b.pedidos = [pedido('PED-0043', 'solicitado', [{ ...VIES, itemId: 'c2', nome: 'LINHA 120', un: 'cones', qtd: 4 }])] as never;
    }
  });
  expect(await nomesDasColunas(page)).toEqual(['Sem pedido', ...COLUNAS_SAIDA]);
  const sem = page.getByRole('region', { name: 'Sem pedido' }).getByRole('button', { name: 'OS 90003 · 1 de 2', exact: true });
  await expect(sem).toContainText('VIES LINEAR 6 CM');
  await expect(sem).not.toContainText('LINHA 120');
  const sol = page.getByRole('region', { name: 'Solicitado' }).getByRole('button', { name: 'OS 90003 · 2 de 2', exact: true });
  await expect(sol).toContainText('LINHA 120');
  await expect(sol).toContainText('PED-0043');
  await expect(sol).not.toContainText('VIES LINEAR 6 CM');
  await sol.click();
  const painel = page.getByRole('complementary', { name: 'Caixa da OS 90003' });
  await expect(painel).toContainText('Solicitado · parte 2 de 2');
  await expect(painel.getByRole('button', { name: 'Selecionar para pedido' })).toHaveCount(0);
  await expect(painel.getByRole('button', { name: 'Enviar à oficina' })).toHaveCount(0);
});

test('Saídas: pedido com baixa leva a parte para Enviado ao destino final; concluído, para Concluído', async ({ page }) => {
  await preparar(page, '#saidas', {
    ajustar: (b) => {
      const i = b.caixas[2].itens[0] as Corpo;
      i.resta = 0; i.baixada = i.falta; i.status = 'RESOLVIDO'; i.resolvidoEm = '2026-10-06';
      b.pedidos = [pedido('PED-0042', 'entregue', [VIES], { baixadoEm: '2026-10-06' })] as never;
    }
  });
  expect(await nomesDasColunas(page)).toEqual(COLUNAS_SAIDA);
  await expect(page.getByRole('region', { name: 'Enviado ao destino final' }).getByRole('button', { name: 'OS 90003' })).toContainText('PED-0042');
});

test('Saídas: material entregue no destino (pedido concluído) fica em Concluído', async ({ page }) => {
  await preparar(page, '#saidas', {
    ajustar: (b) => {
      const i = b.caixas[2].itens[0] as Corpo;
      i.resta = 0; i.baixada = i.falta; i.status = 'RESOLVIDO'; i.resolvidoEm = '2026-10-05';
      b.pedidos = [pedido('PED-0042', 'concluido', [VIES], { baixadoEm: '2026-10-04', concluidoEm: '2026-10-05', finalizado: true })] as never;
    }
  });
  await expect(page.getByRole('region', { name: 'Concluído' }).getByRole('button', { name: 'OS 90003' })).toContainText('material entregue no destino');
});
```

No teste `caixa fora de dealsEditaveis: ...`, apague as duas linhas que conferem `Enviar à oficina` e `Oficina recebeu` (os botões não existem mais).

- [ ] **Step 8: Rodar tudo do web**

Run: `cd web && npm test && npm run build && CI=1 npx playwright test`
Expected: tudo PASS (inclusive `f3-smoke.spec.ts`: 90003 continua em Sem pedido com "Selecionar para pedido").

- [ ] **Step 9: Commit**

```bash
git add -A web/src web/scripts/mock-api.mjs web/e2e
git commit -m "$(cat <<'EOF'
feat(web): Saídas com falta divididas por etapa e sem o rabo da oficina

Colunas Sem pedido + etapas dos pedidos; a caixa vira uma parte por coluna onde tem
item ("90004 · 1 de 2"), cada uma só com os itens daquela etapa. Concluído some após
30 dias sem atividade. Saem Enviar à oficina, Oficina recebeu e a tratativa.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: n8n — Nova demanda pós-saída (FALTANTES append, posSaida no board)

**Files:**
- Modify: `n8n/src/pedidos.js` (tipo `nova_demanda`), `n8n/src/montarCaixas.js` (`posSaida`), `n8n/src/planilhaLote.js` (destino `FALTANTES append`)
- Create: `n8n/test/demanda-pos-saida.test.js`
- Modify: `n8n/test/montarCaixas.test.js`, `n8n/test/planilha-lote.test.js`
- Regenerate: `n8n/build/*`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json`

**Interfaces:**
- Consumes: `tipoDaSecao`, `dealEditavel`, `ERRO_NAO_EDITAVEL`, `linhaHistorico`, `op`, `textoCurto`, `qtdValida`, `formatarQtd`.
- Produces: ação `{ tipo: 'nova_demanda', os: string, caixa: 'COSTURA' | 'ACABAMENTO', itens: [{ nome, cor?, qtd, un }] }` → operações `FALTANTES append` (chave `id`) + uma linha de histórico na OS; erros 400/403/404/409 da Decisão 7 e da spec; board: `item.posSaida: boolean`.

- [ ] **Step 1: Conferir o Sync Faltantes (só leitura, MCP do n8n)**

Use o MCP do n8n, sem alterar nada:
1. `search_workflows` com `query: "Sync Faltantes"` → anote o id de "Sync Faltantes - Google Sheets" (em 09/10/2026: `s4mbblVXykIvkA8M`).
2. `get_workflow_details` desse id. Leia o código dos nodes **"Diff"** e **"Montar Linhas Desejadas"** e os parâmetros de **"Gravar FALTANTES"**.
3. Confirme os três pontos (se algum mudou, **pare** e avise o dono antes de seguir):
   - o id gerado pelo sync é `dealId + '|' + ciclo + '|' + chave`, com `ciclo` só `PEDIDO` ou `CORTE`;
   - a limpeza de órfãs do "Diff" só fecha linhas com `String(r.deal_id) === dealId && String(r.ciclo) === ciclo`, e a reconciliação com o corte só mexe em `ciclo === 'PEDIDO'`;
   - "Gravar FALTANTES" é `appendOrUpdate` com `matchingColumns: ["id"]` e colunas definidas uma a uma (sem `origem`).
4. Conclusão esperada (09/10/2026): linhas com `ciclo` = `POS_SAIDA` e id `<deal>|POS_SAIDA|<uuid>` nunca são apagadas nem sobrescritas pelo sync. **Nada a mudar no Sync.** Só o "Utilitario - Limpar Planilha Faltantes (manual)" (inativo) apagaria tudo, como apaga o resto: fica registrado no README (Tarefa 7).

- [ ] **Step 2: Testes (falham)**

Crie `n8n/test/demanda-pos-saida.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

// 09/10/2026: nova demanda pos-saida. Itens descobertos depois que a caixa saiu entram
// na FALTANTES ligados ao deal da caixa (CAIXAS GANHAS por OS + tipo), com ciclo e origem
// POS_SAIDA (o Sync Faltantes nao toca essas linhas).
const ctx = carregar();
const T0 = Date.UTC(2026, 9, 9, 15, 0, 0);
const ISO = new Date(T0).toISOString();
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [{ email: 'lucca@exemplo.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' }];

function sessao() {
  const e = {};
  const r = ctx.processarLogin(crypto, e, { email: 'lucca@exemplo.com', senha: 'senha-forte-123' }, USUARIOS, T0);
  return { e, cab: 'Bearer ' + r.body.token };
}
const GANHA = { deal_id: '700004', os: '90004', caixa: 'Caixa de costura', referencia: 'REF-04', descricao_peca: 'PECA D',
  cliente: 'CLIENTE ALFA', saiu_com_falta: 'NAO', itens_faltando: '', data_ganho: '2026-10-01' };
const CORPO = { tipo: 'nova_demanda', os: '90004', caixa: 'COSTURA',
  itens: [{ nome: 'BOTÃO 12MM', cor: 'azul', qtd: 2, un: 'UN' }, { nome: 'VIÉS', cor: '', qtd: '1,5', un: 'MT' }] };
function linhas(extra) {
  return Object.assign({ faltantes: [], caixasPcp: [], ganhas: [GANHA], pedidos: [], pedidosItens: [], etapas: [] }, extra);
}
function acao(corpo, lin) {
  const s = sessao();
  let n = 0;
  return limpo(ctx.processarAcao(s.e, s.cab, corpo, lin || linhas(), T0, () => 'h-' + (++n)));
}

test('nova_demanda: grava os itens na FALTANTES ligados ao deal da caixa, com ciclo e origem POS_SAIDA', () => {
  const r = acao(CORPO);
  assert.equal(r.status, 200);
  const base = {
    os: '90004', ciclo: 'POS_SAIDA', origem: 'POS_SAIDA', referencia: 'REF-04', descricao_peca: 'PECA D', cliente: 'CLIENTE ALFA',
    secao: 'COSTURA', qtd_baixada: 0, status: 'ABERTO', data_separacao: '2026-10-09 12:00', deal_id: '700004', atualizado_em_app: ISO
  };
  assert.deepEqual(r.operacoes, [
    { aba: 'FALTANTES', operacao: 'append', chave: 'id', linha: Object.assign({ id: '700004|POS_SAIDA|h-1', descricao_item: 'BOTÃO 12MM', nome_cor: 'azul', unidade: 'UN', qtd_falta: 2 }, base) },
    { aba: 'FALTANTES', operacao: 'append', chave: 'id', linha: Object.assign({ id: '700004|POS_SAIDA|h-2', descricao_item: 'VIÉS', nome_cor: '', unidade: 'MT', qtd_falta: 1.5 }, base) }
  ]);
  assert.deepEqual(r.historicos.map((h) => [h.deal_id, h.os, h.acao, h.texto, h.ploomes_status]), [
    ['700004', '90004', 'nova_demanda', 'Lucca criou demanda pós-saída: 2 UN de BOTÃO 12MM azul; 1,5 MT de VIÉS', 'PENDENTE']
  ]);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.versao, ISO);
  assert.equal(r.gravacao, null);
  assert.equal(r.historico, null);
});

test('nova_demanda: validacoes do corpo, iguais no pre e no processar', () => {
  const s = sessao();
  const casos = [
    [{ os: '' }, 'Informe a OS.'],
    [{ caixa: 'PREPARACAO' }, 'Escolha o tipo de caixa.'],
    [{ itens: [] }, 'Informe ao menos um item.'],
    [{ itens: [{ nome: ' ', qtd: 1, un: 'UN' }] }, 'Informe o nome do item.'],
    [{ itens: [{ nome: 'X', qtd: 0, un: 'UN' }] }, 'Informe uma quantidade maior que zero'],
    [{ itens: [{ nome: 'X', qtd: 1, un: '' }] }, 'Informe a unidade do item.'],
    [{ itens: [{ nome: 'X'.repeat(101), qtd: 1, un: 'UN' }] }, 'Nome do item muito longo.'],
    [{ itens: Array.from({ length: 31 }, () => ({ nome: 'X', qtd: 1, un: 'UN' })) }, 'No máximo 30 itens por demanda.']
  ];
  for (const [extra, erro] of casos) {
    const corpo = Object.assign({}, CORPO, extra);
    assert.deepEqual(limpo(ctx.preValidarAcao(s.e, s.cab, corpo, T0)), { ok: false, status: 400, body: { erro } });
    assert.deepEqual(acao(corpo), { status: 400, body: { erro } });
  }
  // tipo de caixa sem acento/caixa baixa vale; aqui a caixa de acabamento nao existe
  assert.equal(acao(Object.assign({}, CORPO, { caixa: 'acabamento' })).status, 404);
});

test('nova_demanda: caixa nao encontrada, ainda nao saiu, duplicada ou nao editavel; nada e gravado', () => {
  assert.deepEqual(acao(Object.assign({}, CORPO, { os: '99999' })), { status: 404, body: { erro: 'Caixa da OS 99999 (Costura) não encontrada.' } });
  const noAlmox = linhas({ ganhas: [], faltantes: [{ id: 'x', os: '90004', deal_id: '700004', secao: 'COSTURA', status: 'ABERTO', qtd_falta: 1 }] });
  assert.deepEqual(acao(CORPO, noAlmox), { status: 409, body: { erro: 'A caixa da OS 90004 (Costura) ainda não saiu.' } });
  const duas = linhas({ ganhas: [GANHA, Object.assign({}, GANHA, { deal_id: '700099' })] });
  assert.deepEqual(acao(CORPO, duas), { status: 409, body: { erro: 'Mais de uma caixa da OS 90004 (Costura) saiu. Fale com o PCP.' } });
  ctx.DEALS_EDITAVEIS = ['600001'];
  try {
    assert.deepEqual(acao(CORPO), { status: 403, body: { erro: 'Edição liberada em breve para esta caixa.' } });
  } finally {
    ctx.DEALS_EDITAVEIS = [];
  }
});

test('board: item com origem POS_SAIDA vem com posSaida e fica na caixa mesmo resolvido numa caixa de CORTE', () => {
  const linha = acao(CORPO).operacoes[0].linha;
  const corte = { id: 'k', os: '90004', deal_id: '700004', ciclo: 'CORTE', secao: 'COSTURA', descricao_item: 'TECIDO', unidade: 'MT', qtd_falta: 0, status: 'RESOLVIDO' };
  const pos = Object.assign({}, linha, { status: 'RESOLVIDO', qtd_baixada: 2 });
  const cx = limpo(ctx.montarRespostaBoard({}, [corte, pos], [GANHA], T0, {})).body.caixas[0];
  assert.deepEqual(cx.itens.map((i) => [i.nome, i.posSaida]), [['TECIDO', false], ['BOTÃO 12MM', true]]);
  assert.equal(cx.saiu, true);
  assert.equal(cx.saiuComFalta, false);
});
```

No fim de `n8n/test/planilha-lote.test.js`, acrescente:

```js
test('nova_demanda: append na FALTANTES (com a coluna origem nova) antes do historico', () => {
  const p = planilha([
    ['FALTANTES', [['id', 'os', 'deal_id', 'descricao_item', 'qtd_falta'], ['a', '9', '1', 'X', 1]]],
    ['HISTORICO_APP', [['id', 'quando', 'texto', 'ploomes_status']]]
  ]);
  const r = req([op('FALTANTES', 'append', 'id', { id: '1|POS_SAIDA|u1', os: '9', deal_id: '1', descricao_item: 'BOTÃO', qtd_falta: 2, origem: 'POS_SAIDA' })],
    [{ id: 'h1', quando: 'T', texto: 'demanda', ploomes_status: 'PENDENTE' }], p);
  assert.deepEqual(r.map((x) => x.url.replace(BASE, '')), [
    ':batchUpdate',
    '/' + encodeURIComponent("'FALTANTES'!A1") + ':append?valueInputOption=RAW&insertDataOption=OVERWRITE',
    '/' + encodeURIComponent("'HISTORICO_APP'!A1") + ':append?valueInputOption=RAW&insertDataOption=OVERWRITE'
  ]);
  assert.deepEqual(r[0].body.data, [{ range: "'FALTANTES'!F1", values: [['origem']] }]);
  assert.deepEqual(r[1].body.values, [['1|POS_SAIDA|u1', '9', '1', 'BOTÃO', 2, 'POS_SAIDA']]);
});
```

Em `n8n/test/montarCaixas.test.js`, acrescente `posSaida: false` aos dois `deepEqual` de item (o do item `a` e o do item genérico `700009|ganha|0`).

Run: `cd n8n && npm test`
Expected: FAIL em `demanda-pos-saida.test.js` (tipo inválido), no teste novo do `planilha-lote` (`Operacao sem destino no workflow: FALTANTES append id`) e nos dois `deepEqual` do `montarCaixas`.

- [ ] **Step 3: Implementar**

`n8n/src/planilhaLote.js`, em `DESTINOS_ESCRITA`, acrescente depois da linha do `FALTANTES update`:

```js
  { aba: 'FALTANTES', operacao: 'append', chave: 'id' },  // nova demanda pos-saida
```

`n8n/src/montarCaixas.js`:
- em `itemDaLinha`, depois de `editavel: true`, acrescente `,\n    posSaida: semAcento(l.origem) === 'POS_SAIDA'` (item da demanda pós-saída: selo no site e fora do No Ploomes);
- em `itensDoTexto` e no item genérico `'Itens não detalhados na planilha'`, acrescente `posSaida: false` depois de `editavel: false`;
- no `linhas.forEach` de `montarCaixas` (onde monta `itens`), troque por:

```js
    linhas.forEach(function (l) {
      var it = itemDaLinha(l, ano);
      var ehCorte = texto(l.ciclo).toUpperCase() === 'CORTE';
      // item pos-saida fica sempre (o sync do corte nao o conhece)
      if (!temCorte || ehCorte || it.posSaida || itemEstaAberto(it)) itens.push(it);
    });
```

`n8n/src/pedidos.js`:
- em `TIPOS_PEDIDO`, acrescente `'nova_demanda'`;
- depois de `var ERRO_ETAPA_PELO_CARD = ...`, acrescente:

```js
var NOMES_CAIXA = { COSTURA: 'Costura', ACABAMENTO: 'Acabamento' };
var MAX_ITENS_DEMANDA = 30;
```

- em `validarAcaoPedido`, antes do bloco `if (tipo === 'salvar_etapas')`, acrescente:

```js
  if (tipo === 'nova_demanda') {
    acao.os = texto(corpo.os);
    if (!acao.os) return erroAcao(400, 'Informe a OS.');
    acao.caixa = semAcento(corpo.caixa);
    if (!NOMES_CAIXA[acao.caixa]) return erroAcao(400, 'Escolha o tipo de caixa.');
    if (!Array.isArray(corpo.itens) || !corpo.itens.length) return erroAcao(400, 'Informe ao menos um item.');
    if (corpo.itens.length > MAX_ITENS_DEMANDA) return erroAcao(400, 'No máximo 30 itens por demanda.');
    acao.itens = [];
    for (i = 0; i < corpo.itens.length; i++) {
      var d = corpo.itens[i] || {};
      var rn = textoCurto(d.nome, 100, 'Nome do item muito longo.');
      if (!rn.ok) return erroAcao(400, rn.erro);
      if (!rn.valor) return erroAcao(400, 'Informe o nome do item.');
      var rc = textoCurto(d.cor, 40, 'Cor muito longa.');
      if (!rc.ok) return erroAcao(400, rc.erro);
      var qd = qtdValida(d.qtd);
      if (qd === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
      var ru = textoCurto(d.un, 10, 'Unidade muito longa.');
      if (!ru.ok) return erroAcao(400, ru.erro);
      if (!ru.valor) return erroAcao(400, 'Informe a unidade do item.');
      acao.itens.push({ nome: rn.valor, cor: rc.valor, qtd: qd, un: ru.valor });
    }
    return { ok: true, acao: acao };
  }
```

  (as variáveis `i` e `r` já são declaradas no topo da função; se o `qd` colidir com o do ramo `dividir_pedido`, use `qn`.)
- em `aplicarAcaoPedido`, logo depois de `if (tipo === 'salvar_etapas') return aplicarEtapas(...);`, acrescente `if (tipo === 'nova_demanda') return aplicarNovaDemanda(acao, linhas, ctx);`;
- no fim do arquivo, acrescente:

```js
// 'aaaa-mm-dd hh:mm' no horario de Brasilia (como o Sync Faltantes grava data_separacao).
function dataHoraBrasilia(iso) {
  var d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString();
  return d.slice(0, 10) + ' ' + d.slice(11, 16);
}

// nova_demanda: falta descoberta depois que a caixa saiu. A caixa e achada na CAIXAS
// GANHAS pela OS + tipo; sem caixa, ou caixa que ainda nao saiu, recusa sem gravar nada.
// Os itens entram na FALTANTES com ciclo e origem POS_SAIDA e id <deal>|POS_SAIDA|<uuid>:
// o Sync Faltantes so mexe nas linhas do mesmo deal com ciclo PEDIDO/CORTE e casa por id.
function aplicarNovaDemanda(acao, linhas, ctx) {
  var rotulo = 'OS ' + acao.os + ' (' + NOMES_CAIXA[acao.caixa] + ')';
  var ganhas = (linhas.ganhas || []).filter(function (g) {
    return g && texto(g.os) === acao.os && tipoDaSecao(g.caixa) === acao.caixa && texto(g.deal_id) !== '';
  });
  var deals = {};
  ganhas.forEach(function (g) { deals[texto(g.deal_id)] = 1; });
  if (Object.keys(deals).length > 1) return erroAcao(409, 'Mais de uma caixa da ' + rotulo + ' saiu. Fale com o PCP.');
  if (!ganhas.length) {
    var noAlmox = (linhas.faltantes || []).some(function (l) {
      return l && texto(l.os) === acao.os && tipoDaSecao(l.secao) === acao.caixa;
    });
    return noAlmox ? erroAcao(409, 'A caixa da ' + rotulo + ' ainda não saiu.') : erroAcao(404, 'Caixa da ' + rotulo + ' não encontrada.');
  }
  var g = ganhas[0];
  var dealId = texto(g.deal_id);
  if (!dealEditavel(dealId)) return erroAcao(403, ERRO_NAO_EDITAVEL);
  var agora = ctx.agora;
  var quando = dataHoraBrasilia(agora);
  var os = texto(g.os);
  var operacoes = acao.itens.map(function (it) {
    return op('FALTANTES', 'append', 'id', {
      id: dealId + '|POS_SAIDA|' + ctx.gerarId(), os: os, ciclo: 'POS_SAIDA', origem: 'POS_SAIDA',
      referencia: texto(g.referencia), descricao_peca: texto(g.descricao_peca), cliente: texto(g.cliente), secao: acao.caixa,
      descricao_item: it.nome, nome_cor: it.cor, unidade: it.un, qtd_falta: it.qtd, qtd_baixada: 0, status: 'ABERTO',
      data_separacao: quando, deal_id: dealId, atualizado_em_app: agora
    });
  });
  var partes = acao.itens.map(function (it) {
    return formatarQtd(it.qtd) + ' ' + it.un + ' de ' + it.nome + (it.cor ? ' ' + it.cor : '');
  });
  return {
    ok: true,
    operacoes: operacoes,
    historicos: [linhaHistorico(ctx, dealId, os, '', acao.tipo, ctx.usuario + ' criou demanda pós-saída: ' + partes.join('; '))],
    versao: agora
  };
}
```

- [ ] **Step 4: Rodar a suíte e o build**

Run: `cd n8n && npm test && npm run build`
Expected: todos PASS; build regenerado sem erro.

- [ ] **Step 5: Commit**

```bash
git add n8n/src n8n/test n8n/build n8n/workflows
git commit -m "$(cat <<'EOF'
feat(n8n): nova demanda pós-saída grava itens na FALTANTES com origem POS_SAIDA

A caixa é achada em CAIXAS GANHAS pela OS + tipo; sem caixa ou caixa que não saiu, a
ação recusa sem gravar. As linhas têm ciclo/origem POS_SAIDA e id próprio, que o Sync
Faltantes não apaga nem sobrescreve (conferido no workflow). O board marca posSaida.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Web — Nova demanda (janela, selo pós-saída, Saídas e No Ploomes)

**Files:**
- Create: `web/src/regras/demanda.ts`, `web/src/regras/demanda.test.ts`, `web/src/componentes/pedidos/JanelaNovaDemanda.tsx`
- Modify: `web/src/api/tipos.ts`, `web/src/regras/acoes.ts`, `web/src/regras/otimista.ts`, `web/src/regras/colunas.ts`, `web/src/regras/saidas.ts`
- Modify: `web/src/componentes/pedidos/AcoesPedidos.tsx`, `FaltasSemPedido.tsx`, `web/src/telas/Pedidos.tsx`, `web/src/telas/NoPloomes.tsx`, `web/src/App.tsx`, `web/src/styles/f3.css`
- Modify: `web/scripts/mock-api.mjs`, `web/e2e/f3.spec.ts`

**Interfaces:**
- Consumes: ação do servidor da Tarefa 5; `caixaEditavelNoApp`, `MSG_SOMENTE_LEITURA`, `lerQuantidade`, `arredondar3`, `Janela`, `PREFIXO_NOVO`.
- Produces: `Item.posSaida?: boolean`; `Acao` `{ tipo: 'nova_demanda'; os: string; caixa: TipoCaixaDemanda; itens: { nome; cor; qtd; un }[] }`; `caixaDaDemanda(board, os, tipo): { caixa: Caixa } | { erro: string }`; `validarDemanda(linhas): { erros: Record<number,string>; itens }`; `acaoNovaDemanda(os, tipo, itens): Acao`; `semPosSaida(caixa): Caixa`; `saiuComFalta` passa a contar item pós-saída; `JanelaPedidos` ganha `'demanda'`.

- [ ] **Step 1: Testes (falham)**

Crie `web/src/regras/demanda.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Board } from '../api/tipos';
import { mensagemSucesso } from './acoes';
import { colunaDaCaixa, semPosSaida } from './colunas';
import { acaoNovaDemanda, caixaDaDemanda, validarDemanda } from './demanda';
import { aplicarOtimista } from './otimista';
import { faltasSemPedido } from './pedidos';
import { saiuComFalta } from './saidas';
import { caixa, item } from './teste-util';

const quadro = (caixas: Board['caixas'], o: Partial<Board> = {}): Board => ({ geradoEm: '', avisos: [], usuarios: [], caixas, ...o });
const saiu = caixa({ id: '700003', dealId: '700003', os: '90003', tipo: 'COSTURA', saiu: true, saiuEm: '2026-10-01', itens: [] });

describe('caixaDaDemanda', () => {
  it('acha a caixa que saiu pela OS e pelo tipo', () => {
    expect(caixaDaDemanda(quadro([saiu]), ' 90003 ', 'COSTURA')).toEqual({ caixa: saiu });
  });
  it('mensagens iguais às do servidor', () => {
    expect(caixaDaDemanda(quadro([saiu]), '90003', 'ACABAMENTO')).toEqual({ erro: 'Caixa da OS 90003 (Acabamento) não encontrada.' });
    expect(caixaDaDemanda(quadro([{ ...saiu, saiu: false }]), '90003', 'COSTURA')).toEqual({ erro: 'A caixa da OS 90003 (Costura) ainda não saiu.' });
    expect(caixaDaDemanda(quadro([saiu, { ...saiu, id: '700099', dealId: '700099' }]), '90003', 'COSTURA'))
      .toEqual({ erro: 'Mais de uma caixa da OS 90003 (Costura) saiu. Fale com o PCP.' });
    expect(caixaDaDemanda(quadro([saiu], { dealsEditaveis: ['1'] }), '90003', 'COSTURA')).toEqual({ erro: 'Edição liberada em breve para esta caixa.' });
  });
});

describe('validarDemanda', () => {
  it('nome, quantidade e unidade obrigatórios; cor opcional; linha vazia ignorada', () => {
    const r = validarDemanda([
      { nome: ' BOTÃO ', cor: '', qtd: '2', un: 'UN' },
      { nome: '', cor: '', qtd: '', un: '' },
      { nome: 'VIÉS', cor: 'preto', qtd: '0', un: 'MT' },
      { nome: 'LINHA', cor: '', qtd: '1,5', un: '' },
      { nome: '', cor: 'azul', qtd: '1', un: 'UN' }
    ]);
    expect(r.itens).toEqual([{ nome: 'BOTÃO', cor: '', qtd: 2, un: 'UN' }]);
    expect(r.erros).toEqual({ 2: 'Informe uma quantidade maior que zero', 3: 'Informe a unidade do item.', 4: 'Informe o nome do item.' });
  });
  it('corpo da ação e mensagem de sucesso', () => {
    const a = acaoNovaDemanda(' 90003 ', 'COSTURA', [{ nome: 'BOTÃO', cor: 'azul', qtd: 2, un: 'UN' }]);
    expect(a).toEqual({ tipo: 'nova_demanda', os: '90003', caixa: 'COSTURA', itens: [{ nome: 'BOTÃO', cor: 'azul', qtd: 2, un: 'UN' }] });
    expect(mensagemSucesso(a)).toBe('Demanda pós-saída criada · 1 item na OS 90003');
  });
});

describe('demanda pós-saída nas telas', () => {
  it('otimista: os itens entram na caixa como pós-saída, ainda sem edição (id provisório)', () => {
    const b = aplicarOtimista(quadro([saiu]), acaoNovaDemanda('90003', 'COSTURA', [{ nome: 'BOTÃO', cor: 'azul', qtd: 2, un: 'UN' }]), { hoje: '2026-10-09', n: 4 });
    expect(b.caixas[0].itens).toMatchObject([{ id: 'novo:4.0', nome: 'BOTÃO', cor: 'azul', un: 'UN', falta: 2, resta: 2, status: 'ABERTO', posSaida: true, editavel: false }]);
    const sem = quadro([{ ...saiu, saiu: false }]);
    expect(aplicarOtimista(sem, acaoNovaDemanda('90003', 'COSTURA', [{ nome: 'X', cor: '', qtd: 1, un: 'UN' }]), { hoje: '', n: 1 })).toBe(sem);
  });
  it('item pós-saída gravado aparece em Faltas sem pedido e põe a caixa em Saídas, mas não no No Ploomes', () => {
    const c = { ...saiu, itens: [item({ id: '700003|POS_SAIDA|u1', posSaida: true })] };
    expect(faltasSemPedido(quadro([c]))[0].itens.map((i) => i.id)).toEqual(['700003|POS_SAIDA|u1']);
    expect(saiuComFalta(c)).toBe(true);
    expect(saiuComFalta({ ...c, itens: [] })).toBe(false);
    expect(semPosSaida(c).itens).toEqual([]);
    expect(colunaDaCaixa(semPosSaida(c))).toBe('saiu_sem');
    const misto = { ...c, itens: [item({ id: 'a' }), ...c.itens] };
    expect(semPosSaida(misto).itens.map((i) => i.id)).toEqual(['a']);
    expect(semPosSaida(saiu)).toBe(saiu);
  });
});
```

Run: `cd web && npx vitest run src/regras/demanda.test.ts`
Expected: FAIL (módulo `./demanda` não existe).

- [ ] **Step 2: Tipos, regras e otimista**

`web/src/api/tipos.ts`: no `Item`, depois de `editavel: boolean;`, acrescente `posSaida?: boolean; // falta registrada depois que a caixa saiu (Nova demanda): selo em Faltas sem pedido, fora do No Ploomes`. Na `Acao`, antes do `salvar_etapas`, acrescente:

```ts
  | { tipo: 'nova_demanda'; os: string; caixa: 'COSTURA' | 'ACABAMENTO'; itens: { nome: string; cor: string; qtd: number; un: string }[] }
```

Crie `web/src/regras/demanda.ts`:

```ts
import type { Acao, Board, Caixa } from '../api/tipos';
import { arredondar3, lerQuantidade } from './acoes';
import { caixaEditavelNoApp, MSG_SOMENTE_LEITURA } from './edicao';

// Nova demanda pós-saída: falta descoberta depois que a caixa saiu do almoxarifado. Os itens
// entram na FALTANTES da caixa e seguem o fluxo normal (gerar pedido, etapas, baixa).
export type TipoCaixaDemanda = 'COSTURA' | 'ACABAMENTO';

export const TIPOS_CAIXA_DEMANDA: { id: TipoCaixaDemanda; nome: string }[] = [
  { id: 'COSTURA', nome: 'Costura (preta)' },
  { id: 'ACABAMENTO', nome: 'Acabamento (azul)' }
];

const NOME_CURTO: Record<TipoCaixaDemanda, string> = { COSTURA: 'Costura', ACABAMENTO: 'Acabamento' };

export interface LinhaDemanda { nome: string; cor: string; qtd: string; un: string }
export interface ItemDemanda { nome: string; cor: string; qtd: number; un: string }

export const linhaVazia = (): LinhaDemanda => ({ nome: '', cor: '', qtd: '', un: '' });

// A caixa da demanda pela OS e pelo tipo, com as mesmas mensagens do servidor (n8n/src/pedidos.js).
export function caixaDaDemanda(board: Board, os: string, tipo: TipoCaixaDemanda): { caixa: Caixa } | { erro: string } {
  const alvo = os.trim();
  const rotulo = `OS ${alvo} (${NOME_CURTO[tipo]})`;
  const doTipo = board.caixas.filter((c) => c.os.trim() === alvo && c.tipo === tipo);
  if (doTipo.length === 0) return { erro: `Caixa da ${rotulo} não encontrada.` };
  const sairam = doTipo.filter((c) => c.saiu);
  if (sairam.length === 0) return { erro: `A caixa da ${rotulo} ainda não saiu.` };
  if (new Set(sairam.map((c) => c.dealId)).size > 1) return { erro: `Mais de uma caixa da ${rotulo} saiu. Fale com o PCP.` };
  if (!caixaEditavelNoApp(board, sairam[0])) return { erro: MSG_SOMENTE_LEITURA };
  return { caixa: sairam[0] };
}

export interface ValidacaoDemanda { erros: Record<number, string>; itens: ItemDemanda[] }

// Cada linha: nome, quantidade maior que zero e unidade obrigatórios; cor opcional. Linha toda
// vazia é ignorada. Mesmas mensagens do servidor.
export function validarDemanda(linhas: LinhaDemanda[]): ValidacaoDemanda {
  const erros: Record<number, string> = {};
  const itens: ItemDemanda[] = [];
  linhas.forEach((l, k) => {
    const nome = l.nome.trim();
    const cor = l.cor.trim();
    const un = l.un.trim();
    if (!nome && !cor && !un && !l.qtd.trim()) return;
    const q = lerQuantidade(l.qtd);
    if (!nome) erros[k] = 'Informe o nome do item.';
    else if (q === null || arredondar3(q) <= 0) erros[k] = 'Informe uma quantidade maior que zero';
    else if (!un) erros[k] = 'Informe a unidade do item.';
    else itens.push({ nome, cor, qtd: arredondar3(q), un });
  });
  return { erros, itens };
}

export function acaoNovaDemanda(os: string, tipo: TipoCaixaDemanda, itens: ItemDemanda[]): Acao {
  return { tipo: 'nova_demanda', os: os.trim(), caixa: tipo, itens };
}
```

`web/src/regras/acoes.ts`:
- no `mensagemSucesso`, antes do `salvar_etapas`, acrescente:

```ts
    case 'nova_demanda': {
      const n = acao.itens.length;
      return `Demanda pós-saída criada · ${n} ${n === 1 ? 'item' : 'itens'} na OS ${acao.os}`;
    }
```

- no `chaveDaAcao`, antes de `return \`caixa:${acao.dealId}\`;`, acrescente `if (acao.tipo === 'nova_demanda') return \`demanda:${acao.os}:${acao.caixa}\`;`.

`web/src/regras/otimista.ts`: no primeiro `switch` (antes do `salvar_etapas`), acrescente:

```ts
    case 'nova_demanda': {
      // Itens novos na caixa que saiu, com id provisório: ficam fora de Faltas sem pedido
      // (editavel false) até a recarga trazer o id gravado.
      const c = board.caixas.find((x) => x.saiu && x.os === acao.os && x.tipo === acao.caixa);
      if (!c) return board;
      const novos: Item[] = acao.itens.map((x, k) => ({
        id: `${PREFIXO_NOVO}${ctx.n}.${k}`, nome: x.nome, cor: x.cor, un: x.un, necessaria: null, separada: null,
        falta: x.qtd, faltaG: null, status: 'ABERTO', baixada: 0, resta: x.qtd, restaG: null, obsAlmox: '', obsPcp: '',
        previsao: '', resolvidoEm: '', versao: '', editavel: false, pedidoId: '', pedidoIds: [], posSaida: true
      }));
      return comCaixa(board, c.dealId, (y) => ({ ...y, itens: [...y.itens, ...novos] }));
    }
```

`web/src/regras/colunas.ts`, no fim:

```ts
// No Ploomes não mostra a demanda pós-saída: a caixa fica como estava antes dela.
export function semPosSaida(c: Caixa): Caixa {
  return c.itens.some((i) => i.posSaida) ? { ...c, itens: c.itens.filter((i) => !i.posSaida) } : c;
}
```

`web/src/regras/saidas.ts`: troque `saiuComFalta` por:

```ts
// Caixa que aparece em Saídas: saiu com falta, ou saiu e ganhou demanda pós-saída.
export function saiuComFalta(c: Caixa): boolean {
  return c.saiu && (c.saiuComFalta || c.itens.some((i) => i.posSaida));
}
```

Run: `cd web && npm test`
Expected: PASS.

- [ ] **Step 3: Componentes e telas**

Crie `web/src/componentes/pedidos/JanelaNovaDemanda.tsx`:

```tsx
import { useId, useState } from 'react';
import type { Board } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import {
  acaoNovaDemanda, caixaDaDemanda, linhaVazia, TIPOS_CAIXA_DEMANDA, validarDemanda, type LinhaDemanda, type TipoCaixaDemanda
} from '../../regras/demanda';
import { Janela } from '../Janela';

interface Props {
  board: Board;
  executar: Executar;
  onFechar: () => void;
}

// Nova demanda pós-saída: falta descoberta depois que a caixa saiu. Os itens entram em Faltas
// sem pedido com o selo pós-saída e seguem o fluxo normal. A janela fecha na hora; se o servidor
// recusar, o aviso mostra a mensagem dele.
export function JanelaNovaDemanda({ board, executar, onFechar }: Props) {
  const id = useId();
  const [os, setOs] = useState('');
  const [tipo, setTipo] = useState<TipoCaixaDemanda | ''>('');
  const [linhas, setLinhas] = useState<LinhaDemanda[]>(() => [linhaVazia()]);
  const [tentou, setTentou] = useState(false);
  const v = validarDemanda(linhas);
  const achada = os.trim() && tipo ? caixaDaDemanda(board, os, tipo) : null;
  const erroCaixa = achada && 'erro' in achada ? achada.erro : null;
  const temErroItem = Object.keys(v.erros).length > 0;
  const falta = !os.trim() ? 'Informe a OS.'
    : !tipo ? 'Escolha o tipo de caixa.'
      : v.itens.length === 0 && !temErroItem ? 'Informe ao menos um item.' : null;
  const erroGeral = falta ?? erroCaixa;
  const mudar = (k: number, m: Partial<LinhaDemanda>) => setLinhas((ls) => ls.map((l, i) => (i === k ? { ...l, ...m } : l)));

  function criar() {
    setTentou(true);
    if (erroGeral || temErroItem || !tipo) return;
    const acao = acaoNovaDemanda(os, tipo, v.itens);
    void executar(acao, mensagemSucesso(acao));
    onFechar();
  }

  return (
    <Janela titulo="Nova demanda" sobretitulo="Falta depois da saída" larga onFechar={onFechar}
      rodape={<>
        {tentou && erroGeral
          ? <span className="janela__nota janela__nota--erro">{erroGeral}</span>
          : <span className="janela__nota">Os itens entram em Faltas sem pedido com o selo pós-saída e ficam registrados no Ploomes da OS.</span>}
        <button type="button" className="botao botao--leve" onClick={onFechar}>Cancelar</button>
        <button type="button" className="botao botao--signal" onClick={criar}>Criar demanda</button>
      </>}>
      <div className="campos">
        <div className="campo">
          <label htmlFor={`${id}-os`}>OS<span className="obrigatorio" aria-hidden="true"> *</span></label>
          <input id={`${id}-os`} type="text" inputMode="numeric" autoComplete="off" maxLength={20} value={os} onChange={(e) => setOs(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-tipo`}>Tipo de caixa<span className="obrigatorio" aria-hidden="true"> *</span></label>
          <select id={`${id}-tipo`} value={tipo} required onChange={(e) => setTipo(e.target.value as TipoCaixaDemanda)}>
            {tipo === '' && <option value="" disabled>Selecionar</option>}
            {TIPOS_CAIXA_DEMANDA.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
      </div>
      {achada && 'caixa' in achada && <p className="janela__ajuda">{[achada.caixa.peca, achada.caixa.cliente].filter(Boolean).join(' · ')}</p>}
      {erroCaixa && <p className="campo__erro" role="alert">{erroCaixa}</p>}
      <ul className="demanda__itens">
        {linhas.map((l, k) => {
          const base = `${id}-${k}`;
          const n = k + 1;
          const erro = tentou ? v.erros[k] : undefined;
          return (
            <li key={k} className="demanda__item">
              <div className="campo">
                <label htmlFor={`${base}-nome`}>Item {n}<span className="obrigatorio" aria-hidden="true"> *</span></label>
                <input id={`${base}-nome`} type="text" maxLength={100} value={l.nome} aria-invalid={erro ? true : undefined}
                  onChange={(e) => mudar(k, { nome: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor={`${base}-cor`}>Cor do item {n} (opcional)</label>
                <input id={`${base}-cor`} type="text" maxLength={40} value={l.cor} onChange={(e) => mudar(k, { cor: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor={`${base}-qtd`}>Quantidade do item {n}<span className="obrigatorio" aria-hidden="true"> *</span></label>
                <input id={`${base}-qtd`} type="text" inputMode="decimal" autoComplete="off" value={l.qtd}
                  onChange={(e) => mudar(k, { qtd: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor={`${base}-un`}>Unidade do item {n}<span className="obrigatorio" aria-hidden="true"> *</span></label>
                <input id={`${base}-un`} type="text" maxLength={10} placeholder="UN, MT, cones" value={l.un}
                  onChange={(e) => mudar(k, { un: e.target.value })} />
              </div>
              {linhas.length > 1 && (
                <button type="button" className="botao botao--leve" aria-label={`Remover item ${n}`}
                  onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== k))}>Remover</button>
              )}
              {erro && <p className="campo__erro demanda__erro">{erro}</p>}
            </li>
          );
        })}
      </ul>
      <button type="button" className="botao botao--contorno" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>+ Adicionar item</button>
    </Janela>
  );
}
```

`web/src/styles/f3.css`, no fim:

```css
/* Nova demanda pós-saída */
.selo-pos { flex: none; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: var(--erro-bg); color: var(--erro-text); font-size: 11px; font-weight: 700; }
.demanda__itens { list-style: none; margin: 14px 0 10px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.demanda__item { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 8px; align-items: end; }
.demanda__erro { grid-column: 1 / -1; margin: 0; }
@media (max-width: 720px) { .demanda__item { grid-template-columns: 1fr 1fr; } }
```

`web/src/componentes/pedidos/AcoesPedidos.tsx`: acrescente `onNovaDemanda: () => void;` às `Props`, receba-o na função e, antes do botão "Gerar pedido", acrescente:

```tsx
      <button type="button" className="botao botao--contorno" onClick={onNovaDemanda}
        title="Falta descoberta depois que a caixa saiu do almoxarifado">
        Nova demanda
      </button>
```

`web/src/componentes/pedidos/FaltasSemPedido.tsx`: troque o `<span className="grupo__nome">…</span>` do item por:

```tsx
                        <span className="grupo__nome">
                          {i.nome}{i.cor && <span className="card__item-cor"> {i.cor}</span>}
                          {i.posSaida && <span className="selo-pos" title="Falta registrada depois que a caixa saiu">pós-saída</span>}
                        </span>
```

`web/src/telas/Pedidos.tsx`: troque `export type JanelaPedidos = 'gerar' | 'etapas' | null;` por `export type JanelaPedidos = 'gerar' | 'etapas' | 'demanda' | null;`, importe `import { JanelaNovaDemanda } from '../componentes/pedidos/JanelaNovaDemanda';` e, depois da linha da `JanelaEtapas`, acrescente:

```tsx
      {janela === 'demanda' && <JanelaNovaDemanda board={board} executar={executar} onFechar={fecharJanela} />}
```

`web/src/App.tsx`: no `<AcoesPedidos ...>`, acrescente `onNovaDemanda={() => setJanela('demanda')}`.

`web/src/telas/NoPloomes.tsx`: importe `useMemo` e `semPosSaida` (de `../regras/colunas`), e troque as duas linhas de `visiveis`/`sel` por:

```tsx
  // A demanda pós-saída não entra no No Ploomes: a caixa fica como estava antes dela.
  const caixas = useMemo(() => board.caixas.map(semPosSaida), [board.caixas]);
  const visiveis = caixas.filter((c) => visivelNoQuadro(c, hoje) && caixaAtendeBusca(c, q));
  const sel = caixas.find((c) => c.id === selId) ?? null;
```

- [ ] **Step 4: Build e Vitest**

Run: `cd web && npm test && npm run build`
Expected: PASS e build sem erro.

- [ ] **Step 5: Simulado**

Em `web/scripts/mock-api.mjs`:
- no helper `item(...)`, acrescente `posSaida: false, ` antes de `...extra`;
- depois de `const ENVIO_PLOOMES_MS = ...`, acrescente `let seqDemanda = 0;`;
- antes de `function processar(`, acrescente:

```js
// Nova demanda pós-saída, como o servidor: caixa que saiu, achada pela OS e pelo tipo.
function novaDemanda(c, usuario) {
  const os = String(c.os ?? '').trim();
  if (!os) throw bad('Informe a OS.');
  if (c.caixa !== 'COSTURA' && c.caixa !== 'ACABAMENTO') throw bad('Escolha o tipo de caixa.');
  if (!Array.isArray(c.itens) || c.itens.length === 0) throw bad('Informe ao menos um item.');
  const rotulo = `OS ${os} (${c.caixa === 'COSTURA' ? 'Costura' : 'Acabamento'})`;
  const doTipo = estado.caixas.filter((x) => x.os === os && x.tipo === c.caixa);
  if (!doTipo.length) throw new Erro(404, `Caixa da ${rotulo} não encontrada.`);
  const cx = doTipo.find((x) => x.saiu);
  if (!cx) throw new Erro(409, `A caixa da ${rotulo} ainda não saiu.`);
  exigirEditavel([cx.dealId]);
  const novos = c.itens.map((i) => {
    const nome = String(i?.nome ?? '').trim();
    const un = String(i?.un ?? '').trim();
    const cor = String(i?.cor ?? '').trim();
    if (!nome) throw bad('Informe o nome do item.');
    if (!num(i.qtd) || i.qtd <= 0) throw bad('Informe uma quantidade maior que zero');
    if (!un) throw bad('Informe a unidade do item.');
    return { nome, un, cor, qtd: i.qtd };
  });
  for (const n of novos) cx.itens.push(item(`${cx.dealId}|POS_SAIDA|${++seqDemanda}`, n.nome, n.un, n.qtd, { cor: n.cor, posSaida: true }));
  const historicos = [];
  registrar(cx.dealId, usuario, `${usuario} criou demanda pós-saída: ${novos.map((n) => `${fmtNum(n.qtd)} ${n.un} de ${n.nome}${n.cor ? ` ${n.cor}` : ''}`).join('; ')}`, historicos);
  return resposta(agoraIso(), historicos);
}
```

- no `processar`, acrescente `case 'nova_demanda': return novaDemanda(corpo, usuario);`;
- no comentário do topo, acrescente: `// Nova demanda: OS 90006 (Acabamento) ou 90003 (Costura) já saíram; 90001 (Acabamento) ainda não saiu (409).`

- [ ] **Step 6: e2e**

No fim de `web/e2e/f3.spec.ts`, acrescente:

```ts
test('Nova demanda: cria itens pós-saída na caixa que saiu; aparecem em Faltas sem pedido e em Saídas', async ({ page }) => {
  const mock = await preparar(page, '#pedidos', {
    resposta: (corpo) => corpo.tipo === 'nova_demanda' ? { status: 200, json: { ok: true, versao: 'v2', historico: null, historicos: [] } } : undefined,
    aoAgir: (b) => {
      const c = b.caixas[2];
      c.itens.push({ ...c.itens[0], id: '700003|POS_SAIDA|u1', nome: 'BOTÃO 12MM', cor: 'azul', un: 'UN', falta: 2, resta: 2, posSaida: true } as never);
    }
  });
  await page.getByRole('button', { name: 'Nova demanda' }).click();
  const janela = page.getByRole('dialog', { name: 'Nova demanda' });
  await janela.getByLabel('OS', { exact: true }).fill('90001');
  await janela.getByLabel('Tipo de caixa').selectOption('ACABAMENTO');
  await expect(janela.getByRole('alert')).toHaveText('A caixa da OS 90001 (Acabamento) ainda não saiu.');
  await janela.getByLabel('OS', { exact: true }).fill('90003');
  await janela.getByLabel('Tipo de caixa').selectOption('COSTURA');
  await expect(janela.getByRole('alert')).toHaveCount(0);
  await janela.getByLabel('Item 1', { exact: true }).fill('BOTÃO 12MM');
  await janela.getByLabel('Cor do item 1 (opcional)').fill('azul');
  await janela.getByLabel('Quantidade do item 1').fill('2');
  await janela.getByLabel('Unidade do item 1').fill('UN');
  await janela.getByRole('button', { name: 'Criar demanda' }).click();
  await expect(janela).toHaveCount(0);
  await expect(aviso(page, 'Demanda pós-saída criada · 1 item na OS 90003')).toBeVisible();
  expect(mock.bodies).toEqual([{ tipo: 'nova_demanda', os: '90003', caixa: 'COSTURA', itens: [{ nome: 'BOTÃO 12MM', cor: 'azul', qtd: 2, un: 'UN' }] }]);
  const faltas = page.getByRole('complementary', { name: 'Faltas sem pedido' });
  await expect(faltas.getByRole('checkbox', { name: /BOTÃO 12MM/ })).toBeVisible();
  await expect(faltas.locator('.selo-pos')).toHaveText('pós-saída');
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Saídas com falta' }).click();
  await expect(page.getByRole('region', { name: 'Sem pedido' }).getByRole('button', { name: 'OS 90003' })).toContainText('BOTÃO 12MM');
});

test('Nova demanda: sem item não envia e mostra o motivo', async ({ page }) => {
  const mock = await preparar(page, '#pedidos');
  await page.getByRole('button', { name: 'Nova demanda' }).click();
  const janela = page.getByRole('dialog', { name: 'Nova demanda' });
  await janela.getByLabel('OS', { exact: true }).fill('90003');
  await janela.getByLabel('Tipo de caixa').selectOption('COSTURA');
  await janela.getByRole('button', { name: 'Criar demanda' }).click();
  await expect(janela).toContainText('Informe ao menos um item.');
  expect(mock.bodies).toHaveLength(0);
});

test('No Ploomes não mostra a demanda pós-saída; Saídas mostra a caixa que saiu sem falta', async ({ page }) => {
  await preparar(page, '', {
    ajustar: (b) => {
      const c = b.caixas[2] as Corpo & { itens: Corpo[] };
      c.saiuComFalta = false;
      c.itens = [{ ...c.itens[0], id: '700003|POS_SAIDA|u1', nome: 'BOTÃO 12MM', posSaida: true }];
    }
  });
  const card = page.getByRole('region', { name: 'Saiu sem faltas' }).getByRole('button', { name: 'OS 90003' });
  await expect(card).toBeVisible();
  await expect(card).not.toContainText('BOTÃO 12MM');
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Saídas com falta' }).click();
  await expect(page.getByRole('region', { name: 'Sem pedido' }).getByRole('button', { name: 'OS 90003' })).toContainText('BOTÃO 12MM');
});
```

- [ ] **Step 7: Rodar tudo do web**

Run: `cd web && npm test && npm run build && CI=1 npx playwright test`
Expected: tudo PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src web/scripts/mock-api.mjs web/e2e
git commit -m "$(cat <<'EOF'
feat(web): Nova demanda pós-saída em Solicitações de faltas

Janela com OS, tipo de caixa e itens (nome, cor opcional, quantidade, unidade), com as
mesmas recusas do servidor. Os itens ganham o selo pós-saída em Faltas sem pedido, põem a
caixa em Saídas (Sem pedido) e ficam fora do No Ploomes. Otimista e simulado seguem.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Documentação do deploy, migração da planilha e verificação final

**Files:**
- Modify: `n8n/workflows/README.md` (seção nova no fim)
- Modify: `docs/superpowers/specs/2026-10-09-f3-etapas-saidas-demanda-design.md` (linha "Plano:")

**Interfaces:**
- Consumes: tudo das Tarefas 1–6.
- Produces: passos manuais de produção para o dono (planilha, n8n, site) e o rollback.

- [ ] **Step 1: Escrever a seção do README**

No fim de `n8n/workflows/README.md`, acrescente:

```markdown
## Etapas novas, Saídas divididas e demanda pós-saída (09/10/2026)

Desenho: `docs/superpowers/specs/2026-10-09-f3-etapas-saidas-demanda-design.md`. Plano: `docs/superpowers/plans/2026-10-09-f3-etapas-saidas-demanda.md`.

O que muda no servidor: a **penúltima** etapa (pela ordem) dá a baixa e a **última** finaliza o pedido (`concluido_em`); pedido com baixa só vai para a última; `editar_pedido` não muda etapa; `dividir_pedido` só da antepenúltima ("Aguardando entrega") e a parte vai para a penúltima com a baixa; `salvar_etapas` exige 3 etapas e mantém as duas últimas no fim; saem `enviar_oficina`/`oficina_recebeu`; entra `nova_demanda` (append na FALTANTES).

### 0. Planilha de produção — ANTES de aplicar o SDK (ordem obrigatória)

**Atenção:** o código novo trata a penúltima etapa como a da baixa. Com a ETAPAS_PEDIDO antiga (4 linhas, `entregue` por último), a penúltima seria `aguardando` e mover para "Aguardando entrega" daria baixa. Faça os passos abaixo primeiro.

1. **ETAPAS_PEDIDO**
   - Na linha de id `entregue`: troque `nome` para **Enviado ao destino final**. Não mexa em `id` nem em `ordem` (4).
   - Inclua uma linha nova: `id` = `concluido`, `nome` = **Concluído**, `ordem` = **5**.
   - Se as etapas tiverem sido personalizadas: `entregue` precisa ficar com a **penúltima** ordem e `concluido` com a **maior** (maior ordem existente + 1). Linhas removidas (nome e ordem vazios) continuam ignoradas.
   - Aba vazia: nada a fazer (o padrão do código já tem as 5 etapas).
2. **PEDIDOS**: inclua o cabeçalho `concluido_em` na próxima coluna livre da linha 1 (linhas antigas ficam vazias = não concluídas). Pedidos que estavam em "Resolvido" (com `baixado_em`) passam a aparecer em **Enviado ao destino final**, em aberto: o dono arrasta para Concluído quando o destino confirmar.
3. **FALTANTES**: inclua o cabeçalho `origem` na próxima coluna livre da linha 1. (Se faltar, a primeira demanda cria a coluna sozinha, mas é melhor deixar a posição combinada.) Confira que existe `atualizado_em_app` (F2).
4. **CAIXAS_PCP**: as colunas `tratativa` e `tratativa_em` podem ficar; o código não lê mais.

### 1. Sync Faltantes — nada a mudar (conferido em 09/10/2026)

O "Sync Faltantes - Google Sheets" (`s4mbblVXykIvkA8M`) só fecha órfãs com o mesmo `deal_id` **e** o mesmo `ciclo` (`PEDIDO`/`CORTE`), só reconcilia linhas `PEDIDO` com o corte e grava por `id` com colunas fixas. As linhas da demanda têm `ciclo` = `POS_SAIDA`, `origem` = `POS_SAIDA` e id `<deal>|POS_SAIDA|<uuid>`: o sync não as apaga nem sobrescreve. **Não rode** o "Utilitario - Limpar Planilha Faltantes (manual)": ele apaga a FALTANTES inteira, inclusive as demandas pós-saída (que não voltam pelo sync). Se o sync for alterado no futuro, confira de novo esses três pontos.

### 2. n8n (homolog primeiro)

1. `cd n8n && npm test && npm run build`.
2. Aplique `workflows/pcp-api-homolog.sdk.js` no "PCP MRBL - API (homolog)" e religue a credencial **Google Sheets - MRBL** (`72hvCT9jkADwOOo1`) em Ler USUARIOS, Ler Planilha, Ler Planilha Acao e Gravar Lote. Teste com o site local apontando para os webhooks `-h`, **só na OS de teste** (607479158): mover para Enviado ao destino final (baixa), arrastar para Concluído, dividir em Aguardando entrega, salvar etapas (renomear uma), criar uma Nova demanda na caixa da OS de teste. Confira na planilha: PEDIDOS com `baixado_em`/`concluido_em`, FALTANTES com as linhas `POS_SAIDA` e `origem`, HISTORICO_APP com as linhas novas.
3. Anote o `activeVersionId` do "PCP MRBL - API" (`WpuXpcSa5oGiEkTm`), aplique `workflows/pcp-api.sdk.js` e religue a credencial nos mesmos nodes. Publicar fica com o dono.

### 3. Site

Merge na `main` **depois** do passo 2 (o site novo manda `dividir_pedido` sem etapa e `nova_demanda`, que a API antiga não entende).

### Rollback

- n8n: `restore_workflow_version` para o `activeVersionId` anotado e publish.
- Site: reverta o merge.
- Planilha: volte o nome da linha `entregue` para "Resolvido" e apague a linha `concluido` da ETAPAS_PEDIDO (sem pedidos nela; se houver, mova-os antes para `entregue`). As colunas `concluido_em` e `origem` e as linhas `POS_SAIDA` podem ficar: a API antiga ignora `concluido_em`; as linhas pós-saída aparecem como itens comuns da caixa.
```

- [ ] **Step 2: Ligar o plano na spec**

No `docs/superpowers/specs/2026-10-09-f3-etapas-saidas-demanda-design.md`, depois da primeira linha de "Data:", acrescente a linha `Plano: docs/superpowers/plans/2026-10-09-f3-etapas-saidas-demanda.md.`

- [ ] **Step 3: Verificação final completa**

Run: `cd n8n && npm test && npm run build && git status --short`
Expected: testes PASS; `git status` sem mudanças pendentes em `n8n/build` e `n8n/workflows` (o build já estava commitado).

Run: `cd web && npm test && npm run build && CI=1 npx playwright test`
Expected: tudo PASS.

Run: `grep -rn "enviar_oficina\|oficina_recebeu\|tratativa" n8n/src web/src web/scripts`
Expected: nenhuma ocorrência.

Run: `grep -rn "Resolvido" n8n/src web/src web/scripts | grep -v "ConfirmarResolvido\|confirmacao--resolvido"`
Expected: nenhuma ocorrência (o componente `ConfirmarResolvido` e a classe CSS mantêm o nome; se sobrar algum comentário ou teste falando de "Resolvido" como etapa, troque pelo nome novo e rode os testes de novo).

- [ ] **Step 4: Conferência no simulado com o dono**

Run: `cd web && npm run dev:mock`
Mostre ao dono, no simulado: arrastar até Enviado ao destino final (confirmação e baixa), arrastar até Concluído, o painel sem Etapa, Dividir em Aguardando entrega, Etapas do quadro com as duas últimas fixas, Saídas com a 90004 e a 90005 divididas em partes, Nova demanda na 90006 (Acabamento) com o selo pós-saída e a caixa fora do No Ploomes. Nada vai para produção antes do ok dele.

- [ ] **Step 5: Commit**

```bash
git add n8n/workflows/README.md docs/superpowers/specs/2026-10-09-f3-etapas-saidas-demanda-design.md
git commit -m "$(cat <<'EOF'
docs(f3): deploy das etapas novas, Saídas divididas e demanda pós-saída

Passos manuais da planilha (ETAPAS_PEDIDO entregue/concluido, PEDIDOS.concluido_em,
FALTANTES.origem) antes do SDK, conferência do Sync Faltantes, ordem homolog → produção
→ site e rollback.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review (feito ao escrever)

- **Cobertura da spec:** §1 etapas (Tarefas 1 e 2; confirmação na etapa da baixa; duas últimas fixas; `entregue` renomeada, `concluido` nova; Resolvido e oficina saem nas Tarefas 1 e 4); §2 painel sem Etapa (Tarefa 2), Dividir só em Aguardando entrega direto para a baixa com confirmação (Tarefas 1 e 3), Dividir por previsão igual; §3 Saídas (Tarefa 4: colunas, partes "1 de 2", Concluído com 30 dias); §4 Nova demanda (Tarefa 5 servidor + conferência do Sync; Tarefa 6 janela, selo, Saídas, fora do No Ploomes, histórico no Ploomes pelo envio normal, só DEALS_EDITAVEIS); deploy e migração da planilha (Tarefa 7).
- **Nomes consistentes:** `etapaDaBaixa`/`etapaFinal`/`etapaDeDividir` (servidor e site), `pedidoBaixado`/`pedidoConcluido` (servidor), `motivoMoverPedido`, `pedidoArrastavel`/`pedidoEditavel`, `podeDividir`, `textoConfirmarBaixa`, `entraNaEtapaDaBaixa`, `partesDaSaida`/`saidasNaTela`/`chaveDaSaida`/`rotuloDaSaida`/`textoPedidosDaParte`, `saiuComFalta`, `semPosSaida`, `caixaDaDemanda`/`validarDemanda`/`acaoNovaDemanda`; mensagens iguais no servidor, no site e no simulado.
