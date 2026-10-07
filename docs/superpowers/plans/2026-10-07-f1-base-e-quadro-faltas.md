# F1 — Base do app e quadro "No Ploomes" — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** colocar no ar, no GitHub Pages, o app do PCP da MRBL com login e com o quadro "No Ploomes" (6 colunas de faltas por caixa) lendo os dados reais da planilha por meio do n8n. Nesta fase o app é só de leitura.

**Architecture:**
- O front é Vite + React + TS, em `web/`, publicado no GitHub Pages pelo Actions. Ele só conhece duas URLs de webhook do n8n, informadas no build.
- O backend é um único workflow n8n, "PCP MRBL - API", com dois webhooks (`pcp-login` e `pcp-board`). Sessões, tentativas de login e cache ficam no static data global desse workflow.
- A lógica dos Code nodes fica em `n8n/src/*.js`: JavaScript puro, sem imports, testado com `node:test`. O texto de cada Code node é gerado por `n8n/scripts/gerar-code-nodes.js`, no mesmo padrão do repositório hubPecas.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, n8n (Code, Google Sheets, Webhook, Respond to Webhook, IF), Node 22, GitHub Actions/Pages.

**Spec:** `docs/superpowers/specs/2026-10-07-f1-base-e-quadro-faltas-design.md`

## Global Constraints

- Nenhum segredo no repositório. O repositório é **público**: nada de credencial, senha, hash de senha, nem dado de cliente fora dos fixtures fictícios.
- `design_handoff_pcp_mrbl/` nunca é commitado (já está no `.gitignore`).
- Planilha: `1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww`. Abas lidas: `FALTANTES`, `CAIXAS GANHAS`, `USUARIOS`. A F1 **não escreve** em FALTANTES nem em CAIXAS GANHAS.
- Instância n8n: `https://mrbl-automacoes.duckdns.org`. A credencial do Google Sheets é a mesma service account usada nos outros workflows (descobrir o id com `list_credentials` do MCP do n8n).
- CORS dos webhooks: `https://rslconsultoria.github.io,http://localhost:5173,http://localhost:4173`.
- Endereço do app: `https://rslconsultoria.github.io/pcp-mrbl/`. O `base` do Vite é `/pcp-mrbl/`.
- Link do card no Ploomes: `https://app10.ploomes.com/deal/{dealId}`. A coluna `link_negocio` da planilha é ignorada.
- Sessão de 12h. Login bloqueado depois de 5 falhas em 15 min para o mesmo e-mail. Cache do board de 30 s. Front atualiza a cada 60 s.
- Formato do hash de senha: `pbkdf2$<iterações>$<salt hex>$<hash hex>`, PBKDF2-SHA256, 32 bytes.
- Toda a interface em português do Brasil, sem emoji, sem `alert`/`confirm`.
- Commits terminam com: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Mapa de arquivos

```
.github/workflows/publicar.yml        CI: testes n8n + web + e2e, depois deploy no Pages
n8n/
  package.json                        scripts: test, build, hash-senha
  src/util.js                         texto, numero, dataISO, semAcento
  src/montarCaixas.js                 linhas FALTANTES + CAIXAS GANHAS -> caixas
  src/auth.js                         gerarHash, conferirSenha, gerarToken
  src/api.js                          processarLogin, validarPedidoBoard, montarRespostaBoard
  adaptadores/processar-login.js      cola entre o n8n ($input, $(...)) e src/
  adaptadores/validar-pedido.js
  adaptadores/montar-board.js
  scripts/gerar-code-nodes.js         gera build/*.js (texto dos Code nodes)
  scripts/hash-senha.js               pergunta a senha e imprime o senha_hash
  build/*.js                          GERADO, commitado
  test/carregar.js                    carrega src/ num contexto vm
  test/montarCaixas.test.js
  test/auth-api.test.js
  workflows/pcp-api.sdk.js            código SDK do workflow (versionado)
  workflows/README.md                 nodes, URLs de produção, como atualizar
web/
  index.html, package.json, vite.config.ts, playwright.config.ts, .env.example, .env.e2e
  src/main.tsx, src/App.tsx
  src/api/tipos.ts                    Item, Caixa, Board, Sessao
  src/api/client.ts                   entrar(), buscarBoard(), ApiError
  src/auth/sessao.ts                  lerSessao, salvarSessao, limparSessao
  src/regras/datas.ts                 paraData, diasEntre, textoDias, ddmm, horaMinuto
  src/regras/quantidade.ts            formatarNumero, formatarQtd, contaDoItem
  src/regras/texto.ts                 iniciais, nomeDoTipo, corDoTipo
  src/regras/colunas.ts               COLUNAS, itemAberto, itensAbertos, colunaDaCaixa, visivelNoQuadro
  src/regras/busca.ts                 normalizar, caixaAtendeBusca
  src/hooks/useBoard.ts               polling 60 s + visibilidade + offline
  src/componentes/Icone.tsx, Navbar.tsx, Subnav.tsx, FaixaOffline.tsx
  src/componentes/CardCaixa.tsx, PainelCaixa.tsx
  src/telas/Login.tsx, src/telas/NoPloomes.tsx
  src/styles/ds/**                    cópia dos tokens e do CSS do Soccius DS
  src/styles/mrbl.css                 sobrescritas de cor MRBL
  src/styles/app.css                  estilos das telas
  e2e/f1.spec.ts, e2e/fixtures/board.json
```

---

### Task 1: Conferir o n8n e criar a aba USUARIOS

Gate da fase. O login depende de `require('crypto')` funcionar no Code node.

**Files:**
- Create: nenhum arquivo no repositório. Esta tarefa só atua no n8n e na planilha.

**Interfaces:**
- Produces: confirmação de que `require('crypto')` funciona no Code node, e a aba `USUARIOS` com o cabeçalho `email | nome | perfil | senha_hash | ativo` e uma linha para `lucca@rslconsultoria.com`.

- [ ] **Step 1: Criar o workflow de teste de crypto**

Pelo MCP do n8n, criar um workflow **inativo** chamado `Utilitario - Teste crypto PCP (manual)`, com um Manual Trigger ligado a um Code node com este código:

```js
const c = require('crypto');
const h = c.pbkdf2Sync('a', 'b', 1000, 32, 'sha256').toString('hex');
return [{ json: { ok: typeof c.randomBytes === 'function', h } }];
```

- [ ] **Step 2: Executar e conferir**

Executar pelo MCP (`execute_workflow`) e ler a execução (`get_execution`).
Esperado: `ok: true` e `h` com 64 caracteres hexadecimais.

Se der erro de módulo não permitido (`Cannot find module 'crypto'` ou `not allowed`), **parar a tarefa**. Pedir ao usuário que adicione `NODE_FUNCTION_ALLOW_BUILTIN=crypto` às variáveis do container do n8n na VPS e reinicie o container. Repetir o Step 2 depois disso.

- [ ] **Step 3: Arquivar o workflow de teste**

Usar `archive_workflow` com o id criado no Step 1.

- [ ] **Step 4: Criar a aba USUARIOS**

Criar um workflow inativo `Utilitario - Criar aba USUARIOS PCP (manual)` com esta sequência:
1. Manual Trigger.
2. Google Sheets "Criar Aba": resource `sheet`, operation `create`, título `USUARIOS`, `onError: continueRegularOutput`, `executeOnce: true`.
3. Code "Linha Inicial":
   ```js
   return [{ json: { email: 'lucca@rslconsultoria.com', nome: 'Lucca', perfil: 'ADM', senha_hash: '', ativo: 'SIM' } }];
   ```
4. Google Sheets "Gravar": operation `append`, aba `USUARIOS`, `mappingMode: autoMapInputData`, `cellFormat: RAW`.

Executar uma vez e conferir, lendo a aba com um node de leitura ou pela execução, que existe uma linha com `email = lucca@rslconsultoria.com` e `senha_hash` vazio. Depois arquivar o workflow.

- [ ] **Step 5: Registrar o resultado**

Não há commit nesta tarefa. Anotar no relatório da tarefa: crypto OK (ou o que precisou mudar na VPS) e a aba criada.

---

### Task 2: Montagem das caixas (`n8n/src/util.js` + `montarCaixas.js`)

**Files:**
- Create: `n8n/package.json`, `n8n/src/util.js`, `n8n/src/montarCaixas.js`, `n8n/test/carregar.js`, `n8n/test/montarCaixas.test.js`

**Interfaces:**
- Produces (funções globais, sem `export`, carregadas no mesmo escopo):
  - `texto(v): string`
  - `numero(v): number | null` (devolve `NaN` quando o valor é inválido)
  - `dataISO(v, anoPadrao): string` (`'aaaa-mm-dd'` ou `''`)
  - `semAcento(s): string`
  - `montarCaixas(faltantes: object[], ganhas: object[], hoje: Date): { caixas: Caixa[], avisos: string[] }`
- Formato da Caixa (é o contrato com o front, Task 6):
  - `{ id, dealId, os, ciclo: 'PEDIDO'|'CORTE', tipo, referencia, peca, cliente, responsavel, registradoEm, saiu, saiuComFalta, saiuEm, itens: Item[] }`
- Formato do Item:
  - `{ id, nome, cor, un, necessaria: number|null, separada: number|null, falta: number|null, faltaG: number|null, status, obs, previsao, resolvidoEm }`

- [ ] **Step 1: Criar `n8n/package.json` e o carregador de testes**

```json
{
  "name": "pcp-mrbl-n8n",
  "private": true,
  "scripts": {
    "test": "node --test test/",
    "build": "node scripts/gerar-code-nodes.js",
    "hash-senha": "node scripts/hash-senha.js"
  }
}
```

`n8n/test/carregar.js`:

```js
// Carrega os arquivos de src/ num contexto vm, do mesmo jeito que o n8n
// enxerga o texto do Code node: tudo no mesmo escopo, sem import/export.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQUIVOS = ['util.js', 'auth.js', 'montarCaixas.js', 'api.js'];

function carregar() {
  const ctx = vm.createContext({});
  for (const f of ARQUIVOS) {
    const caminho = path.join(__dirname, '..', 'src', f);
    if (!fs.existsSync(caminho)) continue;
    vm.runInContext(fs.readFileSync(caminho, 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

// Objetos criados dentro do vm tem outro prototipo; a ida e volta por JSON
// deixa o deepStrictEqual comparar so os dados.
function limpo(x) {
  return JSON.parse(JSON.stringify(x));
}

module.exports = { carregar, ARQUIVOS, limpo };
```

- [ ] **Step 2: Escrever os testes que falham**

