# F5a · Visão da peça — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** uma tela com tudo de uma OS (Ploomes lido na hora, caixas e faltas, pedidos, produção, WhatsApp e uma linha do tempo única), aberta pela guia **Visão das peças**, pelo endereço `#peca/<OS>` ou pelo link **"Ver visão da peça"** dos painéis, com a única escrita **Anotar no histórico**.

**Arquitetura:** endpoint novo `GET pcp-peca` (homolog `pcp-peca-h`) no workflow da API: Code nodes com a lógica pura de `n8n/src/peca.js` (ES5) montam as URLs do Ploomes, quatro HTTP Request (Header Auth) leem cards, registros, trocas de etapa e etapas do funil, e a resposta fica 60 s no static data. O front cruza essa resposta com o board que já tem (caixas, pedidos, produção, mensagens, histórico) pela OS, em regras puras de `web/src/regras/peca.ts`. A ação nova `anotar_peca` em `pcp-acao` grava só uma linha `ANOTACAO` no HISTORICO_APP (vai ao registro compilado do Ploomes como as outras) e o board passa a trazer `anotacoes` e `id`/`acao` no histórico.

**Tecnologias:** n8n (Code nodes ES5 gerados de `n8n/src` + `n8n/adaptadores`, HTTP Request 4.2), API pública do Ploomes (OData), Vite + React 19 + TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-f5a-visao-da-peca-design.md` (fonte da verdade do escopo).

> **Fatos confirmados no Ploomes real em 27/10 (valem por cima do que o plano supõe abaixo):**
> - Campo OS (`deal_C06992BA-FF1E-47A8-9330-5242026E691E`) é **`StringValue`**: `Deals?$filter=OtherProperties/any(op: op/FieldKey eq '…' and op/StringValue eq '123456')` acha o card 607612577. Não use `IntegerValue` nem `or` no filtro.
> - Etapas do funil: `GET Deals@Stages?$filter=PipelineId eq <id>` devolve `Id, Name, PipelineId, LastPipelineStage, Ordination` (Ordination 0-based). Use esse caminho (não `/DealsStages`).
> - `GET /Deals(<id>)` dá **404** em `public-api2`; para um card, use `Deals?$filter=Id eq <id>`.
> - `DealsStagesHistory`: cada linha é a passagem por uma etapa: `StageId` = etapa de origem, `NewStageId` = destino (`null` na etapa atual), **`CreateDate` = entrada na etapa de origem e `UpdateDate` = hora da troca**. O evento "mudou de X para Y" usa **`UpdateDate`** (no card 607612577: Corte → Costura em 19/10 16:11, que é o `UpdateDate`). Linha com `NewStageId` nulo não vira evento de troca. `Undone: true` = troca desfeita (mostrar com "desfeita").

## Restrições globais

- Fale e escreva em pt-BR (commits, comentários, textos da interface). Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Repositório público: testes, fixtures e simulador só com dados fictícios (OS 9000x, deals 6000x/7000x/7100x, "CLIENTE FICTICIO"). Os ids reais que aparecem são só os dos cards de teste listados no `AGENTS.md` (OS 123456 / deal 607612577 na homologação).
- `n8n/src` e `n8n/adaptadores`: JavaScript ES5 puro (`var`, `function`, sem arrow, sem template string, sem `const`/`let`, sem import/export).
- Depois de mexer em `n8n/src`, `n8n/adaptadores` ou `n8n/scripts`: `cd n8n && npm test && npm run build` e commitar `n8n/build/`, `n8n/workflows/*.sdk.js` e `n8n/workflows/json/*.json` junto.
- Planilha: nunca ordenar nem apagar linhas; a anotação é só um append no HISTORICO_APP (INSERT_ROWS). Nenhuma aba ou coluna nova.
- Ploomes: base `https://public-api2.ploomes.com/`, credencial `httpHeaderAuth` id `QfXOyNly69oAqwH2` ("Header Auth account"). Campo OS `deal_C06992BA-FF1E-47A8-9330-5242026E691E` (`CAMPO_OS_PRODUCAO`), referência `CAMPO_REFERENCIA`, descrição da peça `CAMPO_DESCRICAO_PECA` (todos em `n8n/src/producao.js`). Funis: `FUNIL_PRODUCAO = 60015827`, `FUNIL_PCP = 60011710` (`n8n/src/previsao.js`).
- Registros do Ploomes cujo conteúdo começa com `[PCP · OS` **não** viram evento *Ploomes* (o app já mostra os seus com "enviado ao Ploomes").
- Cache da resposta: **60 s** por busca, no static data do workflow. Limites: **5 cards** e **200 eventos** do Ploomes por OS (os mais recentes).
- Erro do Ploomes → **502** `Não foi possível ler o Ploomes agora.`; nada achado → **404** `Nenhuma OS encontrada no Ploomes.`.
- Ação `anotar_peca`: `{ tipo: 'anotar_peca', os, dealId, texto }`; texto obrigatório, até **500** caracteres, sem linha em branco; grava `acao: 'ANOTACAO'`; allowlist `DEALS_EDITAVEIS ∪ DEALS_PRODUCAO_EDITAVEIS` até o go-live (lista vazia = todos); fora dela: **403** `Edição liberada em breve para esta OS.`.
- Link do HUB: `https://rslconsultoria.github.io/hub-pecas-catalogo/#<referência>` (constante do front, só quando houver referência). Card no Ploomes: `https://app10.ploomes.com/deal/<id>`.
- Endereço da tela: `#peca/<OS>` (ou `#peca/<referência>`; com uma OS só, a tela troca para `#peca/<OS>`).
- Aba **E-mails do PCP** vazia, com o texto `Chega na próxima parte da F5.`.
- A URL do `pcp-peca` sai da `VITE_API_BOARD` trocando `pcp-board` por `pcp-peca` (mantém o `-h` do homolog). **Nenhuma variável nova** no GitHub.
- Não mexer em cards reais do Ploomes. A edição só vale nos cards de teste até o go-live.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `n8n/src/peca.js` (novo) | regras puras: busca, URLs do Ploomes, cards, eventos, trilha, cache, resposta, validação e processamento da anotação, `anotacoesDoBoard` |
| `n8n/test/carregar.js` | `'peca.js'` em `ARQUIVOS`, logo antes de `'api.js'` |
| `n8n/src/api.js` | `anotar_peca` em `preValidarAcao`/`processarAcao`, allowlist da anotação, `anotacoes` no board |
| `n8n/src/montarCaixas.js` | `historicoDoDeal` devolve `id` e `acao` quando existem |
| `n8n/adaptadores/validar-peca.js`, `preparar-leituras-peca.js`, `montar-peca.js` (novos) | cola dos Code nodes do ramo Peça |
| `n8n/scripts/gerar-code-nodes.js`, `n8n/scripts/gerar-workflow-sdk.js` | registro dos adaptadores e nós novos do ramo Peça (produção e homolog) |
| `n8n/test/peca.test.js`, `peca-resposta.test.js`, `anotar-peca.test.js`, `workflow-peca.test.js` (novos) | testes do n8n |
| `n8n/test/workflow-acao.test.js` | lista de HTTP da planilha ignora os nós do Ploomes da Peça; teste das escritas da anotação |
| `web/src/api/tipos.ts`, `web/src/api/client.ts` | contrato do `pcp-peca`, `anotar_peca`, `anotacoes`, `buscarPeca`, `urlPeca` |
| `web/src/hooks/filaAcoes.ts`, `web/src/regras/acoes.ts`, `web/src/regras/otimista.ts` | anotação otimista |
| `web/src/regras/peca.ts` (novo) | `linhaDoTempo`, `resumoSituacao`, `cardPrincipal`, `fonteDaAcao`, `dealDaAnotacao`, `podeAnotar`, `erroAnotacao`, URLs |
| `web/src/regras/telas.ts`, `web/src/App.tsx`, `web/src/componentes/Navbar.tsx` | guia e endereço `#peca/<q>` |
| `web/src/componentes/ConversaWhatsapp.tsx` (novo) | conversa extraída do painel da produção, reaproveitada na Peça |
| `web/src/componentes/LinkPeca.tsx` (novo) | link "Ver visão da peça" |
| `web/src/telas/Peca.tsx` (novo), `web/src/styles/f5.css` (novo), `web/src/main.tsx` | tela |
| `web/src/telas/Producao.tsx`, `web/src/componentes/PainelCaixa.tsx`, `web/src/componentes/painel/CabecalhoCaixa.tsx`, `web/src/componentes/pedidos/PainelPedido.tsx` | links nos painéis e conversa extraída |
| `web/scripts/mock-api.mjs` | `pcp-peca` e `anotar_peca` no simulador |
| `web/e2e/f5a-peca.spec.ts` (novo), `web/e2e/mock-servidor.spec.ts` | e2e |
| `n8n/workflows/README.md` | roteiro de publicação e teste na homologação |

---

### Tarefa 1: Busca no Ploomes (lógica pura n8n)

**Arquivos:**
- Criar: `n8n/src/peca.js`
- Modificar: `n8n/test/carregar.js` (ARQUIVOS)
- Teste: `n8n/test/peca.test.js`

**Interfaces (produz):**
- Constantes: `PECA_PLOOMES`, `PECA_URL_CARD`, `PECA_CACHE_MS = 60000`, `PECA_MAX_CACHE = 50`, `PECA_MAX_CARDS = 5`, `PECA_MAX_EVENTOS = 200`, `PECA_MAX_CARDS_BUSCA = 50`, `PECA_PREFIXO_APP = '[PCP · OS'`, `PECA_ERRO_PLOOMES`, `PECA_ERRO_NADA`, `PECA_ERRO_BUSCA`, `PECA_CAMINHO_REGISTROS = 'InteractionRecords'`, `PECA_CAMINHO_TROCAS = 'DealsStagesHistory'`, `PECA_CAMINHO_ETAPAS = 'DealsStages'`.
- `normalizarBuscaPeca(q)` → `{ ok: true, q, chave, numerica }` ou `{ ok: false, status: 400, erro }` (`chave` = `semAcento(q)`, usada no cache e na comparação da referência).
- `urlCardsPeca(busca)` → string (GET `Deals`).
- `cardPecaDoDeal(deal)` → `{ dealId, funilId, funil, etapaId, etapa, etapaOrdem: null, titulo, cliente, peca, referencia, os, atualizadoEm, link }`.
- `respostaPloomesPecaOk(resposta)` → boolean (status 2xx e `body.value` lista).
- `ordenarCardsPeca(cards)` → cópia, mais recente primeiro (`atualizadoEm`).
- `resolverCardsPeca(busca, resposta)` → `{ ok: true, os, cards }` | `{ ok: true, os: '', cards: [], candidatos: [{ os, peca, etapa, funil, dealId }] }` | `{ ok: false, status, erro }`.
- `urlsDetalhesPeca(cards)` → `{ registros, trocas, etapas }` (strings).

- [ ] **Passo 1: escrever os testes que falham** (`n8n/test/peca.test.js`)

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const CAMPO_OS = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
const CAMPO_REF = 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D';
const CAMPO_PECA = 'deal_B53149A5-FDAB-49C4-85E6-46CC6FB3F0B7';

function deal(id, os, ref, extra) {
  return Object.assign({
    Id: id, Title: 'CARD ' + id, ContactName: 'CLIENTE FICTICIO', PipelineId: 60015827, StageId: 60105, StatusId: 1,
    LastUpdateDate: '2026-10-27T10:00:00-03:00', CreateDate: '2026-10-01T10:00:00-03:00',
    Stage: { Id: 60105, Name: '17. Costura' },
    OtherProperties: [
      { FieldKey: CAMPO_OS, StringValue: os },
      { FieldKey: CAMPO_REF, StringValue: ref },
      { FieldKey: CAMPO_PECA, StringValue: 'CAMISA TESTE' }
    ]
  }, extra || {});
}
const ok = (value) => ({ statusCode: 200, body: { value } });

test('busca: OS numérica, referência e entrada inválida', () => {
  assert.deepEqual(limpo(ctx.normalizarBuscaPeca(' 123456 ')), { ok: true, q: '123456', chave: '123456', numerica: true });
  assert.deepEqual(limpo(ctx.normalizarBuscaPeca('ref-01  a')), { ok: true, q: 'ref-01 a', chave: 'REF-01 A', numerica: false });
  for (const ruim of ['', '   ', "x' or 1 eq 1", 'a'.repeat(61), null, undefined]) {
    assert.deepEqual(limpo(ctx.normalizarBuscaPeca(ruim)), { ok: false, status: 400, erro: 'Informe a OS ou a referência.' });
  }
});

test('URL dos cards: OS em texto ou número, ou referência; só os campos lidos', () => {
  const crua = ctx.urlCardsPeca(ctx.normalizarBuscaPeca('123456'));
  assert.ok(!/ /.test(crua), 'sem espaço cru na URL');
  const url = decodeURIComponent(crua);
  assert.ok(url.startsWith('https://public-api2.ploomes.com/Deals?$filter='), url);
  assert.ok(url.includes("(OtherProperties/any(o: o/FieldKey eq '" + CAMPO_OS + "' and (o/StringValue eq '123456' or o/IntegerValue eq 123456))) or (OtherProperties/any(o: o/FieldKey eq '" + CAMPO_REF + "' and o/StringValue eq '123456'))"), url);
  assert.ok(url.includes("$expand=OtherProperties($filter=FieldKey eq '" + CAMPO_OS + "' or FieldKey eq '" + CAMPO_REF + "' or FieldKey eq '" + CAMPO_PECA + "'),Stage($select=Id,Name)"), url);
  assert.ok(url.includes('$select=Id,Title,ContactName,PipelineId,StageId,StatusId,LastUpdateDate,CreateDate'), url);
  assert.ok(url.includes('$orderby=LastUpdateDate desc') && url.endsWith('$top=50'), url);
  const ref = decodeURIComponent(ctx.urlCardsPeca(ctx.normalizarBuscaPeca('REF 01/A')));
  assert.ok(!ref.includes(CAMPO_OS + "' and"), ref);
  assert.ok(ref.includes("$filter=OtherProperties/any(o: o/FieldKey eq '" + CAMPO_REF + "' and o/StringValue eq 'REF 01/A')&"), ref);
});

test('card normalizado; OS em IntegerValue também vale', () => {
  assert.deepEqual(limpo(ctx.cardPecaDoDeal(deal(607600001, '123456', 'REF-01'))), {
    dealId: '607600001', funilId: 60015827, funil: 'Produção', etapaId: 60105, etapa: '17. Costura', etapaOrdem: null,
    titulo: 'CARD 607600001', cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-01', os: '123456',
    atualizadoEm: '2026-10-27T10:00:00-03:00', link: 'https://app10.ploomes.com/deal/607600001'
  });
  const inteiro = deal(2, '', '', { PipelineId: 60011710, OtherProperties: [{ FieldKey: CAMPO_OS, IntegerValue: 123456 }] });
  const c = limpo(ctx.cardPecaDoDeal(inteiro));
  assert.equal(c.os, '123456');
  assert.equal(c.funil, 'PCP');
  assert.equal(c.peca, 'CARD 2');
  assert.equal(limpo(ctx.cardPecaDoDeal(deal(3, '1', '', { PipelineId: 1 }))).funil, 'Funil 1');
});

test('resolução por OS: até 5 cards, os mais recentes; outra OS fica de fora', () => {
  const busca = ctx.normalizarBuscaPeca('123456');
  const deals = [1, 2, 3, 4, 5, 6].map((n) => deal(607600000 + n, '123456', 'REF-01', { LastUpdateDate: '2026-10-2' + n + 'T10:00:00-03:00' }));
  deals.push(deal(607699999, '999', 'REF-01', { LastUpdateDate: '2026-10-29T10:00:00-03:00' }));
  const r = limpo(ctx.resolverCardsPeca(busca, ok(deals)));
  assert.equal(r.ok, true);
  assert.equal(r.os, '123456');
  assert.equal(r.candidatos, undefined);
  assert.deepEqual(r.cards.map((c) => c.dealId), ['607600006', '607600005', '607600004', '607600003', '607600002']);
});

test('referência: uma linha por OS; número que não é OS cai na referência; nada; Ploomes fora', () => {
  const r = limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('ref-01'), ok([
    deal(1, '111', 'REF-01'),
    deal(2, '222', 'REF-01', { PipelineId: 60011710, Stage: { Id: 7, Name: 'Concluído' } }),
    deal(3, '111', 'REF-01'),
    deal(4, '', 'REF-01'),
    deal(5, '333', 'OUTRA')
  ])));
  assert.deepEqual(r, { ok: true, os: '', cards: [], candidatos: [
    { os: '111', peca: 'CAMISA TESTE', etapa: '17. Costura', funil: 'Produção', dealId: '1' },
    { os: '222', peca: 'CAMISA TESTE', etapa: 'Concluído', funil: 'PCP', dealId: '2' }
  ] });
  const numero = limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('2024'), ok([deal(9, '555', '2024')])));
  assert.deepEqual(numero.candidatos.map((c) => c.os), ['555']);
  assert.deepEqual(limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('nada'), ok([]))), { ok: false, status: 404, erro: 'Nenhuma OS encontrada no Ploomes.' });
  for (const ruim of [{ statusCode: 500, body: {} }, { error: { message: 'timeout' } }, null, { statusCode: 200, body: {} }]) {
    assert.deepEqual(limpo(ctx.resolverCardsPeca(ctx.normalizarBuscaPeca('123456'), ruim)), { ok: false, status: 502, erro: 'Não foi possível ler o Ploomes agora.' });
  }
});

test('URLs de registros, trocas e etapas dos cards da OS', () => {
  const cards = [{ dealId: '607612577', funilId: 60015827 }, { dealId: '607600001', funilId: 60011710 }, { dealId: '607600002', funilId: 60015827 }];
  const u = limpo(ctx.urlsDetalhesPeca(cards));
  Object.keys(u).forEach((k) => assert.ok(!/ /.test(u[k]), k));
  const d = (x) => decodeURIComponent(x);
  assert.equal(d(u.registros), 'https://public-api2.ploomes.com/InteractionRecords?$filter=(DealId eq 607612577 or DealId eq 607600001 or DealId eq 607600002)&$expand=Creator($select=Name)&$select=Id,DealId,Date,CreateDate,Content,TypeId&$orderby=Date desc&$top=200');
  assert.equal(d(u.trocas), 'https://public-api2.ploomes.com/DealsStagesHistory?$filter=(DealId eq 607612577 or DealId eq 607600001 or DealId eq 607600002)&$select=Id,DealId,StageId,NewStageId,CreateDate,CreatorId,Undone,Days&$orderby=CreateDate desc&$top=200');
  assert.equal(d(u.etapas), 'https://public-api2.ploomes.com/DealsStages?$filter=(PipelineId eq 60015827 or PipelineId eq 60011710)&$select=Id,Name,Ordination,PipelineId&$top=300');
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd n8n && node --test test/peca.test.js`
Expected: FAIL (`ctx.normalizarBuscaPeca is not a function`).

- [ ] **Passo 3: implementar** — em `n8n/test/carregar.js`, trocar a linha `ARQUIVOS` por:

```js
const ARQUIVOS = ['util.js', 'auth.js', 'montarCaixas.js', 'acoes.js', 'pedidos.js', 'previsao.js', 'producao.js', 'whatsapp.js', 'associador.js', 'envioPloomes.js', 'planilhaLote.js', 'peca.js', 'api.js'];
```

e criar `n8n/src/peca.js`:

```js
// ===== src/peca.js =====
// F5a · Visão da peça (27/10): leitura do Ploomes na hora para o dossiê da OS
// (cards em qualquer funil, registros de interação e trocas de etapa), cache
// de 60 s e a ação "anotar_peca". Funções puras; o workflow faz as chamadas HTTP.
// Depende de util.js, previsao.js (funis) e producao.js (campos do Ploomes).

var PECA_PLOOMES = 'https://public-api2.ploomes.com/';
var PECA_URL_CARD = 'https://app10.ploomes.com/deal/';
var PECA_CACHE_MS = 60 * 1000;
var PECA_MAX_CACHE = 50;
var PECA_MAX_CARDS = 5;
var PECA_MAX_EVENTOS = 200;
var PECA_MAX_CARDS_BUSCA = 50;
var PECA_PREFIXO_APP = '[PCP · OS';
var PECA_ERRO_PLOOMES = 'Não foi possível ler o Ploomes agora.';
var PECA_ERRO_NADA = 'Nenhuma OS encontrada no Ploomes.';
var PECA_ERRO_BUSCA = 'Informe a OS ou a referência.';
// Caminhos da API do Ploomes (campos conferidos em 27/10 no card de teste 607612577).
var PECA_CAMINHO_REGISTROS = 'InteractionRecords';
var PECA_CAMINHO_TROCAS = 'DealsStagesHistory';
var PECA_CAMINHO_ETAPAS = 'DealsStages';

function nomeFunilPeca(id) {
  var n = numeroOuNulo(id);
  if (n === FUNIL_PRODUCAO) return 'Produção';
  if (n === FUNIL_PCP) return 'PCP';
  return 'Funil ' + texto(id);
}

// OS (só dígitos) ou referência: letras, números, espaço, ponto, traço, barra e sublinhado.
function normalizarBuscaPeca(q) {
  var v = texto(q).replace(/\s+/g, ' ');
  if (!v || v.length > 60 || !/^[0-9A-Za-zÀ-ÿ ._\/-]+$/.test(v)) return { ok: false, status: 400, erro: PECA_ERRO_BUSCA };
  return { ok: true, q: v, chave: semAcento(v), numerica: /^\d+$/.test(v) };
}

function literalODataPeca(v) {
  return "'" + encodeURIComponent(texto(v).split("'").join("''")) + "'";
}

// Partes "$param=valor" unidas por &; os espaços do OData viram %20.
function urlODataPeca(caminho, partes) {
  return PECA_PLOOMES + caminho + '?' + partes.join('&').split(' ').join('%20');
}

// Cards por OS (campo OS em texto ou número) ou por referência. Busca numérica
// tenta os dois de uma vez; resolverCardsPeca dá preferência à OS.
function urlCardsPeca(busca) {
  var ref = "OtherProperties/any(o: o/FieldKey eq '" + CAMPO_REFERENCIA + "' and o/StringValue eq " + literalODataPeca(busca.q) + ')';
  var filtro = ref;
  if (busca.numerica) {
    var os = "OtherProperties/any(o: o/FieldKey eq '" + CAMPO_OS_PRODUCAO + "' and (o/StringValue eq " + literalODataPeca(busca.q) +
      ' or o/IntegerValue eq ' + Number(busca.q) + '))';
    filtro = '(' + os + ') or (' + ref + ')';
  }
  var campos = [CAMPO_OS_PRODUCAO, CAMPO_REFERENCIA, CAMPO_DESCRICAO_PECA].map(function (c) {
    return "FieldKey eq '" + c + "'";
  }).join(' or ');
  return urlODataPeca('Deals', [
    '$filter=' + filtro,
    '$expand=OtherProperties($filter=' + campos + '),Stage($select=Id,Name)',
    '$select=Id,Title,ContactName,PipelineId,StageId,StatusId,LastUpdateDate,CreateDate',
    '$orderby=LastUpdateDate desc',
    '$top=' + PECA_MAX_CARDS_BUSCA
  ]);
}

function cardPecaDoDeal(deal) {
  deal = deal || {};
  var dealId = texto(deal.Id);
  return {
    dealId: dealId,
    funilId: numeroOuNulo(deal.PipelineId),
    funil: nomeFunilPeca(deal.PipelineId),
    etapaId: numeroOuNulo(deal.StageId),
    etapa: texto(deal.Stage && deal.Stage.Name),
    etapaOrdem: null,
    titulo: texto(deal.Title),
    cliente: texto(deal.ContactName),
    peca: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_DESCRICAO_PECA))) || texto(deal.Title),
    referencia: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_REFERENCIA))),
    os: texto(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_OS_PRODUCAO))),
    atualizadoEm: texto(deal.LastUpdateDate) || texto(deal.CreateDate),
    link: PECA_URL_CARD + dealId
  };
}

function respostaPloomesPecaOk(resposta) {
  var st = Number(resposta && resposta.statusCode);
  return st >= 200 && st < 300 && !!resposta.body && Array.isArray(resposta.body.value);
}

function msPeca(v) {
  var t = Date.parse(texto(v));
  return isNaN(t) ? 0 : t;
}

function ordenarCardsPeca(cards) {
  return (cards || []).slice().sort(function (a, b) { return msPeca(b.atualizadoEm) - msPeca(a.atualizadoEm); });
}

function resolverCardsPeca(busca, resposta) {
  if (!respostaPloomesPecaOk(resposta)) return { ok: false, status: 502, erro: PECA_ERRO_PLOOMES };
  var cards = ordenarCardsPeca(resposta.body.value.map(cardPecaDoDeal).filter(function (c) { return !!c.dealId; }));
  var daOs = busca.numerica ? cards.filter(function (c) { return c.os === busca.q; }) : [];
  if (daOs.length) return { ok: true, os: busca.q, cards: daOs.slice(0, PECA_MAX_CARDS) };
  var porOs = {};
  var ordem = [];
  cards.forEach(function (c) {
    if (!c.os || semAcento(c.referencia) !== busca.chave || porOs[c.os]) return;
    porOs[c.os] = c;
    ordem.push(c.os);
  });
  if (!ordem.length) return { ok: false, status: 404, erro: PECA_ERRO_NADA };
  return {
    ok: true, os: '', cards: [],
    candidatos: ordem.map(function (os) {
      var c = porOs[os];
      return { os: os, peca: c.peca, etapa: c.etapa, funil: c.funil, dealId: c.dealId };
    })
  };
}

function urlsDetalhesPeca(cards) {
  var deals = '(' + cards.map(function (c) { return 'DealId eq ' + Number(c.dealId); }).join(' or ') + ')';
  var funis = [];
  cards.forEach(function (c) {
    var f = c.funilId === null || c.funilId === undefined ? FUNIL_PRODUCAO : c.funilId;
    if (funis.indexOf(f) < 0) funis.push(f);
  });
  return {
    registros: urlODataPeca(PECA_CAMINHO_REGISTROS, ['$filter=' + deals, '$expand=Creator($select=Name)',
      '$select=Id,DealId,Date,CreateDate,Content,TypeId', '$orderby=Date desc', '$top=' + PECA_MAX_EVENTOS]),
    trocas: urlODataPeca(PECA_CAMINHO_TROCAS, ['$filter=' + deals,
      '$select=Id,DealId,StageId,NewStageId,CreateDate,CreatorId,Undone,Days', '$orderby=CreateDate desc', '$top=' + PECA_MAX_EVENTOS]),
    etapas: urlODataPeca(PECA_CAMINHO_ETAPAS, ['$filter=(' + funis.map(function (f) { return 'PipelineId eq ' + f; }).join(' or ') + ')',
      '$select=Id,Name,Ordination,PipelineId', '$top=300'])
  };
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `cd n8n && node --test test/peca.test.js && npm test`
Expected: PASS (todos os testes do n8n).

- [ ] **Passo 5: build e commit**

```bash
cd n8n && npm run build && cd ..
git add n8n/src/peca.js n8n/test/carregar.js n8n/test/peca.test.js n8n/build n8n/workflows
git commit -m "feat: busca da Visão da peça no Ploomes (lógica pura)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Eventos, trilha, cache e resposta do `pcp-peca` (lógica pura n8n)

**Arquivos:**
- Modificar: `n8n/src/peca.js` (acrescentar no fim)
- Teste: `n8n/test/peca-resposta.test.js`

**Interfaces:**
- Consome (Tarefa 1): `normalizarBuscaPeca`, `urlCardsPeca`, `resolverCardsPeca`, `urlsDetalhesPeca`, `respostaPloomesPecaOk`, `ordenarCardsPeca`, `msPeca`; de `api.js`: `sessaoDoCabecalho(estado, cabecalho, agora)`.
- Produz:
  - `cardPrincipalPeca(cards)` → card | `null` (Produção > PCP > mais recente).
  - `etapasPorIdPeca(etapas)` → `{ [id]: { id, nome, ordem, funilId } }`.
  - `eventosPloomesPeca(registros, trocas, etapas, cards)` → `[{ quando, fonte: 'PLOOMES'|'ETAPA', texto, autor, dealId, desfeita? }]` (desc, empate Etapa antes de Ploomes, até 200).
  - `trilhaPeca(cards, etapas)` → `{ funil, dealId, etapas: [{ id, nome, ordem }], atualId }` | `null`.
  - `pecaDoCache(estado, chave, agora)`, `guardarPecaNoCache(estado, chave, corpo, agora)`.
  - `validarPedidoPeca(estado, cabecalho, query, agora)` → `{ pronto: true, status, body }` | `{ pronto: false, busca, url }`.
  - `prepararLeiturasPeca(busca, respostaCards, agora, estado)` → `{ pronto: true, status, body }` | `{ pronto: false, busca, os, cards, urls }`.
  - `finalizarPeca(leituras, respostas, agora, estado)` → `{ status, body }`; `respostas = { registros, trocas, etapas }` (cada uma a saída do HTTP Request com `fullResponse`).
  - Corpo 200: `{ geradoEm, os, cards, trilha, eventos }` ou `{ geradoEm, os: '', candidatos, cards: [], trilha: null, eventos: [] }`.

- [ ] **Passo 1: escrever os testes que falham** (`n8n/test/peca-resposta.test.js`)

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const T0 = Date.parse('2026-10-27T12:00:00.000Z');
const TOKEN = 'a'.repeat(64);
const CAB = 'Bearer ' + TOKEN;
const novaSessao = () => ({ sessoes: { [TOKEN]: { email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'PCP', expira: T0 + 3600e3 } }, tentativas: {} });
const ok = (value) => ({ statusCode: 200, body: { value } });
const CAMPO_OS = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';

const etapas = [
  { Id: 60104, Name: '16. 1ª Peça', Ordination: 5, PipelineId: 60015827 },
  { Id: 60105, Name: '17. Costura', Ordination: 6, PipelineId: 60015827 },
  { Id: 60103, Name: '15. Preparação 1', Ordination: 4, PipelineId: 60015827 },
  { Id: 60200, Name: 'Concluído', Ordination: 9, PipelineId: 60011710 }
];
const card = (o) => Object.assign({ dealId: '607612577', funilId: 60015827, funil: 'Produção', etapaId: 60105, etapa: '17. Costura', etapaOrdem: null,
  titulo: 'CARD', cliente: 'CLIENTE FICTICIO', peca: 'CAMISA TESTE', referencia: 'REF-01', os: '123456', atualizadoEm: '2026-10-26T10:00:00-03:00',
  link: 'https://app10.ploomes.com/deal/607612577' }, o);
const cards = [card({}), card({ dealId: '607600001', funilId: 60011710, funil: 'PCP', etapaId: 60200, etapa: 'Concluído', atualizadoEm: '2026-10-27T10:00:00-03:00' })];
const registros = [
  { Id: 1, DealId: 607612577, Date: '2026-10-20T10:00:00-03:00', Content: 'Cliente pediu ajuste na gola.', Creator: { Name: 'Pessoa Comercial' } },
  { Id: 2, DealId: 607612577, Date: '2026-10-21T10:00:00-03:00', Content: '[PCP · OS 123456] Atualizações do app PCP\n• 10:00 x', Creator: { Name: 'Integração' } },
  { Id: 3, DealId: 607612577, Date: '2026-10-22T10:00:00-03:00', Content: '   ', Creator: null }
];
const trocas = [
  { Id: 10, DealId: 607612577, StageId: 60104, NewStageId: 60105, CreateDate: '2026-10-20T10:00:00-03:00', Undone: false },
  { Id: 11, DealId: 607612577, StageId: 60103, NewStageId: 60104, CreateDate: '2026-10-18T10:00:00-03:00', Undone: true },
  { Id: 12, DealId: 607612577, StageId: 60105, NewStageId: null, CreateDate: '2026-10-20T10:00:00-03:00' }
];

test('card principal: Produção, senão PCP, senão o mais recente', () => {
  assert.equal(ctx.cardPrincipalPeca(cards).dealId, '607612577');
  assert.equal(ctx.cardPrincipalPeca([cards[1], card({ dealId: '9', funilId: 1, atualizadoEm: '2026-10-28T10:00:00-03:00' })]).dealId, '607600001');
  assert.equal(ctx.cardPrincipalPeca([card({ dealId: '8', funilId: 1, atualizadoEm: '2026-10-01T10:00:00-03:00' }), card({ dealId: '9', funilId: 2 })]).dealId, '9');
  assert.equal(ctx.cardPrincipalPeca([]), null);
});

test('eventos: sem os registros do app, trocas com nomes e "desfeita", mais novo primeiro, empate Etapa antes de Ploomes', () => {
  assert.deepEqual(limpo(ctx.eventosPloomesPeca(registros, trocas, etapas, cards)), [
    { quando: '2026-10-20T10:00:00-03:00', fonte: 'ETAPA', texto: 'Produção: 16. 1ª Peça → 17. Costura', autor: '', dealId: '607612577' },
    { quando: '2026-10-20T10:00:00-03:00', fonte: 'PLOOMES', texto: 'Cliente pediu ajuste na gola.', autor: 'Pessoa Comercial', dealId: '607612577' },
    { quando: '2026-10-18T10:00:00-03:00', fonte: 'ETAPA', texto: 'Produção: 15. Preparação 1 → 16. 1ª Peça', autor: '', dealId: '607612577', desfeita: true }
  ]);
  const sem = limpo(ctx.eventosPloomesPeca([], [{ DealId: 5, StageId: 1, NewStageId: 2, CreateDate: '2026-10-01T00:00:00Z' }], [], []));
  assert.equal(sem[0].texto, 'Etapa 1 → Etapa 2');
});

test('eventos: no máximo 200, os mais recentes', () => {
  const muitos = [];
  for (let i = 0; i < 250; i++) muitos.push({ DealId: 1, Date: new Date(T0 - i * 60000).toISOString(), Content: 'r' + i });
  const ev = limpo(ctx.eventosPloomesPeca(muitos, [], [], []));
  assert.equal(ev.length, 200);
  assert.equal(ev[0].texto, 'r0');
  assert.equal(ev[199].texto, 'r199');
});

test('trilha: etapas do funil do card principal em ordem, com a atual', () => {
  assert.deepEqual(limpo(ctx.trilhaPeca(cards, etapas)), {
    funil: 'Produção', dealId: '607612577', atualId: '60105',
    etapas: [{ id: '60103', nome: '15. Preparação 1', ordem: 4 }, { id: '60104', nome: '16. 1ª Peça', ordem: 5 }, { id: '60105', nome: '17. Costura', ordem: 6 }]
  });
  assert.equal(ctx.trilhaPeca([], etapas), null);
});

test('validar: sem sessão 401, busca ruim 400, senão a URL dos cards', () => {
  const estado = novaSessao();
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, 'Bearer x', { q: '123456' }, T0)), { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } });
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, CAB, {}, T0)), { pronto: true, status: 400, body: { erro: 'Informe a OS ou a referência.' } });
  const v = limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0));
  assert.equal(v.pronto, false);
  assert.deepEqual(v.busca, { ok: true, q: '123456', chave: '123456', numerica: true });
  assert.equal(v.url, ctx.urlCardsPeca(v.busca));
});

test('fluxo completo: cards → detalhes → resposta, cache de 60 s, erro do Ploomes fora do cache', () => {
  const estado = novaSessao();
  const v = limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0));
  const deal = { Id: 607612577, Title: 'CARD', ContactName: 'CLIENTE FICTICIO', PipelineId: 60015827, StageId: 60105,
    LastUpdateDate: '2026-10-26T10:00:00-03:00', Stage: { Id: 60105, Name: '17. Costura' }, OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: '123456' }] };
  const l = limpo(ctx.prepararLeiturasPeca(v.busca, ok([deal]), T0, estado));
  assert.equal(l.pronto, false);
  assert.equal(l.os, '123456');
  assert.deepEqual(l.cards.map((c) => c.dealId), ['607612577']);
  assert.deepEqual(Object.keys(l.urls).sort(), ['etapas', 'registros', 'trocas']);
  const erro = limpo(ctx.finalizarPeca(l, { registros: { statusCode: 429, body: {} }, trocas: ok([]), etapas: ok([]) }, T0, estado));
  assert.deepEqual(erro, { status: 502, body: { erro: 'Não foi possível ler o Ploomes agora.' } });
  assert.equal(limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0)).pronto, false, 'erro não vai ao cache');
  const m = limpo(ctx.finalizarPeca(l, { registros: ok(registros), trocas: ok(trocas), etapas: ok(etapas) }, T0, estado));
  assert.equal(m.status, 200);
  assert.equal(m.body.geradoEm, '2026-10-27T12:00:00.000Z');
  assert.equal(m.body.os, '123456');
  assert.equal(m.body.cards[0].etapaOrdem, 6);
  assert.equal(m.body.trilha.atualId, '60105');
  assert.equal(m.body.eventos.length, 3);
  assert.equal(m.body.candidatos, undefined);
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, CAB, { q: ' 123456 ' }, T0 + 59999)), { pronto: true, status: 200, body: m.body });
  assert.equal(limpo(ctx.validarPedidoPeca(estado, CAB, { q: '123456' }, T0 + 60000)).pronto, false);
});

test('referência com várias OS: resposta pronta com a lista (e no cache); nada: 404 fora do cache', () => {
  const estado = novaSessao();
  const busca = ctx.normalizarBuscaPeca('ref-01');
  const d = (id, os) => ({ Id: id, PipelineId: 60015827, Stage: { Name: '17. Costura' }, LastUpdateDate: '2026-10-26T10:00:00-03:00',
    OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: os }, { FieldKey: 'deal_BDA9B977-176D-48FD-9F4D-6E8869D8286D', StringValue: 'REF-01' }] });
  const r = limpo(ctx.prepararLeiturasPeca(busca, ok([d(1, '111'), d(2, '222')]), T0, estado));
  assert.equal(r.pronto, true);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.candidatos.map((c) => c.os), ['111', '222']);
  assert.deepEqual([r.body.os, r.body.cards, r.body.trilha, r.body.eventos], ['', [], null, []]);
  assert.deepEqual(limpo(ctx.validarPedidoPeca(estado, CAB, { q: 'REF-01' }, T0 + 1000)).body, r.body);
  const nada = limpo(ctx.prepararLeiturasPeca(ctx.normalizarBuscaPeca('XYZ'), ok([]), T0, estado));
  assert.deepEqual(nada, { pronto: true, status: 404, body: { erro: 'Nenhuma OS encontrada no Ploomes.' } });
  assert.equal(limpo(ctx.validarPedidoPeca(estado, CAB, { q: 'XYZ' }, T0)).pronto, false);
});

test('cache guarda no máximo 50 buscas e descarta as vencidas', () => {
  const estado = {};
  for (let i = 0; i < 60; i++) ctx.guardarPecaNoCache(estado, 'K' + i, { i }, T0 + i);
  assert.equal(Object.keys(estado.pecas).length, 50);
  assert.equal(ctx.pecaDoCache(estado, 'K0', T0 + 100), null);
  assert.deepEqual(limpo(ctx.pecaDoCache(estado, 'K59', T0 + 100)), { i: 59 });
  ctx.guardarPecaNoCache(estado, 'NOVA', { x: 1 }, T0 + 70000);
  assert.deepEqual(Object.keys(estado.pecas), ['NOVA']);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd n8n && node --test test/peca-resposta.test.js`
Expected: FAIL (`ctx.cardPrincipalPeca is not a function`).

- [ ] **Passo 3: implementar** — acrescentar no fim de `n8n/src/peca.js`:

```js
// Produção > PCP > o mais recente. É o card da trilha e o padrão da anotação no front.
function cardPrincipalPeca(cards) {
  var lista = ordenarCardsPeca(cards);
  return lista.filter(function (c) { return c.funilId === FUNIL_PRODUCAO; })[0] ||
    lista.filter(function (c) { return c.funilId === FUNIL_PCP; })[0] || lista[0] || null;
}

function etapasPorIdPeca(etapas) {
  var mapa = {};
  (etapas || []).forEach(function (e) {
    if (!e || texto(e.Id) === '') return;
    mapa[texto(e.Id)] = { id: texto(e.Id), nome: texto(e.Name), ordem: numeroOuNulo(e.Ordination), funilId: numeroOuNulo(e.PipelineId) };
  });
  return mapa;
}

var ORDEM_FONTE_PECA = { ETAPA: 0, PLOOMES: 1 };

function ordemFontePeca(fonte) {
  return ORDEM_FONTE_PECA[fonte] === undefined ? 2 : ORDEM_FONTE_PECA[fonte];
}

// Registros de interação (menos os criados pelo envio do app, que começam com
// "[PCP · OS") e trocas de etapa (a linha da etapa atual, sem NewStageId, fica
// de fora: a trilha mostra a atual). Mais novo primeiro; empate: Etapa, Ploomes.
function eventosPloomesPeca(registros, trocas, etapas, cards) {
  var porId = etapasPorIdPeca(etapas);
  var funilDoDeal = {};
  (cards || []).forEach(function (c) { funilDoDeal[texto(c.dealId)] = c.funil; });
  var nomeEtapa = function (id) { return porId[texto(id)] ? porId[texto(id)].nome : 'Etapa ' + texto(id); };
  var eventos = [];
  (registros || []).forEach(function (r) {
    var conteudo = texto(r && r.Content);
    if (!conteudo || conteudo.indexOf(PECA_PREFIXO_APP) === 0) return;
    eventos.push({
      quando: texto(r.Date) || texto(r.CreateDate), fonte: 'PLOOMES', texto: conteudo.slice(0, 2000),
      autor: texto(r.Creator && r.Creator.Name), dealId: texto(r.DealId)
    });
  });
  (trocas || []).forEach(function (t) {
    if (!t || texto(t.NewStageId) === '') return;
    var funil = funilDoDeal[texto(t.DealId)];
    var e = {
      quando: texto(t.CreateDate), fonte: 'ETAPA',
      texto: (funil ? funil + ': ' : '') + nomeEtapa(t.StageId) + ' → ' + nomeEtapa(t.NewStageId),
      autor: '', dealId: texto(t.DealId)
    };
    if (t.Undone === true) e.desfeita = true;
    eventos.push(e);
  });
  return eventos.sort(function (a, b) {
    return (msPeca(b.quando) - msPeca(a.quando)) || (ordemFontePeca(a.fonte) - ordemFontePeca(b.fonte));
  }).slice(0, PECA_MAX_EVENTOS);
}

function trilhaPeca(cards, etapas) {
  var p = cardPrincipalPeca(cards);
  if (!p) return null;
  var porId = etapasPorIdPeca(etapas);
  var lista = Object.keys(porId).map(function (k) { return porId[k]; }).filter(function (e) {
    return e.funilId === p.funilId;
  }).sort(function (a, b) {
    return (a.ordem === null ? 9999 : a.ordem) - (b.ordem === null ? 9999 : b.ordem);
  }).map(function (e) { return { id: e.id, nome: e.nome, ordem: e.ordem }; });
  return { funil: p.funil, dealId: p.dealId, etapas: lista, atualId: p.etapaId === null ? '' : String(p.etapaId) };
}

function pecaDoCache(estado, chave, agora) {
  var c = estado && estado.pecas ? estado.pecas[chave] : null;
  return c && agora - c.guardadoEm < PECA_CACHE_MS ? c.corpo : null;
}

function guardarPecaNoCache(estado, chave, corpo, agora) {
  if (!estado.pecas) estado.pecas = Object.create(null);
  Object.keys(estado.pecas).forEach(function (k) {
    if (agora - estado.pecas[k].guardadoEm >= PECA_CACHE_MS) delete estado.pecas[k];
  });
  var chaves = Object.keys(estado.pecas).sort(function (a, b) { return estado.pecas[a].guardadoEm - estado.pecas[b].guardadoEm; });
  while (chaves.length >= PECA_MAX_CACHE) delete estado.pecas[chaves.shift()];
  estado.pecas[chave] = { corpo: corpo, guardadoEm: agora };
}

// GET /pcp-peca?q=: sessão como o board; busca do cache (60 s) ou a URL dos cards.
function validarPedidoPeca(estado, cabecalho, query, agora) {
  if (!sessaoDoCabecalho(estado, cabecalho, agora)) return { pronto: true, status: 401, body: { erro: 'Sessão expirada.' } };
  var busca = normalizarBuscaPeca(query && query.q);
  if (!busca.ok) return { pronto: true, status: 400, body: { erro: busca.erro } };
  var cache = pecaDoCache(estado, busca.chave, agora);
  if (cache) return { pronto: true, status: 200, body: cache };
  return { pronto: false, busca: busca, url: urlCardsPeca(busca) };
}

function prepararLeiturasPeca(busca, respostaCards, agora, estado) {
  var r = resolverCardsPeca(busca, respostaCards);
  if (!r.ok) return { pronto: true, status: r.status, body: { erro: r.erro } };
  if (r.candidatos) {
    var corpo = { geradoEm: new Date(agora).toISOString(), os: '', candidatos: r.candidatos, cards: [], trilha: null, eventos: [] };
    guardarPecaNoCache(estado, busca.chave, corpo, agora);
    return { pronto: true, status: 200, body: corpo };
  }
  return { pronto: false, busca: busca, os: r.os, cards: r.cards, urls: urlsDetalhesPeca(r.cards) };
}

function finalizarPeca(leituras, respostas, agora, estado) {
  respostas = respostas || {};
  if (!respostaPloomesPecaOk(respostas.registros) || !respostaPloomesPecaOk(respostas.trocas) || !respostaPloomesPecaOk(respostas.etapas)) {
    return { status: 502, body: { erro: PECA_ERRO_PLOOMES } };
  }
  var etapas = respostas.etapas.body.value;
  var porId = etapasPorIdPeca(etapas);
  var cards = (leituras.cards || []).map(function (c) {
    var e = porId[texto(c.etapaId)];
    var x = Object.assign({}, c);
    x.etapaOrdem = e ? e.ordem : null;
    if (!x.etapa && e) x.etapa = e.nome;
    return x;
  });
  var corpo = {
    geradoEm: new Date(agora).toISOString(), os: leituras.os, cards: cards, trilha: trilhaPeca(cards, etapas),
    eventos: eventosPloomesPeca(respostas.registros.body.value, respostas.trocas.body.value, etapas, cards)
  };
  guardarPecaNoCache(estado, leituras.busca.chave, corpo, agora);
  return { status: 200, body: corpo };
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `cd n8n && node --test test/peca-resposta.test.js && npm test`
Expected: PASS.

- [ ] **Passo 5: build e commit**

```bash
cd n8n && npm run build && cd ..
git add n8n/src/peca.js n8n/test/peca-resposta.test.js n8n/build n8n/workflows
git commit -m "feat: eventos, trilha e cache da Visão da peça

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Ação `anotar_peca` e histórico no board

**Arquivos:**
- Modificar: `n8n/src/peca.js` (fim), `n8n/src/api.js`, `n8n/src/montarCaixas.js:46-60` (`historicoDoDeal`)
- Teste: `n8n/test/anotar-peca.test.js`, `n8n/test/workflow-acao.test.js`

**Interfaces:**
- Consome: `historicoProducao(ctx, dealId, os, acao, descricao)` (`producao.js`), `erroAcao`, `respostaDeAcao`, `sessaoDoCabecalho`, `DEALS_EDITAVEIS`, `DEALS_PRODUCAO_EDITAVEIS`.
- Produz:
  - `TIPO_ANOTAR_PECA = 'anotar_peca'`, `ACAO_ANOTACAO = 'ANOTACAO'`, `PECA_MAX_ANOTACOES_BOARD = 300`.
  - `validarAnotacaoPeca(corpo)` → `{ ok: true, acao: { os, dealId, texto } }` | `erroAcao(400, ...)`.
  - `processarAnotacaoPeca(acao, ctx)` → `{ ok: true, versao, operacoes: [], historicos: [h], anotacaoId }`.
  - `anotacoesDoBoard(historico)` → `[{ id, quando, usuario, texto, ploomes, dealId, os }]` (desc, até 300).
  - Em `api.js`: `ERRO_PECA_NAO_EDITAVEL`, `dealAnotavel(dealId)`, `validarAcaoAnotacao(corpo)`, `processarAcaoAnotacao(estado, sessao, corpo, agora, gerarId)`; resposta da ação traz `body.anotacaoId`.
  - Board: `corpo.anotacoes`; `historicoDoDeal` devolve `id` e `acao` quando a linha tem.
  - Texto gravado: `<usuario> anotou: "<texto>"`.

- [ ] **Passo 1: escrever os testes que falham** (`n8n/test/anotar-peca.test.js`)

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const T0 = Date.parse('2026-10-27T12:00:00.000Z');
const ISO = '2026-10-27T12:00:00.000Z';
function contexto() {
  const ctx = carregar();
  const estado = {};
  const U = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil: 'PCP', senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-123'), ativo: 'SIM' }];
  const r = ctx.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-123' }, U, T0);
  return { ctx, estado, cab: 'Bearer ' + r.body.token };
}
const corpo = (o) => Object.assign({ tipo: 'anotar_peca', os: '123456', dealId: '607612577', texto: '  Cliente pediu\npara segurar  ' }, o || {});

test('anotar_peca grava só o HISTORICO_APP (ANOTACAO) e devolve o id', () => {
  const { ctx, estado, cab } = contexto();
  assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, corpo(), T0)), { ok: true });
  const r = limpo(ctx.processarAcao(estado, cab, corpo(), {}, T0, () => 'H-1'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, []);
  const texto = 'Pessoa PCP anotou: "Cliente pediu para segurar"';
  assert.deepEqual(r.historicos, [{ id: 'H-1', quando: ISO, usuario: 'Pessoa PCP', email: 'pcp@teste.local', deal_id: '607612577', os: '123456',
    item_id: '', acao: 'ANOTACAO', texto: texto, ploomes_status: 'PENDENTE', ploomes_id: '', tentativas: 0, erro: '' }]);
  assert.deepEqual(r.body, { ok: true, versao: ISO, historico: { quando: ISO, usuario: 'Pessoa PCP', texto: texto, ploomes: 'PENDENTE' }, anotacaoId: 'H-1' });
  assert.equal(r.ploomes, null);
  assert.equal(r.interpretar, null);
  assert.equal(r.gravacao, null);
});

test('anotar_peca: validações (400) e sessão (401)', () => {
  const { ctx, estado, cab } = contexto();
  const casos = [
    [corpo({ texto: '   ' }), 'Escreva a anotação.'],
    [corpo({ texto: 5 }), 'Escreva a anotação.'],
    [corpo({ texto: 'a'.repeat(501) }), 'Anotação com no máximo 500 caracteres.'],
    [corpo({ texto: 'linha 1\n\nlinha 2' }), 'A anotação não pode ter linha em branco.'],
    [corpo({ texto: 'linha 1\r\n  \r\nlinha 2' }), 'A anotação não pode ter linha em branco.'],
    [corpo({ os: '' }), 'Informe a OS.'],
    [corpo({ dealId: 'abc' }), 'Informe o card do Ploomes.']
  ];
  for (const [c, erro] of casos) {
    assert.deepEqual(limpo(ctx.processarAcao(estado, cab, c, {}, T0, () => 'H')), { status: 400, body: { erro } }, erro);
    assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, c, T0)), { ok: false, status: 400, body: { erro } }, erro);
  }
  assert.equal(ctx.processarAcao(estado, 'Bearer x', corpo(), {}, T0, () => 'H').status, 401);
  assert.equal(ctx.processarAcao(estado, cab, corpo({ texto: 'a'.repeat(500) }), {}, T0, () => 'H').status, 200);
});

test('anotar_peca: só nos deals liberados até o go-live (lista vazia = todos)', () => {
  const { ctx, estado, cab } = contexto();
  ctx.DEALS_EDITAVEIS = ['607479158'];
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['607612577'];
  const erro403 = { status: 403, body: { erro: 'Edição liberada em breve para esta OS.' } };
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '607479158' }), {}, T0, () => 'H').status, 200);
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '607612577' }), {}, T0, () => 'H').status, 200);
  assert.deepEqual(limpo(ctx.processarAcao(estado, cab, corpo({ dealId: '600000001' }), {}, T0, () => 'H')), erro403);
  assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, corpo({ dealId: '600000001' }), T0)), Object.assign({ ok: false }, erro403));
  ctx.DEALS_EDITAVEIS = [];
  assert.equal(ctx.processarAcao(estado, cab, corpo({ dealId: '600000001' }), {}, T0, () => 'H').status, 200);
});

test('board: histórico com id e acao quando existem; anotações numa lista própria', () => {
  const { ctx } = contexto();
  const hist = [
    { id: 'H1', deal_id: '600001', os: '90001', acao: 'baixa', quando: '2026-10-27T10:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes_status: 'ENVIADO' },
    { id: 'H2', deal_id: '607612577', os: '90001', acao: 'ANOTACAO', quando: '2026-10-27T11:00:00.000Z', usuario: 'Ana', texto: 'Ana anotou: "x"', ploomes_status: '' },
    { id: 'H3', deal_id: '600001', os: '90001', acao: 'ANOTACAO', quando: '2026-10-27T09:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "y"', ploomes_status: 'ENVIADO' },
    { id: 'H4', deal_id: '600001', os: '', acao: 'ANOTACAO', quando: '2026-10-27T08:00:00.000Z', usuario: 'Bia', texto: 'sem OS', ploomes_status: 'ENVIADO' }
  ];
  assert.deepEqual(limpo(ctx.historicoDoDeal(hist, '600001'))[0],
    { id: 'H1', acao: 'baixa', quando: '2026-10-27T10:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' });
  assert.deepEqual(limpo(ctx.historicoDoDeal([{ deal_id: '1', quando: 'q', usuario: 'A', texto: 't', ploomes_status: 'ENVIADO' }], '1')),
    [{ quando: 'q', usuario: 'A', texto: 't', ploomes: 'ENVIADO' }]);
  const anot = [
    { id: 'H2', quando: '2026-10-27T11:00:00.000Z', usuario: 'Ana', texto: 'Ana anotou: "x"', ploomes: 'PENDENTE', dealId: '607612577', os: '90001' },
    { id: 'H3', quando: '2026-10-27T09:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "y"', ploomes: 'ENVIADO', dealId: '600001', os: '90001' }
  ];
  assert.deepEqual(limpo(ctx.anotacoesDoBoard(hist)), anot);
  assert.deepEqual(limpo(ctx.montarRespostaBoard({}, [], [], T0, { historico: hist })).body.anotacoes, anot);
});
```

Em `n8n/test/workflow-acao.test.js`, logo depois do teste `'F3 gerar_pedido: PEDIDOS, PEDIDOS_ITENS e historico, nessa ordem'`:

```js
test('F5a anotar_peca: um append no HISTORICO_APP e nada mais', () => {
  const { proc, escritas } = acao({ tipo: 'anotar_peca', os: '90001', dealId: '600001', texto: 'Cliente pediu para segurar' });
  assert.equal(proc.status, 200, JSON.stringify(proc.body));
  assert.equal(proc.body.anotacaoId, proc.historicos[0].id);
  assert.deepEqual(escritas.map(alvo), ["'HISTORICO_APP'!A1"]);
  assert.equal(escritas[0].repetir, false);
  const linha = escritas[0].body.values[0];
  assert.equal(linha[CAB_HIST.indexOf('acao')], 'ANOTACAO');
  assert.equal(linha[CAB_HIST.indexOf('texto')], 'Lucca anotou: "Cliente pediu para segurar"');
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd n8n && node --test test/anotar-peca.test.js test/workflow-acao.test.js`
Expected: FAIL (`ctx.anotacoesDoBoard is not a function`; anotar_peca cai em "Tipo de ação inválido.").

- [ ] **Passo 3: implementar**

Acrescentar no fim de `n8n/src/peca.js`:

```js
// ---------- anotação (única escrita da Visão da peça) ----------
var TIPO_ANOTAR_PECA = 'anotar_peca';
var ACAO_ANOTACAO = 'ANOTACAO';
var PECA_MAX_ANOTACOES_BOARD = 300;

function validarAnotacaoPeca(corpo) {
  corpo = corpo || {};
  var os = texto(corpo.os);
  var dealId = texto(corpo.dealId);
  if (!/^[0-9A-Za-z.\/-]{1,20}$/.test(os)) return erroAcao(400, 'Informe a OS.');
  if (!/^\d{1,20}$/.test(dealId)) return erroAcao(400, 'Informe o card do Ploomes.');
  if (typeof corpo.texto !== 'string') return erroAcao(400, 'Escreva a anotação.');
  var bruto = corpo.texto.replace(/\r\n?/g, '\n').trim();
  if (/\n[ \t]*\n/.test(bruto)) return erroAcao(400, 'A anotação não pode ter linha em branco.');
  var t = bruto.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ');
  if (!t) return erroAcao(400, 'Escreva a anotação.');
  if (t.length > 500) return erroAcao(400, 'Anotação com no máximo 500 caracteres.');
  return { ok: true, acao: { os: os, dealId: dealId, texto: t } };
}

// Uma linha no HISTORICO_APP; o Enviar ao Ploomes junta no registro compilado do deal.
function processarAnotacaoPeca(acao, ctx) {
  var h = historicoProducao(ctx, acao.dealId, acao.os, ACAO_ANOTACAO, ctx.usuario + ' anotou: "' + acao.texto + '"');
  return { ok: true, versao: ctx.agora, operacoes: [], historicos: [h], anotacaoId: h.id };
}

// Anotações de qualquer card (o deal da anotação pode não ser caixa nem produção):
// o front cruza pela OS.
function anotacoesDoBoard(historico) {
  return (historico || []).filter(function (h) {
    return h && semAcento(h.acao) === ACAO_ANOTACAO && texto(h.os) !== '';
  }).sort(function (a, b) {
    var x = texto(a.quando);
    var y = texto(b.quando);
    return x < y ? 1 : x > y ? -1 : 0;
  }).slice(0, PECA_MAX_ANOTACOES_BOARD).map(function (h) {
    return {
      id: texto(h.id), quando: texto(h.quando), usuario: texto(h.usuario), texto: texto(h.texto),
      ploomes: texto(h.ploomes_status).toUpperCase() || 'PENDENTE', dealId: texto(h.deal_id), os: texto(h.os)
    };
  });
}
```

Em `n8n/src/montarCaixas.js`, trocar o `.map` de `historicoDoDeal` por:

```js
    .map(function (h) {
      var e = {
        quando: texto(h.quando),
        usuario: texto(h.usuario),
        texto: texto(h.texto),
        ploomes: texto(h.ploomes_status).toUpperCase() || 'PENDENTE'
      };
      // Visão da peça (F5a): id evita evento repetido; acao diz a fonte na linha do tempo.
      if (texto(h.id)) e.id = texto(h.id);
      if (texto(h.acao)) e.acao = texto(h.acao);
      return e;
    });
```

(Confira o fechamento original da função — `});` e `}` — e mantenha-o.)

Em `n8n/src/api.js`:

1. Logo depois de `var ERRO_F3_DESLIGADA = ...;`:

```js
var ERRO_PECA_NAO_EDITAVEL = 'Edição liberada em breve para esta OS.';

// Anotação da Visão da peça: deals das duas allowlists até o go-live (lista vazia = todos).
function dealAnotavel(dealId) {
  if (!DEALS_EDITAVEIS.length || !DEALS_PRODUCAO_EDITAVEIS.length) return true;
  var d = texto(dealId);
  return DEALS_EDITAVEIS.indexOf(d) >= 0 || DEALS_PRODUCAO_EDITAVEIS.indexOf(d) >= 0;
}

function validarAcaoAnotacao(corpo) {
  var v = validarAnotacaoPeca(corpo);
  if (!v.ok) return v;
  if (!dealAnotavel(v.acao.dealId)) return erroAcao(403, ERRO_PECA_NAO_EDITAVEL);
  return v;
}
```

2. Em `montarRespostaBoard`, trocar a linha `previsaoSemHistorico: !temMedias(tabelaMedias(extras.previsaoMedias))` por:

```js
    previsaoSemHistorico: !temMedias(tabelaMedias(extras.previsaoMedias)),
    // Visão da peça (F5a): anotações de qualquer card, cruzadas pela OS no site.
    anotacoes: anotacoesDoBoard(extras.historico)
```

3. Em `preValidarAcao`, entre `if (!sessao) return { ok: false, status: 401, body: { erro: 'Sessão expirada.' } };` e `if (corpo && TIPOS_PEDIDO.indexOf(corpo.tipo) >= 0) {`:

```js
  if (corpo && corpo.tipo === TIPO_ANOTAR_PECA) {
    var vAnot = validarAcaoAnotacao(corpo);
    return vAnot.ok ? { ok: true } : { ok: false, status: vAnot.status, body: { erro: vAnot.erro } };
  }
```

4. Antes de `function processarAcaoProducao(`:

```js
// Visão da peça (F5a): só a linha ANOTACAO no HISTORICO_APP, sem PATCH no Ploomes.
function processarAcaoAnotacao(estado, sessao, corpo, agora, gerarId) {
  var v = validarAcaoAnotacao(corpo);
  if (!v.ok) return { status: v.status, body: { erro: v.erro } };
  var r = processarAnotacaoPeca(v.acao, {
    usuario: sessao.nome, email: sessao.email, agora: new Date(agora).toISOString(), gerarId: gerarId
  });
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos, { anotacaoId: r.anotacaoId });
  saida.ploomes = null;
  saida.interpretar = null;
  saida.gravacao = null;
  saida.historico = null;
  return saida;
}
```

5. Em `processarAcao`, entre `if (!sessao) return { status: 401, body: { erro: 'Sessão expirada.' } };` e `if (corpo && TIPOS_PEDIDO.indexOf(corpo.tipo) >= 0) {`:

```js
  if (corpo && corpo.tipo === TIPO_ANOTAR_PECA) return processarAcaoAnotacao(estado, sessao, corpo, agora, gerarId);
```

- [ ] **Passo 4: rodar e ver passar**

Run: `cd n8n && npm test`
Expected: PASS (inclusive `board-f2` e `board-producao`, que usam linhas sem `id`/`acao`).

- [ ] **Passo 5: build e commit**

```bash
cd n8n && npm run build && cd ..
git add n8n/src n8n/test n8n/build n8n/workflows
git commit -m "feat: ação anotar_peca e anotações no board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Ramo `pcp-peca` no workflow da API (produção e homolog)

**Arquivos:**
- Criar: `n8n/adaptadores/validar-peca.js`, `n8n/adaptadores/preparar-leituras-peca.js`, `n8n/adaptadores/montar-peca.js`
- Modificar: `n8n/scripts/gerar-code-nodes.js` (`NODES`), `n8n/scripts/gerar-workflow-sdk.js` (POS e `gerarApi`), `n8n/test/workflow-acao.test.js` (teste "HTTP da planilha")
- Teste: `n8n/test/workflow-peca.test.js`
- Gerados: `n8n/build/*`, `n8n/workflows/pcp-api*.sdk.js`, `n8n/workflows/json/pcp-api*.json`

**Interfaces:**
- Consome (Tarefa 2): `validarPedidoPeca`, `prepararLeiturasPeca`, `finalizarPeca`.
- Produz nós: `Peça` (webhook GET `pcp-peca` / `pcp-peca-h`) → `Validar Peça` → `Peça Pronta?` → (sim) `Responder Peça`; (não) `Buscar Cards da Peça` → `Preparar Leituras da Peça` → `Peça Pronta (Cards)?` → (sim) `Responder Peça`; (não) `Buscar Registros da Peça` → `Buscar Trocas de Etapa` → `Buscar Etapas do Funil` → `Montar Peça` → `Responder Peça`.

- [ ] **Passo 1: escrever os testes que falham** (`n8n/test/workflow-peca.test.js`)

```js
// Ramo GET pcp-peca do workflow "PCP MRBL - API": estrutura gerada e os Code nodes
// rodando com o $ falso e respostas fictícias do Ploomes.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ARQUIVOS, limpo } = require('./carregar');
const { converter } = require('../scripts/sdk-para-json');

const RAIZ = path.join(__dirname, '..');
const workflow = (arq) => converter(path.join(RAIZ, 'workflows', arq));
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida = 0) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);
const PLOOMES = ['Buscar Cards da Peça', 'Buscar Registros da Peça', 'Buscar Trocas de Etapa', 'Buscar Etapas do Funil'];

function rodarNode(arq, globais) {
  const ctx = vm.createContext(Object.assign({ require }, globais));
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx, { filename: f });
  const adaptador = fs.readFileSync(path.join(RAIZ, 'adaptadores', arq + '.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + adaptador + '\n})()', ctx, { filename: arq + '.js' }));
}
function cifrao(nodes) {
  return (nome) => {
    if (!(nome in nodes)) throw new Error('node inesperado: ' + nome);
    const itens = nodes[nome].map((json) => ({ json }));
    return { first: () => itens[0], all: () => itens };
  };
}
function sessao() {
  const estado = {};
  const ctx = vm.createContext({});
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', f), 'utf8'), ctx);
  const U = [{ email: 'l@x.com', nome: 'Lucca', perfil: 'adm', senha_hash: ctx.gerarHash(crypto, 'senha-forte-123'), ativo: 'SIM' }];
  const r = ctx.processarLogin(crypto, estado, { email: 'l@x.com', senha: 'senha-forte-123' }, U, Date.now());
  return { estado, cab: 'Bearer ' + r.body.token };
}

test('pcp-peca: webhook GET e o caminho até o Responder Peça', () => {
  const w = workflow('pcp-api.sdk.js');
  const gatilho = no(w, 'Peça');
  assert.equal(gatilho.type, 'n8n-nodes-base.webhook');
  assert.equal(gatilho.parameters.httpMethod, 'GET');
  assert.equal(gatilho.parameters.path, 'pcp-peca');
  assert.equal(gatilho.parameters.responseMode, 'responseNode');
  assert.deepEqual(destinos(w, 'Peça'), ['Validar Peça']);
  assert.deepEqual(destinos(w, 'Validar Peça'), ['Peça Pronta?']);
  assert.deepEqual(destinos(w, 'Peça Pronta?', 0), ['Responder Peça']);
  assert.deepEqual(destinos(w, 'Peça Pronta?', 1), ['Buscar Cards da Peça']);
  assert.deepEqual(destinos(w, 'Buscar Cards da Peça'), ['Preparar Leituras da Peça']);
  assert.deepEqual(destinos(w, 'Preparar Leituras da Peça'), ['Peça Pronta (Cards)?']);
  assert.deepEqual(destinos(w, 'Peça Pronta (Cards)?', 0), ['Responder Peça']);
  assert.deepEqual(destinos(w, 'Peça Pronta (Cards)?', 1), ['Buscar Registros da Peça']);
  assert.deepEqual(destinos(w, 'Buscar Registros da Peça'), ['Buscar Trocas de Etapa']);
  assert.deepEqual(destinos(w, 'Buscar Trocas de Etapa'), ['Buscar Etapas do Funil']);
  assert.deepEqual(destinos(w, 'Buscar Etapas do Funil'), ['Montar Peça']);
  assert.deepEqual(destinos(w, 'Montar Peça'), ['Responder Peça']);
});

test('pcp-peca: HTTP do Ploomes com Header Auth, GET, sem retry e sem derrubar o fluxo', () => {
  const w = workflow('pcp-api.sdk.js');
  const urls = {
    'Buscar Cards da Peça': '{{ $json.url }}',
    'Buscar Registros da Peça': '{{ $json.urls.registros }}',
    'Buscar Trocas de Etapa': "{{ $('Preparar Leituras da Peça').first().json.urls.trocas }}",
    'Buscar Etapas do Funil': "{{ $('Preparar Leituras da Peça').first().json.urls.etapas }}"
  };
  for (const nome of PLOOMES) {
    const n = no(w, nome);
    assert.equal(n.type, 'n8n-nodes-base.httpRequest', nome);
    assert.equal(n.parameters.method, 'GET', nome);
    assert.equal(n.parameters.genericAuthType, 'httpHeaderAuth', nome);
    assert.deepEqual(n.credentials, { httpHeaderAuth: { id: 'QfXOyNly69oAqwH2', name: 'Header Auth account' } }, nome);
    assert.equal(n.parameters.url, '=' + urls[nome], nome);
    assert.equal(n.retryOnFail, undefined, nome);
    assert.equal(n.onError, 'continueRegularOutput', nome);
    assert.equal(n.parameters.options.response.response.fullResponse, true, nome);
  }
});

test('homolog: mesmo ramo com pcp-peca-h', () => {
  assert.equal(no(workflow('pcp-api-homolog.sdk.js'), 'Peça').parameters.path, 'pcp-peca-h');
});

test('Code nodes: validar → preparar → montar com Ploomes fictício; a segunda busca vem do cache', () => {
  const s = sessao();
  const estatico = () => s.estado;
  const pedido = { headers: { authorization: s.cab }, query: { q: '123456' } };
  const [v] = rodarNode('validar-peca', { $: cifrao({ 'Peça': [pedido] }), $getWorkflowStaticData: estatico });
  assert.equal(v.json.pronto, false);
  assert.ok(v.json.url.startsWith('https://public-api2.ploomes.com/Deals?'));
  const deal = { Id: 607612577, Title: 'CARD', PipelineId: 60015827, StageId: 60105, LastUpdateDate: '2026-10-26T10:00:00-03:00',
    Stage: { Id: 60105, Name: '17. Costura' }, OtherProperties: [{ FieldKey: 'deal_C06992BA-FF1E-47A8-9330-5242026E691E', StringValue: '123456' }] };
  const [l] = rodarNode('preparar-leituras-peca', {
    $: cifrao({ 'Validar Peça': [v.json] }), $input: { first: () => ({ json: { statusCode: 200, body: { value: [deal] } } }) }, $getWorkflowStaticData: estatico
  });
  assert.equal(l.json.pronto, false);
  const vazio = { statusCode: 200, body: { value: [] } };
  const [m] = rodarNode('montar-peca', {
    $: cifrao({ 'Preparar Leituras da Peça': [l.json], 'Buscar Registros da Peça': [{ statusCode: 200, body: { value: [{ DealId: 607612577, Date: '2026-10-20T10:00:00-03:00', Content: 'Registro do comercial' }] } }],
      'Buscar Trocas de Etapa': [vazio], 'Buscar Etapas do Funil': [{ statusCode: 200, body: { value: [{ Id: 60105, Name: '17. Costura', Ordination: 6, PipelineId: 60015827 }] } }] }),
    $getWorkflowStaticData: estatico
  });
  assert.equal(m.json.status, 200);
  assert.equal(m.json.body.os, '123456');
  assert.deepEqual(m.json.body.eventos.map((e) => e.texto), ['Registro do comercial']);
  const [v2] = rodarNode('validar-peca', { $: cifrao({ 'Peça': [pedido] }), $getWorkflowStaticData: estatico });
  assert.deepEqual(v2.json, { pronto: true, status: 200, body: m.json.body });
});
```

Em `n8n/test/workflow-acao.test.js`, no teste `'pcp-api.sdk.js: HTTP da planilha com credencial googleApi; retry 3x / 3 s so onde repetir nao duplica'`, trocar a linha

```js
  const google = blocos(sdk).filter((b) => /type: 'n8n-nodes-base\.(httpRequest|googleSheets)'/.test(b.txt));
```

por

```js
  // Os GET do Ploomes da Visão da peça têm teste próprio (workflow-peca.test.js).
  const PECA_PLOOMES = ['Buscar Cards da Peça', 'Buscar Registros da Peça', 'Buscar Trocas de Etapa', 'Buscar Etapas do Funil'];
  const google = blocos(sdk).filter((b) => /type: 'n8n-nodes-base\.(httpRequest|googleSheets)'/.test(b.txt) && !PECA_PLOOMES.includes(b.nome));
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd n8n && node --test test/workflow-peca.test.js`
Expected: FAIL (`Cannot read properties of undefined` no nó `Peça`; adaptador `validar-peca.js` inexistente).

- [ ] **Passo 3: implementar**

`n8n/adaptadores/validar-peca.js`:

```js
// ===== adaptador: Validar Peça =====
// GET /pcp-peca?q=: sessão, busca e cache (60 s). Pronto = vai direto ao Responder Peça.
var estadoPeca = $getWorkflowStaticData('global');
var entradaPeca = $('Peça').first().json;
return [{ json: validarPedidoPeca(estadoPeca, (entradaPeca.headers || {}).authorization, entradaPeca.query || {}, Date.now()) }];
```

`n8n/adaptadores/preparar-leituras-peca.js`:

```js
// ===== adaptador: Preparar Leituras da Peça =====
// Entrada: resposta do "Buscar Cards da Peça" (fullResponse). Saída pronta (lista de OS,
// 404 ou 502) ou as URLs de registros, trocas e etapas dos cards da OS.
var estadoPeca = $getWorkflowStaticData('global');
var pedidoPeca = $('Validar Peça').first().json;
return [{ json: prepararLeiturasPeca(pedidoPeca.busca, $input.first().json, Date.now(), estadoPeca) }];
```

`n8n/adaptadores/montar-peca.js`:

```js
// ===== adaptador: Montar Peça =====
// Junta cards, registros, trocas e etapas na resposta do pcp-peca e guarda no cache.
var estadoPeca = $getWorkflowStaticData('global');
var leiturasPeca = $('Preparar Leituras da Peça').first().json;
return [{ json: finalizarPeca(leiturasPeca, {
  registros: $('Buscar Registros da Peça').first().json,
  trocas: $('Buscar Trocas de Etapa').first().json,
  etapas: $('Buscar Etapas do Funil').first().json
}, Date.now(), estadoPeca) }];
```

Em `n8n/scripts/gerar-code-nodes.js`, no fim do objeto `NODES` (depois de `'fechar-perguntas-vencidas': 'Fechar Perguntas Vencidas'`, acrescentando a vírgula):

```js
  'validar-peca': 'Validar Peça',
  'preparar-leituras-peca': 'Preparar Leituras da Peça',
  'montar-peca': 'Montar Peça'
```

Em `n8n/scripts/gerar-workflow-sdk.js`:

1. Depois de `POS['Disparar Interpretação'] = [16 * DX, 900];`:

```js
// Visão da peça (F5a): GET pcp-peca lê o Ploomes na hora (cache de 60 s no static data).
linha(1100, 0, ['Peça', 'Validar Peça', 'Peça Pronta?', 'Buscar Cards da Peça', 'Preparar Leituras da Peça',
  'Peça Pronta (Cards)?', 'Buscar Registros da Peça', 'Buscar Trocas de Etapa', 'Buscar Etapas do Funil', 'Montar Peça', 'Responder Peça']);
```

2. Em `gerarApi`, logo depois de `responder('responderBoard', 'Responder Board'),`:

```js
  webhook('pecaWebhook', 'Peça', 'GET', 'pcp-peca' + sufixo),
  code('validarPeca', 'Validar Peça', 'validar-peca'),
  'const pecaPronta = ' + condicao('Peça Pronta?', '{{ $json.pronto }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  http('buscarCardsPeca', 'Buscar Cards da Peça', 'GET', "expr('{{ $json.url }}')", false),
  code('prepararLeiturasPeca', 'Preparar Leituras da Peça', 'preparar-leituras-peca'),
  'const pecaProntaCards = ' + condicao('Peça Pronta (Cards)?', '{{ $json.pronto }}', 'boolean', 'true', "''").replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  http('buscarRegistrosPeca', 'Buscar Registros da Peça', 'GET', "expr('{{ $json.urls.registros }}')", false),
  http('buscarTrocasEtapa', 'Buscar Trocas de Etapa', 'GET', 'expr(' + JSON.stringify("{{ $('Preparar Leituras da Peça').first().json.urls.trocas }}") + ')', false),
  http('buscarEtapasFunil', 'Buscar Etapas do Funil', 'GET', 'expr(' + JSON.stringify("{{ $('Preparar Leituras da Peça').first().json.urls.etapas }}") + ')', false),
  code('montarPeca', 'Montar Peça', 'montar-peca'),
  responder('responderPeca', 'Responder Peça'),
```

3. Na cadeia do `export default workflow(...)` de `gerarApi`, entre `.onFalse(responderBoard))` e `.add(acaoWebhook)`:

```js
  .add(pecaWebhook)
  .to(validarPeca)
  .to(pecaPronta
    .onTrue(responderPeca)
    .onFalse(buscarCardsPeca.to(prepararLeiturasPeca).to(pecaProntaCards
      .onTrue(responderPeca)
      .onFalse(buscarRegistrosPeca.to(buscarTrocasEtapa).to(buscarEtapasFunil).to(montarPeca).to(responderPeca)))))
```

- [ ] **Passo 4: build e testes**

Run: `cd n8n && npm run build && npm test`
Expected: PASS (inclui `workflow-peca.test.js`, `workflow-acao.test.js` e o teste de que o homolog só difere em nome, id e `-h` dos caminhos).

- [ ] **Passo 5: commit**

```bash
git add n8n/adaptadores n8n/scripts n8n/test n8n/build n8n/workflows
git commit -m "feat: webhook pcp-peca no workflow da API (produção e homolog)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Contrato, cliente e anotação otimista no site

**Arquivos:**
- Modificar: `web/src/api/tipos.ts`, `web/src/api/client.ts`, `web/src/hooks/filaAcoes.ts`, `web/src/regras/acoes.ts` (`chaveDaAcao`), `web/src/regras/otimista.ts`
- Teste: `web/src/api/client.test.ts`, `web/src/regras/otimista.test.ts`

**Interfaces (produz):**
- Tipos: `CardPeca`, `CandidatoPeca`, `EventoPloomes`, `TrilhaPeca`, `RespostaPeca`, `AnotacaoPeca`; `EntradaHistorico.id?`, `EntradaHistorico.acao?`; `Board.anotacoes?`; `Acao` `{ tipo: 'anotar_peca'; os; dealId; texto }`; `RespostaAcao.anotacaoId?`.
- `urlPeca(): string`, `buscarPeca(token, q): Promise<RespostaPeca>`.
- `chaveDaAcao({ tipo: 'anotar_peca', os })` → `anotacao:<os>`.
- Otimista: anotação provisória `{ id: 'novo:anotacao:<n>', usuario: 'Você', texto: 'Você anotou: "<texto>"', ploomes: 'PENDENTE' }` no topo de `board.anotacoes`; some quando o board traz `anotacaoId`.

- [ ] **Passo 1: testes que falham**

Em `web/src/api/client.test.ts`, trocar o import por `import { ApiError, buscarBoard, buscarPeca, enviarAcao, entrar, urlPeca } from './client';` e acrescentar dentro do `describe('client'`:

```ts
  it('buscarPeca usa a URL do board trocando pcp-board por pcp-peca (inclusive no homolog)', async () => {
    const corpo = { geradoEm: 'x', os: '90001', cards: [], trilha: null, eventos: [] };
    const f = vi.fn(() => resposta(200, corpo));
    vi.stubGlobal('fetch', f);
    expect(await buscarPeca('abc', 'REF 01')).toEqual(corpo);
    expect(f).toHaveBeenCalledWith('http://api.test/pcp-peca?q=REF%2001', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer abc' } }));
    vi.stubEnv('VITE_API_BOARD', 'https://n8n.exemplo.test/webhook/pcp-board-h');
    expect(urlPeca()).toBe('https://n8n.exemplo.test/webhook/pcp-peca-h');
  });

  it('buscarPeca: resposta sem cards ou eventos é inválida; 404 e 502 viram ApiError com a mensagem', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(200, { os: '1' })));
    await expect(buscarPeca('t', '1')).rejects.toMatchObject({ status: 200, message: 'Resposta inválida do servidor.' });
    vi.stubGlobal('fetch', vi.fn(() => resposta(404, { erro: 'Nenhuma OS encontrada no Ploomes.' })));
    await expect(buscarPeca('t', '1')).rejects.toMatchObject({ status: 404, message: 'Nenhuma OS encontrada no Ploomes.' });
    vi.stubGlobal('fetch', vi.fn(() => resposta(502, { erro: 'Não foi possível ler o Ploomes agora.' })));
    await expect(buscarPeca('t', '1')).rejects.toMatchObject({ status: 502 });
  });

  it('enviarAcao devolve o anotacaoId da anotação', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(200, { ok: true, versao: 'v', historico: null, anotacaoId: 'H-1' })));
    const r = await enviarAcao('t', { tipo: 'anotar_peca', os: '90001', dealId: '600001', texto: 'oi' });
    expect(r.anotacaoId).toBe('H-1');
  });
```

No fim de `web/src/regras/otimista.test.ts`:

```ts
describe('anotar_peca', () => {
  it('a anotação aparece na hora e sai da fila quando o board traz o id gravado', () => {
    const a: Acao = { tipo: 'anotar_peca', os: '90001', dealId: '600001', texto: ' Ligar\npara a oficina ' };
    const b = aplicar(quadro(), a);
    expect(b.anotacoes?.[0]).toEqual({
      id: 'novo:anotacao:7', quando: '2026-10-08T12:00:00.000Z', usuario: 'Você', texto: 'Você anotou: "Ligar para a oficina"',
      ploomes: 'PENDENTE', dealId: '600001', os: '90001'
    });
    expect(aplicar(quadro({ anotacoes: b.anotacoes }), a).anotacoes).toHaveLength(2);
    const p = pend(1, a, { estado: 'confirmada', confirmadaEm: 1, versaoNova: 'x', resposta: { anotacaoId: 'H-1' } });
    expect(pendentesVivos([p], quadro(), 1)).toEqual([p]);
    const gravado = quadro({ anotacoes: [{ id: 'H-1', quando: '', usuario: 'Lucca', texto: 'x', ploomes: 'PENDENTE', dealId: '600001', os: '90001' }] });
    expect(pendentesVivos([p], gravado, 1)).toEqual([]);
  });
});
```

Run: `cd web && npx vitest run src/api/client.test.ts src/regras/otimista.test.ts`
Expected: FAIL (`buscarPeca` não exportado; tipo `anotar_peca` inexistente).

- [ ] **Passo 2: tipos** — em `web/src/api/tipos.ts`:

`EntradaHistorico` passa a ser:

```ts
export interface EntradaHistorico {
  id?: string; // linha do HISTORICO_APP (API nova): evita evento repetido na Visão da peça
  acao?: string; // coluna acao do HISTORICO_APP (baixa, gerar_pedido, ANOTACAO...): fonte na linha do tempo
  quando: string; // ISO
  usuario: string;
  texto: string;
  ploomes: StatusPloomes;
}
```

Em `Board`, depois de `previsaoSemHistorico?`:

```ts
  anotacoes?: AnotacaoPeca[]; // anotações da Visão da peça (qualquer card), cruzadas pela OS
```

Em `Acao`, depois da linha de `alterar_capacidade_oficina`:

```ts
  // Visão da peça (F5a): única escrita; texto até 500 caracteres, sem linha em branco.
  | { tipo: 'anotar_peca'; os: string; dealId: string; texto: string };
```

(a linha anterior perde o `;` final e ganha a nova alternativa.) Em `RespostaAcao`: `anotacaoId?: string; // anotar_peca: id da linha no HISTORICO_APP`.

No fim do arquivo:

```ts
// Contrato do webhook pcp-peca (n8n/src/peca.js): o que o board não tem (Ploomes na hora).
export interface CardPeca {
  dealId: string;
  funilId: number | null;
  funil: string; // 'Produção' | 'PCP' | 'Funil <id>'
  etapaId: number | null;
  etapa: string;
  etapaOrdem: number | null;
  titulo: string;
  cliente: string;
  peca: string;
  referencia: string;
  os: string;
  atualizadoEm: string;
  link: string;
}

export interface CandidatoPeca { os: string; peca: string; etapa: string; funil: string; dealId: string }

export interface EventoPloomes {
  quando: string;
  fonte: 'PLOOMES' | 'ETAPA';
  texto: string;
  autor: string;
  dealId: string;
  desfeita?: boolean; // troca de etapa desfeita no Ploomes
}

export interface TrilhaPeca { funil: string; dealId: string; etapas: { id: string; nome: string; ordem: number | null }[]; atualId: string }

export interface RespostaPeca {
  geradoEm: string;
  os: string; // '' quando a busca devolve a lista de candidatos
  candidatos?: CandidatoPeca[];
  cards: CardPeca[];
  trilha: TrilhaPeca | null;
  eventos: EventoPloomes[];
}

export interface AnotacaoPeca {
  id: string;
  quando: string;
  usuario: string;
  texto: string;
  ploomes: StatusPloomes;
  dealId: string;
  os: string;
}
```

- [ ] **Passo 3: cliente** — em `web/src/api/client.ts`, trocar o import por `import type { Acao, Board, RespostaAcao, RespostaPeca, Sessao } from './tipos';`, acrescentar em `enviarAcao`, antes do `return resp;`:

```ts
  if (typeof r.anotacaoId === 'string') resp.anotacaoId = r.anotacaoId;
```

e no fim do arquivo:

```ts
// O pcp-peca mora ao lado do pcp-board (o homolog termina em -h): a URL sai da do board,
// sem variável nova no build.
export function urlPeca(): string {
  return import.meta.env.VITE_API_BOARD.replace(/pcp-board(-h)?$/, 'pcp-peca$1');
}

export async function buscarPeca(token: string, q: string): Promise<RespostaPeca> {
  const r = await pedir<RespostaPeca>(`${urlPeca()}?q=${encodeURIComponent(q)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!Array.isArray(r.cards) || !Array.isArray(r.eventos)) throw new ApiError(200, 'Resposta inválida do servidor.');
  return r;
}
```

- [ ] **Passo 4: fila, chave e otimista**

`web/src/hooks/filaAcoes.ts`, depois de `if (r.mensagemId !== undefined) resposta.mensagemId = r.mensagemId;`:

```ts
        if (r.anotacaoId !== undefined) resposta.anotacaoId = r.anotacaoId;
```

`web/src/regras/acoes.ts`, em `chaveDaAcao`, logo antes de `if ('itemId' in acao)`:

```ts
  if (acao.tipo === 'anotar_peca') return `anotacao:${acao.os}`;
```

`web/src/regras/otimista.ts`:
- em `Pendente.resposta`, trocar `Pick<RespostaAcao, 'pedidoId' | 'partes' | 'itemIds' | 'mensagemId'>` por `Pick<RespostaAcao, 'pedidoId' | 'partes' | 'itemIds' | 'mensagemId' | 'anotacaoId'>`;
- em `aplicarOtimista`, antes de `case 'salvar_etapas':`:

```ts
    case 'anotar_peca':
      // Como o servidor (n8n/src/peca.js): texto numa linha só; o nome real chega com a recarga.
      return {
        ...board,
        anotacoes: [{
          id: `novo:anotacao:${ctx.n}`, quando: quandoProvisorio(ctx), usuario: 'Você',
          texto: `Você anotou: "${normalizarTexto(acao.texto)}"`, ploomes: 'PENDENTE' as const, dealId: acao.dealId, os: acao.os
        }, ...(board.anotacoes ?? [])]
      };
```

- em `acaoNoBoard`, antes de `case 'gerar_pedido':`:

```ts
    case 'anotar_peca':
      return !!r.anotacaoId && !!board.anotacoes?.some((x) => x.id === r.anotacaoId);
```

- [ ] **Passo 5: rodar**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS, sem erro de tipo.

- [ ] **Passo 6: commit**

```bash
git add web/src/api web/src/hooks/filaAcoes.ts web/src/regras/acoes.ts web/src/regras/otimista.ts web/src/regras/otimista.test.ts
git commit -m "feat: contrato do pcp-peca e anotação otimista no site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Regras puras da Visão da peça (front)

**Arquivos:**
- Criar: `web/src/regras/peca.ts`
- Teste: `web/src/regras/peca.test.ts`

**Interfaces (produz):**
- `URL_HUB_PECAS`, `URL_CARD_PLOOMES`, `FUNIL_PRODUCAO = 60015827`, `FUNIL_PCP = 60011710`, `MAX_ANOTACAO = 500`.
- `type FontePeca = 'PLOOMES' | 'ETAPA' | 'ALMOXARIFADO' | 'COMPRAS' | 'PRODUCAO' | 'WHATSAPP' | 'ANOTACAO'`; `ROTULO_FONTE`.
- `interface EventoPeca { chave; quando; fonte; texto; autor; enviadoPloomes; desfeita? }`.
- `fonteDaAcao(acao, padrao)`, `caixasDaOs(board, os)`, `producaoDaOs(board, os)`, `linhaDoTempo(board, ploomes, os)`, `resumoSituacao(board, os)`, `cardPrincipal(cards)`, `dealDaAnotacao(cards, board, os)`, `podeAnotar(board, dealId)`, `erroAnotacao(texto)`, `urlHub(referencia)`, `urlCard(dealId)`.

- [ ] **Passo 1: testes que falham** (`web/src/regras/peca.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { Board, CardPeca, Pedido, Producao } from '../api/tipos';
import { cardPrincipal, dealDaAnotacao, erroAnotacao, fonteDaAcao, linhaDoTempo, podeAnotar, resumoSituacao, urlHub } from './peca';
import { caixa, item } from './teste-util';

const card = (o: Partial<CardPeca>): CardPeca => ({
  dealId: '1', funilId: 60015827, funil: 'Produção', etapaId: 1, etapa: '17. Costura', etapaOrdem: 6, titulo: '', cliente: '',
  peca: 'CAMISA TESTE', referencia: 'REF-01', os: '90001', atualizadoEm: '2026-10-20T10:00:00.000Z', link: '', ...o
});
const prod = (o: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA A', inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 10,
  cliente: '', peca: '', referencia: '', versao: 'v1', faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [], ...o
});
const ped = (o: Partial<Pedido>): Pedido => ({
  id: 'PED-0001', pai: '', etapa: 'sol', origem: 'FORNECEDOR', quem: '', local: 'BRAGANCA', previsao: '', responsavel: '', criadoEm: '',
  baixadoEm: '', versao: 'v1', finalizado: false,
  itens: [{ itemId: 'i1', dealId: '600001', os: '90001', nome: 'ZIPER', un: 'UN', qtd: 1, fornecedor: '' }], ...o
});
const quadro = (o: Partial<Board> = {}): Board => ({ geradoEm: '', avisos: [], usuarios: [], caixas: [], ...o });

describe('fonteDaAcao', () => {
  it('separa almoxarifado, compras, produção, WhatsApp e anotação', () => {
    expect(fonteDaAcao('baixa', 'PRODUCAO')).toBe('ALMOXARIFADO');
    expect(fonteDaAcao('obs_caixa', 'PRODUCAO')).toBe('ALMOXARIFADO');
    expect(fonteDaAcao('gerar_pedido', 'ALMOXARIFADO')).toBe('COMPRAS');
    expect(fonteDaAcao('nova_demanda', 'ALMOXARIFADO')).toBe('COMPRAS');
    expect(fonteDaAcao('PRODUCAO_ALTERAR_COMBINADO', 'ALMOXARIFADO')).toBe('PRODUCAO');
    expect(fonteDaAcao('WHATSAPP_SUGESTAO_ACEITA', 'ALMOXARIFADO')).toBe('PRODUCAO');
    expect(fonteDaAcao('WHATSAPP_ASSOCIAR', 'ALMOXARIFADO')).toBe('WHATSAPP');
    expect(fonteDaAcao('WHATSAPP_ENFILEIRAR', 'PRODUCAO')).toBeNull();
    expect(fonteDaAcao('WHATSAPP_REENFILEIRAR', 'PRODUCAO')).toBeNull();
    expect(fonteDaAcao('ANOTACAO', 'ALMOXARIFADO')).toBe('ANOTACAO');
    expect(fonteDaAcao(undefined, 'ALMOXARIFADO')).toBe('ALMOXARIFADO');
  });
});

describe('linhaDoTempo', () => {
  const board = quadro({
    caixas: [
      caixa({ dealId: '600001', os: '90001', historico: [
        { id: 'H1', acao: 'baixa', quando: '2026-10-20T12:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' },
        { id: 'H2', acao: 'gerar_pedido', quando: '2026-10-21T12:00:00.000Z', usuario: 'Ana', texto: 'Ana gerou PED-0001', ploomes: 'PENDENTE' },
        { id: 'H9', acao: 'ANOTACAO', quando: '2026-10-22T12:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "x"', ploomes: 'ENVIADO' }
      ] }),
      caixa({ dealId: '600009', os: '90009', historico: [{ id: 'X', acao: 'baixa', quando: '2026-10-23T00:00:00.000Z', usuario: 'Ana', texto: 'outra OS', ploomes: 'ENVIADO' }] })
    ],
    producao: [prod({
      historico: [
        { id: 'P1', acao: 'PRODUCAO_ALTERAR_COMBINADO', quando: '2026-10-19T12:00:00.000Z', usuario: 'Ana', texto: 'Ana alterou o combinado', ploomes: 'ENVIADO' },
        { id: 'P2', acao: 'WHATSAPP_ENFILEIRAR', quando: '2026-10-19T13:00:00.000Z', usuario: 'Ana', texto: 'Ana colocou mensagem na fila', ploomes: 'ENVIADO' },
        { id: 'P3', acao: 'WHATSAPP_SUGESTAO_ACEITA', quando: '2026-10-19T14:00:00.000Z', usuario: 'Ana', texto: 'Ana aceitou a sugestão', ploomes: 'ENVIADO' }
      ],
      mensagens: [{ id: 'M1', quando: '2026-10-19T13:00:00.000Z', participanteNome: '', direcao: 'ENVIADA', texto: 'Olá', associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO' }]
    })],
    anotacoes: [
      { id: 'H9', quando: '2026-10-22T12:00:00.000Z', usuario: 'Bia', texto: 'Bia anotou: "x"', ploomes: 'ENVIADO', dealId: '600001', os: '90001' },
      { id: 'H10', quando: '2026-10-23T12:00:00.000Z', usuario: 'Bia', texto: 'outra OS', ploomes: 'ENVIADO', dealId: '600009', os: '90009' }
    ]
  });
  const ploomes = { eventos: [
    { quando: '2026-10-21T12:00:00.000Z', fonte: 'PLOOMES' as const, texto: 'Registro do comercial', autor: 'Pessoa Comercial', dealId: '1' },
    { quando: '2026-10-21T12:00:00.000Z', fonte: 'ETAPA' as const, texto: 'Produção: 16 → 17', autor: '', dealId: '1', desfeita: true }
  ] };

  it('junta todas as fontes da OS, do mais novo para o mais antigo; empate: Etapa, Ploomes, app', () => {
    const ev = linhaDoTempo(board, ploomes, '90001');
    expect(ev.map((e) => [e.fonte, e.texto])).toEqual([
      ['ANOTACAO', 'Bia anotou: "x"'],
      ['ETAPA', 'Produção: 16 → 17'],
      ['PLOOMES', 'Registro do comercial'],
      ['COMPRAS', 'Ana gerou PED-0001'],
      ['ALMOXARIFADO', 'Ana deu baixa'],
      ['PRODUCAO', 'Ana aceitou a sugestão'],
      ['WHATSAPP', 'Olá'],
      ['PRODUCAO', 'Ana alterou o combinado']
    ]);
    expect(ev[0]).toMatchObject({ autor: 'Bia', enviadoPloomes: true });
    expect(ev[1].desfeita).toBe(true);
    expect(ev[3].enviadoPloomes).toBe(false);
    expect(ev[6]).toMatchObject({ autor: 'PCP', enviadoPloomes: false });
    expect(new Set(ev.map((e) => e.chave)).size).toBe(ev.length);
  });

  it('sem Ploomes e com API antiga (sem id e acao): fonte pela origem e sem repetir', () => {
    const antigo = quadro({
      caixas: [caixa({ os: '90001', historico: [
        { quando: '2026-10-20T12:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' },
        { quando: '2026-10-20T12:00:00.000Z', usuario: 'Ana', texto: 'Ana deu baixa', ploomes: 'ENVIADO' }
      ] })],
      producao: [prod({ historico: [{ quando: '2026-10-19T12:00:00.000Z', usuario: 'Ana', texto: 'combinado', ploomes: 'PENDENTE' }] })]
    });
    expect(linhaDoTempo(antigo, null, '90001').map((e) => e.fonte)).toEqual(['ALMOXARIFADO', 'PRODUCAO']);
    expect(linhaDoTempo(quadro(), null, '90001')).toEqual([]);
  });
});

describe('resumoSituacao', () => {
  it('caixas e itens em aberto, pedidos abertos com a etapa e a última mensagem', () => {
    const board = quadro({
      etapasPedido: [{ id: 'sol', nome: 'Solicitado', ordem: 2 }],
      caixas: [
        caixa({ os: '90001', itens: [item(), item({ id: 'i2', status: 'RESOLVIDO', resta: 0, baixada: 52 })] }),
        caixa({ dealId: '600002', os: '90001', tipo: 'ACABAMENTO', itens: [item({ id: 'i3', status: 'RESOLVIDO', resta: 0, baixada: 52 })] })
      ],
      pedidos: [ped({}), ped({ id: 'PED-0002', finalizado: true }), ped({ id: 'PED-0003', itens: [] })],
      producao: [prod({ mensagens: [
        { id: 'M1', quando: '2026-10-19T13:00:00.000Z', participanteNome: '', direcao: 'ENVIADA', texto: 'Olá', associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO' },
        { id: 'M2', quando: '2026-10-20T13:00:00.000Z', participanteNome: 'Oficina', direcao: 'RECEBIDA', texto: '', associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'NAO_TEXTUAL' }
      ] })]
    });
    expect(resumoSituacao(board, '90001')).toEqual({
      caixas: 2, caixasComFalta: 1, itensAbertos: 1,
      pedidosAbertos: [{ id: 'PED-0001', etapa: 'Solicitado' }],
      ultimaMensagem: { quando: '2026-10-20T13:00:00.000Z', texto: 'Conteúdo não textual', direcao: 'RECEBIDA' },
      temDados: true
    });
    expect(resumoSituacao(board, '99999')).toEqual({ caixas: 0, caixasComFalta: 0, itensAbertos: 0, pedidosAbertos: [], ultimaMensagem: null, temDados: false });
  });
});

describe('cardPrincipal, dealDaAnotacao e podeAnotar', () => {
  it('card principal: Produção, senão PCP, senão o mais recente', () => {
    const pcp = card({ dealId: 'P', funilId: 60011710, atualizadoEm: '2026-10-25T00:00:00.000Z' });
    const producao = card({ dealId: 'R', atualizadoEm: '2026-10-01T00:00:00.000Z' });
    const outroVelho = card({ dealId: 'A', funilId: 1, atualizadoEm: '2026-10-01T00:00:00.000Z' });
    const outroNovo = card({ dealId: 'B', funilId: 1, atualizadoEm: '2026-10-02T00:00:00.000Z' });
    expect(cardPrincipal([pcp, producao])?.dealId).toBe('R');
    expect(cardPrincipal([outroNovo, pcp])?.dealId).toBe('P');
    expect(cardPrincipal([outroVelho, outroNovo])?.dealId).toBe('B');
    expect(cardPrincipal([])).toBeNull();
  });

  it('deal da anotação: card de Produção, senão o primeiro; sem Ploomes, o do board', () => {
    const board = quadro({ caixas: [caixa({ dealId: '600001', os: '90001' })], producao: [prod()] });
    expect(dealDaAnotacao([card({ dealId: 'P', funilId: 60011710 }), card({ dealId: 'R' })], board, '90001')).toBe('R');
    expect(dealDaAnotacao([card({ dealId: 'P', funilId: 60011710 }), card({ dealId: 'Q', funilId: 1 })], board, '90001')).toBe('P');
    expect(dealDaAnotacao([], board, '90001')).toBe('700001');
    expect(dealDaAnotacao([], quadro({ caixas: [caixa({ dealId: '600001', os: '90001' })] }), '90001')).toBe('600001');
    expect(dealDaAnotacao([], quadro(), '90001')).toBe('');
  });

  it('anotar só nos deals liberados (lista vazia = todos)', () => {
    expect(podeAnotar(quadro(), '1')).toBe(true);
    expect(podeAnotar(quadro(), '')).toBe(false);
    const restrito = quadro({ dealsEditaveis: ['607479158'], dealsProducaoEditaveis: ['607612577'] });
    expect(podeAnotar(restrito, '607612577')).toBe(true);
    expect(podeAnotar(restrito, '607479158')).toBe(true);
    expect(podeAnotar(restrito, '600000001')).toBe(false);
    expect(podeAnotar(quadro({ dealsEditaveis: [], dealsProducaoEditaveis: ['607612577'] }), '600000001')).toBe(true);
  });
});

describe('erroAnotacao e urlHub', () => {
  it('valida a anotação como o servidor', () => {
    expect(erroAnotacao('  ')).toBe('Escreva a anotação.');
    expect(erroAnotacao('a\n\nb')).toBe('A anotação não pode ter linha em branco.');
    expect(erroAnotacao('a'.repeat(501))).toBe('Anotação com no máximo 500 caracteres.');
    expect(erroAnotacao('a\nb')).toBe('');
  });
  it('link do HUB de Peças pela referência', () => {
    expect(urlHub(' REF 01/A ')).toBe('https://rslconsultoria.github.io/hub-pecas-catalogo/#REF%2001%2FA');
  });
});
```

Run: `cd web && npx vitest run src/regras/peca.test.ts`
Expected: FAIL (módulo `./peca` não existe).

- [ ] **Passo 2: implementar** (`web/src/regras/peca.ts`)

```ts
import type { Board, Caixa, CardPeca, EntradaHistorico, Producao, RespostaPeca } from '../api/tipos';
import { itemAberto } from './colunas';

// Visão da peça (F5a): o dossiê de uma OS junta o Ploomes (pcp-peca) com o board.
export const URL_HUB_PECAS = 'https://rslconsultoria.github.io/hub-pecas-catalogo/#';
export const URL_CARD_PLOOMES = 'https://app10.ploomes.com/deal/';
export const FUNIL_PRODUCAO = 60015827;
export const FUNIL_PCP = 60011710;
export const MAX_ANOTACAO = 500;

export type FontePeca = 'PLOOMES' | 'ETAPA' | 'ALMOXARIFADO' | 'COMPRAS' | 'PRODUCAO' | 'WHATSAPP' | 'ANOTACAO';
export const ROTULO_FONTE: Record<FontePeca, string> = {
  PLOOMES: 'Ploomes', ETAPA: 'Etapa', ALMOXARIFADO: 'Almoxarifado', COMPRAS: 'Compras', PRODUCAO: 'Produção', WHATSAPP: 'WhatsApp', ANOTACAO: 'Anotação'
};

export interface EventoPeca {
  chave: string;
  quando: string;
  fonte: FontePeca;
  texto: string;
  autor: string;
  enviadoPloomes: boolean;
  desfeita?: boolean;
}

const ACOES_ALMOXARIFADO = new Set(['baixa', 'previsao_item', 'obs_item', 'responsavel', 'previsao_caixa', 'obs_caixa', 'mover']);
const ACOES_COMPRAS = new Set(['gerar_pedido', 'editar_pedido', 'mover_pedido', 'baixar_pedido', 'dividir_pedido', 'dividir_por_previsao', 'nova_demanda']);
// O histórico de enfileirar repete a mensagem, que já entra como evento do WhatsApp.
const ACOES_DA_MENSAGEM = new Set(['WHATSAPP_ENFILEIRAR', 'WHATSAPP_REENFILEIRAR']);

// Fonte do evento do app pela coluna acao do HISTORICO_APP. null = fica fora. Sem acao (API
// antiga): a fonte de onde o histórico veio.
export function fonteDaAcao(acao: string | undefined, padrao: FontePeca): FontePeca | null {
  const a = (acao ?? '').trim();
  if (!a) return padrao;
  const maiuscula = a.toUpperCase();
  if (maiuscula === 'ANOTACAO') return 'ANOTACAO';
  if (ACOES_ALMOXARIFADO.has(a)) return 'ALMOXARIFADO';
  if (ACOES_COMPRAS.has(a)) return 'COMPRAS';
  if (ACOES_DA_MENSAGEM.has(maiuscula)) return null;
  if (maiuscula.startsWith('WHATSAPP_SUGESTAO')) return 'PRODUCAO';
  if (maiuscula.startsWith('WHATSAPP_')) return 'WHATSAPP';
  return 'PRODUCAO';
}

export const caixasDaOs = (board: Board, os: string): Caixa[] => board.caixas.filter((c) => c.os === os);
export const producaoDaOs = (board: Board, os: string): Producao | undefined => board.producao?.find((p) => p.os === os);

const ms = (v: string): number => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};
const ORDEM_FONTE: Partial<Record<FontePeca, number>> = { ETAPA: 0, PLOOMES: 1 };
const ordemFonte = (f: FontePeca) => ORDEM_FONTE[f] ?? 2;
const textoMensagem = (m: { tipoConteudo: string; texto: string }) => (m.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : m.texto);

// Todos os eventos da OS, do mais novo para o mais antigo; empate: Etapa, Ploomes, app.
export function linhaDoTempo(board: Board, ploomes: Pick<RespostaPeca, 'eventos'> | null, os: string): EventoPeca[] {
  const eventos: EventoPeca[] = [];
  const vistos = new Set<string>();
  const doApp = (h: EntradaHistorico, padrao: FontePeca) => {
    const fonte = fonteDaAcao(h.acao, padrao);
    if (!fonte) return;
    const chave = h.id ? `app:${h.id}` : `app:${h.quando}:${h.texto}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    eventos.push({ chave, quando: h.quando, fonte, texto: h.texto, autor: h.usuario, enviadoPloomes: h.ploomes === 'ENVIADO' });
  };
  (ploomes?.eventos ?? []).forEach((e, k) => eventos.push({
    chave: `ploomes:${k}`, quando: e.quando, fonte: e.fonte, texto: e.texto, autor: e.autor, enviadoPloomes: false,
    ...(e.desfeita ? { desfeita: true } : {})
  }));
  caixasDaOs(board, os).forEach((c) => c.historico.forEach((h) => doApp(h, 'ALMOXARIFADO')));
  const p = producaoDaOs(board, os);
  p?.historico.forEach((h) => doApp(h, 'PRODUCAO'));
  (board.anotacoes ?? []).filter((a) => a.os === os).forEach((a) => doApp({ ...a, acao: 'ANOTACAO' }, 'ANOTACAO'));
  p?.mensagens.forEach((m) => eventos.push({
    chave: `whatsapp:${m.id}`, quando: m.quando, fonte: 'WHATSAPP', texto: textoMensagem(m),
    autor: m.direcao === 'ENVIADA' ? 'PCP' : m.participanteNome || 'Oficina', enviadoPloomes: false
  }));
  return eventos.sort((a, b) => ms(b.quando) - ms(a.quando) || ordemFonte(a.fonte) - ordemFonte(b.fonte));
}

export interface ResumoSituacao {
  caixas: number;
  caixasComFalta: number;
  itensAbertos: number;
  pedidosAbertos: { id: string; etapa: string }[];
  ultimaMensagem: { quando: string; texto: string; direcao: 'ENVIADA' | 'RECEBIDA' } | null;
  temDados: boolean;
}

export function resumoSituacao(board: Board, os: string): ResumoSituacao {
  const caixas = caixasDaOs(board, os);
  const abertosPorCaixa = caixas.map((c) => c.itens.filter(itemAberto).length);
  const etapas = new Map((board.etapasPedido ?? []).map((e) => [e.id, e.nome]));
  const pedidosAbertos = (board.pedidos ?? [])
    .filter((p) => !p.finalizado && p.itens.some((i) => i.os === os))
    .map((p) => ({ id: p.id, etapa: etapas.get(p.etapa) ?? p.etapa }));
  const p = producaoDaOs(board, os);
  const ultima = [...(p?.mensagens ?? [])].sort((a, b) => ms(b.quando) - ms(a.quando))[0];
  return {
    caixas: caixas.length,
    caixasComFalta: abertosPorCaixa.filter((n) => n > 0).length,
    itensAbertos: abertosPorCaixa.reduce((s, n) => s + n, 0),
    pedidosAbertos,
    ultimaMensagem: ultima ? { quando: ultima.quando, texto: textoMensagem(ultima), direcao: ultima.direcao } : null,
    temDados: caixas.length > 0 || pedidosAbertos.length > 0 || !!p || (board.anotacoes ?? []).some((a) => a.os === os)
  };
}

// Produção > PCP > o mais recente (mesma regra do servidor, n8n/src/peca.js).
export function cardPrincipal(cards: CardPeca[]): CardPeca | null {
  const lista = [...cards].sort((a, b) => ms(b.atualizadoEm) - ms(a.atualizadoEm));
  return lista.find((c) => c.funilId === FUNIL_PRODUCAO) ?? lista.find((c) => c.funilId === FUNIL_PCP) ?? lista[0] ?? null;
}

// Card da anotação: o de Produção, senão o primeiro; sem Ploomes, o da produção ou da caixa.
export function dealDaAnotacao(cards: CardPeca[], board: Board, os: string): string {
  return cards.find((c) => c.funilId === FUNIL_PRODUCAO)?.dealId ?? cards[0]?.dealId ??
    producaoDaOs(board, os)?.dealId ?? caixasDaOs(board, os)[0]?.dealId ?? '';
}

// Até o go-live: deals das duas allowlists (lista vazia = todos), como o servidor.
export function podeAnotar(board: Board, dealId: string): boolean {
  if (!dealId) return false;
  const caixas = board.dealsEditaveis ?? [];
  const producao = board.dealsProducaoEditaveis ?? [];
  return !caixas.length || !producao.length || caixas.includes(dealId) || producao.includes(dealId);
}

export function erroAnotacao(texto: string): string {
  const t = texto.replace(/\r\n?/g, '\n').trim();
  if (!t) return 'Escreva a anotação.';
  if (/\n[ \t]*\n/.test(t)) return 'A anotação não pode ter linha em branco.';
  if (t.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').length > MAX_ANOTACAO) return 'Anotação com no máximo 500 caracteres.';
  return '';
}

export const urlHub = (referencia: string): string => URL_HUB_PECAS + encodeURIComponent(referencia.trim());
export const urlCard = (dealId: string): string => URL_CARD_PLOOMES + dealId;
```

- [ ] **Passo 3: rodar**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS.

- [ ] **Passo 4: commit**

```bash
git add web/src/regras/peca.ts web/src/regras/peca.test.ts
git commit -m "feat: regras puras da Visão da peça (linha do tempo, situação, card principal)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Navegação `#peca/<q>` e conversa do WhatsApp reaproveitável

**Arquivos:**
- Modificar: `web/src/regras/telas.ts`, `web/src/regras/telas.test.ts`, `web/src/componentes/Navbar.tsx`, `web/src/App.tsx`, `web/src/telas/Producao.tsx`
- Criar: `web/src/componentes/ConversaWhatsapp.tsx`, `web/src/telas/Peca.tsx` (esqueleto; a tela completa vem na Tarefa 8)

**Interfaces (produz):**
- `Tela` ganha `'peca'`; `telaDoHash('#peca')` e `telaDoHash('#peca/<q>')` → `'peca'`; `buscaDaPeca(hash): string`; `hashDaPeca(q): string` (`#peca/<encodeURIComponent(q)>`).
- `ConversaWhatsapp({ mensagens, acoes? })`.
- `Peca({ board, token, hoje, executar, aoExpirar })`.

- [ ] **Passo 1: teste que falha** — em `web/src/regras/telas.test.ts`, trocar o import por `import { buscaDaPeca, hashDaPeca, hashDaTela, telaDoHash } from './telas';` e acrescentar no `describe`:

```ts
  it('Visão da peça: #peca e #peca/<OS ou referência>', () => {
    expect(telaDoHash('#peca')).toBe('peca');
    expect(telaDoHash('#peca/90001')).toBe('peca');
    expect(telaDoHash('#PECA/REF%2001')).toBe('peca');
    expect(telaDoHash('#pecas')).toBe('ploomes');
    expect(buscaDaPeca('#peca/REF%2001%2FA')).toBe('REF 01/A');
    expect(buscaDaPeca('#peca')).toBe('');
    expect(buscaDaPeca('#peca/%E0%A4%A')).toBe('');
    expect(hashDaPeca(' REF 01/A ')).toBe('#peca/REF%2001%2FA');
    expect(hashDaTela('peca')).toBe('#peca');
  });
```

e no teste `'ida e volta'`, trocar a lista por `['ploomes', 'saidas', 'pedidos', 'producao', 'peca'] as const`.

Run: `cd web && npx vitest run src/regras/telas.test.ts` → FAIL.

- [ ] **Passo 2: `web/src/regras/telas.ts`** (arquivo inteiro):

```ts
// Guias que funcionam. O hash da URL guarda a guia para o recarregar voltar nela.
// Visão da peça: #peca ou #peca/<OS ou referência>.
export type Tela = 'ploomes' | 'saidas' | 'pedidos' | 'producao' | 'peca';

const HASH: Record<Tela, string> = { ploomes: '', saidas: '#saidas', pedidos: '#pedidos', producao: '#producao', peca: '#peca' };

export function telaDoHash(hash: string): Tela {
  const h = (hash ?? '').toLowerCase();
  if (h === HASH.saidas) return 'saidas';
  if (h === HASH.pedidos) return 'pedidos';
  if (h === HASH.producao) return 'producao';
  if (h === HASH.peca || h.startsWith(`${HASH.peca}/`)) return 'peca';
  return 'ploomes';
}

export function hashDaTela(t: Tela): string {
  return HASH[t];
}

// O que vem depois de #peca/ (OS ou referência), decodificado.
export function buscaDaPeca(hash: string): string {
  const m = /^#peca\/(.+)$/i.exec(hash ?? '');
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]).trim();
  } catch {
    return '';
  }
}

export function hashDaPeca(q: string): string {
  return `${HASH.peca}/${encodeURIComponent(q.trim())}`;
}

export const BUSCA_DA_TELA: Record<Tela, string> = {
  ploomes: 'Buscar OS, peça, cliente ou material',
  saidas: 'Buscar OS, peça, cliente ou material',
  pedidos: 'Buscar item, OS, fornecedor ou pedido',
  producao: 'Buscar OS, peça, referência, cliente ou oficina',
  peca: 'OS ou referência'
};
```

- [ ] **Passo 3: conversa extraída** — criar `web/src/componentes/ConversaWhatsapp.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { MensagemProducao } from '../api/tipos';
import { dataHora } from '../regras/datas';

// Conversa da OS no WhatsApp (painel do Controle de produção e Visão da peça). acoes: controles
// de cada mensagem (trocar OS, reenviar); sem eles a lista é só leitura.
export function ConversaWhatsapp({ mensagens, acoes }: { mensagens: MensagemProducao[]; acoes?: (m: MensagemProducao) => ReactNode }) {
  if (mensagens.length === 0) return <p className="producao-vazio">Nenhuma mensagem associada.</p>;
  return (
    <ol className="producao-conversa">{mensagens.map((m) => <li key={m.id} className={`producao-mensagem producao-mensagem--${m.direcao.toLowerCase()}`}>
      <span>{m.direcao === 'ENVIADA' ? 'PCP' : m.participanteNome || 'Oficina'} · {dataHora(m.quando)}</span>
      <p>{m.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : m.texto}</p>
      {m.associacao === 'SEM_ASSOCIACAO' && <small>Mensagem ainda sem associação</small>}
      {m.associacao === 'IA' && <small className="producao-selo producao-selo--ia" title={m.associacaoMotivo}>ligada pela IA</small>}
      {m.pergunta && <small className="producao-selo producao-selo--ia">pergunta da IA</small>}
      {m.statusEnvio === 'PENDENTE' && !!m.envioTentativas && <small>Aguardando nova tentativa ({m.envioTentativas} de 5)</small>}
      {m.interpretacao === 'ERRO' && <small>Não foi possível interpretar esta mensagem.</small>}
      {m.statusEnvio === 'ERRO' && <small>Falha no envio.</small>}
      {acoes?.(m)}
    </li>)}</ol>
  );
}
```

Em `web/src/telas/Producao.tsx`: acrescentar `import { ConversaWhatsapp } from '../componentes/ConversaWhatsapp';` e trocar a `<section className="producao-secao">` que começa em `<h3>Conversa relacionada</h3>` (até o `</section>` dela, inclusive) por:

```tsx
        <section className="producao-secao">
          <h3>Conversa relacionada</h3>
          <ConversaWhatsapp mensagens={item.mensagens} acoes={(m) => <>
            {m.associacao === 'IA' && editavel && <TrocarOs mensagemId={m.id} item={item} producao={board.producao ?? []} editaveis={board.dealsProducaoEditaveis} executar={executar} />}
            {m.statusEnvio === 'ERRO' && !m.reenviada && editavel && <button type="button" className="botao botao--contorno" onClick={() => reenviarMensagem(m.id, m.texto)}>Reenviar</button>}
          </>} />
        </section>
```

(Muda só a posição do "Trocar OS": passa para depois dos avisos de envio da mesma mensagem.)

- [ ] **Passo 4: esqueleto da tela** — criar `web/src/telas/Peca.tsx` (substituído pela versão completa na Tarefa 8):

```tsx
import type { Board } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';

export interface PropsPeca { board: Board; token: string; hoje: Date; executar: Executar; aoExpirar: () => void }

export function Peca(_props: PropsPeca) {
  return <div className="peca"><p className="peca__vazio">Visão da peça</p></div>;
}
```

- [ ] **Passo 5: guia e App**

`web/src/componentes/Navbar.tsx`: trocar `{ nome: 'Visão das peças', icone: 'doc' }` por `{ nome: 'Visão das peças', icone: 'doc', tela: 'peca' }`.

`web/src/App.tsx`:
- import: `import { Peca } from './telas/Peca';`
- `buscas`: `useState<Record<Tela, string>>({ ploomes: '', saidas: '', pedidos: '', producao: '', peca: '' })`
- envolver o `<Subnav ...>...</Subnav>` com `{tela !== 'peca' && ( ... )}` (a Visão da peça tem a própria busca);
- no `<main>`, logo depois de `{!board ? <div className="carregando">...</div>`, acrescentar como primeiro ramo:

```tsx
          : tela === 'peca' ? <Peca board={board} token={sessao.token} hoje={hoje} executar={executar} aoExpirar={aoExpirar} />
```

- [ ] **Passo 6: rodar**

Run: `cd web && npx vitest run && npx tsc -b && CI=1 npx playwright test e2e/f4.spec.ts e2e/f3-smoke.spec.ts`
Expected: PASS (a conversa do painel da produção continua igual).

- [ ] **Passo 7: commit**

```bash
git add web/src
git commit -m "feat: guia Visão das peças, endereço #peca e conversa do WhatsApp reaproveitável

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Tela da Visão da peça

**Arquivos:**
- Modificar: `web/src/telas/Peca.tsx` (versão completa), `web/src/main.tsx`
- Criar: `web/src/styles/f5.css`
- Teste: `web/e2e/f5a-peca.spec.ts` (criado aqui com os testes da tela; a Tarefa 10 acrescenta os de link e celular)

**Interfaces:**
- Consome: `buscarPeca`, `ApiError` (Tarefa 5); regras de `regras/peca.ts` (Tarefa 6); `buscaDaPeca`, `hashDaPeca` (Tarefa 7); `ConversaWhatsapp`; `situacaoPrazo` (`regras/producao.ts`); `nomeDoTipo` (`regras/texto.ts`); `itemAberto` (`regras/colunas.ts`); `ddmm`, `dataHora`, `diaIso` (`regras/datas.ts`).
- Produz rótulos usados nos e2e: campo `OS ou referência`, botão `Abrir`, `article` "Visão da peça da OS <os>", links `Abrir card no Ploomes` / `Abrir card no Ploomes · <funil>` / `Ficha técnica no HUB de Peças`, `complementary` "Resumo da OS", `tablist` "Seções da OS" com abas `Linha do tempo`, `Caixas e faltas`, `Oficina e prazos`, `WhatsApp`, `E-mails do PCP`, campo `Anotar algo no histórico`, botão `Anotar`, região "OS encontradas".

- [ ] **Passo 1: e2e que falha** — criar `web/e2e/f5a-peca.spec.ts`:

```ts
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
```

Run: `cd web && CI=1 npx playwright test e2e/f5a-peca.spec.ts`
Expected: FAIL (a tela ainda é o esqueleto).

- [ ] **Passo 2: tela completa** — substituir `web/src/telas/Peca.tsx` por:

```tsx
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, buscarPeca } from '../api/client';
import type { Board, CandidatoPeca, Producao, RespostaPeca } from '../api/tipos';
import { ConversaWhatsapp } from '../componentes/ConversaWhatsapp';
import type { Executar } from '../hooks/useAcao';
import { itemAberto } from '../regras/colunas';
import { dataHora, ddmm, diaIso } from '../regras/datas';
import {
  cardPrincipal, caixasDaOs, dealDaAnotacao, erroAnotacao, linhaDoTempo, MAX_ANOTACAO, podeAnotar, producaoDaOs, resumoSituacao,
  ROTULO_FONTE, urlCard, urlHub, type EventoPeca
} from '../regras/peca';
import { situacaoPrazo } from '../regras/producao';
import { buscaDaPeca, hashDaPeca } from '../regras/telas';
import { nomeDoTipo } from '../regras/texto';

export interface PropsPeca { board: Board; token: string; hoje: Date; executar: Executar; aoExpirar: () => void }

const MSG_PLOOMES_FORA = 'Não foi possível ler o Ploomes agora. Mostrando só o que o app tem desta OS.';
type Aba = 'tempo' | 'caixas' | 'prazos' | 'whatsapp' | 'emails';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'tempo', nome: 'Linha do tempo' }, { id: 'caixas', nome: 'Caixas e faltas' }, { id: 'prazos', nome: 'Oficina e prazos' },
  { id: 'whatsapp', nome: 'WhatsApp' }, { id: 'emails', nome: 'E-mails do PCP' }
];

type Estado =
  | { tipo: 'vazio' }
  | { tipo: 'carregando' }
  | { tipo: 'nada' }
  | { tipo: 'erro'; texto: string }
  | { tipo: 'candidatos'; candidatos: CandidatoPeca[] }
  | { tipo: 'pronto'; os: string; ploomes: RespostaPeca | null; aviso: string };

// A busca mora no hash (#peca/<q>): links dos painéis e o recarregar caem no mesmo dossiê.
function useBuscaDaPeca(): string {
  const [q, setQ] = useState(() => buscaDaPeca(window.location.hash));
  useEffect(() => {
    const aoMudar = () => setQ(buscaDaPeca(window.location.hash));
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return q;
}

export function Peca({ board, token, hoje, executar, aoExpirar }: PropsPeca) {
  const q = useBuscaDaPeca();
  const [campo, setCampo] = useState(q);
  const [estado, setEstado] = useState<Estado>({ tipo: 'vazio' });
  const expirar = useRef(aoExpirar);
  expirar.current = aoExpirar;
  useEffect(() => setCampo(q), [q]);
  useEffect(() => {
    if (!q) {
      setEstado({ tipo: 'vazio' });
      return;
    }
    let vivo = true;
    setEstado({ tipo: 'carregando' });
    buscarPeca(token, q).then((r) => {
      if (!vivo) return;
      const candidatos = r.candidatos ?? [];
      if (candidatos.length === 1) {
        window.location.replace(hashDaPeca(candidatos[0].os));
        return;
      }
      setEstado(candidatos.length ? { tipo: 'candidatos', candidatos } : { tipo: 'pronto', os: r.os || q, ploomes: r, aviso: '' });
    }).catch((e: unknown) => {
      if (!vivo) return;
      if (e instanceof ApiError && e.status === 401) return expirar.current();
      if (e instanceof ApiError && e.status === 404) return setEstado({ tipo: 'nada' });
      if (e instanceof ApiError && e.status === 400) return setEstado({ tipo: 'erro', texto: e.message });
      // Ploomes fora (502) ou sem conexão: com uma OS na busca, o dossiê sai só do board.
      setEstado(/^\d+$/.test(q) ? { tipo: 'pronto', os: q, ploomes: null, aviso: MSG_PLOOMES_FORA } : { tipo: 'erro', texto: MSG_PLOOMES_FORA });
    });
    return () => { vivo = false; };
  }, [q, token]);
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    const v = campo.trim();
    if (v) window.location.hash = hashDaPeca(v);
  };
  return (
    <div className="peca">
      <form className="peca__busca" role="search" onSubmit={buscar}>
        <label>OS ou referência<input type="search" value={campo} maxLength={60} placeholder="Ex.: 123456 ou REF-01" onChange={(e) => setCampo(e.target.value)} /></label>
        <button type="submit" className="botao botao--navy">Abrir</button>
      </form>
      {estado.tipo === 'vazio' && <p className="peca__vazio">Busque uma OS ou referência para ver tudo dela: Ploomes, caixas, pedidos, produção e WhatsApp.</p>}
      {estado.tipo === 'carregando' && <p className="peca__vazio" role="status">Lendo o Ploomes…</p>}
      {estado.tipo === 'nada' && <p className="peca__vazio" role="status">Nenhuma OS encontrada no Ploomes.</p>}
      {estado.tipo === 'erro' && <p className="peca__aviso" role="alert">{estado.texto}</p>}
      {estado.tipo === 'candidatos' && <Candidatos lista={estado.candidatos} />}
      {estado.tipo === 'pronto' && <Dossie key={estado.os} board={board} os={estado.os} ploomes={estado.ploomes} aviso={estado.aviso} hoje={hoje} executar={executar} />}
    </div>
  );
}

function Candidatos({ lista }: { lista: CandidatoPeca[] }) {
  return (
    <section className="peca__candidatos" aria-label="OS encontradas">
      <h2>Mais de uma OS com essa referência</h2>
      <ul>{lista.map((c) => <li key={c.os}><a href={hashDaPeca(c.os)}>
        <strong>OS {c.os}</strong><span>{c.peca || '—'}</span><span>{[c.etapa, c.funil].filter(Boolean).join(' · ')}</span>
      </a></li>)}</ul>
    </section>
  );
}

interface PropsDossie { board: Board; os: string; ploomes: RespostaPeca | null; aviso: string; hoje: Date; executar: Executar }

function Dossie({ board, os, ploomes, aviso, hoje, executar }: PropsDossie) {
  const [aba, setAba] = useState<Aba>('tempo');
  const cards = ploomes?.cards ?? [];
  const trilha = ploomes?.trilha ?? null;
  const principal = cardPrincipal(cards);
  const producao = producaoDaOs(board, os);
  const caixas = caixasDaOs(board, os);
  const resumo = resumoSituacao(board, os);
  const eventos = useMemo(() => linhaDoTempo(board, ploomes, os), [board, ploomes, os]);
  const peca = principal?.peca || producao?.peca || caixas[0]?.peca || '';
  const cliente = principal?.cliente || producao?.cliente || caixas[0]?.cliente || '';
  const referencia = principal?.referencia || producao?.referencia || caixas[0]?.referencia || '';
  const prazo = producao ? situacaoPrazo(producao, diaIso(hoje)) : null;
  const links = cards.length ? cards.map((c) => ({ dealId: c.dealId, funil: c.funil })) : producao ? [{ dealId: producao.dealId, funil: 'Produção' }] : [];
  return (
    <article className="peca__dossie" aria-label={`Visão da peça da OS ${os}`}>
      <header className="peca__cabecalho">
        <span className="peca__sobre">Visão da peça</span>
        <div className="peca__titulo">
          <h1 className="peca__os">{os}</h1>
          <span className="peca__nome">{peca || 'Peça sem descrição'}</span>
          {cliente && <span className="peca__cliente">{cliente}</span>}
          {referencia && <span className="peca__ref">{referencia}</span>}
        </div>
        <nav className="peca__links" aria-label="Links da OS">
          {links.map((c) => <a key={c.dealId} href={urlCard(c.dealId)} target="_blank" rel="noreferrer">{links.length > 1 ? `Abrir card no Ploomes · ${c.funil}` : 'Abrir card no Ploomes'}</a>)}
          {referencia && <a href={urlHub(referencia)} target="_blank" rel="noreferrer">Ficha técnica no HUB de Peças</a>}
        </nav>
        {trilha && trilha.etapas.length > 0 && <ol className="peca__trilha" aria-label={`Etapas do funil ${trilha.funil}`}>
          {trilha.etapas.map((e) => <li key={e.id} aria-current={e.id === trilha.atualId ? 'step' : undefined}>{e.nome}</li>)}
        </ol>}
        {aviso && <p className="peca__aviso" role="alert">{aviso}</p>}
        {!resumo.temDados && <p className="peca__vazio">Esta OS ainda não tem caixas, pedidos ou mensagens no app.</p>}
      </header>
      <div className="peca__corpo">
        <aside className="peca__lateral" aria-label="Resumo da OS">
          <div className={`peca__prazo peca__prazo--${(prazo?.situacao ?? 'SEM_PRAZO').toLowerCase()}`}>{prazo ? prazo.texto : 'Fora do Controle de produção'}</div>
          <section className="peca__bloco">
            <h2>Produção</h2>
            <dl>
              <div><dt>Etapa</dt><dd>{principal?.etapa || producao?.etapaNome || '—'}</dd></div>
              <div><dt>Oficina</dt><dd>{producao?.oficina || '—'}</dd></div>
              <div><dt>Início</dt><dd>{ddmm(producao?.inicioCostura ?? '') || '—'}</dd></div>
              <div><dt>Data combinada</dt><dd>{ddmm(producao?.dataCombinada ?? '') || '—'}</dd></div>
              <div><dt>Lead time</dt><dd>{ddmm(producao?.leadTime ?? '') || '—'}</dd></div>
              <div><dt>Peças</dt><dd>{producao?.pecas ?? '—'}</dd></div>
              <div><dt>Costura</dt><dd>{!producao ? '—' : producao.prevista ? `prevista ${ddmm(producao.inicioCosturaPrevisto ?? '')}`.trim() : 'real (na Costura)'}</dd></div>
            </dl>
          </section>
          <section className="peca__bloco">
            <h2>Situação hoje</h2>
            <dl>
              <div><dt>Caixas</dt><dd>{resumo.caixas ? `${resumo.caixasComFalta} de ${resumo.caixas} com falta · ${resumo.itensAbertos} ${resumo.itensAbertos === 1 ? 'item' : 'itens'} em aberto` : 'Nenhuma caixa'}</dd></div>
              <div><dt>Pedidos abertos</dt><dd>{resumo.pedidosAbertos.length ? resumo.pedidosAbertos.map((p) => `${p.id} · ${p.etapa}`).join('; ') : 'Nenhum'}</dd></div>
              <div><dt>WhatsApp</dt><dd>{resumo.ultimaMensagem ? `${dataHora(resumo.ultimaMensagem.quando)} · ${resumo.ultimaMensagem.texto}` : 'Sem mensagens'}</dd></div>
            </dl>
          </section>
        </aside>
        <section className="peca__principal">
          <div className="peca__abas" role="tablist" aria-label="Seções da OS">
            {ABAS.map((a) => <button key={a.id} type="button" role="tab" id={`aba-${a.id}`} aria-selected={aba === a.id}
              aria-controls={`painel-${a.id}`} onClick={() => setAba(a.id)}>{a.nome}</button>)}
          </div>
          <div className="peca__painel" role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
            {aba === 'tempo' && <LinhaDoTempo eventos={eventos} board={board} os={os} dealId={dealDaAnotacao(cards, board, os)} executar={executar} />}
            {aba === 'caixas' && <CaixasEFaltas board={board} os={os} />}
            {aba === 'prazos' && <OficinaEPrazos producao={producao} />}
            {aba === 'whatsapp' && <ConversaWhatsapp mensagens={producao?.mensagens ?? []} />}
            {aba === 'emails' && <p className="peca__vazio">Chega na próxima parte da F5.</p>}
          </div>
        </section>
      </div>
    </article>
  );
}

function LinhaDoTempo({ eventos, board, os, dealId, executar }: { eventos: EventoPeca[]; board: Board; os: string; dealId: string; executar: Executar }) {
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState('');
  const liberada = podeAnotar(board, dealId);
  const anotar = (e: FormEvent) => {
    e.preventDefault();
    const msg = erroAnotacao(nota);
    if (msg) return setErro(msg);
    setErro('');
    void executar({ tipo: 'anotar_peca', os, dealId, texto: nota.trim() }, 'Anotação registrada');
    setNota('');
  };
  return (
    <>
      <form className="peca__anotar" onSubmit={anotar}>
        <label>Anotar algo no histórico<textarea rows={2} maxLength={MAX_ANOTACAO} value={nota} disabled={!liberada} onChange={(e) => setNota(e.target.value)} /></label>
        <button type="submit" className="botao botao--navy" disabled={!liberada}>Anotar</button>
        {!liberada && <p className="peca__nota">{dealId ? 'Edição liberada em breve para esta OS.' : 'Sem card do Ploomes para anotar.'}</p>}
        {erro && <p className="campo__erro" role="alert">{erro}</p>}
      </form>
      {eventos.length === 0 ? <p className="peca__vazio">Nenhum evento registrado ainda.</p>
        : <ol className="peca__eventos">{eventos.map((e) => <Evento key={e.chave} e={e} />)}</ol>}
    </>
  );
}

function Evento({ e }: { e: EventoPeca }) {
  return (
    <li className="peca__evento">
      <span className="peca__quando">{dataHora(e.quando)}</span>
      <span className={`peca__selo peca__selo--${e.fonte.toLowerCase()}`}>{ROTULO_FONTE[e.fonte]}</span>
      <div>
        <p className={e.desfeita ? 'peca__desfeita' : undefined}>{e.desfeita ? <s>{e.texto}</s> : e.texto}{e.desfeita && ' (desfeita)'}</p>
        <small>{[e.autor, e.enviadoPloomes ? 'enviado ao Ploomes' : ''].filter(Boolean).join(' · ')}</small>
      </div>
    </li>
  );
}

function CaixasEFaltas({ board, os }: { board: Board; os: string }) {
  const caixas = caixasDaOs(board, os);
  if (!caixas.length) return <p className="peca__vazio">Nenhuma caixa desta OS no almoxarifado ainda.</p>;
  return (
    <div className="peca__caixas">{caixas.map((c, k) => {
      const ciclo = c.ciclo === 'CORTE' ? 'Corte' : 'Pedido';
      return (
        <section key={`${c.id}-${c.tipo}-${c.ciclo}-${k}`} className="peca__caixa" aria-label={`Caixa de ${nomeDoTipo(c.tipo)} · ${ciclo}`}>
          <h3>Caixa de {nomeDoTipo(c.tipo)} <span>{ciclo} · {c.saiu ? `saiu ${ddmm(c.saiuEm)}`.trim() : 'no almoxarifado'}</span></h3>
          {c.itens.length === 0 ? <p className="peca__vazio">Sem itens.</p> : <div className="peca__tabela"><table>
            <thead><tr><th>Item</th><th>Falta</th><th>Baixado</th><th>Resta</th><th>Previsão</th><th>Pedido</th></tr></thead>
            <tbody>{c.itens.map((i) => <tr key={i.id} className={itemAberto(i) ? undefined : 'peca__item--ok'}>
              <td>{i.nome}{i.cor && <small> {i.cor}</small>}</td><td>{i.falta ?? '—'} {i.un}</td><td>{i.baixada}</td>
              <td>{i.resta ?? '—'}</td><td>{ddmm(i.previsao) || '—'}</td><td>{i.pedidoId || 'Sem pedido'}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      );
    })}</div>
  );
}

function OficinaEPrazos({ producao }: { producao: Producao | undefined }) {
  if (!producao) return <p className="peca__vazio">Esta OS não está no Controle de produção (só entram as OS na Costura ou previstas para ela).</p>;
  const alteracoes = producao.historico.filter((h) => !h.acao || h.acao === 'PRODUCAO_ALTERAR_COMBINADO');
  return (
    <>
      <dl className="peca__dados">
        <div><dt>Oficina</dt><dd>{producao.oficina}</dd></div>
        <div><dt>Início</dt><dd>{ddmm(producao.inicioCostura) || '—'}</dd></div>
        <div><dt>Data combinada</dt><dd>{ddmm(producao.dataCombinada) || '—'}</dd></div>
        <div><dt>Lead time</dt><dd>{ddmm(producao.leadTime) || '—'}</dd></div>
        <div><dt>Peças</dt><dd>{producao.pecas ?? '—'}</dd></div>
      </dl>
      <h3>Alterações do combinado</h3>
      {alteracoes.length === 0 ? <p className="peca__vazio">Nenhuma alteração registrada.</p>
        : <ol className="peca__eventos">{alteracoes.map((h, k) => <li key={h.id ?? `${h.quando}-${k}`} className="peca__evento peca__evento--simples">
          <span className="peca__quando">{dataHora(h.quando)}</span><div><p>{h.texto}</p><small>{h.usuario}</small></div>
        </li>)}</ol>}
      <p className="peca__nota">A oficina e a data combinada mudam no painel da OS em Controle de produção. <a href="#producao">Abrir Controle de produção</a></p>
    </>
  );
}
```

- [ ] **Passo 3: estilos** — criar `web/src/styles/f5.css` e importar em `web/src/main.tsx` logo depois de `import './styles/f4.css';` (`import './styles/f5.css';`):

```css
/* F5a · Visão da peça (dossiê da OS). Tokens de app.css, mrbl.css e ds/tokens. */
.peca { display: flex; flex-direction: column; gap: 16px; padding: 16px 24px 32px; min-width: 0; }
.peca__busca { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.peca__busca label { display: flex; flex-direction: column; gap: 4px; flex: 1 1 260px; max-width: 380px; font-size: 12px; color: var(--suave); }
.peca__busca input { height: 34px; padding: 0 10px; border: 1px solid var(--borda); border-radius: 4px; background: #fff; color: var(--texto); font: inherit; font-size: 13.5px; }
.peca__vazio { margin: 0; color: var(--suave); font-size: 13px; }
.peca__aviso { margin: 0; padding: 8px 12px; border-radius: 4px; background: var(--erro-bg); color: var(--erro-text); font-size: 13px; }
.peca__nota { margin: 0; color: var(--suave); font-size: 12px; }
.peca__candidatos h2 { margin: 0 0 8px; font-size: 14px; }
.peca__candidatos ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-width: 640px; }
.peca__candidatos a { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 12px; padding: 10px 12px; border: 1px solid var(--borda); border-radius: 5px; background: #fff; color: var(--texto); text-decoration: none; }
.peca__candidatos a:hover { border-color: var(--navy); }
.peca__candidatos strong { font-family: var(--font-mono); }
.peca__dossie { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--borda); border-radius: 5px; background: #fff; }
.peca__cabecalho { display: flex; flex-direction: column; gap: 10px; padding: 16px 20px 14px; border-bottom: 1px solid var(--borda); }
.peca__sobre { font-family: var(--font-mono); font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--leve); }
.peca__titulo { display: flex; align-items: baseline; gap: 6px 14px; flex-wrap: wrap; min-width: 0; }
.peca__os { margin: 0; font-family: var(--font-mono); font-size: 30px; font-weight: 700; line-height: 1; }
.peca__nome { font-size: 19px; font-weight: 700; overflow-wrap: anywhere; }
.peca__cliente, .peca__ref { font-size: 14px; color: var(--suave); }
.peca__links { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; }
.peca__links a { color: var(--navy); }
.peca__trilha { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.peca__trilha li { padding: 4px 8px; border-radius: 3px; background: var(--canvas); color: var(--suave); font-size: 11.5px; }
.peca__trilha li[aria-current] { background: var(--navy); color: #fff; font-weight: 700; }
.peca__corpo { display: grid; grid-template-columns: 384px minmax(0, 1fr); min-height: 0; }
.peca__lateral { display: flex; flex-direction: column; gap: 16px; padding: 18px; background: var(--paper); border-right: 1px solid var(--borda); min-width: 0; }
.peca__prazo { padding: 12px 14px; border-radius: 5px; background: var(--canvas); color: var(--texto); font-size: 14px; font-weight: 700; }
.peca__prazo--atrasada { background: var(--erro-bg); color: var(--erro-text); }
.peca__prazo--em_breve { background: var(--falta-bg); color: var(--falta); }
.peca__prazo--no_prazo { background: var(--ok-bg); color: var(--ok-text); }
.peca__bloco h2 { margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--suave); }
.peca__bloco dl, .peca__dados { margin: 0; display: flex; flex-direction: column; gap: 4px; }
.peca__bloco dl div, .peca__dados div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px; font-size: 13px; }
.peca__bloco dt, .peca__dados dt { color: var(--suave); }
.peca__bloco dd, .peca__dados dd { margin: 0; overflow-wrap: anywhere; }
.peca__principal { display: flex; flex-direction: column; min-width: 0; }
.peca__abas { display: flex; gap: 2px; padding: 0 16px; border-bottom: 1px solid var(--borda); overflow-x: auto; }
.peca__abas button { padding: 12px 10px; border: 0; background: none; color: var(--suave); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; box-shadow: inset 0 -2px 0 transparent; }
.peca__abas button[aria-selected='true'] { color: var(--texto); font-weight: 700; box-shadow: inset 0 -2px 0 var(--signal); }
.peca__abas button:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.peca__painel { display: flex; flex-direction: column; gap: 14px; max-width: 900px; min-width: 0; padding: 16px 20px 24px; }
.peca__painel h3 { margin: 0; font-size: 13px; }
.peca__anotar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 8px; align-items: end; }
.peca__anotar label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--suave); }
.peca__anotar textarea { padding: 6px 10px; border: 1px solid var(--borda); border-radius: 4px; font: inherit; font-size: 13px; resize: vertical; }
.peca__anotar .peca__nota, .peca__anotar .campo__erro { grid-column: 1 / -1; }
.peca__eventos { list-style: none; margin: 0; padding: 0; }
.peca__evento { display: grid; grid-template-columns: 96px 108px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 10px 0; border-bottom: 1px solid var(--paper-3); }
.peca__evento--simples { grid-template-columns: 96px minmax(0, 1fr); }
.peca__evento p { margin: 0; font-size: 13px; line-height: 1.5; white-space: pre-line; overflow-wrap: anywhere; }
.peca__evento small { font-family: var(--font-mono); font-size: 10px; color: var(--navy); }
.peca__quando { font-family: var(--font-mono); font-size: 11px; color: var(--leve); }
.peca__selo { justify-self: start; padding: 1px 7px; border-radius: 3px; background: var(--canvas); color: var(--suave); font-family: var(--font-mono); font-size: 10px; font-weight: 700; }
.peca__selo--ploomes { background: var(--navy-tint); color: var(--navy); }
.peca__selo--etapa { background: var(--signal-tint); color: var(--signal-lo); }
.peca__selo--almoxarifado { background: var(--falta-bg); color: var(--falta); }
.peca__selo--compras { background: rgba(47, 85, 212, .1); color: var(--tipo-acabamento); }
.peca__selo--producao { background: var(--ok-bg); color: var(--ok-text); }
.peca__selo--whatsapp { background: rgba(37, 211, 102, .12); color: #137a3d; }
.peca__selo--anotacao { background: var(--paper-2); color: var(--texto); }
.peca__desfeita s { color: var(--suave); }
.peca__caixas { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.peca__caixa { min-width: 0; padding: 12px 14px; border: 1px solid var(--borda); border-radius: 5px; }
.peca__caixa h3 { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin: 0 0 8px; font-size: 13px; }
.peca__caixa h3 span { color: var(--suave); font-size: 12px; font-weight: 400; }
.peca__tabela { overflow-x: auto; }
.peca__tabela table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.peca__tabela th { padding: 4px 6px; border-bottom: 1px solid var(--borda); color: var(--suave); font-weight: 600; text-align: left; }
.peca__tabela td { padding: 6px; border-bottom: 1px solid var(--paper-3); }
.peca__item--ok td { color: var(--leve); }
@media (max-width: 900px) {
  .peca { padding: 12px 16px 24px; }
  .peca__corpo { grid-template-columns: minmax(0, 1fr); }
  .peca__lateral { border-right: 0; border-bottom: 1px solid var(--borda); }
  .peca__evento, .peca__evento--simples { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .peca__caixas { grid-template-columns: minmax(0, 1fr); }
  .peca__candidatos a { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
```

- [ ] **Passo 4: rodar**

Run: `cd web && npx tsc -b && npx vitest run && CI=1 npx playwright test e2e/f5a-peca.spec.ts`
Expected: PASS.

- [ ] **Passo 5: commit**

```bash
git add web/src web/e2e/f5a-peca.spec.ts
git commit -m "feat: tela da Visão da peça (busca, dossiê, abas e anotação)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Link "Ver visão da peça" nos painéis

**Arquivos:**
- Criar: `web/src/componentes/LinkPeca.tsx`
- Modificar: `web/src/componentes/PainelCaixa.tsx`, `web/src/componentes/painel/CabecalhoCaixa.tsx`, `web/src/componentes/pedidos/PainelPedido.tsx`, `web/src/telas/Producao.tsx`
- Teste: `web/e2e/f5a-peca.spec.ts`

**Interfaces:** `LinkPeca({ os, className?, rotulo? })` → `<a href="#peca/<os>">Ver visão da peça</a>` (nada quando `os` vazio).

- [ ] **Passo 1: e2e que falha** — acrescentar em `web/e2e/f5a-peca.spec.ts`:

```ts
test('link nos painéis: caixa (No Ploomes) e OS (Controle de produção) abrem a Visão da peça', async ({ page }) => {
  await entrar(page, '');
  await page.getByRole('button', { name: 'OS 90002' }).click();
  await page.getByRole('complementary', { name: 'Caixa da OS 90002' }).getByRole('link', { name: 'Ver visão da peça' }).click();
  await expect(page).toHaveURL(/#peca\/90002$/);
  await expect(page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Visão das peças' })).toHaveAttribute('aria-current', 'page');
  await expect(dossie(page, '90002')).toBeVisible();
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('button', { name: 'Controle de produção' }).click();
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  await page.getByRole('complementary', { name: 'Detalhes da OS 90002' }).getByRole('link', { name: 'Ver visão da peça' }).click();
  await expect(page).toHaveURL(/#peca\/90002$/);
  await expect(dossie(page, '90002')).toBeVisible();
});

test('link no painel do pedido: um por OS quando o pedido junta várias', async ({ page }) => {
  await entrar(page, '#pedidos');
  await page.getByRole('region', { name: 'A pedir' }).getByRole('button', { name: 'Pedido PED-0042' }).click();
  const painel = page.getByRole('complementary', { name: 'Pedido PED-0042' });
  await expect(painel.getByRole('link', { name: 'Ver visão da peça · OS 90001' })).toHaveAttribute('href', '#peca/90001');
  await painel.getByRole('link', { name: 'Ver visão da peça · OS 90002' }).click();
  await expect(page).toHaveURL(/#peca\/90002$/);
  await expect(dossie(page, '90002')).toBeVisible();
});
```

Run: `cd web && CI=1 npx playwright test e2e/f5a-peca.spec.ts -g "link"` → FAIL.

- [ ] **Passo 2: componente** — `web/src/componentes/LinkPeca.tsx`:

```tsx
import { hashDaPeca } from '../regras/telas';

// Leva à Visão da peça (#peca/<OS>), na mesma aba: o hash troca a guia.
export function LinkPeca({ os, className = 'painel__link', rotulo }: { os: string; className?: string; rotulo?: string }) {
  if (!os.trim()) return null;
  return <a className={className} href={hashDaPeca(os)}>{rotulo ?? 'Ver visão da peça'}</a>;
}
```

- [ ] **Passo 3: painéis**
  - `web/src/componentes/PainelCaixa.tsx`: `import { LinkPeca } from './LinkPeca';` e, logo depois de `<a className="painel__link" href={URL_PLOOMES + caixa.dealId} ...>Abrir card no Ploomes</a>`, `<LinkPeca os={caixa.os} />`.
  - `web/src/componentes/painel/CabecalhoCaixa.tsx`: `import { LinkPeca } from '../LinkPeca';` e o mesmo `<LinkPeca os={caixa.os} />` depois do link do Ploomes.
  - `web/src/telas/Producao.tsx`: `import { LinkPeca } from '../componentes/LinkPeca';` e, logo depois de `<a className="producao-link" href={`https://app10.ploomes.com/deal/${item.dealId}`} ...>Abrir card no Ploomes</a>`, `<LinkPeca os={item.os} className="producao-link" />`.
  - `web/src/componentes/pedidos/PainelPedido.tsx`: `import { LinkPeca } from '../LinkPeca';`; imediatamente antes de `  return (\n    <aside className="painel" aria-label={\`Pedido ${pedido.id}\`}>`:

```tsx
  const osDoPedido = [...new Set(pedido.itens.map((i) => i.os).filter(Boolean))];
```

e, depois de `{familia && <div className="painel__meta painel__familia">{familia}</div>}`:

```tsx
        {osDoPedido.map((os) => <LinkPeca key={os} os={os} rotulo={osDoPedido.length > 1 ? `Ver visão da peça · OS ${os}` : undefined} />)}
```

- [ ] **Passo 4: rodar**

Run: `cd web && npx tsc -b && npx vitest run && CI=1 npx playwright test`
Expected: PASS (todos os e2e; o `.painel__link` empilha os dois links no cabeçalho — confira no `dev-mock` que não quebra o layout).

- [ ] **Passo 5: commit**

```bash
git add web/src web/e2e/f5a-peca.spec.ts
git commit -m "feat: link Ver visão da peça nos painéis de caixa, saída, pedido e produção

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Simulador, celular e e2e contra o mock

**Arquivos:**
- Modificar: `web/scripts/mock-api.mjs`, `web/e2e/mock-servidor.spec.ts`, `web/e2e/f5a-peca.spec.ts`

**Interfaces:** `GET /pcp-peca?q=` no mock: OS 90002 com dois cards (Produção `700002` e PCP `790002`), registros (um do app, que fica de fora) e trocas (uma desfeita); qualquer OS do mock vira um card de Produção; `REF-COMUM` → lista 90002 e 90003; referência de uma OS só → lista de uma; OS `90005` → 502; nada → 404. Ação `anotar_peca` com as regras do servidor; board com `anotacoes`.

- [ ] **Passo 1: e2e que falham**

Em `web/e2e/f5a-peca.spec.ts`:

```ts
test('celular (375 px): lateral acima das abas e nada estoura a largura', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page, '#peca/90002');
  const lateral = page.getByRole('complementary', { name: 'Resumo da OS' });
  const abas = page.getByRole('tablist', { name: 'Seções da OS' });
  await expect(abas).toBeVisible();
  expect((await lateral.boundingBox())!.y).toBeLessThan((await abas.boundingBox())!.y);
  for (const aba of ['Linha do tempo', 'Caixas e faltas', 'Oficina e prazos', 'WhatsApp']) {
    await page.getByRole('tab', { name: aba }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});
```

Em `web/e2e/mock-servidor.spec.ts`, no fim:

```ts
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
```

Run: `cd web && CI=1 npx playwright test e2e/mock-servidor.spec.ts -g "Visão da peça"` → FAIL (404 do mock).

- [ ] **Passo 2: simulador** — em `web/scripts/mock-api.mjs`:

1. No comentário do topo, acrescentar a linha: `// Visão da peça (pcp-peca): OS 90002 com dois cards, registros e troca desfeita; REF-COMUM lista 90002 e 90003; OS 90005 simula o Ploomes fora (502).`
2. Depois de `let seqDemanda = 0;`: `let seqAnotacao = 0;`
3. Depois da linha `  dealsProducaoEditaveis: ['700002', '700003', '700005', '700011'],`:

```js
  anotacoes: [{ id: 'ANOT-0', quando: new Date(Date.now() - 2 * 86_400_000).toISOString(), usuario: 'Renata', texto: 'Renata anotou: "Cliente confirmou a cor do viés."', dealId: '700002', os: '90002', criadoMs: 0 }],
```

4. Em `montarBoard`, depois de `previsaoSemHistorico: estado.previsaoSemHistorico,`:

```js
    anotacoes: estado.anotacoes.map(({ criadoMs, ...a }) => ({ ...a, ploomes: criadoMs && agora - criadoMs < ENVIO_PLOOMES_MS ? 'PENDENTE' : 'ENVIADO' })),
```

5. Antes de `function processar(corpo, usuario) {`:

```js
// ---------- Visão da peça ----------
// Como o servidor (n8n/src/peca.js): Ploomes lido na hora; registros do app ("[PCP · OS") ficam de fora.
const ETAPAS_PRODUCAO_MOCK = ['12. Encaixe', '13. Estratégico 2', '14. Corte', '15. Preparação 1', '16. 1ª Peça', '17. Costura', '18. Acabamento', '19. Expedição']
  .map((nome, k) => ({ id: String(60100 + k), nome, ordem: k + 1 }));
const horas = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const ossDoMock = () => [...new Set([...estado.producao.map((p) => p.os), ...estado.caixas.map((c) => c.os)])];
function dadosDaOs(os) {
  const p = estado.producao.find((x) => x.os === os);
  const c = estado.caixas.find((x) => x.os === os);
  return { p, c, peca: p?.peca ?? c?.peca ?? '', cliente: p?.cliente ?? c?.cliente ?? '', referencia: p?.referencia ?? c?.referencia ?? '', dealId: p?.dealId ?? `8${os}` };
}
function dossieMock(os) {
  const d = dadosDaOs(os);
  const etapa = ETAPAS_PRODUCAO_MOCK[d.p?.prevista ? 2 : 5];
  const base = { titulo: `OS ${os}`, cliente: d.cliente, peca: d.peca, referencia: d.referencia, os };
  const cards = [{ ...base, dealId: d.dealId, funilId: 60015827, funil: 'Produção', etapaId: Number(etapa.id), etapa: etapa.nome, etapaOrdem: etapa.ordem,
    atualizadoEm: horas(-1), link: `https://app10.ploomes.com/deal/${d.dealId}` }];
  if (os === '90002') cards.push({ ...base, dealId: '790002', funilId: 60011710, funil: 'PCP', etapaId: 60200, etapa: 'Concluído', etapaOrdem: 9,
    atualizadoEm: horas(-48), link: 'https://app10.ploomes.com/deal/790002' });
  const registros = os === '90002' ? [
    { quando: horas(-30), fonte: 'PLOOMES', texto: 'Cliente pediu para conferir a cor do viés antes do corte.', autor: 'Renata', dealId: d.dealId },
    { quando: horas(-2), fonte: 'PLOOMES', texto: '[PCP · OS 90002] Atualizações do app PCP\n• 10:00 Lucca deu baixa', autor: 'Integração', dealId: d.dealId }
  ] : [];
  const trocas = [{ quando: horas(-72), fonte: 'ETAPA', texto: `Produção: ${ETAPAS_PRODUCAO_MOCK[4].nome} → ${ETAPAS_PRODUCAO_MOCK[5].nome}`, autor: '', dealId: d.dealId }];
  if (os === '90002') trocas.push({ quando: horas(-96), fonte: 'ETAPA', texto: `Produção: ${ETAPAS_PRODUCAO_MOCK[3].nome} → ${ETAPAS_PRODUCAO_MOCK[4].nome}`, autor: '', dealId: d.dealId, desfeita: true });
  const eventos = [...registros.filter((r) => !r.texto.startsWith('[PCP · OS')), ...trocas].sort((a, b) => b.quando.localeCompare(a.quando));
  return { geradoEm: agoraIso(), os, cards, trilha: { funil: 'Produção', dealId: d.dealId, etapas: ETAPAS_PRODUCAO_MOCK, atualId: etapa.id }, eventos };
}
function pecaMock(q) {
  const v = String(q ?? '').trim().replace(/\s+/g, ' ');
  if (!v || v.length > 60) throw bad('Informe a OS ou a referência.');
  const oss = ossDoMock();
  if (/^\d+$/.test(v) && oss.includes(v)) {
    if (v === '90005') throw new Erro(502, 'Não foi possível ler o Ploomes agora.');
    return dossieMock(v);
  }
  const ref = semAcento(v).toUpperCase();
  const achadas = ref === 'REF-COMUM' ? ['90002', '90003'] : oss.filter((os) => semAcento(dadosDaOs(os).referencia).toUpperCase() === ref);
  if (!achadas.length) throw new Erro(404, 'Nenhuma OS encontrada no Ploomes.');
  return {
    geradoEm: agoraIso(), os: '', cards: [], trilha: null, eventos: [],
    candidatos: achadas.map((os) => ({ os, peca: dadosDaOs(os).peca, etapa: '17. Costura', funil: 'Produção', dealId: dadosDaOs(os).dealId }))
  };
}
function anotarPeca(c, usuario) {
  const bruto = typeof c.texto === 'string' ? c.texto.replace(/\r\n?/g, '\n').trim() : '';
  if (!/^[0-9A-Za-z./-]{1,20}$/.test(String(c.os ?? '').trim())) throw bad('Informe a OS.');
  if (!/^\d{1,20}$/.test(String(c.dealId ?? ''))) throw bad('Informe o card do Ploomes.');
  if (/\n[ \t]*\n/.test(bruto)) throw bad('A anotação não pode ter linha em branco.');
  const t = bruto.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ');
  if (!t) throw bad('Escreva a anotação.');
  if (t.length > 500) throw bad('Anotação com no máximo 500 caracteres.');
  const listas = [estado.dealsEditaveis, estado.dealsProducaoEditaveis];
  if (listas.every((l) => l.length) && !listas.some((l) => l.includes(String(c.dealId)))) throw new Erro(403, 'Edição liberada em breve para esta OS.');
  const a = { id: `ANOT-${++seqAnotacao}`, quando: agoraIso(), usuario, texto: `${usuario} anotou: "${t}"`, dealId: String(c.dealId), os: String(c.os).trim(), criadoMs: Date.now() };
  estado.anotacoes.unshift(a);
  return resposta(a.quando, [{ quando: a.quando, usuario, texto: a.texto, ploomes: 'PENDENTE', dealId: a.dealId }], { anotacaoId: a.id });
}
```

6. Em `processar`, antes de `case 'salvar_etapas':`: `case 'anotar_peca': return anotarPeca(corpo, usuario);`
7. No servidor HTTP, depois da linha do `/pcp-board`:

```js
    if (rota === '/pcp-peca' && req.method === 'GET') return enviar(res, 200, pecaMock(new URLSearchParams(busca).get('q')));
```

8. No `console.log` do `listen`, trocar `(pcp-login, pcp-board, pcp-acao)` por `(pcp-login, pcp-board, pcp-peca, pcp-acao)` (o `mock-servidor.spec.ts` espera só o prefixo "Mock da API").

- [ ] **Passo 3: rodar**

Run: `cd web && CI=1 npx playwright test e2e/f5a-peca.spec.ts e2e/mock-servidor.spec.ts`
Expected: PASS. Depois, conferência manual: `cd web && node scripts/dev-mock.mjs`, abrir `http://localhost:5174/pcp-mrbl/#peca/90002` (qualquer login), olhar as cinco abas, anotar e ver o "Você anotou" virar "Lucca anotou"; buscar `REF-COMUM` e `90005`; repetir com a janela em 375 px.

- [ ] **Passo 4: commit**

```bash
git add web/scripts/mock-api.mjs web/e2e
git commit -m "feat: Visão da peça no simulador e e2e de celular e do mock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Roteiro de publicação (`n8n/workflows/README.md`)

**Arquivos:**
- Modificar: `n8n/workflows/README.md`

- [ ] **Passo 1: parágrafo novo** — logo depois do parágrafo que começa com `**Associador por IA (22/10).**`, acrescentar:

```markdown
**Visão da peça (F5a, 27/10).** Spec: `docs/superpowers/specs/2026-10-27-f5a-visao-da-peca-design.md`. A API (`pcp-api` e `pcp-api-homolog`) ganha o webhook **GET `pcp-peca`** (homolog `pcp-peca-h`), com `?q=` = OS ou referência e o mesmo `Authorization: Bearer` do board: **Peça** → **Validar Peça** (sessão, busca, cache de 60 s no static data, até 50 buscas) → **Peça Pronta?** → (não) **Buscar Cards da Peça** (`Deals` filtrado pelo campo OS em texto ou número, ou pela referência; até 50, ficam os 5 mais recentes da OS) → **Preparar Leituras da Peça** → **Peça Pronta (Cards)?** → (não) **Buscar Registros da Peça** (`InteractionRecords`, até 200) → **Buscar Trocas de Etapa** (`DealsStagesHistory`, até 200) → **Buscar Etapas do Funil** (`DealsStages`) → **Montar Peça** → **Responder Peça**. Os quatro GET usam a credencial `Header Auth account` (`QfXOyNly69oAqwH2`), sem retry e com `continueRegularOutput`: falha do Ploomes responde **502** "Não foi possível ler o Ploomes agora." e o site mostra o dossiê só com o board. Nada achado: **404** "Nenhuma OS encontrada no Ploomes.". Referência com mais de uma OS devolve `candidatos`. Registros que começam com `[PCP · OS` (os do envio compilado do app) não viram evento. O site deriva a URL do `pcp-peca` da `VITE_API_BOARD` (nenhuma variável nova no GitHub). A ação nova **`anotar_peca`** (`pcp-acao`) grava uma linha `ANOTACAO` no HISTORICO_APP (append, sem PATCH no Ploomes) que entra no registro compilado como as outras; até o go-live só nos deals de `DEALS_EDITAVEIS` ∪ `DEALS_PRODUCAO_EDITAVEIS` (403 fora deles). O board passa a mandar `anotacoes` e `id`/`acao` no histórico (o site antigo ignora). Nenhuma aba ou coluna nova.

Publicação da F5a (homologação primeiro, só com o ok do dono para a produção):

1. `cd n8n && npm test && npm run build`; `cd web && npm test && npm run build && CI=1 npx playwright test`; push da branch; anote o hash do commit.
2. Anote o `versionId` atual do **"PCP MRBL - API (homolog)"** (`dI2NUYzxfApYM8iA`) para o rollback.
3. Rode o **"Utilitario - Deploy PCP (manual)"** com `workflows/json/pcp-api-homolog.json` do commit fixado. Gravar num workflow ativo publica na hora; confira que `https://mrbl-automacoes.duckdns.org/webhook/pcp-peca-h` responde (sem token: 401 "Sessão expirada."). Se der 404, desative e reative o homolog para registrar o webhook novo.
4. Teste com o site local apontando para os webhooks `-h` (arquivo `web/.env.local`, fora do Git, com `VITE_API_LOGIN`, `VITE_API_BOARD` e `VITE_API_ACAO` terminando em `-h`; `cd web && npx vite --port 5174`), **só na OS 123456** (card de teste 607612577):
   - `#peca/123456`: cards da OS (Produção e os outros funis), trilha do funil de Produção com a etapa atual, registros de interação do card e trocas de etapa (troca desfeita riscada); nenhum registro `[PCP · OS ...]` como evento Ploomes;
   - a busca pela referência do card de teste abre a OS (ou lista as OS da referência);
   - link **Ver visão da peça** no painel da OS em Controle de produção;
   - **Anotar**: "Teste da Visão da peça (homologação)" → linha `ANOTACAO` no HISTORICO_APP com `deal_id` 607612577 e `os` 123456; depois de ~12 min, registro compilado no card 607612577 com "anotou:"; reabrindo a tela depois de 60 s, a anotação aparece com "enviado ao Ploomes" e o registro compilado **não** aparece como evento Ploomes;
   - ERROS_APP sem linhas novas; tempo de resposta do `pcp-peca-h` (anote).
5. Se o filtro do campo OS der 400 no Ploomes (tipo do campo), ajuste `urlCardsPeca` em `src/peca.js` (deixe só `StringValue` ou só `IntegerValue`), rode os testes, o build e repita do passo 1. O mesmo para os caminhos `DealsStagesHistory`/`DealsStages` e o campo `Ordination` (constantes no topo de `src/peca.js`).
6. Rollback: volte o `versionId` anotado. O site em produção não muda até o merge na `main`.
```

- [ ] **Passo 2: referência** — na seção `### PCP MRBL - API (id: WpuXpcSa5oGiEkTm)`:
  - na tabela de webhooks, depois da linha do Board: `| Peça (GET) | https://mrbl-automacoes.duckdns.org/webhook/pcp-peca |`;
  - em "Nodes hoje", depois do item **Board**: `- **Peça** (F5a): Peça → Validar Peça → Peça Pronta? → (não) Buscar Cards da Peça → Preparar Leituras da Peça → Peça Pronta (Cards)? → (não) Buscar Registros da Peça → Buscar Trocas de Etapa → Buscar Etapas do Funil → Montar Peça → Responder Peça; (sim, cache de 60 s, erro ou lista de OS) → Responder Peça.`;
  - no parágrafo **Homolog:**, trocar "webhooks `pcp-login-h`, `pcp-board-h`, `pcp-acao-h`" por "webhooks `pcp-login-h`, `pcp-board-h`, `pcp-peca-h`, `pcp-acao-h`".

- [ ] **Passo 3: commit**

```bash
git add n8n/workflows/README.md
git commit -m "docs: roteiro de publicação da Visão da peça

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Revisão final da branch

- [ ] **Passo 1:** `cd n8n && npm test && npm run build && git status --short` → testes verdes e nenhum arquivo gerado diferente.
- [ ] **Passo 2:** `cd web && npm test && npm run build && CI=1 npx playwright test` → tudo verde.
- [ ] **Passo 3:** conferência no simulador com o dono (`node scripts/dev-mock.mjs`, `http://localhost:5174/pcp-mrbl/#peca/90002`), incluindo celular. Juntar os ajustes pedidos numa rodada só.
- [ ] **Passo 4:** revisão final da branch (superpowers:requesting-code-review) contra o spec: busca, cabeçalho e links, trilha, lateral, cinco abas, anotação otimista, 375 px, endpoint, cache, limites, 502/404, allowlist, sem duplicar registros do app.

---

### Tarefa 13: Publicação na homologação (orquestrador, não subagente)

Executada pelo orquestrador, com o ok do dono, seguindo o roteiro da Tarefa 11. **Não publicar a API de produção nem fazer merge na `main`.**

- [ ] **Passo 1:** push da branch `f4-gantt-whatsapp`; anotar o hash do commit.
- [ ] **Passo 2:** pelo MCP do n8n, ler o "PCP MRBL - API (homolog)" (`dI2NUYzxfApYM8iA`) e anotar o `versionId` atual.
- [ ] **Passo 3:** rodar o "Utilitario - Deploy PCP (manual)" (id `fzSTmObQZQP7vr2i`) com `n8n/workflows/json/pcp-api-homolog.json` daquele commit. Conferir que o homolog continua ativo e que `pcp-peca-h` responde 401 sem token.
- [ ] **Passo 4:** teste na OS 123456 (card 607612577) com o site local apontando para os `-h`, pelos itens do passo 4 do roteiro. Leitura do HISTORICO_APP e da ERROS_APP pela planilha (sem ordenar nem apagar nada).
- [ ] **Passo 5:** se algo do Ploomes divergir (tipo do campo OS, caminho ou campo das etapas), corrigir em `src/peca.js` com teste, build, commit, push e republicar (passos 2 e 3 de novo).
- [ ] **Passo 6:** registrar em `.superpowers/sdd/progress.md` (fora do Git): commit publicado, `versionId` anterior, resultado do teste e o tempo de resposta. Mostrar ao dono e só depois falar em produção.

---

## Autorrevisão (feita)

- **Cobertura do spec:** §2 guia e busca (T7, T8), link nos painéis e `#peca/<OS>` (T7, T9), leitura do Ploomes (T1, T2, T4), anotação (T3, T5, T8); §3 busca com lista e "nada" (T8), cabeçalho com links por card e HUB (T8), trilha do card principal (T2, T8), lateral com prazo, Produção e Situação hoje (T6, T8), cinco abas e "enviado ao Ploomes" (T6, T8), celular (T8 CSS, T10 e2e); §4.1 endpoint, campos, sem duplicar, cache 60 s, 502, limites 5/200 (T1, T2, T4); §4.2 anotação, allowlist, otimista (T3, T5, T8); §5 regras puras (T6); §6 OS sem dados, Ploomes fora, constante do HUB (T6, T8); §7 testes n8n, web, simulador e homologação (T1–T4, T5–T10, T11, T13).
- **Fora do spec, decidido aqui:** o board ganhou `anotacoes` e `id`/`acao` no histórico (sem isso a anotação num card que não é caixa nem produção sumiria depois da recarga, e a linha do tempo não saberia a fonte de cada evento do app); a busca por referência com uma OS só devolve a lista e o site troca para `#peca/<OS>`; os nomes de etapa são lidos a cada busca (o cache de 60 s da resposta já segura a carga), sem cache próprio de `DealsStages`.
- **Nomes conferidos entre tarefas:** `normalizarBuscaPeca`, `urlCardsPeca`, `cardPecaDoDeal`, `resolverCardsPeca`, `urlsDetalhesPeca`, `cardPrincipalPeca`, `eventosPloomesPeca`, `trilhaPeca`, `validarPedidoPeca`, `prepararLeiturasPeca`, `finalizarPeca`, `validarAnotacaoPeca`, `processarAnotacaoPeca`, `anotacoesDoBoard`, `processarAcaoAnotacao`; nós `Peça`, `Validar Peça`, `Peça Pronta?`, `Buscar Cards da Peça`, `Preparar Leituras da Peça`, `Peça Pronta (Cards)?`, `Buscar Registros da Peça`, `Buscar Trocas de Etapa`, `Buscar Etapas do Funil`, `Montar Peça`, `Responder Peça`; front `buscarPeca`, `urlPeca`, `linhaDoTempo`, `resumoSituacao`, `cardPrincipal`, `dealDaAnotacao`, `podeAnotar`, `erroAnotacao`, `buscaDaPeca`, `hashDaPeca`, `LinkPeca`, `ConversaWhatsapp`.