`n8n/test/montarCaixas.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const HOJE = new Date(2026, 9, 7);

function linha(o) {
  return Object.assign({
    id: '600001|PEDIDO|a', os: '90001', ciclo: 'PEDIDO', referencia: 'REF1',
    descricao_peca: 'PECA TESTE A', cliente: 'CLIENTE ALFA', secao: 'COSTURA',
    cod_item: '', descricao_item: 'ZIPER METAL MEDIO', cor: '00002', nome_cor: 'preto',
    tamanho: '', unidade: 'UN', qtd_necessaria: 52, qtd_separada: 0, qtd_falta: 52,
    qtd_necessaria_g: '', qtd_separada_g: '', qtd_falta_g: '', status: 'ABERTO',
    data_separacao: '2026-10-01 09:00', data_atualizacao: '', data_resolucao: '',
    obs_almoxarifado: '', deal_id: '600001', link_negocio: '', sincronizado_em: ''
  }, o);
}

function ganha(o) {
  return Object.assign({
    data_ganho: '2026-10-03 15:10', os: '90001', referencia: 'REF1',
    descricao_peca: 'PECA TESTE A', cliente: 'CLIENTE ALFA', caixa: 'Caixa de costura',
    saiu_com_falta: 'NÃO', qtd_itens_faltando: 0, itens_faltando: '', conferido_em: 'PEDIDO',
    titulo_card: '', deal_id: '600001', link_negocio: '', atualizado_em: ''
  }, o);
}

test('util: numero, dataISO e semAcento', () => {
  assert.equal(ctx.numero(''), null);
  assert.equal(ctx.numero('163,5'), 163.5);
  assert.ok(Number.isNaN(ctx.numero('abc')));
  assert.equal(ctx.dataISO('2026-10-01 09:00', 2026), '2026-10-01');
  assert.equal(ctx.dataISO('09/10', 2026), '2026-10-09');
  assert.equal(ctx.dataISO('9/10/26', 2026), '2026-10-09');
  assert.equal(ctx.dataISO('ontem', 2026), '');
  assert.equal(ctx.semAcento('Calça Açaí'), 'CALCA ACAI');
});

test('agrupa as linhas de um negocio numa caixa so', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'a' }),
    linha({ id: 'b', descricao_item: 'ETIQUETA TAMANHO (34)', nome_cor: '', cor: '', data_separacao: '2026-09-30 10:00' })
  ], [], HOJE));
  assert.equal(r.caixas.length, 1);
  const c = r.caixas[0];
  assert.equal(c.id, '600001');
  assert.equal(c.os, '90001');
  assert.equal(c.ciclo, 'PEDIDO');
  assert.equal(c.tipo, 'COSTURA');
  assert.equal(c.peca, 'PECA TESTE A');
  assert.equal(c.cliente, 'CLIENTE ALFA');
  assert.equal(c.registradoEm, '2026-09-30');
  assert.equal(c.saiu, false);
  assert.equal(c.itens.length, 2);
  assert.deepEqual(c.itens[0], {
    id: 'a', nome: 'ZIPER METAL MEDIO', cor: 'preto', un: 'UN', necessaria: 52, separada: 0,
    falta: 52, faltaG: null, status: 'ABERTO', obs: '', previsao: '', resolvidoEm: ''
  });
  assert.equal(c.itens[1].cor, '');
});

test('item: cor cai no codigo, obs junta as duas colunas, previsao e gramas', () => {
  const r = limpo(ctx.montarCaixas([linha({
    nome_cor: '', cor: '00002', obs_almoxarifado: 'fornecedor atrasou', observacao_pcp: 'cobrar sexta',
    previsao: '09/10', descricao_item: 'LINHA 120 RESISTENTE', unidade: 'cones', qtd_falta: 2, qtd_falta_g: 100,
    responsavel: 'Maria'
  })], [], HOJE));
  const c = r.caixas[0];
  assert.equal(c.responsavel, 'Maria');
  const i = c.itens[0];
  assert.equal(i.cor, '00002');
  assert.equal(i.obs, 'fornecedor atrasou · cobrar sexta');
  assert.equal(i.previsao, '2026-10-09');
  assert.equal(i.faltaG, 100);
});

test('com linhas de CORTE: caixa vira CORTE, some PEDIDO resolvido, fica PEDIDO aberto', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'p1', status: 'RESOLVIDO', qtd_falta: 0, data_resolucao: '2026-10-02 08:00' }),
    linha({ id: 'p2', descricao_item: 'TAG', status: 'ABERTO' }),
    linha({ id: 'p3', descricao_item: 'LACRE', status: 'SUBSTITUIDO', qtd_falta: 0 }),
    linha({ id: 'c1', ciclo: 'CORTE', descricao_item: 'LACRE', status: 'PARCIAL', qtd_falta: 10, data_separacao: '2026-10-04 10:00' })
  ], [], HOJE));
  const c = r.caixas[0];
  assert.equal(c.ciclo, 'CORTE');
  assert.deepEqual(c.itens.map((i) => i.id), ['p2', 'c1']);
  assert.equal(c.registradoEm, '2026-10-01');
});

test('sem CORTE: itens RESOLVIDO ficam na caixa (contam como resolvidos)', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'a' }),
    linha({ id: 'b', status: 'RESOLVIDO', qtd_falta: 0, data_resolucao: '2026-10-05 11:00' })
  ], [], HOJE));
  assert.deepEqual(r.caixas[0].itens.map((i) => [i.id, i.status, i.resolvidoEm]),
    [['a', 'ABERTO', ''], ['b', 'RESOLVIDO', '2026-10-05']]);
});

test('linhas invalidas viram aviso e nao derrubam o resto', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'sem-deal', deal_id: '' }),
    linha({ id: 'qtd-ruim', qtd_falta: 'muito' }),
    {},
    linha({ id: 'ok' })
  ], [], HOJE));
  assert.equal(r.caixas.length, 1);
  assert.deepEqual(r.caixas[0].itens.map((i) => i.id), ['ok']);
  assert.deepEqual(r.avisos, [
    'FALTANTES linha 2: sem deal_id ou os, ignorada',
    'FALTANTES linha 3 (OS 90001): qtd_falta invalida, ignorada'
  ]);
});

test('cruza com CAIXAS GANHAS: saiu, saiuComFalta e saiuEm', () => {
  const r = limpo(ctx.montarCaixas([linha({})], [ganha({ saiu_com_falta: 'SIM' })], HOJE));
  const c = r.caixas[0];
  assert.equal(c.saiu, true);
  assert.equal(c.saiuComFalta, true);
  assert.equal(c.saiuEm, '2026-10-03');
});

test('caixa so na CAIXAS GANHAS: sem falta fica sem itens; com falta le o texto', () => {
  const r = limpo(ctx.montarCaixas([], [
    ganha({ deal_id: '700001', os: '90002', caixa: 'Caixa de acabamento', saiu_com_falta: 'NÃO', data_ganho: '2026-10-02 10:00' }),
    ganha({
      deal_id: '700002', os: '90003', saiu_com_falta: 'SIM', conferido_em: 'CORTE', data_ganho: '2026-09-18 10:00',
      itens_faltando: 'VIES LINEAR 6 CM (falta 450 MT); LINHA 120 RESIST. PREPARACAO (falta 3 cones); GABARITO'
    })
  ], HOJE));
  const [a, b] = r.caixas.sort((x, y) => x.os.localeCompare(y.os));
  assert.equal(a.os, '90002');
  assert.equal(a.tipo, 'ACABAMENTO');
  assert.equal(a.ciclo, 'PEDIDO');
  assert.equal(a.registradoEm, '2026-10-02');
  assert.deepEqual(a.itens, []);
  assert.equal(b.ciclo, 'CORTE');
  assert.deepEqual(b.itens.map((i) => [i.id, i.nome, i.falta, i.un, i.status]), [
    ['700002|ganha|0', 'VIES LINEAR 6 CM', 450, 'MT', 'ABERTO'],
    ['700002|ganha|1', 'LINHA 120 RESIST. PREPARACAO', 3, 'cones', 'ABERTO'],
    ['700002|ganha|2', 'GABARITO', null, '', 'ABERTO']
  ]);
});

test('ordena as caixas pela data de registro, a mais antiga primeiro', () => {
  const r = limpo(ctx.montarCaixas([
    linha({ id: 'x', deal_id: '2', os: '2', data_separacao: '2026-10-05 10:00' }),
    linha({ id: 'y', deal_id: '1', os: '1', data_separacao: '2026-09-20 10:00' })
  ], [], HOJE));
  assert.deepEqual(r.caixas.map((c) => c.os), ['1', '2']);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd n8n && npm test`
Esperado: FAIL, com `ctx.numero is not a function` ou equivalente.

- [ ] **Step 4: Implementar `n8n/src/util.js`**

```js
// ===== src/util.js =====
// Helpers de leitura das linhas da planilha. Sem import/export: este
// arquivo entra inteiro no texto dos Code nodes do n8n.

function texto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// null = celula vazia; NaN = preenchida com algo que nao e numero.
function numero(v) {
  var t = texto(v).replace(',', '.');
  if (t === '') return null;
  var n = Number(t);
  return isFinite(n) ? n : NaN;
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

// Aceita 'aaaa-mm-dd', 'aaaa-mm-dd hh:mm', 'dd/mm/aaaa', 'dd/mm/aa' e
// 'dd/mm' (usa anoPadrao). Devolve 'aaaa-mm-dd' ou '' quando nao reconhece.
function dataISO(v, anoPadrao) {
  var t = texto(v);
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) {
    var ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(anoPadrao);
    return ano + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1]));
  }
  return '';
}

function semAcento(s) {
  return texto(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
```

- [ ] **Step 5: Implementar `n8n/src/montarCaixas.js`**

```js
// ===== src/montarCaixas.js =====
// Junta as linhas das abas FALTANTES e CAIXAS GANHAS em uma caixa por
// negocio (deal_id) - um card por caixa fisica. Funcao pura.
// Regras (spec da F1):
//  - SUBSTITUIDO nunca vira item (foi trocado pela linha do CORTE).
//  - Se o negocio tem linhas de CORTE, a caixa e CORTE: entram os itens do
//    CORTE e os do PEDIDO ainda abertos (o sync nao mexe em material que
//    nao aparece no corte).
//  - saiu / saiuComFalta / saiuEm vem da CAIXAS GANHAS pelo deal_id.
//  - Caixa so na CAIXAS GANHAS com saiu_com_falta = SIM: itens lidos do
//    texto itens_faltando ("DESC (falta N UN); ...").

var STATUS_ABERTOS = { ABERTO: 1, PARCIAL: 1 };

function tipoDaSecao(v) {
  var n = semAcento(v);
  if (n.indexOf('ACABAMENTO') >= 0) return 'ACABAMENTO';
  if (n.indexOf('COSTURA') >= 0) return 'COSTURA';
  if (n.indexOf('PREPARA') >= 0) return 'PREPARACAO';
  return n;
}

function itemEstaAberto(it) {
  return !!STATUS_ABERTOS[it.status] && (it.falta === null || it.falta > 0);
}

function itemDaLinha(l, ano) {
  var obs = [texto(l.obs_almoxarifado), texto(l.observacao_pcp)]
    .filter(function (s) { return s !== ''; }).join(' · ');
  var nec = numero(l.qtd_necessaria);
  var sep = numero(l.qtd_separada);
  var falta = numero(l.qtd_falta);
  var faltaG = numero(l.qtd_falta_g);
  return {
    id: texto(l.id),
    nome: texto(l.descricao_item),
    cor: texto(l.nome_cor) || texto(l.cor),
    un: texto(l.unidade),
    necessaria: isNaN(nec) ? null : nec,
    separada: isNaN(sep) ? null : sep,
    falta: falta === null ? 0 : falta,
    faltaG: faltaG === null || isNaN(faltaG) ? null : faltaG,
    status: texto(l.status).toUpperCase(),
    obs: obs,
    previsao: dataISO(l.previsao, ano),
    resolvidoEm: dataISO(l.data_resolucao, ano)
  };
}

function itensDoTexto(dealId, txt) {
  return texto(txt).split(';')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; })
    .map(function (s, i) {
      var m = s.match(/^(.*?)\s*\(falta ([\d.]+)(?: ([^)]+))?\)\s*$/);
      return {
        id: dealId + '|ganha|' + i,
        nome: m ? m[1].trim() : s,
        cor: '',
        un: m && m[3] ? m[3].trim() : '',
        necessaria: null,
        separada: null,
        falta: m ? Number(m[2]) : null,
        faltaG: null,
        status: 'ABERTO',
        obs: '',
        previsao: '',
        resolvidoEm: ''
      };
    });
}

function menorData(datas) {
  return datas.filter(function (d) { return d !== ''; }).sort()[0] || '';
}

function montarCaixas(faltantes, ganhas, hoje) {
  var ano = hoje.getFullYear();
  var avisos = [];
  var grupos = {};
  var ordem = [];

  (faltantes || []).forEach(function (l, idx) {
    if (!l) return;
    var numLinha = idx + 2; // linha 1 da aba e o cabecalho
    var dealId = texto(l.deal_id);
    var os = texto(l.os);
    if (!dealId || !os) {
      if (texto(l.id)) avisos.push('FALTANTES linha ' + numLinha + ': sem deal_id ou os, ignorada');
      return;
    }
    if (isNaN(numero(l.qtd_falta))) {
      avisos.push('FALTANTES linha ' + numLinha + ' (OS ' + os + '): qtd_falta invalida, ignorada');
      return;
    }
    if (texto(l.status).toUpperCase() === 'SUBSTITUIDO') return;
    if (!grupos[dealId]) { grupos[dealId] = []; ordem.push(dealId); }
    grupos[dealId].push(l);
  });

  var ganhasPorDeal = {};
  (ganhas || []).forEach(function (g) {
    var id = texto(g && g.deal_id);
    if (id) ganhasPorDeal[id] = g;
  });

  function marcarSaida(caixa, g) {
    caixa.saiu = !!g;
    caixa.saiuComFalta = !!g && semAcento(g.saiu_com_falta) === 'SIM';
    caixa.saiuEm = g ? dataISO(g.data_ganho, ano) : '';
    return caixa;
  }

  var caixas = ordem.map(function (dealId) {
    var linhas = grupos[dealId];
    var temCorte = linhas.some(function (l) { return texto(l.ciclo).toUpperCase() === 'CORTE'; });
    var itens = [];
    linhas.forEach(function (l) {
      var it = itemDaLinha(l, ano);
      var ehCorte = texto(l.ciclo).toUpperCase() === 'CORTE';
      if (!temCorte || ehCorte || itemEstaAberto(it)) itens.push(it);
    });
    var p = linhas[0];
    var resp = '';
    linhas.forEach(function (l) { if (!resp) resp = texto(l.responsavel); });
    return marcarSaida({
      id: dealId,
      dealId: dealId,
      os: texto(p.os),
      ciclo: temCorte ? 'CORTE' : 'PEDIDO',
      tipo: tipoDaSecao(p.secao),
      referencia: texto(p.referencia),
      peca: texto(p.descricao_peca),
      cliente: texto(p.cliente),
      responsavel: resp,
      registradoEm: menorData(linhas.map(function (l) { return dataISO(l.data_separacao, ano); })),
      itens: itens
    }, ganhasPorDeal[dealId]);
  });

  Object.keys(ganhasPorDeal).forEach(function (dealId) {
    if (grupos[dealId]) return;
    var g = ganhasPorDeal[dealId];
    var comFalta = semAcento(g.saiu_com_falta) === 'SIM';
    caixas.push(marcarSaida({
      id: dealId,
      dealId: dealId,
      os: texto(g.os),
      ciclo: texto(g.conferido_em).toUpperCase() === 'CORTE' ? 'CORTE' : 'PEDIDO',
      tipo: tipoDaSecao(g.caixa),
      referencia: texto(g.referencia),
      peca: texto(g.descricao_peca),
      cliente: texto(g.cliente),
      responsavel: '',
      registradoEm: dataISO(g.data_ganho, ano),
      itens: comFalta ? itensDoTexto(dealId, g.itens_faltando) : []
    }, g));
  });

  caixas.sort(function (a, b) {
    if (a.registradoEm !== b.registradoEm) return a.registradoEm < b.registradoEm ? -1 : 1;
    return a.os < b.os ? -1 : a.os > b.os ? 1 : 0;
  });
  return { caixas: caixas, avisos: avisos };
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd n8n && npm test`
Esperado: PASS em todos os testes de `montarCaixas.test.js`.

- [ ] **Step 7: Commit**

```bash
git add n8n/package.json n8n/src n8n/test
git commit -m "feat(n8n): montagem das caixas a partir de FALTANTES e CAIXAS GANHAS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Login, sessão e cache (`auth.js`, `api.js`, `hash-senha`)

**Files:**
- Create: `n8n/src/auth.js`, `n8n/src/api.js`, `n8n/test/auth-api.test.js`, `n8n/scripts/hash-senha.js`

**Interfaces:**
- Consumes: `texto`, `montarCaixas` (Task 2).
- Produces:
  - `gerarHash(cripto, senha, saltHex?): string`
  - `conferirSenha(cripto, senha, armazenado): boolean`
  - `gerarToken(cripto): string` (64 caracteres hex)
  - `processarLogin(cripto, estado, corpo, usuarios, agora): { status, body }`
  - `validarPedidoBoard(estado, cabecalhoAuthorization, agora): { status, body } | { ler: true }`
  - `montarRespostaBoard(estado, faltantes, ganhas, agora): { status: 200, body: { geradoEm, caixas, avisos } }`
- Formato de `estado` (static data global): `{ sessoes: { [token]: { email, nome, perfil, expira } }, tentativas: { [email]: number[] }, board: { corpo, guardadoEm } }`
- Corpo de sucesso do login (contrato com o front): `{ token, nome, perfil, expiraEm }`. Corpo de erro: `{ erro: string }`.

- [ ] **Step 1: Escrever os testes que falham**

`n8n/test/auth-api.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const T0 = Date.UTC(2026, 9, 7, 12, 0, 0);
const HASH = ctx.gerarHash(crypto, 'senha-forte-123');
const USUARIOS = [
  { email: 'Lucca@RSLConsultoria.com', nome: 'Lucca', perfil: 'adm', senha_hash: HASH, ativo: 'SIM' },
  { email: 'inativo@x.com', nome: 'Fulano', perfil: 'PCP', senha_hash: HASH, ativo: 'NAO' }
];

function novoEstado() { return {}; }
function login(estado, email, senha, agora) {
  return limpo(ctx.processarLogin(crypto, estado, { email, senha }, USUARIOS, agora || T0));
}

test('hash: formato, ida e volta, senha errada e hash malformado', () => {
  assert.match(HASH, /^pbkdf2\$120000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', HASH), true);
  assert.equal(ctx.conferirSenha(crypto, 'senha-errada', HASH), false);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', ''), false);
  assert.equal(ctx.conferirSenha(crypto, 'senha-forte-123', 'sha1$1$aa$bb'), false);
  assert.match(ctx.gerarToken(crypto), /^[0-9a-f]{64}$/);
});

test('login certo: devolve token, guarda sessao de 12h, e-mail sem diferenca de maiuscula', () => {
  const estado = novoEstado();
  const r = login(estado, ' lucca@rslconsultoria.com ', 'senha-forte-123');
  assert.equal(r.status, 200);
  assert.match(r.body.token, /^[0-9a-f]{64}$/);
  assert.equal(r.body.nome, 'Lucca');
  assert.equal(r.body.perfil, 'ADM');
  assert.equal(r.body.expiraEm, new Date(T0 + 12 * 3600 * 1000).toISOString());
  assert.deepEqual(limpo(estado.sessoes[r.body.token]), {
    email: 'lucca@rslconsultoria.com', nome: 'Lucca', perfil: 'ADM', expira: T0 + 12 * 3600 * 1000
  });
});

test('login: campos faltando = 400; senha errada, inativo ou desconhecido = 401', () => {
  const estado = novoEstado();
  assert.equal(login(estado, '', 'x').status, 400);
  assert.deepEqual(login(estado, 'lucca@rslconsultoria.com', 'errada'), { status: 401, body: { erro: 'E-mail ou senha incorretos.' } });
  assert.equal(login(estado, 'inativo@x.com', 'senha-forte-123').status, 401);
  assert.equal(login(estado, 'ninguem@x.com', 'senha-forte-123').status, 401);
});

test('login: 5 falhas em 15 min bloqueiam, mesmo com a senha certa; depois libera', () => {
  const estado = novoEstado();
  for (let i = 0; i < 5; i++) login(estado, 'lucca@rslconsultoria.com', 'errada', T0 + i * 1000);
  const bloqueado = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123', T0 + 10000);
  assert.deepEqual(bloqueado, { status: 429, body: { erro: 'Muitas tentativas. Tente de novo em 15 minutos.' } });
  const depois = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123', T0 + 16 * 60 * 1000);
  assert.equal(depois.status, 200);
  assert.equal(estado.tentativas['lucca@rslconsultoria.com'], undefined);
});

test('board: sem token ou token invalido = 401', () => {
  const estado = novoEstado();
  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, undefined, T0)), { status: 401, body: { erro: 'Sessão expirada.' } });
  assert.equal(ctx.validarPedidoBoard(estado, 'Bearer ' + 'a'.repeat(64), T0).status, 401);
});

test('board: token valido sem cache pede leitura; com cache novo devolve o cache', () => {
  const estado = novoEstado();
  const token = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123').body.token;
  const cab = 'Bearer ' + token;
  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, cab, T0)), { ler: true });

  const r = limpo(ctx.montarRespostaBoard(estado, [], [], T0));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { geradoEm: new Date(T0).toISOString(), caixas: [], avisos: [] });

  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, cab, T0 + 29000)), { status: 200, body: r.body });
  assert.deepEqual(limpo(ctx.validarPedidoBoard(estado, cab, T0 + 31000)), { ler: true });
});

test('board: sessao vencida = 401 e some do estado', () => {
  const estado = novoEstado();
  const token = login(estado, 'lucca@rslconsultoria.com', 'senha-forte-123').body.token;
  const r = ctx.validarPedidoBoard(estado, 'Bearer ' + token, T0 + 12 * 3600 * 1000 + 1);
  assert.equal(r.status, 401);
  assert.equal(estado.sessoes[token], undefined);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd n8n && npm test`
Esperado: FAIL em `auth-api.test.js`, com `ctx.gerarHash is not a function`.

- [ ] **Step 3: Implementar `n8n/src/auth.js`**

```js
// ===== src/auth.js =====
// Hash de senha e token de sessao. O modulo crypto do Node chega por
// parametro (cripto): no n8n vem de require('crypto') no adaptador, nos
// testes vem direto do Node.
// Formato do hash: pbkdf2$<iteracoes>$<salt hex>$<hash hex> (SHA-256, 32 bytes).

var PBKDF2_ITERACOES = 120000;

function gerarHash(cripto, senha, saltHex) {
  var salt = saltHex || cripto.randomBytes(16).toString('hex');
  var h = cripto.pbkdf2Sync(senha, salt, PBKDF2_ITERACOES, 32, 'sha256').toString('hex');
  return 'pbkdf2$' + PBKDF2_ITERACOES + '$' + salt + '$' + h;
}

function iguaisTempoConstante(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function conferirSenha(cripto, senha, armazenado) {
  var p = texto(armazenado).split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  var it = Number(p[1]);
  if (!isFinite(it) || it < 1 || !/^[0-9a-f]+$/.test(p[2]) || !/^[0-9a-f]{64}$/.test(p[3])) return false;
  var h = cripto.pbkdf2Sync(senha, p[2], it, 32, 'sha256').toString('hex');
  return iguaisTempoConstante(h, p[3]);
}

function gerarToken(cripto) {
  return cripto.randomBytes(32).toString('hex');
}
```

- [ ] **Step 4: Implementar `n8n/src/api.js`**

```js
// ===== src/api.js =====
// Regras dos dois webhooks do workflow "PCP MRBL - API". "estado" e o
// static data global do workflow: sessoes, tentativas de login e cache do
// board. Funcoes puras sobre "estado" + "agora" (ms), para testar sem n8n.

var VALIDADE_SESSAO_MS = 12 * 3600 * 1000;
var JANELA_TENTATIVAS_MS = 15 * 60 * 1000;
var MAX_TENTATIVAS = 5;
var VALIDADE_CACHE_MS = 30 * 1000;
var VALORES_ATIVO = { SIM: 1, S: 1, TRUE: 1, '1': 1 };

function prepararEstado(estado, agora) {
  if (!estado.sessoes) estado.sessoes = {};
  if (!estado.tentativas) estado.tentativas = {};
  Object.keys(estado.sessoes).forEach(function (t) {
    if (estado.sessoes[t].expira <= agora) delete estado.sessoes[t];
  });
  Object.keys(estado.tentativas).forEach(function (e) {
    var ainda = estado.tentativas[e].filter(function (ts) { return agora - ts < JANELA_TENTATIVAS_MS; });
    if (ainda.length) estado.tentativas[e] = ainda;
    else delete estado.tentativas[e];
  });
}

function processarLogin(cripto, estado, corpo, usuarios, agora) {
  prepararEstado(estado, agora);
  var email = texto(corpo && corpo.email).toLowerCase();
  var senha = corpo && typeof corpo.senha === 'string' ? corpo.senha : '';
  if (!email || !senha) return { status: 400, body: { erro: 'Informe e-mail e senha.' } };

  var falhas = estado.tentativas[email] || [];
  if (falhas.length >= MAX_TENTATIVAS) {
    return { status: 429, body: { erro: 'Muitas tentativas. Tente de novo em 15 minutos.' } };
  }

  var u = (usuarios || []).filter(function (x) { return x && texto(x.email).toLowerCase() === email; })[0];
  var ativo = !!u && !!VALORES_ATIVO[semAcento(u.ativo)];
  if (!ativo || !conferirSenha(cripto, senha, u.senha_hash)) {
    estado.tentativas[email] = falhas.concat([agora]);
    return { status: 401, body: { erro: 'E-mail ou senha incorretos.' } };
  }

  delete estado.tentativas[email];
  var token = gerarToken(cripto);
  var expira = agora + VALIDADE_SESSAO_MS;
  var perfil = texto(u.perfil).toUpperCase();
  estado.sessoes[token] = { email: email, nome: texto(u.nome), perfil: perfil, expira: expira };
  return {
    status: 200,
    body: { token: token, nome: texto(u.nome), perfil: perfil, expiraEm: new Date(expira).toISOString() }
  };
}

function sessaoDoCabecalho(estado, cabecalho, agora) {
  prepararEstado(estado, agora);
  var m = texto(cabecalho).match(/^Bearer\s+([0-9a-fA-F]{64})$/);
  if (!m) return null;
  return estado.sessoes[m[1].toLowerCase()] || null;
}

function validarPedidoBoard(estado, cabecalho, agora) {
  if (!sessaoDoCabecalho(estado, cabecalho, agora)) {
    return { status: 401, body: { erro: 'Sessão expirada.' } };
  }
  var c = estado.board;
  if (c && c.corpo && agora - c.guardadoEm < VALIDADE_CACHE_MS) return { status: 200, body: c.corpo };
  return { ler: true };
}

function montarRespostaBoard(estado, faltantes, ganhas, agora) {
  var r = montarCaixas(faltantes, ganhas, new Date(agora));
  var corpo = { geradoEm: new Date(agora).toISOString(), caixas: r.caixas, avisos: r.avisos };
  estado.board = { corpo: corpo, guardadoEm: agora };
  return { status: 200, body: corpo };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd n8n && npm test`
Esperado: PASS em todos os testes, dos dois arquivos.

- [ ] **Step 6: Escrever `n8n/scripts/hash-senha.js`**

```js
// Gera o senha_hash para a aba USUARIOS. Roda so na maquina de quem vai
// colar o hash na planilha: a senha nao sai daqui e nao e gravada em lugar
// nenhum.  Uso: npm run hash-senha
const crypto = require('crypto');
const { carregar } = require('../test/carregar');

function perguntarOculto(pergunta) {
  return new Promise((resolve) => {
    process.stdout.write(pergunta);
    const stdin = process.stdin;
    let s = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    function aoDigitar(pedaco) {
      for (const ch of pedaco) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', aoDigitar);
          process.stdout.write('\n');
          resolve(s);
          return;
        }
        if (ch === '\u0003') process.exit(1);
        if (ch === '\u007f' || ch === '\b') s = s.slice(0, -1);
        else s += ch;
      }
    }
    stdin.on('data', aoDigitar);
  });
}

(async () => {
  if (!process.stdin.isTTY) {
    console.error('Rode num terminal interativo: npm run hash-senha');
    process.exit(1);
  }
  const senha = await perguntarOculto('Senha (mínimo 10 caracteres): ');
  if (senha.length < 10) {
    console.error('Senha curta demais.');
    process.exit(1);
  }
  const conf = await perguntarOculto('Repita a senha: ');
  if (conf !== senha) {
    console.error('As senhas não batem.');
    process.exit(1);
  }
  const hash = carregar().gerarHash(crypto, senha);
  console.log('\nCole na coluna senha_hash da aba USUARIOS:\n\n' + hash + '\n');
})();
```

- [ ] **Step 7: Commit**

```bash
git add n8n/src/auth.js n8n/src/api.js n8n/test/auth-api.test.js n8n/scripts/hash-senha.js
git commit -m "feat(n8n): login com PBKDF2, sessao de 12h, bloqueio por tentativas e cache do board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Workflow "PCP MRBL - API" no n8n

**Files:**
- Create: `n8n/adaptadores/processar-login.js`, `n8n/adaptadores/validar-pedido.js`, `n8n/adaptadores/montar-board.js`, `n8n/scripts/gerar-code-nodes.js`, `n8n/build/*.js` (gerados), `n8n/workflows/pcp-api.sdk.js`, `n8n/workflows/README.md`

**Interfaces:**
- Consumes: `processarLogin`, `validarPedidoBoard`, `montarRespostaBoard` (Task 3).
- Produces: duas URLs de produção (escritas em `n8n/workflows/README.md`):
  - `POST …/pcp-login`: corpo JSON `{email, senha}`, responde `{token, nome, perfil, expiraEm}` ou `{erro}` com status 400/401/429.
  - `GET …/pcp-board`: cabeçalho `Authorization: Bearer <token>`, responde `{geradoEm, caixas, avisos}` ou `{erro}` com status 401.

- [ ] **Step 1: Escrever os adaptadores**

`n8n/adaptadores/processar-login.js`:

```js
// ===== adaptador: Processar Login =====
// Entrada: linhas da aba USUARIOS ($input). Corpo do POST vem do webhook.
var estado = $getWorkflowStaticData('global');
var corpo = $('Login').first().json.body || {};
var usuarios = $input.all().map(function (i) { return i.json; });
return [{ json: processarLogin(require('crypto'), estado, corpo, usuarios, Date.now()) }];
```

`n8n/adaptadores/validar-pedido.js`:

```js
// ===== adaptador: Validar Pedido =====
var estado = $getWorkflowStaticData('global');
var cabecalhos = $('Board').first().json.headers || {};
return [{ json: validarPedidoBoard(estado, cabecalhos.authorization, Date.now()) }];
```

`n8n/adaptadores/montar-board.js`:

```js
// ===== adaptador: Montar Board =====
var estado = $getWorkflowStaticData('global');
var faltantes = $('Ler FALTANTES').all().map(function (i) { return i.json; });
var ganhas = $('Ler CAIXAS GANHAS').all().map(function (i) { return i.json; });
return [{ json: montarRespostaBoard(estado, faltantes, ganhas, Date.now()) }];
```

- [ ] **Step 2: Escrever o gerador `n8n/scripts/gerar-code-nodes.js`**

```js
// Monta o texto de cada Code node: todos os arquivos de src/ (mesma ordem do
// carregador de testes) + o adaptador do node. Saida em build/<node>.js,
// que e o texto colado no n8n.
const fs = require('fs');
const path = require('path');
const { ARQUIVOS } = require('../test/carregar');

const raiz = path.join(__dirname, '..');
const NODES = {
  'processar-login': 'Processar Login',
  'validar-pedido': 'Validar Pedido',
  'montar-board': 'Montar Board'
};

const corpo = ARQUIVOS
  .map((f) => '// ----- src/' + f + ' -----\n' + fs.readFileSync(path.join(raiz, 'src', f), 'utf8'))
  .join('\n');

fs.mkdirSync(path.join(raiz, 'build'), { recursive: true });
for (const [arq, nome] of Object.entries(NODES)) {
  const adaptador = fs.readFileSync(path.join(raiz, 'adaptadores', arq + '.js'), 'utf8');
  const txt =
    '// ===== Code node "' + nome + '" =====\n' +
    '// GERADO por n8n/scripts/gerar-code-nodes.js. Nao edite no n8n.\n' +
    '// Para mudar a logica, edite n8n/src/ e rode: npm run build\n\n' +
    corpo + '\n' + adaptador;
  fs.writeFileSync(path.join(raiz, 'build', arq + '.js'), txt);
  console.log('build/' + arq + '.js');
}
```

- [ ] **Step 3: Gerar e conferir que o texto é JS válido**

Run: `cd n8n && npm run build && node --check build/processar-login.js && node --check build/validar-pedido.js && node --check build/montar-board.js`
Esperado: três linhas `build/….js` e nenhum erro de sintaxe. O `--check` não executa o código, então `$input` e `$(...)` não precisam existir.

- [ ] **Step 4: Montar o workflow com o SDK do n8n**

Seguir o processo do MCP do n8n: `get_sdk_reference`, depois `search_nodes` e `get_node_types` para webhook, googleSheets, code, if e respondToWebhook, e `list_credentials` para pegar o id da service account do Google Sheets. Escrever `n8n/workflows/pcp-api.sdk.js` com exatamente estes nodes:

| # | Nome | Tipo | Parâmetros |
|---|---|---|---|
| 1 | `Login` | Webhook | POST, path `pcp-login`, `responseMode: responseNode`, `options.allowedOrigins: "https://rslconsultoria.github.io,http://localhost:5173,http://localhost:4173"` |
| 2 | `Ler USUARIOS` | Google Sheets | read, `authentication: serviceAccount`, doc `1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww`, aba `USUARIOS`, `alwaysOutputData: true` |
| 3 | `Processar Login` | Code | runOnceForAllItems, `jsCode` = conteúdo de `n8n/build/processar-login.js` |
| 4 | `Responder Login` | Respond to Webhook | `respondWith: json`, `responseBody: ={{ $json.body }}`, `options.responseCode: ={{ $json.status }}`, header `Cache-Control: no-store` |
| 5 | `Board` | Webhook | GET, path `pcp-board`, `responseMode: responseNode`, mesmo `allowedOrigins` |
| 6 | `Validar Pedido` | Code | `jsCode` = `n8n/build/validar-pedido.js` |
| 7 | `Precisa Ler?` | IF | `{{ $json.ler }}` é boolean true |
| 8 | `Ler FALTANTES` | Google Sheets | read, mesmo doc, aba `FALTANTES`, `executeOnce: true`, `alwaysOutputData: true` |
| 9 | `Ler CAIXAS GANHAS` | Google Sheets | read, mesmo doc, aba `CAIXAS GANHAS`, `executeOnce: true`, `alwaysOutputData: true` |
| 10 | `Montar Board` | Code | runOnceForAllItems, `jsCode` = `n8n/build/montar-board.js` |
| 11 | `Responder Board` | Respond to Webhook | igual ao node 4 |

Ligações: 1→2→3→4. 5→6→7. 7 (true)→8→9→10→11. 7 (false)→11.

Settings do workflow:
- `timezone: America/Sao_Paulo`.
- `saveDataSuccessExecution: none` e `saveDataErrorExecution: none`, porque o corpo do login traz a senha e não pode ficar no histórico de execuções.

Descrição do workflow: "API do app PCP MRBL (GitHub Pages): POST pcp-login e GET pcp-board. Sessões e cache no static data. Code nodes gerados de n8n/build/ do repo pcp-mrbl."

- [ ] **Step 5: Validar e criar inativo**

Rodar `validate_workflow` com o código do SDK. Corrigir até não haver erros. Depois rodar `create_workflow_from_code`, ainda sem publicar.

- [ ] **Step 6: Gerar o hash do usuário e preencher a planilha (passo do usuário)**

Pedir ao usuário que rode, no terminal dele, e cole o resultado na coluna `senha_hash` da linha `lucca@rslconsultoria.com` na aba USUARIOS:

```bash
cd n8n && npm run hash-senha
```

**Não pedir a senha no chat.** Esperar o usuário confirmar que colou.

- [ ] **Step 7: Publicar e testar com curl**

Publicar com `publish_workflow` e pegar as URLs de produção em `get_workflow_details` (campo `triggerInfo`).

Teste de login errado:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d '{"email":"lucca@rslconsultoria.com","senha":"errada-de-proposito"}' "<URL pcp-login>"
```

Esperado: `401`. Rodar no máximo **uma** vez, para não gastar as 5 tentativas.

Teste do board sem token:

```bash
curl -s -w "\n%{http_code}\n" "<URL pcp-board>"
```

Esperado: `{"erro":"Sessão expirada."}` e `401`.

Teste de preflight do CORS:

```bash
curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://rslconsultoria.github.io" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization" "<URL pcp-board>"
```

Esperado: cabeçalho `Access-Control-Allow-Origin: https://rslconsultoria.github.io`.

O login com a senha certa é testado pelo usuário no app (Task 9), não aqui.

- [ ] **Step 8: Documentar em `n8n/workflows/README.md`**

```markdown
# Workflows n8n do PCP MRBL

## PCP MRBL - API (id: <id do workflow>)

| Webhook | URL de produção |
|---|---|
| Login (POST) | <URL pcp-login> |
| Board (GET) | <URL pcp-board> |

Code nodes gerados a partir de `n8n/build/`:

| Node | Arquivo |
|---|---|
| Processar Login | build/processar-login.js |
| Validar Pedido | build/validar-pedido.js |
| Montar Board | build/montar-board.js |

**Para mudar a lógica:**
1. Edite `n8n/src/`.
2. Rode `npm test && npm run build`.
3. Cole o novo `build/*.js` no Code node correspondente, pelo MCP `update_workflow`.
4. Atualize `pcp-api.sdk.js`.

O static data guarda as sessões, as tentativas e o cache. Se ele for perdido (reinício, reimportação), o efeito é só que as pessoas precisam entrar de novo.

Execuções não são salvas (`saveData*: none`), porque o corpo do login traz a senha.
```

Preencher com o id e as URLs reais.

- [ ] **Step 9: Commit**

```bash
git add n8n/adaptadores n8n/scripts/gerar-code-nodes.js n8n/build n8n/workflows
git commit -m "feat(n8n): workflow PCP MRBL - API (pcp-login e pcp-board)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Projeto web, estilos e regras puras do quadro

**Files:**
- Create: `web/` (scaffold Vite), `web/vite.config.ts`, `web/.env.example`, `web/.env.e2e`, `web/src/api/tipos.ts`, `web/src/regras/{datas,quantidade,texto,colunas,busca}.ts` e os `*.test.ts` de cada um, `web/src/styles/ds/**`, `web/src/styles/mrbl.css`
- Modify: `.gitignore` (adicionar `!.env.e2e`)

**Interfaces:**
- Produces:
  - `tipos.ts`: `Item`, `Caixa`, `Board`, `Sessao`.
  - `datas.ts`: `paraData(s): Date|null`, `diasEntre(desde, hoje): number|null`, `textoDias(n): string`, `ddmm(s): string`, `horaMinuto(iso): string`.
  - `quantidade.ts`: `formatarNumero(n): string`, `formatarQtd(qtd, un, g): string`, `contaDoItem(i: Item): string`.
  - `texto.ts`: `iniciais(nome): string`, `nomeDoTipo(tipo): string`, `corDoTipo(tipo): string`.
  - `colunas.ts`: `ColunaId`, `COLUNAS`, `itemAberto(i)`, `itensAbertos(c)`, `colunaDaCaixa(c)`, `visivelNoQuadro(c, hoje)`.
  - `busca.ts`: `normalizar(s)`, `caixaAtendeBusca(c, q)`.

- [ ] **Step 1: Criar o projeto**

Run (na raiz do repo):

```bash
npm create vite@latest web -- --template react-ts
cd web && npm install && npm install -D vitest jsdom @playwright/test
```

Apagar o que o template traz e não será usado: `web/src/App.css`, `web/src/index.css`, `web/src/assets/`, `web/public/vite.svg`.

Acrescentar ao `.gitignore` da raiz a linha `!.env.e2e`, logo abaixo de `!.env.example`.

- [ ] **Step 2: Configurar Vite, Vitest e as variáveis**

`web/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/pcp-mrbl/',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] }
});
```

Em `web/package.json`, deixar `scripts` assim:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "build:e2e": "tsc -b && vite build --mode e2e",
  "preview": "vite preview",
  "test": "vitest run",
  "e2e": "playwright test"
}
```

`web/.env.example`:

```
# URLs de produção dos webhooks (n8n/workflows/README.md)
VITE_API_LOGIN=https://mrbl-automacoes.duckdns.org/webhook/pcp-login
VITE_API_BOARD=https://mrbl-automacoes.duckdns.org/webhook/pcp-board
```

`web/.env.e2e`:

```
VITE_API_LOGIN=http://api.test/pcp-login
VITE_API_BOARD=http://api.test/pcp-board
```

Criar `web/src/vite-env.d.ts`, se o template não tiver criado:

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_LOGIN: string;
  readonly VITE_API_BOARD: string;
}
```

- [ ] **Step 3: Copiar o design system e escrever as sobrescritas MRBL**

```bash
mkdir -p web/src/styles/ds
cp -r design_handoff_pcp_mrbl/_ds/soccius-design-system-0637dd66-e37c-496b-a3dd-e25ebb06d41c/tokens web/src/styles/ds/
cp -r design_handoff_pcp_mrbl/_ds/soccius-design-system-0637dd66-e37c-496b-a3dd-e25ebb06d41c/components web/src/styles/ds/
cp design_handoff_pcp_mrbl/_ds/soccius-design-system-0637dd66-e37c-496b-a3dd-e25ebb06d41c/styles.css web/src/styles/ds/
```

O design system é do próprio estúdio (Soccius) e pode ser versionado. O `.gitignore` só exclui a pasta do handoff, não esta cópia.

`web/src/styles/mrbl.css`:

```css
/* Sobrescritas MRBL sobre o Soccius DS (README do handoff, "Design Tokens"). */
:root {
  --ink: #0E1B4F; --ink-2: #13277A; --ink-3: #172C82; --graphite: #2D3F8F;
  --slate: #56607A; --mist: #AEB7D6;
  --signal: #D4A21C; --signal-hi: #E6BD4C; --signal-lo: #A97F0E;
  --signal-tint: rgba(212,162,28,.14); --signal-ring: rgba(212,162,28,.24);
  --ember: #D9731F; --warn: #D9731F; --link: #13277A; --link-hover: #0E1B4F;
  --mod-crm: #D4A21C; --stage-default: #13277A; --focus-ring: 0 0 0 3px rgba(212,162,28,.24);
  --paper: #fafafb; --paper-2: #efeee7; --paper-3: #e5e3d9; --line: #d8d5c8; --fog: #8a8676;

  --navy: #13277A;
  --navy-tint: rgba(19,39,122,.08);
  --falta: #B4531A; --falta-bg: rgba(217,115,31,.12);
  --ok-text: #1b8f73; --ok-bg: rgba(63,182,139,.13);
  --erro-text: #A3282B; --erro-bg: rgba(216,93,85,.13);
  --tipo-acabamento: #2F55D4; --tipo-costura: #14161C;
  --shadow-panel: 0 1px 0 rgba(0,0,0,.04), 0 1px 2px rgba(10,14,20,.05);
  --shadow-card: 0 1px 2px rgba(10,14,20,.04), 0 8px 18px -14px rgba(10,14,20,.16);
  --shadow-popover: 0 16px 38px -16px rgba(10,14,20,.34);
}
html, body, #root { height: 100%; }
body { font-size: 13.5px; }
a { color: var(--navy); }
a:hover { color: var(--ink); text-decoration: underline; }
```

- [ ] **Step 4: Escrever `web/src/api/tipos.ts`**

```ts
// Contrato com o webhook pcp-board (n8n/src/montarCaixas.js).
export interface Item {
  id: string;
  nome: string;
  cor: string;
  un: string;
  necessaria: number | null;
  separada: number | null;
  falta: number | null;
  faltaG: number | null;
  status: string; // ABERTO | PARCIAL | RESOLVIDO | ...
  obs: string;
  previsao: string; // 'aaaa-mm-dd' ou ''
  resolvidoEm: string; // 'aaaa-mm-dd' ou ''
}

export interface Caixa {
  id: string;
  dealId: string;
  os: string;
  ciclo: 'PEDIDO' | 'CORTE';
  tipo: string; // COSTURA | ACABAMENTO | ...
  referencia: string;
  peca: string;
  cliente: string;
  responsavel: string;
  registradoEm: string;
  saiu: boolean;
  saiuComFalta: boolean;
  saiuEm: string;
  itens: Item[];
}

export interface Board {
  geradoEm: string; // ISO
  caixas: Caixa[];
  avisos: string[];
}

export interface Sessao {
  token: string;
  nome: string;
  perfil: string;
  expiraEm: string; // ISO
}
```

- [ ] **Step 5: Escrever os testes das regras (que falham)**

`web/src/regras/teste-util.ts` (fábricas compartilhadas pelos testes):

```ts
import type { Caixa, Item } from '../api/tipos';

export function item(o: Partial<Item> = {}): Item {
  return {
    id: 'i1', nome: 'ZIPER METAL', cor: 'preto', un: 'UN', necessaria: 52, separada: 0,
    falta: 52, faltaG: null, status: 'ABERTO', obs: '', previsao: '', resolvidoEm: '', ...o
  };
}

export function caixa(o: Partial<Caixa> = {}): Caixa {
  return {
    id: '600001', dealId: '600001', os: '90001', ciclo: 'PEDIDO', tipo: 'COSTURA', referencia: 'REF1',
    peca: 'PECA TESTE A', cliente: 'CLIENTE ALFA', responsavel: 'Maria', registradoEm: '2026-10-01',
    saiu: false, saiuComFalta: false, saiuEm: '', itens: [item()], ...o
  };
}
```

`web/src/regras/datas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ddmm, diasEntre, horaMinuto, paraData, textoDias } from './datas';

const HOJE = new Date(2026, 9, 7, 15, 30);

describe('datas', () => {
  it('paraData lê aaaa-mm-dd com ou sem hora', () => {
    expect(paraData('2026-10-01')?.getDate()).toBe(1);
    expect(paraData('2026-10-01 09:00')?.getMonth()).toBe(9);
    expect(paraData('')).toBeNull();
  });
  it('diasEntre conta dias de calendário até hoje', () => {
    expect(diasEntre('2026-10-07', HOJE)).toBe(0);
    expect(diasEntre('2026-10-06', HOJE)).toBe(1);
    expect(diasEntre('2026-09-07', HOJE)).toBe(30);
    expect(diasEntre('', HOJE)).toBeNull();
  });
  it('textoDias', () => {
    expect(textoDias(0)).toBe('hoje');
    expect(textoDias(1)).toBe('há 1 dia');
    expect(textoDias(12)).toBe('há 12 dias');
    expect(textoDias(null)).toBe('');
  });
  it('ddmm e horaMinuto', () => {
    expect(ddmm('2026-10-09')).toBe('09/10');
    expect(ddmm('')).toBe('');
    expect(horaMinuto(new Date(2026, 9, 7, 7, 58).toISOString())).toBe('07:58');
    expect(horaMinuto('lixo')).toBe('--:--');
  });
});
```

`web/src/regras/quantidade.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contaDoItem, formatarNumero, formatarQtd } from './quantidade';
import { item } from './teste-util';

describe('quantidade', () => {
  it('formatarNumero usa vírgula e até 3 casas', () => {
    expect(formatarNumero(163.5)).toBe('163,5');
    expect(formatarNumero(1200)).toBe('1.200');
  });
  it('formatarQtd mostra unidade e gramas quando houver', () => {
    expect(formatarQtd(26, 'UN', null)).toBe('26 UN');
    expect(formatarQtd(2, 'cones', 100)).toBe('2 cones · 100 g');
    expect(formatarQtd(3, '', null)).toBe('3');
    expect(formatarQtd(null, 'UN', null)).toBe('—');
  });
  it('contaDoItem junta necessário, separado e falta', () => {
    expect(contaDoItem(item({ necessaria: 52, separada: 10, falta: 42 }))).toBe('necessário 52 · separado 10 · falta 42 UN');
    expect(contaDoItem(item({ necessaria: null, separada: null, falta: 3, un: 'cones' }))).toBe('falta 3 cones');
  });
});
```

`web/src/regras/texto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { corDoTipo, iniciais, nomeDoTipo } from './texto';

describe('texto', () => {
  it('iniciais', () => {
    expect(iniciais('Lucca')).toBe('LU');
    expect(iniciais('Maria Souza')).toBe('MS');
    expect(iniciais('')).toBe('—');
  });
  it('tipo da caixa', () => {
    expect(nomeDoTipo('ACABAMENTO')).toBe('Acabamento');
    expect(nomeDoTipo('COSTURA')).toBe('Costura');
    expect(nomeDoTipo('PREPARACAO')).toBe('Preparação');
    expect(nomeDoTipo('')).toBe('Caixa');
    expect(corDoTipo('ACABAMENTO')).toBe('var(--tipo-acabamento)');
    expect(corDoTipo('COSTURA')).toBe('var(--tipo-costura)');
    expect(corDoTipo('X')).toBe('var(--fog)');
  });
});
```

`web/src/regras/colunas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { colunaDaCaixa, COLUNAS, itemAberto, itensAbertos, visivelNoQuadro } from './colunas';
import { caixa, item } from './teste-util';

const HOJE = new Date(2026, 9, 7);
const resolvido = item({ id: 'r', status: 'RESOLVIDO', falta: 0 });

describe('colunas', () => {
  it('tem as 6 colunas na ordem do protótipo', () => {
    expect(COLUNAS.map((c) => c.id)).toEqual(['falta_pedido', 'completa_pedido', 'falta_corte', 'completa_corte', 'saiu_com', 'saiu_sem']);
  });
  it('itemAberto: ABERTO/PARCIAL com falta > 0 ou desconhecida', () => {
    expect(itemAberto(item())).toBe(true);
    expect(itemAberto(item({ status: 'PARCIAL', falta: 4 }))).toBe(true);
    expect(itemAberto(item({ falta: 0 }))).toBe(false);
    expect(itemAberto(item({ falta: null }))).toBe(true);
    expect(itemAberto(resolvido)).toBe(false);
    expect(itensAbertos(caixa({ itens: [item(), resolvido] }))).toHaveLength(1);
  });
  it('colunaDaCaixa', () => {
    expect(colunaDaCaixa(caixa())).toBe('falta_pedido');
    expect(colunaDaCaixa(caixa({ itens: [resolvido] }))).toBe('completa_pedido');
    expect(colunaDaCaixa(caixa({ ciclo: 'CORTE' }))).toBe('falta_corte');
    expect(colunaDaCaixa(caixa({ ciclo: 'CORTE', itens: [] }))).toBe('completa_corte');
    expect(colunaDaCaixa(caixa({ saiu: true }))).toBe('saiu_com');
    expect(colunaDaCaixa(caixa({ saiu: true, itens: [resolvido] }))).toBe('saiu_sem');
  });
  it('visivelNoQuadro esconde "saiu sem faltas" depois de 30 dias', () => {
    const saiuSem = (saiuEm: string) => caixa({ saiu: true, saiuEm, itens: [] });
    expect(visivelNoQuadro(saiuSem('2026-09-07'), HOJE)).toBe(true);
    expect(visivelNoQuadro(saiuSem('2026-09-06'), HOJE)).toBe(false);
    expect(visivelNoQuadro(saiuSem(''), HOJE)).toBe(true);
    expect(visivelNoQuadro(caixa({ saiu: true, saiuEm: '2026-01-01' }), HOJE)).toBe(true);
  });
});
```

`web/src/regras/busca.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { caixaAtendeBusca, normalizar } from './busca';
import { caixa, item } from './teste-util';

const c = caixa({ os: '90002', peca: 'CALÇA TESTE AÇAI', cliente: 'CLIENTE BETA', responsavel: 'Maria', referencia: 'R-77',
  itens: [item({ nome: 'TAG CUIDADOS PADRÃO', cor: 'amora' })] });

describe('busca', () => {
  it('normalizar tira acento, caixa e espaços das pontas', () => {
    expect(normalizar('  Calça AÇAÍ ')).toBe('calca acai');
  });
  it('procura em OS, peça, cliente, responsável, referência e itens, sem acento', () => {
    expect(caixaAtendeBusca(c, '')).toBe(true);
    expect(caixaAtendeBusca(c, '8887')).toBe(true);
    expect(caixaAtendeBusca(c, 'acai')).toBe(true);
    expect(caixaAtendeBusca(c, 'cliente beta')).toBe(true);
    expect(caixaAtendeBusca(c, 'maria')).toBe(true);
    expect(caixaAtendeBusca(c, 'r-77')).toBe(true);
    expect(caixaAtendeBusca(c, 'padrao')).toBe(true);
    expect(caixaAtendeBusca(c, 'AMORA')).toBe(true);
    expect(caixaAtendeBusca(c, 'zíper')).toBe(false);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd web && npm test`
Esperado: FAIL, com "Failed to resolve import './datas'" e equivalentes.

- [ ] **Step 7: Implementar as regras**

`web/src/regras/datas.ts`:

```ts
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})/;

export function paraData(s: string): Date | null {
  const m = RE_DATA.exec(s ?? '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function diasEntre(desde: string, hoje: Date): number | null {
  const d = paraData(desde);
  if (!d) return null;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((h.getTime() - d.getTime()) / 86_400_000));
}

export function textoDias(n: number | null): string {
  if (n === null) return '';
  if (n === 0) return 'hoje';
  return `há ${n} ${n > 1 ? 'dias' : 'dia'}`;
}

export function ddmm(s: string): string {
  const m = RE_DATA.exec(s ?? '');
  return m ? `${m[3]}/${m[2]}` : '';
}

export function horaMinuto(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
```

`web/src/regras/quantidade.ts`:

```ts
import type { Item } from '../api/tipos';

export function formatarNumero(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// Linha e fio chegam em cones com o peso em gramas ao lado (faltaG).
export function formatarQtd(qtd: number | null, un: string, g: number | null): string {
  if (qtd === null) return '—';
  const base = un ? `${formatarNumero(qtd)} ${un}` : formatarNumero(qtd);
  return g !== null && g > 0 ? `${base} · ${formatarNumero(g)} g` : base;
}

export function contaDoItem(i: Item): string {
  const partes: string[] = [];
  if (i.necessaria !== null) partes.push(`necessário ${formatarNumero(i.necessaria)}`);
  if (i.separada !== null) partes.push(`separado ${formatarNumero(i.separada)}`);
  partes.push(`falta ${formatarQtd(i.falta, i.un, i.faltaG)}`);
  return partes.join(' · ');
}
```

`web/src/regras/texto.ts`:

```ts
export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '—';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}

const TIPOS: Record<string, { nome: string; cor: string }> = {
  ACABAMENTO: { nome: 'Acabamento', cor: 'var(--tipo-acabamento)' },
  COSTURA: { nome: 'Costura', cor: 'var(--tipo-costura)' },
  PREPARACAO: { nome: 'Preparação', cor: 'var(--fog)' }
};

export function nomeDoTipo(tipo: string): string {
  if (!tipo) return 'Caixa';
  return TIPOS[tipo]?.nome ?? tipo.charAt(0) + tipo.slice(1).toLowerCase();
}

export function corDoTipo(tipo: string): string {
  return TIPOS[tipo]?.cor ?? 'var(--fog)';
}
```

`web/src/regras/colunas.ts`:

```ts
import type { Caixa, Item } from '../api/tipos';
import { diasEntre } from './datas';

export type ColunaId = 'falta_pedido' | 'completa_pedido' | 'falta_corte' | 'completa_corte' | 'saiu_com' | 'saiu_sem';

export const COLUNAS: { id: ColunaId; nome: string; cor: string; vazio: string }[] = [
  { id: 'falta_pedido', nome: 'Itens faltando · Pedido', cor: '#D9731F', vazio: 'Nenhuma caixa com falta no ciclo Pedido.' },
  { id: 'completa_pedido', nome: 'Caixa completa · Pedido', cor: '#3FB68B', vazio: 'As caixas vêm para cá sozinhas quando a falta zera.' },
  { id: 'falta_corte', nome: 'Itens faltando · Corte', cor: '#D9731F', vazio: 'Nenhuma caixa com falta no ciclo Corte.' },
  { id: 'completa_corte', nome: 'Caixa completa · Corte', cor: '#3FB68B', vazio: 'As caixas vêm para cá sozinhas quando a falta zera.' },
  { id: 'saiu_com', nome: 'Saiu com faltas', cor: '#8B1D1D', vazio: 'Nenhuma caixa saiu com item em aberto.' },
  { id: 'saiu_sem', nome: 'Saiu sem faltas', cor: '#8A8676', vazio: 'Caixas que saíram completas ficam aqui por 30 dias.' }
];

const DIAS_SAIU_SEM_VISIVEL = 30;

export function itemAberto(i: Item): boolean {
  return (i.status === 'ABERTO' || i.status === 'PARCIAL') && (i.falta === null || i.falta > 0);
}

export function itensAbertos(c: Caixa): Item[] {
  return c.itens.filter(itemAberto);
}

export function colunaDaCaixa(c: Caixa): ColunaId {
  const aberto = c.itens.some(itemAberto);
  if (c.saiu) return aberto ? 'saiu_com' : 'saiu_sem';
  const ciclo = c.ciclo === 'CORTE' ? 'corte' : 'pedido';
  return aberto ? `falta_${ciclo}` : `completa_${ciclo}`;
}

export function visivelNoQuadro(c: Caixa, hoje: Date): boolean {
  if (colunaDaCaixa(c) !== 'saiu_sem') return true;
  const d = diasEntre(c.saiuEm, hoje);
  return d === null || d <= DIAS_SAIU_SEM_VISIVEL;
}
```

`web/src/regras/busca.ts`:

```ts
import type { Caixa } from '../api/tipos';

export function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function caixaAtendeBusca(c: Caixa, q: string): boolean {
  const termo = normalizar(q);
  if (!termo) return true;
  const campos = [c.os, c.referencia, c.peca, c.cliente, c.responsavel, ...c.itens.flatMap((i) => [i.nome, i.cor])];
  return campos.some((x) => normalizar(x).includes(termo));
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd web && npm test`
Esperado: PASS nos 5 arquivos de teste.

- [ ] **Step 9: Commit**

```bash
git add .gitignore web
git commit -m "feat(web): projeto Vite, design system MRBL e regras do quadro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cliente da API e sessão

**Files:**
- Create: `web/src/api/client.ts`, `web/src/api/client.test.ts`, `web/src/auth/sessao.ts`, `web/src/auth/sessao.test.ts`

**Interfaces:**
- Consumes: `Board`, `Sessao` (Task 5).
- Produces:
  - `class ApiError extends Error { status: number }` (status 0 = sem conexão)
  - `entrar(email, senha): Promise<Sessao>`
  - `buscarBoard(token): Promise<Board>`
  - `lerSessao(agora?: number): Sessao | null`
  - `salvarSessao(s: Sessao): void`
  - `limparSessao(): void`

- [ ] **Step 1: Escrever os testes que falham**

`web/src/api/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, buscarBoard, entrar } from './client';

function resposta(status: number, corpo: unknown) {
  return Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_LOGIN', 'http://api.test/pcp-login');
    vi.stubEnv('VITE_API_BOARD', 'http://api.test/pcp-board');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('entrar faz POST com JSON e devolve a sessão', async () => {
    const f = vi.fn(() => resposta(200, { token: 't', nome: 'Lucca', perfil: 'ADM', expiraEm: '2026-10-08T00:00:00.000Z' }));
    vi.stubGlobal('fetch', f);
    const s = await entrar('lucca@rslconsultoria.com', 'x');
    expect(s.nome).toBe('Lucca');
    expect(f).toHaveBeenCalledWith('http://api.test/pcp-login', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ email: 'lucca@rslconsultoria.com', senha: 'x' })
    }));
  });

  it('erro HTTP vira ApiError com status e mensagem do servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(() => resposta(401, { erro: 'E-mail ou senha incorretos.' })));
    await expect(entrar('a', 'b')).rejects.toMatchObject({ status: 401, message: 'E-mail ou senha incorretos.' });
  });

  it('falha de rede vira ApiError status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const e = await buscarBoard('t').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(0);
  });

  it('buscarBoard manda o token no Authorization', async () => {
    const f = vi.fn(() => resposta(200, { geradoEm: 'x', caixas: [], avisos: [] }));
    vi.stubGlobal('fetch', f);
    await buscarBoard('abc');
    expect(f).toHaveBeenCalledWith('http://api.test/pcp-board', expect.objectContaining({
      headers: { Authorization: 'Bearer abc' }
    }));
  });
});
```

`web/src/auth/sessao.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { lerSessao, limparSessao, salvarSessao } from './sessao';

const S = { token: 't', nome: 'Lucca', perfil: 'ADM', expiraEm: '2026-10-08T00:00:00.000Z' };
const ANTES = Date.parse('2026-10-07T12:00:00.000Z');
const DEPOIS = Date.parse('2026-10-08T00:00:01.000Z');

describe('sessao', () => {
  beforeEach(() => localStorage.clear());

  it('salva, lê e limpa', () => {
    salvarSessao(S);
    expect(lerSessao(ANTES)).toEqual(S);
    limparSessao();
    expect(lerSessao(ANTES)).toBeNull();
  });

  it('sessão vencida é descartada', () => {
    salvarSessao(S);
    expect(lerSessao(DEPOIS)).toBeNull();
    expect(localStorage.getItem('pcp-mrbl.sessao')).toBeNull();
  });

  it('conteúdo corrompido não quebra', () => {
    localStorage.setItem('pcp-mrbl.sessao', '{nao e json');
    expect(lerSessao(ANTES)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npm test`
Esperado: FAIL, com "Failed to resolve import './client'" e "'./sessao'".

- [ ] **Step 3: Implementar**

`web/src/api/client.ts`:

```ts
import type { Board, Sessao } from './tipos';

export class ApiError extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ApiError';
  }
}

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  }
  const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
  if (!r.ok) throw new ApiError(r.status, corpo.erro || `Erro ${r.status}`);
  return corpo as T;
}

export function entrar(email: string, senha: string): Promise<Sessao> {
  return pedir<Sessao>(import.meta.env.VITE_API_LOGIN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha })
  });
}

export function buscarBoard(token: string): Promise<Board> {
  return pedir<Board>(import.meta.env.VITE_API_BOARD, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
}
```

`web/src/auth/sessao.ts`:

```ts
import type { Sessao } from '../api/tipos';

const CHAVE = 'pcp-mrbl.sessao';

// localStorage pode lançar exceção (aba privada, bloqueio de dados do site).
// Nesse caso a sessão vale só enquanto a aba estiver aberta.
export function lerSessao(agora: number = Date.now()): Sessao | null {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Sessao;
    if (!s.token || !(Date.parse(s.expiraEm) > agora)) {
      localStorage.removeItem(CHAVE);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function salvarSessao(s: Sessao): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    /* sessão fica só em memória */
  }
}

export function limparSessao(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a limpar */
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npm test`
Esperado: PASS em todos os testes.

- [ ] **Step 5: Commit**

```bash
git add web/src/api web/src/auth
git commit -m "feat(web): cliente da API e sessao no navegador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Telas — login, moldura, quadro, card e painel

**Files:**
- Create: `web/src/hooks/useBoard.ts`, `web/src/componentes/{Icone,Navbar,Subnav,FaixaOffline,CardCaixa,PainelCaixa}.tsx`, `web/src/telas/{Login,NoPloomes}.tsx`, `web/src/styles/app.css`
- Modify: `web/src/main.tsx`, `web/src/App.tsx`, `web/index.html`

**Interfaces:**
- Consumes: tudo das Tasks 5 e 6.
- Produces: `useBoard(token, aoExpirar): { board: Board | null; erroDesde: Date | null; carregando: boolean; recarregar: () => void }`. Os textos visíveis abaixo são os que o e2e da Task 8 procura; não alterar sem alterar os testes.

- [ ] **Step 1: `web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>MRBL · PCP</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/ds/styles.css';
import './styles/mrbl.css';
import './styles/app.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: `web/src/hooks/useBoard.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, buscarBoard } from '../api/client';
import type { Board } from '../api/tipos';

const INTERVALO_MS = 60_000;

export function useBoard(token: string, aoExpirar: () => void) {
  const [board, setBoard] = useState<Board | null>(null);
  const [erroDesde, setErroDesde] = useState<Date | null>(null);
  const [carregando, setCarregando] = useState(true);
  const aoExpirarRef = useRef(aoExpirar);
  aoExpirarRef.current = aoExpirar;

  const recarregar = useCallback(async () => {
    try {
      const b = await buscarBoard(token);
      setBoard(b);
      setErroDesde(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        aoExpirarRef.current();
        return;
      }
      setErroDesde((d) => d ?? new Date());
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void recarregar();
    const id = window.setInterval(() => void recarregar(), INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void recarregar();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [recarregar]);

  return { board, erroDesde, carregando, recarregar };
}
```

- [ ] **Step 4: Componentes da moldura**

`web/src/componentes/Icone.tsx`:

```tsx
import type { ReactElement } from 'react';

export type NomeIcone = 'produtos' | 'bell' | 'propostas' | 'funil' | 'doc' | 'search';

// Traços copiados do conjunto de ícones do Soccius DS.
const DESENHOS: Record<NomeIcone, ReactElement> = {
  produtos: <><path d="M21 16V8l-9-5-9 5v8l9 5z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  propostas: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  funil: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>,
  doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></>
};

export function Icone({ nome, tamanho = 17 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {DESENHOS[nome]}
    </svg>
  );
}
```

`web/src/componentes/Navbar.tsx`:

```tsx
import { useState, type CSSProperties } from 'react';
import { horaMinuto } from '../regras/datas';
import { iniciais } from '../regras/texto';
import { Icone, type NomeIcone } from './Icone';

const GUIAS: { nome: string; icone: NomeIcone; ativa: boolean }[] = [
  { nome: 'No Ploomes', icone: 'produtos', ativa: true },
  { nome: 'Saídas com falta', icone: 'bell', ativa: false },
  { nome: 'Solicitações de faltas', icone: 'propostas', ativa: false },
  { nome: 'Controle de produção', icone: 'funil', ativa: false },
  { nome: 'Visão das peças', icone: 'doc', ativa: false }
];

export function Navbar({ nome, geradoEm, onSair }: { nome: string; geradoEm?: string; onSair: () => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <header className="soc-navbar navbar">
      <div className="marca">
        <span className="marca__mrbl">MRBL</span>
        <span className="marca__divisor" />
        <span className="marca__texto">
          <span className="marca__pcp">PCP</span>
          <span className="marca__local">Confecção · Bragança</span>
        </span>
      </div>
      <nav className="soc-modnav" style={{ '--mc': 'var(--signal)' } as CSSProperties}>
        {GUIAS.map((g) => (
          <button key={g.nome} type="button" className="soc-modnav__item" disabled={!g.ativa}
            aria-current={g.ativa ? 'page' : undefined} title={g.ativa ? undefined : 'Em breve'}>
            <Icone nome={g.icone} />
            <span>{g.nome}</span>
            {!g.ativa && <span className="em-breve">em breve</span>}
          </button>
        ))}
      </nav>
      <div className="navbar__direita">
        <span className="sync" title="Leitura da planilha de faltas">
          <span className="sync__ponto" />
          Ploomes · sincronizado {geradoEm ? horaMinuto(geradoEm) : '--:--'}
        </span>
        <div className="avatar">
          <button type="button" className="avatar__botao" title={nome} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            {iniciais(nome)}
          </button>
          {menu && (
            <div className="avatar__menu" role="menu">
              <span className="avatar__nome">{nome}</span>
              <button type="button" role="menuitem" onClick={onSair}>Sair</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

`web/src/componentes/Subnav.tsx`:

```tsx
import { Icone } from './Icone';

export function Subnav({ q, onQ }: { q: string; onQ: (v: string) => void }) {
  return (
    <div className="soc-subnav subnav">
      <label className="busca">
        <Icone nome="search" tamanho={15} />
        <input type="search" aria-label="Buscar" placeholder="Buscar OS, peça, cliente, responsável ou material"
          value={q} onChange={(e) => onQ(e.target.value)} />
      </label>
      <div className="soc-subnav__spacer" />
    </div>
  );
}
```

`web/src/componentes/FaixaOffline.tsx`:

```tsx
import { horaMinuto } from '../regras/datas';

export function FaixaOffline({ desde }: { desde: Date }) {
  return (
    <div className="faixa-offline" role="status">
      Sem conexão desde {horaMinuto(desde.toISOString())} — tentando de novo. O quadro mostra os últimos dados carregados.
    </div>
  );
}
```

- [ ] **Step 5: Card e painel**

`web/src/componentes/CardCaixa.tsx`:

```tsx
import type { Caixa } from '../api/tipos';
import { itensAbertos } from '../regras/colunas';
import { ddmm, diasEntre, textoDias } from '../regras/datas';
import { formatarQtd } from '../regras/quantidade';
import { corDoTipo, iniciais, nomeDoTipo } from '../regras/texto';

interface Props { caixa: Caixa; hoje: Date; selecionada: boolean; onAbrir: () => void }

export function CardCaixa({ caixa, hoje, selecionada, onAbrir }: Props) {
  const abertos = itensAbertos(caixa);
  const resolvidos = caixa.itens.filter((i) => i.status === 'RESOLVIDO').length;
  const dias = diasEntre(caixa.registradoEm, hoje);
  return (
    <div role="button" tabIndex={0} aria-pressed={selecionada} aria-label={`OS ${caixa.os}`}
      className={selecionada ? 'card card--selecionado' : 'card'} onClick={onAbrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}>
      <div className="card__topo">
        <span className="tipo"><span className="tipo__ponto" style={{ background: corDoTipo(caixa.tipo) }} />{nomeDoTipo(caixa.tipo)}</span>
        <span className="card__cliente">{caixa.cliente}</span>
      </div>
      <div>
        <div className="card__os">{caixa.os}</div>
        <div className="card__peca">{caixa.peca}</div>
      </div>
      <div className="selos">
        <span className={abertos.length ? 'selo selo--falta' : 'selo selo--ok'}>
          {abertos.length ? `${abertos.length} ${abertos.length > 1 ? 'itens faltando' : 'item faltando'}` : 'nada faltando'}
        </span>
        {dias !== null && <span className="selo">{textoDias(dias)}</span>}
      </div>
      {abertos.length > 0 && (
        <div className="card__itens">
          {abertos.map((i) => (
            <div key={i.id} className="card__item">
              <div className="card__item-linha">
                <span className="card__item-nome">{i.nome} <span className="card__item-cor">{i.cor}</span></span>
                <span className="card__item-qtd">{formatarQtd(i.falta, i.un, i.faltaG)}</span>
              </div>
              {i.previsao && <span className="card__item-prev">previsão {ddmm(i.previsao)}</span>}
              {i.obs && <span className="card__item-obs">{i.obs}</span>}
            </div>
          ))}
        </div>
      )}
      {resolvidos > 0 && (
        <span className="card__resolvidos">+ {resolvidos} {resolvidos > 1 ? 'itens já resolvidos' : 'item já resolvido'}</span>
      )}
      {caixa.responsavel && (
        <div className="card__rodape">
          <span className="resp"><span className="resp__ini">{iniciais(caixa.responsavel)}</span>{caixa.responsavel}</span>
        </div>
      )}
    </div>
  );
}
```

`web/src/componentes/PainelCaixa.tsx`:

```tsx
import type { Caixa, Item } from '../api/tipos';
import { colunaDaCaixa, COLUNAS, itemAberto } from '../regras/colunas';
import { ddmm, diasEntre, textoDias } from '../regras/datas';
import { contaDoItem } from '../regras/quantidade';
import { corDoTipo, nomeDoTipo } from '../regras/texto';

const URL_PLOOMES = 'https://app10.ploomes.com/deal/';

function ItemDoPainel({ item }: { item: Item }) {
  const aberto = itemAberto(item);
  return (
    <div className="item">
      <div className="item__topo">
        <div className="item__nomes">
          <span className="item__nome">{item.nome}</span>
          <span className="item__cor">{[item.cor, item.un].filter(Boolean).join(' · ')}</span>
        </div>
        <span className={aberto ? 'tag tag--falta' : 'tag tag--ok'}>{aberto ? item.status.toLowerCase() : 'resolvido'}</span>
      </div>
      <span className="item__conta">{contaDoItem(item)}</span>
      {item.previsao && <span className="item__prev">previsão {ddmm(item.previsao)}</span>}
      {item.obs && <span className="item__obs">{item.obs}</span>}
      {item.resolvidoEm && <span className="item__resolvido">resolvido em {ddmm(item.resolvidoEm)}</span>}
    </div>
  );
}

export function PainelCaixa({ caixa, hoje, onFechar }: { caixa: Caixa; hoje: Date; onFechar: () => void }) {
  const coluna = COLUNAS.find((c) => c.id === colunaDaCaixa(caixa))!;
  const dias = diasEntre(caixa.registradoEm, hoje);
  const itens = [...caixa.itens].sort((a, b) => Number(itemAberto(b)) - Number(itemAberto(a)));
  return (
    <aside className="painel" aria-label={`Caixa da OS ${caixa.os}`}>
      <div className="painel__cabecalho">
        <div className="painel__linha">
          <span className="tipo"><span className="tipo__ponto" style={{ background: corDoTipo(caixa.tipo) }} />{nomeDoTipo(caixa.tipo)} · {caixa.cliente || '—'}</span>
          <button type="button" className="painel__fechar" title="Fechar" aria-label="Fechar" onClick={onFechar}>×</button>
        </div>
        <div className="painel__os">{caixa.os}</div>
        <div className="painel__peca">{caixa.peca}</div>
        {caixa.referencia && <div className="painel__ref">{caixa.referencia}</div>}
        <a className="painel__link" href={URL_PLOOMES + caixa.dealId} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
      </div>
      <div className="painel__corpo">
        <dl className="leitura">
          <div><dt>Responsável</dt><dd>{caixa.responsavel || '—'}</dd></div>
          <div><dt>Etapa atual</dt><dd>{coluna.nome}</dd></div>
          <div><dt>Registro</dt><dd>{caixa.registradoEm ? `${ddmm(caixa.registradoEm)} · ${textoDias(dias)}` : '—'}</dd></div>
          {caixa.saiu && <div><dt>Saiu do almoxarifado</dt><dd>{caixa.saiuEm ? ddmm(caixa.saiuEm) : 'sim'}</dd></div>}
        </dl>
        <section className="secao">
          <span className="eyebrow">Itens</span>
          {itens.map((i) => <ItemDoPainel key={i.id} item={i} />)}
          {itens.length === 0 && <p className="vazio">Nenhum item registrado nesta caixa.</p>}
        </section>
        <p className="painel__nota">Baixa, previsão e responsável passam a ser editáveis aqui na próxima fase.</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 6: Telas**

`web/src/telas/Login.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { ApiError, entrar } from '../api/client';
import type { Sessao } from '../api/tipos';

const MENSAGENS: Record<number, string> = {
  0: 'Sem conexão com o servidor. Confira a internet e tente de novo.',
  400: 'Informe e-mail e senha.',
  401: 'E-mail ou senha incorretos.',
  429: 'Muitas tentativas. Tente de novo em 15 minutos.'
};

export function Login({ aviso, onEntrar }: { aviso: string; onEntrar: (s: Sessao) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      onEntrar(await entrar(email.trim(), senha));
    } catch (x) {
      const status = x instanceof ApiError ? x.status : -1;
      setErro(MENSAGENS[status] ?? 'Não foi possível entrar agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="login__caixa" onSubmit={enviar}>
        <div className="login__marca">
          <span className="marca__mrbl">MRBL</span>
          <span className="marca__divisor" />
          <span className="marca__texto"><span className="marca__pcp">PCP</span><span className="marca__local">Confecção · Bragança</span></span>
        </div>
        <div className="login__corpo">
          {aviso && <p className="login__aviso" role="status">{aviso}</p>}
          <label className="campo"><span>E-mail</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="campo"><span>Senha</span>
            <input type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </label>
          {erro && <p className="login__erro" role="alert">{erro}</p>}
          <button type="submit" className="botao botao--signal" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        </div>
      </form>
    </div>
  );
}
```

`web/src/telas/NoPloomes.tsx`:

```tsx
import { useState } from 'react';
import type { Board } from '../api/tipos';
import { CardCaixa } from '../componentes/CardCaixa';
import { PainelCaixa } from '../componentes/PainelCaixa';
import { caixaAtendeBusca } from '../regras/busca';
import { colunaDaCaixa, COLUNAS, visivelNoQuadro } from '../regras/colunas';

export function NoPloomes({ board, q, hoje }: { board: Board; q: string; hoje: Date }) {
  const [selId, setSelId] = useState<string | null>(null);
  const visiveis = board.caixas.filter((c) => visivelNoQuadro(c, hoje) && caixaAtendeBusca(c, q));
  const sel = board.caixas.find((c) => c.id === selId) ?? null;
  return (
    <div className="quadro">
      <div className="quadro__rolagem">
        <div className="quadro__trilho">
          {COLUNAS.map((col) => {
            const cs = visiveis.filter((c) => colunaDaCaixa(c) === col.id);
            return (
              <section key={col.id} className="coluna" aria-label={col.nome}>
                <header className="coluna__cabecalho">
                  <span className="coluna__ponto" style={{ background: col.cor }} />
                  <span className="coluna__nome">{col.nome}</span>
                  <span className="coluna__qtd">{cs.length}</span>
                </header>
                <div className="coluna__cards">
                  {cs.map((c) => (
                    <CardCaixa key={c.id} caixa={c} hoje={hoje} selecionada={c.id === selId}
                      onAbrir={() => setSelId(c.id === selId ? null : c.id)} />
                  ))}
                  {cs.length === 0 && <div className="coluna__vazio">{q ? 'Nenhuma caixa desta etapa atende à busca.' : col.vazio}</div>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {sel && <PainelCaixa caixa={sel} hoje={hoje} onFechar={() => setSelId(null)} />}
    </div>
  );
}
```

`web/src/App.tsx`:

```tsx
import { useCallback, useState } from 'react';
import type { Sessao } from './api/tipos';
import { lerSessao, limparSessao, salvarSessao } from './auth/sessao';
import { FaixaOffline } from './componentes/FaixaOffline';
import { Navbar } from './componentes/Navbar';
import { Subnav } from './componentes/Subnav';
import { useBoard } from './hooks/useBoard';
import { Login } from './telas/Login';
import { NoPloomes } from './telas/NoPloomes';

function Quadro({ sessao, aoExpirar, onSair }: { sessao: Sessao; aoExpirar: () => void; onSair: () => void }) {
  const { board, erroDesde, carregando } = useBoard(sessao.token, aoExpirar);
  const [q, setQ] = useState('');
  const hoje = new Date();
  return (
    <div className="app">
      <Navbar nome={sessao.nome} geradoEm={board?.geradoEm} onSair={onSair} />
      <Subnav q={q} onQ={setQ} />
      {erroDesde && <FaixaOffline desde={erroDesde} />}
      <main className="app__principal">
        {board ? <NoPloomes board={board} q={q} hoje={hoje} />
          : <div className="carregando">{carregando ? 'Carregando o quadro…' : 'Não foi possível carregar o quadro.'}</div>}
      </main>
    </div>
  );
}

export default function App() {
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessao());
  const [aviso, setAviso] = useState('');

  const sair = useCallback((msg: string) => {
    limparSessao();
    setAviso(msg);
    setSessao(null);
  }, []);

  if (!sessao) {
    return <Login aviso={aviso} onEntrar={(s) => { salvarSessao(s); setAviso(''); setSessao(s); }} />;
  }
  return (
    <Quadro sessao={sessao} aoExpirar={() => sair('Sua sessão expirou. Entre de novo.')} onSair={() => sair('')} />
  );
}
```

- [ ] **Step 7: `web/src/styles/app.css`**

```css
/* Telas da F1. Medidas e cores do README do handoff (Shell e tela 1). */
.app { height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: var(--paper); }
.app__principal { flex: 1; min-height: 0; display: flex; position: relative; }
.carregando { margin: auto; color: var(--slate); font-size: 13.5px; }

/* Navbar */
.navbar { background: var(--navy); gap: 18px; flex: none; }
.marca { display: flex; align-items: center; gap: 12px; flex: none; }
.marca__mrbl { font-family: var(--font-display-alt); font-size: 22px; font-weight: 500; letter-spacing: .03em; color: #fff; line-height: 1; }
.marca__divisor { width: 1px; height: 24px; background: rgba(255,255,255,.18); }
.marca__texto { display: flex; flex-direction: column; gap: 3px; line-height: 1; }
.marca__pcp { font-size: 10.5px; font-weight: 700; letter-spacing: .09em; color: var(--signal); text-transform: uppercase; }
.marca__local { font-size: 11px; color: var(--mist); }
.soc-modnav__item:disabled { cursor: default; opacity: .55; }
.soc-modnav__item:disabled:hover { background: transparent; color: var(--mist); }
.em-breve { font-family: var(--font-mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--mist); border: 1px solid var(--graphite); border-radius: 2px; padding: 0 4px; }
.navbar__direita { display: flex; align-items: center; gap: 14px; flex: none; }
.sync { display: flex; align-items: center; gap: 7px; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .04em; color: var(--mist); }
.sync__ponto { width: 7px; height: 7px; border-radius: 50%; background: #3FB68B; }
.avatar { position: relative; }
.avatar__botao { display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border: 0; border-radius: 4px; background: var(--signal); color: var(--ink); font-family: var(--font-mono); font-size: 11px; font-weight: 700; cursor: pointer; }
.avatar__menu { position: absolute; right: 0; top: 40px; z-index: 40; min-width: 160px; display: flex; flex-direction: column; gap: 4px; padding: 8px; background: #fff; border: 1px solid var(--line); border-radius: 5px; box-shadow: var(--shadow-popover); }
.avatar__nome { font-size: 12px; color: var(--slate); padding: 4px 6px; }
.avatar__menu button { border: 0; background: transparent; text-align: left; padding: 6px; border-radius: 3px; font: 600 13px var(--font-sans); color: var(--ink); cursor: pointer; }
.avatar__menu button:hover { background: var(--paper-2); }

/* Subnav e busca */
.subnav { flex: none; }
.busca { display: flex; align-items: center; gap: 8px; width: 380px; margin: 8px 0 8px 16px; padding: 0 10px; height: 36px; border-radius: 4px; background: rgba(255,255,255,.08); color: var(--mist); }
.busca:focus-within { box-shadow: var(--focus-ring); }
.busca input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #fff; font: 13px var(--font-sans); }
.busca input::placeholder { color: var(--mist); }

/* Faixa de conexão */
.faixa-offline { flex: none; padding: 8px 20px; background: #FFF4D6; border-bottom: 1px solid #E9C96A; color: #6B4E00; font-size: 13px; }

/* Quadro */
.quadro { flex: 1; min-width: 0; display: flex; }
.quadro__rolagem { flex: 1; min-width: 0; overflow: auto; background: var(--paper-2); }
.quadro__trilho { display: flex; min-height: 100%; width: max-content; min-width: 100%; }
.coluna { flex: 0 0 296px; display: flex; flex-direction: column; border-right: 1px solid var(--line); background: var(--paper-2); min-height: 100%; }
.coluna__cabecalho { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; background: var(--paper); border-bottom: 1px solid var(--line); flex: none; }
.coluna__ponto { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.coluna__nome { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.coluna__qtd { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--slate); }
.coluna__cards { display: flex; flex-direction: column; gap: 10px; padding: 10px; }
.coluna__vazio { padding: 14px 6px; font-size: 12px; line-height: 1.5; color: var(--fog); text-align: center; }

/* Card */
.card { background: #fff; border: 1px solid var(--line); box-shadow: var(--shadow-card); border-radius: 3px; padding: 12px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; text-align: left; transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease; }
.card:hover { transform: translateY(-1px); }
.card:focus-visible { outline: 0; box-shadow: var(--focus-ring); }
.card--selecionado { border-color: var(--navy); box-shadow: 0 0 0 1px var(--navy), var(--shadow-card); }
.card__topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--slate); }
.tipo { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 11.5px; color: var(--slate); }
.tipo__ponto { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.card__cliente { font-weight: 600; }
.card__os { font-family: var(--font-mono); font-size: 19px; font-weight: 700; letter-spacing: .02em; line-height: 1.2; }
.card__peca { font-size: 13px; font-weight: 600; line-height: 1.35; }
.selos { display: flex; flex-wrap: wrap; gap: 5px; }
.selo { display: inline-flex; align-items: center; border-radius: 3px; padding: 1px 7px; font-family: var(--font-mono); font-size: 10.5px; color: var(--slate); background: var(--paper-3); }
.selo--falta { font-weight: 700; color: var(--falta); background: var(--falta-bg); }
.selo--ok { font-weight: 700; color: var(--ok-text); background: var(--ok-bg); }
.card__itens { display: flex; flex-direction: column; border-top: 1px solid var(--paper-3); }
.card__item { display: flex; flex-direction: column; gap: 1px; padding: 6px 0; border-bottom: 1px solid var(--paper-3); }
.card__item-linha { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
.card__item-nome { font-size: 12px; font-weight: 600; line-height: 1.35; }
.card__item-cor { font-weight: 400; color: var(--slate); }
.card__item-qtd { flex: none; font-family: var(--font-mono); font-size: 11.5px; font-weight: 700; color: var(--falta); text-align: right; }
.card__item-prev { font-family: var(--font-mono); font-size: 10.5px; color: var(--navy); }
.card__item-obs { font-size: 11.5px; font-style: italic; color: var(--slate); }
.card__resolvidos { font-size: 11.5px; font-weight: 600; color: var(--ok-text); }
.card__rodape { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid rgba(10,14,20,.06); padding-top: 8px; }
.resp { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--slate); }
.resp__ini { display: flex; width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; background: rgba(19,39,122,.1); color: var(--navy); font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; }

/* Painel */
.painel { flex: 0 0 480px; min-width: 0; overflow: auto; background: #fff; border-left: 1px solid var(--line); box-shadow: -12px 0 30px -24px rgba(10,14,20,.4); }
.painel__cabecalho { padding: 18px 20px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
.painel__linha { display: flex; align-items: center; justify-content: space-between; }
.painel__fechar { border: 0; background: transparent; font-size: 22px; line-height: 1; color: var(--slate); cursor: pointer; padding: 0 4px; }
.painel__os { font-family: var(--font-mono); font-size: 26px; font-weight: 700; letter-spacing: .02em; line-height: 1.1; }
.painel__peca { font-size: 14px; font-weight: 600; }
.painel__ref { font-family: var(--font-mono); font-size: 11.5px; color: var(--slate); }
.painel__link { font-size: 12.5px; font-weight: 600; margin-top: 4px; }
.painel__corpo { padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }
.leitura { margin: 0; display: flex; flex-direction: column; gap: 2px; }
.leitura div { display: grid; grid-template-columns: 170px minmax(0,1fr); gap: 10px; font-size: 13px; padding: 3px 0; }
.leitura dt { color: var(--slate); }
.leitura dd { margin: 0; font-weight: 600; }
.secao { display: flex; flex-direction: column; gap: 8px; }
.eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--fog); }
.item { border: 1px solid var(--line); border-radius: 5px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.item__topo { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.item__nomes { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.item__nome { font-size: 13px; font-weight: 700; }
.item__cor { font-size: 12px; color: var(--slate); }
.item__conta { font-family: var(--font-mono); font-size: 11.5px; color: var(--slate); }
.item__prev { font-family: var(--font-mono); font-size: 11px; color: var(--navy); }
.item__obs { font-size: 12px; font-style: italic; color: var(--slate); }
.item__resolvido { font-family: var(--font-mono); font-size: 11px; color: var(--ok-text); }
.tag { flex: none; border-radius: 3px; padding: 1px 7px; font-family: var(--font-mono); font-size: 10.5px; font-weight: 700; }
.tag--falta { color: var(--falta); background: var(--falta-bg); }
.tag--ok { color: var(--ok-text); background: var(--ok-bg); }
.vazio { margin: 0; font-size: 13px; color: var(--slate); }
.painel__nota { margin: 0; padding: 10px 12px; border-radius: 4px; background: var(--navy-tint); color: var(--navy); font-size: 12.5px; }

/* Login */
.login { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--paper-2); }
.login__caixa { width: 100%; max-width: 380px; background: #fff; border: 1px solid var(--line); border-radius: 5px; box-shadow: var(--shadow-popover); overflow: hidden; }
.login__marca { display: flex; align-items: center; gap: 12px; padding: 18px 20px; background: var(--navy); }
.login__corpo { display: flex; flex-direction: column; gap: 14px; padding: 20px; }
.login__aviso { margin: 0; padding: 8px 10px; border-radius: 4px; background: var(--navy-tint); color: var(--navy); font-size: 13px; }
.login__erro { margin: 0; color: var(--erro-text); font-size: 13px; }
.campo { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: var(--slate); }
.campo input { height: 32px; padding: 0 10px; border: 1px solid var(--line); border-radius: 4px; font: 13.5px var(--font-sans); color: var(--ink); background: #fff; }
.campo input:focus { outline: 0; border-color: var(--signal); box-shadow: var(--focus-ring); }
.botao { height: 34px; border: 0; border-radius: 4px; padding: 0 14px; font: 600 13px var(--font-sans); cursor: pointer; }
.botao--signal { background: var(--signal); color: var(--ink); }
.botao--signal:hover { background: var(--signal-hi); }
.botao:disabled { opacity: .6; cursor: default; }

@media (max-width: 720px) {
  .busca { width: auto; flex: 1; margin-right: 16px; }
  .navbar__direita .sync { display: none; }
  .painel { position: absolute; inset: 0; flex-basis: auto; }
}
```

- [ ] **Step 8: Conferir build e testes**

Run: `cd web && npm test && npm run build`
Esperado: testes PASS e o build termina gerando `web/dist/`, sem erro de tipo.

- [ ] **Step 9: Conferência visual rápida**

Criar `web/.env.local` (fica fora do git pelo padrão `.env.*`), com as URLs reais de `n8n/workflows/README.md`. Rodar `npm run dev`, abrir `http://localhost:5173/pcp-mrbl/` no navegador embutido e conferir que:
- o login aparece com a faixa azul-marinho e a marca;
- com uma senha errada, aparece "E-mail ou senha incorretos.".

Não entrar com a senha real: isso é feito pelo usuário na Task 9. Comparar o visual com `design_handoff_pcp_mrbl/PCP MRBL.dc.html` servido com `npx serve design_handoff_pcp_mrbl`.

- [ ] **Step 10: Commit**

```bash
git add web/index.html web/src
git commit -m "feat(web): login, moldura, quadro No Ploomes, card e painel de leitura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Testes de ponta a ponta (Playwright)

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/fixtures/board.json`, `web/e2e/f1.spec.ts`
- Modify: `web/tsconfig.app.json`, se o `tsc -b` tentar compilar `e2e/`. Garantir que `include` seja só `["src"]`.

**Interfaces:**
- Consumes: textos e `aria-label` da Task 7. URLs falsas de `web/.env.e2e`.

- [ ] **Step 1: `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173/pcp-mrbl/', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:e2e && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/pcp-mrbl/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
```

- [ ] **Step 2: Fixture `web/e2e/fixtures/board.json`**

Os dados são fictícios, inspirados nos exemplos da spec.

```json
{
  "geradoEm": "2026-10-07T10:58:00.000Z",
  "avisos": [],
  "caixas": [
    {
      "id": "700001", "dealId": "700001", "os": "90002", "ciclo": "PEDIDO", "tipo": "ACABAMENTO",
      "referencia": "REF-01", "peca": "CALÇA TESTE AÇAI", "cliente": "CLIENTE BETA", "responsavel": "Maria",
      "registradoEm": "2026-10-01", "saiu": false, "saiuComFalta": false, "saiuEm": "",
      "itens": [
        { "id": "a1", "nome": "LINHA 120 RESISTENTE 335", "cor": "amora", "un": "cones", "necessaria": 4, "separada": 2, "falta": 2, "faltaG": 100, "status": "PARCIAL", "obs": "", "previsao": "2026-10-09", "resolvidoEm": "" },
        { "id": "a2", "nome": "TAG CUIDADOS PADRÃO", "cor": "", "un": "UN", "necessaria": 26, "separada": 0, "falta": 26, "faltaG": null, "status": "ABERTO", "obs": "fornecedor confirmou envio", "previsao": "", "resolvidoEm": "" },
        { "id": "a3", "nome": "ETIQUETA COMPOSIÇÃO", "cor": "", "un": "UN", "necessaria": 26, "separada": 26, "falta": 0, "faltaG": null, "status": "RESOLVIDO", "obs": "", "previsao": "", "resolvidoEm": "2026-10-03" }
      ]
    },
    {
      "id": "700002", "dealId": "700002", "os": "90001", "ciclo": "PEDIDO", "tipo": "COSTURA",
      "referencia": "REF-02", "peca": "PECA TESTE A", "cliente": "CLIENTE ALFA", "responsavel": "Lucca",
      "registradoEm": "2026-10-03", "saiu": false, "saiuComFalta": false, "saiuEm": "",
      "itens": [
        { "id": "b1", "nome": "ZÍPER METAL MÉDIO FIXO CA 18CM", "cor": "", "un": "UN", "necessaria": 52, "separada": 0, "falta": 52, "faltaG": null, "status": "ABERTO", "obs": "", "previsao": "", "resolvidoEm": "" }
      ]
    },
    {
      "id": "700003", "dealId": "700003", "os": "90003", "ciclo": "CORTE", "tipo": "COSTURA",
      "referencia": "REF-03", "peca": "PECA TESTE B", "cliente": "CLIENTE BETA", "responsavel": "",
      "registradoEm": "2026-09-16", "saiu": true, "saiuComFalta": true, "saiuEm": "2026-09-18",
      "itens": [
        { "id": "c1", "nome": "VIES LINEAR 6 CM", "cor": "cobra", "un": "MT", "necessaria": null, "separada": null, "falta": 450, "faltaG": null, "status": "ABERTO", "obs": "", "previsao": "", "resolvidoEm": "" }
      ]
    }
  ]
}
```

- [ ] **Step 3: Escrever `web/e2e/f1.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';
import board from './fixtures/board.json' with { type: 'json' };

const LOGIN = 'http://api.test/pcp-login';
const BOARD = 'http://api.test/pcp-board';
const SESSAO = { token: 'f'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: '2099-01-01T00:00:00.000Z' };

async function entrar(page: Page) {
  await page.route(LOGIN, (r) => r.fulfill({ json: SESSAO }));
  await page.goto('./');
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('qualquer-coisa');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00-03:00'));
});

test('senha errada mostra o erro e não entra', async ({ page }) => {
  await page.route(LOGIN, (r) => r.fulfill({ status: 401, json: { erro: 'E-mail ou senha incorretos.' } }));
  await page.goto('./');
  await page.getByLabel('E-mail').fill('lucca@rslconsultoria.com');
  await page.getByLabel('Senha').fill('errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
});

test('entra e mostra as caixas nas colunas certas', async ({ page }) => {
  let auth = '';
  await page.route(BOARD, (r) => { auth = r.request().headers()['authorization']; return r.fulfill({ json: board }); });
  await entrar(page);
  const faltaPedido = page.getByRole('region', { name: 'Itens faltando · Pedido' });
  await expect(faltaPedido.getByRole('button', { name: 'OS 90002' })).toBeVisible();
  await expect(faltaPedido.getByRole('button', { name: 'OS 90001' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saiu com faltas' }).getByRole('button', { name: 'OS 90003' })).toBeVisible();
  const card = faltaPedido.getByRole('button', { name: 'OS 90002' });
  await expect(card).toContainText('2 itens faltando');
  await expect(card).toContainText('2 cones · 100 g');
  await expect(card).toContainText('+ 1 item já resolvido');
  expect(auth).toBe(`Bearer ${SESSAO.token}`);
});

test('busca ignora acentos', async ({ page }) => {
  await page.route(BOARD, (r) => r.fulfill({ json: board }));
  await entrar(page);
  await page.getByLabel('Buscar').fill('acai');
  await expect(page.getByRole('button', { name: 'OS 90002' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OS 90001' })).toHaveCount(0);
  await page.getByLabel('Buscar').fill('ziper');
  await expect(page.getByRole('button', { name: 'OS 90001' })).toBeVisible();
});

test('clicar no card abre o painel com o link do Ploomes', async ({ page }) => {
  await page.route(BOARD, (r) => r.fulfill({ json: board }));
  await entrar(page);
  await page.getByRole('button', { name: 'OS 90002' }).click();
  const painel = page.getByRole('complementary', { name: 'Caixa da OS 90002' });
  await expect(painel.getByRole('link', { name: 'Abrir card no Ploomes' })).toHaveAttribute('href', 'https://app10.ploomes.com/deal/700001');
  await expect(painel).toContainText('necessário 4 · separado 2 · falta 2 cones · 100 g');
  await painel.getByRole('button', { name: 'Fechar' }).click();
  await expect(painel).toHaveCount(0);
});

test('sessão expirada volta para o login com aviso', async ({ page }) => {
  await page.route(BOARD, (r) => r.fulfill({ status: 401, json: { erro: 'Sessão expirada.' } }));
  await entrar(page);
  await expect(page.getByText('Sua sessão expirou. Entre de novo.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('sem conexão mantém o quadro e mostra a faixa', async ({ page }) => {
  let falhar = false;
  await page.route(BOARD, (r) => (falhar ? r.abort('internetdisconnected') : r.fulfill({ json: board })));
  await entrar(page);
  await expect(page.getByRole('button', { name: 'OS 90001' })).toBeVisible();
  falhar = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('status').filter({ hasText: 'Sem conexão desde' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'OS 90001' })).toBeVisible();
});
```

- [ ] **Step 4: Instalar o navegador e rodar**

Run: `cd web && npx playwright install chromium && npm run e2e`
Esperado: 6 testes PASS.

Se algum falhar por causa de texto ou papel ARIA, corrigir o componente (não o teste) para bater com a spec. Se o problema for o import do JSON com `with { type: 'json' }`, trocar por `import board from './fixtures/board.json';` e conferir de novo.

- [ ] **Step 5: Commit**

```bash
git add web/playwright.config.ts web/e2e web/tsconfig.app.json
git commit -m "test(web): e2e da F1 com n8n simulado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Publicação no GitHub Pages e conferência com dados reais

**Files:**
- Create: `.github/workflows/publicar.yml`, `README.md` (raiz)

**Interfaces:**
- Consumes: as URLs de `n8n/workflows/README.md`, os scripts `test`/`e2e`/`build` de `web/` e o `test` de `n8n/`.

- [ ] **Step 1: `.github/workflows/publicar.yml`**

```yaml
name: Testar e publicar
on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  testar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json
      - name: Testes n8n
        run: npm test
        working-directory: n8n
      - run: npm ci
        working-directory: web
      - name: Testes unitários web
        run: npm test
        working-directory: web
      - run: npx playwright install --with-deps chromium
        working-directory: web
      - name: Testes e2e
        run: npm run e2e
        working-directory: web

  publicar:
    needs: testar
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
        working-directory: web
      - run: npm run build
        working-directory: web
        env:
          VITE_API_LOGIN: ${{ vars.VITE_API_LOGIN }}
          VITE_API_BOARD: ${{ vars.VITE_API_BOARD }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web/dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: `README.md` da raiz**

```markdown
# PCP MRBL

Software de PCP da MRBL Confecção. Quadro de faltas por caixa e, nas próximas fases, saídas com falta, solicitações, controle de produção e visão das peças.

- App: https://rslconsultoria.github.io/pcp-mrbl/
- Front: `web/` (Vite + React + TS). `npm run dev`, `npm test`, `npm run e2e`
- Backend: workflows n8n em `n8n/` (lógica testável em `n8n/src`, Code nodes gerados em `n8n/build`). Veja `n8n/workflows/README.md`
- Specs e planos: `docs/superpowers/`

Nenhuma credencial fica neste repositório. Ele é público.

## Novo usuário

1. Adicionar uma linha na aba USUARIOS (`email, nome, perfil, senha_hash, ativo=SIM`).
2. Quem vai usar roda `cd n8n && npm run hash-senha` na própria máquina e cola o resultado em `senha_hash`.
```

- [ ] **Step 3: Configurar o Pages e as variáveis (comandos no GitHub — confirmar com o usuário antes)**

```bash
gh api repos/RSLConsultoria/pcp-mrbl/pages -X POST -f build_type=workflow
gh variable set VITE_API_LOGIN --repo RSLConsultoria/pcp-mrbl --body "<URL pcp-login>"
gh variable set VITE_API_BOARD --repo RSLConsultoria/pcp-mrbl --body "<URL pcp-board>"
```

Esperado: o primeiro comando responde com JSON contendo `"build_type": "workflow"`. Se o Pages já existir, responde 409, e nesse caso trocar `-X POST` por `-X PUT`.

- [ ] **Step 4: Commit, push e acompanhar o Actions**

```bash
git add .github README.md
git commit -m "ci: testes e publicacao no GitHub Pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
gh run watch --repo RSLConsultoria/pcp-mrbl --exit-status
```

Esperado: os jobs `testar` e `publicar` verdes, e o app respondendo em `https://rslconsultoria.github.io/pcp-mrbl/`.

- [ ] **Step 5: Conferência com dados reais (com o usuário)**

Pedir ao usuário que:
1. entre com `lucca@rslconsultoria.com` e a senha que gerou na Task 4;
2. procure duas OS reais escolhidas pelo dono e compare coluna, itens e quantidades com a aba FALTANTES;
3. abra uma caixa de "Saiu com faltas" e confira com a CAIXAS GANHAS.

Registrar o resultado e qualquer divergência em `docs/superpowers/notes/2026-10-07-f1-conferencia.md`. Divergências viram correção no `montarCaixas` (com teste novo) antes de fechar a fase.

- [ ] **Step 6: Commit da conferência**

```bash
git add docs/superpowers/notes
git commit -m "docs: conferencia da F1 com dados reais

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```
