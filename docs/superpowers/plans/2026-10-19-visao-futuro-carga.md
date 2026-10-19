# Visão de futuro e carga das oficinas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prever a chegada e a saída da Costura das OS nas etapas 12 a 16 com o motor de previsão do BI do dono, guardar a capacidade semanal de cada oficina e mostrar a carga das oficinas por semana (visão Carga), além do filtro "Incluir previstas" no Gantt e na Tabela.

**Architecture:** Um módulo ES5 puro novo (`n8n/src/previsao.js`) reimplementa a regra do DAX (faixa, IQR, médias, filas, projeção). Um workflow diário novo ("PCP MRBL - Médias de Previsão") lê o histórico marcado no Ploomes e grava a aba nova `PREVISAO_MEDIAS`; o "PCP MRBL - Sincronizar Produção" passa a ler também as etapas 12 a 16, projeta a Costura dessas OS com essas médias e grava colunas novas no fim da `PRODUCAO`. O board leva as OS previstas e a capacidade das oficinas; no front, uma regra pura (`web/src/regras/carga.ts`) monta a carga semanal e a tela ganha a terceira visão (Gantt | Tabela | Carga).

**Tech Stack:** n8n (Code nodes ES5 gerados de `n8n/src` + `n8n/adaptadores`, workflows gerados por `n8n/scripts/gerar-workflow-sdk.js`), testes `node --test`; Vite + React 19 + TypeScript, Vitest, Playwright; Google Sheets (API em lote) e Ploomes (API REST OData).

**Spec:** `docs/superpowers/specs/2026-10-19-visao-futuro-carga-design.md` (aprovado em 19/10). Plano anterior de referência: `docs/superpowers/plans/2026-10-13-f4-gantt-whatsapp.md`.

## Global Constraints

- Tudo em português do Brasil: commits, comentários, textos da interface e mensagens ao dono.
- O repositório é público: testes, fixtures, mock e documentação só com dados fictícios (nada de clientes, OS, oficinas, chaves ou tokens reais). Não ler nem copiar nada da pasta `arquivoPBI` (o modelo do BI fica fora do repositório).
- `n8n/src/*.js` e `n8n/adaptadores/*.js` em JavaScript ES5 puro: `var`, `function`, sem `import`/`export`, sem arrow functions, sem `let`/`const`, sem template strings. Os scripts de `n8n/scripts` e os testes de `n8n/test` são Node moderno (CommonJS) e podem usar ES2015+.
- TDD em todas as tarefas: teste falhando primeiro, depois o código mínimo, depois o teste passando; revisão do diff ao fim de cada tarefa.
- Colunas novas sempre **no fim** das abas, sem reordenar as existentes. Nunca ordenar nem apagar linhas das abas do app; as gravações usam o número da linha.
- `DEALS_PRODUCAO_EDITAVEIS` continua `['0']` em `n8n/src/api.js` (nenhuma OS de produção editável até haver card de teste). `DEALS_EDITAVEIS` e `DEALS_PERMITIDOS` não mudam.
- Os gerados (`n8n/build/*.js`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json`) são commitados junto com as fontes: depois de mexer em `n8n/src`, `n8n/adaptadores` ou `n8n/scripts`, rodar `cd n8n && npm test && npm run build` e commitar o resultado.
- Nada de publicação neste plano: nenhum deploy no n8n, nenhuma aba criada na planilha real, nenhum push. A única tarefa de publicação é **atualizar o roteiro** `n8n/workflows/README.md`. "Mostre antes de publicar": ao fim, o dono confere no simulador local (`cd web && node scripts/dev-mock.mjs`, http://localhost:5174/pcp-mrbl/).
- Sem chamadas a serviços externos nos testes (Ploomes, Google, n8n): tudo com páginas e planilhas fictícias.
- No PowerShell do dono `npm run` pode ser bloqueado: os comandos abaixo funcionam no Git Bash; no PowerShell use `node --test "test/*.test.js"`, `node scripts/...` e `npx vitest run`.
- Regras de previsão copiadas do spec (seção 3), sem mudança de regra: faixas até 50 "01. Pequeno", até 150 "02. Médio", até 300 "03. Grande", até 450 "04. Industrial", acima "05. Industrial+"; janela de 180 dias; duração entre 1 e 180 (ou etapa marco 14/19); etapas 14 e 19 valem 1 dia; filas das etapas destino 14, 15, 17, 18 e 19 com mediana por (destino, faixa) só com pelo menos 5 cards; etapa 16 fora da cadeia; frações carregadas e data exibida cortada para baixo; hoje no fuso `America/Sao_Paulo`.
- Cores da carga: até 80% verde, até 100% amarelo, acima de 100% vermelho; semana de segunda a domingo; dias úteis de segunda a sexta; da semana atual até 8 à frente.

## Mapa de arquivos

**n8n (servidor)**
- Criar `n8n/src/previsao.js` — motor puro: datas de São Paulo, estatística (PERCENTILE.INC, IQR, média, mediana), faixa, parser da etapa, normalização de registros e negócios do Ploomes, médias diárias, operações da `PREVISAO_MEDIAS` e projeção de uma OS.
- Modificar `n8n/test/carregar.js` — `previsao.js` entra em `ARQUIVOS` (antes de `producao.js`).
- Modificar `n8n/src/planilhaLote.js` — leituras novas (`LEITURAS_MEDIAS_PREVISAO`, `LEITURAS_SYNC_PRODUCAO`, `PREVISAO_MEDIAS` no board), destinos novos e `PREVISAO_MEDIAS` em `ABAS_F4`.
- Modificar `n8n/src/producao.js` — colunas novas da `PRODUCAO`, OS previstas no sync e no board, capacidade no board e a ação de capacidade.
- Modificar `n8n/src/api.js` — `alterar_capacidade_oficina` (só ADM) e `previsaoSemHistorico` no board.
- Criar `n8n/adaptadores/montar-medias-previsao.js` e `n8n/adaptadores/montar-erro-medias.js`.
- Modificar `n8n/adaptadores/sincronizar-producao.js` e `n8n/adaptadores/montar-board.js`.
- Modificar `n8n/scripts/gerar-code-nodes.js` (dois Code nodes novos) e `n8n/scripts/gerar-workflow-sdk.js` (helper `buscarPloomes`, node "Buscar Previstas no Ploomes", workflow novo `pcp-medias-previsao`).
- Testes: criar `n8n/test/previsao.test.js`, `n8n/test/workflow-medias-previsao.test.js`, `n8n/test/capacidade-oficina.test.js`; modificar `n8n/test/producao.test.js`, `n8n/test/workflow-producao-sync.test.js`, `n8n/test/board-producao.test.js`, `n8n/test/planilha-lote.test.js`, `n8n/test/workflow-acao.test.js`, `n8n/test/auth-api.test.js`.
- Gerados: `n8n/build/*.js`, `n8n/workflows/pcp-medias-previsao.sdk.js` (novo), `n8n/workflows/pcp-producao-sync.sdk.js`, `n8n/workflows/json/*.json`.
- Modificar `n8n/workflows/README.md` — aba nova, colunas novas e ordem de publicação.

**web (site)**
- Modificar `web/src/api/tipos.ts` — capacidade da oficina, ação nova, campos das OS previstas e `previsaoSemHistorico`.
- Modificar `web/src/regras/acoes.ts`, `web/src/regras/otimista.ts` — ação de capacidade (mensagem, alvo da fila, efeito otimista, confirmação).
- Criar `web/src/regras/carga.ts` (+ `carga.test.ts`) — regra pura da carga semanal.
- Modificar `web/src/regras/producao.ts`, `web/src/regras/producaoTabela.ts` (+ testes) — filtro de previstas, janela do Gantt, indicadores, colunas "Etapa atual" e "Chegada prevista", visão `CARGA`, preferência "Incluir previstas".
- Criar `web/src/telas/ProducaoCarga.tsx`; modificar `web/src/telas/Producao.tsx`, `web/src/telas/ProducaoTabela.tsx`, `web/src/App.tsx`, `web/src/componentes/Legenda.tsx`, `web/src/styles/f4.css`.
- Modificar `web/scripts/mock-api.mjs` — capacidade, OS previstas, `previsaoSemHistorico`, `MOCK_FOTO` coerente.
- E2E: criar `web/e2e/f4-carga.spec.ts`; modificar `web/e2e/mock-servidor.spec.ts`.

## Decisões de desenho deste plano (onde o spec deixa margem)

Registradas aqui para o revisor e para o dono; cada uma aparece também como comentário no código.

1. **Chave da `PREVISAO_MEDIAS`.** As gravações em lote casam linha por **uma** coluna. A aba ganha, no fim, a coluna `chave` (= `tipo|etapa|faixa|oficina_id`, valor derivado). Chave que sumiu do cálculo recebe `valor` vazio e `amostra` 0 (nunca é apagada); valor vazio não conta na projeção.
2. **Chegada.** No spec, `InicioEfetivo = max(chegada, hoje) + fila(S)`; como a chegada é a data de um registro já concluído (sempre no passado), `max(chegada, hoje)` é sempre hoje. `projetarOs` aceita `chegada` (fiel à fórmula), mas o sync não lê registros a cada 5 minutos e passa vazio, o que dá o mesmo resultado.
3. **Etapa da OS no sync.** Em vez de fixar os `StageId` das etapas 12 a 16, o sync consulta as OS **em aberto** dos funis PCP (60011710) e Produção (60015827) com o nome do estágio (`$expand=Stage($select=Id,Name)`) e filtra 12–16 pelo número antes do "." (mesma regra do BI). A Costura continua com a consulta atual (etapa 60073488), sem mudança.
4. **OS prevista na `PRODUCAO`.** `em_costura` = `NAO` e `prevista` = `SIM`; a OS na Costura fica `em_costura` = `SIM` e `prevista` = `NAO`. Assim WhatsApp, intérprete e indicadores continuam só com a Costura. Ao sair das duas situações, o sync grava `NAO` nas duas colunas.
5. **Parser da etapa no registro.** Isolado em `etapaDoTextoRegistro` e tolerante ("Etapa: 17", "Estágio 17", "17. Costura", com ou sem HTML). O formato real fica para a homologação (spec, seção 8).
6. **FieldKeys desconhecidas** ficam como constantes `CONFIGURAR_*` em `n8n/src/previsao.js` (peças do pedido, "PCP completo pelo Ploomes?", "Data de início"/"Data de término" do registro e as datas de entrada das etapas 12 a 16). Enquanto houver marcador, o campo é lido como vazio: nas etapas 12 e 13 nenhuma OS entra, a previsão usa o fallback e o workflow de médias não grava nada (registra o aviso no `ERROS_APP`).
7. **Estatística.** O IQR vale também para a média geral da etapa e para a média só PCP (mesma amostra filtrada). "Passou pela produção" (etapa 19) = o deal tem registro de etapa 14 a 18. Fila: um card por (deal, destino), a passagem mais recente na janela; etapa anterior = maior término de etapa menor que o destino, sem a 16. Média de Costura por oficina usa a oficina atual do negócio e **todos** os registros marcados (sem janela), por isso o workflow diário lê o histórico inteiro do marcador.
8. **Duração da etapa 16** para uma OS que está nela: a regra geral ("etapa ≥ 13 → média da faixa, senão geral, senão 1").
9. **Capacidade.** A ação `alterar_capacidade_oficina` é só de ADM, grava só a `OFICINAS` (sem Ploomes e sem `HISTORICO_APP`, que é por OS) e não depende de `DEALS_PRODUCAO_EDITAVEIS` (não é card).
10. **Carga.** OS real sem início conta a partir de hoje; prazo vencido conta até hoje (a oficina ainda tem as peças); OS sem datas (real sem prazo, prevista sem peças) fica fora e a tela informa quantas. "A alocar" soma a OS inteira na semana de chegada (a que já chegou conta na semana atual). Intervalo só no fim de semana cai inteiro na semana do fim.

---

### Tarefa 1: Motor puro de previsão (faixa, estatística, datas e projeção)

**Files:**
- Create: `n8n/src/previsao.js`
- Modify: `n8n/test/carregar.js:7` (lista `ARQUIVOS`)
- Test: `n8n/test/previsao.test.js` (novo)

**Interfaces:**
- Consumes: de `n8n/src/util.js`: `texto(v)`, `numero(v)` (null = vazio, NaN = inválido), `dataISO(v, anoPadrao)`, `semAcento(s)`.
- Produces (todas globais no contexto dos Code nodes):
  - Constantes: `MARCADOR_HISTORICO_PREVISAO = 60151285`, `FUNIL_PCP = 60011710`, `FUNIL_PRODUCAO = 60015827`, `ETAPA_ENCAIXE = 12`, `ETAPA_PRIMEIRA_PECA = 16`, `ETAPA_COSTURA = 17`, `ETAPA_ULTIMA_PREVISTA = 16`, `ETAPAS_FILA_PREVISAO = [14, 15, 17, 18, 19]`, `ETAPAS_MARCO_PREVISAO = { 14: 1, 19: 1 }`, `JANELA_HISTORICO_DIAS = 180`, `LIMITE_DIAS_PREVISAO = 180`, `MINIMO_CARDS_FILA_FAIXA = 5`, `FAIXAS_VOLUME`, `FAIXA_MAIOR`.
  - `diaNumero(iso: string): number|null` (dias desde 1970-01-01), `isoDoDia(n: number): string` (corta a fração), `hojeSaoPaulo(agoraMs: number): string`, `dataSaoPaulo(v): string`.
  - `percentilInc(valores: number[], p: number): number|null`, `filtrarIqr(valores: number[]): number[]`, `mediaSimples(valores): number|null`, `mediana(valores): number|null`, `arredondar4(n): number`.
  - `pecasPrevisao(pecasCorte, pecasPedido): number`, `faixaVolume(pecas): string`, `numeroEtapa(nome): number|null`.
  - `tabelaMedias(linhas: object[]): { [chave: string]: { valor: number, amostra: number } }` com chave `TIPO|etapa|faixa|oficina_id`; `valorMedia(t, tipo, etapa, faixa?, oficinaId?)`, `temMedias(t): boolean`.
  - `duracaoEtapaPrevisao(t, etapa: number, faixa: string): number`, `filaEtapaPrevisao(t, etapa: number, faixa: string): number`.
  - `projetarOs(os: { etapa, dtInicio, chegada?, pecas, oficinaId }, t, hojeISO: string): { inicioCostura: string, fimCostura: string } | null`.
  - Tipos de linha da `PREVISAO_MEDIAS` usados por `tabelaMedias`: `DURACAO` (etapa, faixa), `DURACAO_GERAL` (etapa), `DURACAO_PCP` (etapa), `FILA` (etapa, faixa), `FILA_GERAL` (etapa), `COSTURA_OFICINA` (17, faixa, oficina_id).

- [ ] **Passo 1: Escrever o teste que falha**

Crie `n8n/test/previsao.test.js`:

```js
// Motor de previsão (src/previsao.js): casos montados à mão com a mesma regra
// do DAX do BI do dono (spec 2026-10-19, seção 3). Só dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();

test('faixa de volume pelas peças do corte, senão do pedido, senão 0', () => {
  assert.equal(ctx.pecasPrevisao(120, 300), 120);
  assert.equal(ctx.pecasPrevisao('', '300'), 300);
  assert.equal(ctx.pecasPrevisao('', ''), 0);
  assert.equal(ctx.faixaVolume(0), '01. Pequeno');
  assert.equal(ctx.faixaVolume(50), '01. Pequeno');
  assert.equal(ctx.faixaVolume(51), '02. Médio');
  assert.equal(ctx.faixaVolume(150), '02. Médio');
  assert.equal(ctx.faixaVolume(300), '03. Grande');
  assert.equal(ctx.faixaVolume(450), '04. Industrial');
  assert.equal(ctx.faixaVolume(451), '05. Industrial+');
});

test('percentil INC, IQR, média e mediana como no Excel/DAX', () => {
  assert.equal(ctx.percentilInc([10, 20, 30, 40], 0.25), 17.5);
  assert.equal(ctx.percentilInc([10, 20, 30, 40], 0.75), 32.5);
  assert.equal(ctx.percentilInc([], 0.5), null);
  // Q1 = 2, Q3 = 4, IQR = 2: limites −1 … 7 tiram o 100.
  assert.deepEqual(limpo(ctx.filtrarIqr([1, 2, 3, 4, 100])), [1, 2, 3, 4]);
  assert.equal(ctx.mediaSimples(ctx.filtrarIqr([1, 2, 3, 4, 100])), 2.5);
  assert.equal(ctx.mediaSimples([]), null);
  assert.equal(ctx.mediana([3, 1, 2]), 2);
  assert.equal(ctx.mediana([4, 1, 3, 2]), 2.5);
});

test('datas: dia com fração cortada para baixo e hoje no fuso de São Paulo', () => {
  assert.equal(ctx.isoDoDia(ctx.diaNumero('2026-10-21') + 0.5), '2026-10-21');
  assert.equal(ctx.isoDoDia(ctx.diaNumero('2026-10-31') + 7.5), '2026-11-07');
  // 01:30 UTC de 20/10 ainda é 19/10 em São Paulo.
  assert.equal(ctx.hojeSaoPaulo(Date.parse('2026-10-20T01:30:00Z')), '2026-10-19');
  assert.equal(ctx.dataSaoPaulo('2026-10-25T03:00:00Z'), '2026-10-25');
  assert.equal(ctx.dataSaoPaulo('2026-10-25T00:00:00-03:00'), '2026-10-25');
  assert.equal(ctx.dataSaoPaulo('25/10/2026'), '2026-10-25');
  assert.equal(ctx.dataSaoPaulo('25/10'), '');
  assert.equal(ctx.dataSaoPaulo(''), '');
});

test('etapa: número antes do ponto no nome do estágio', () => {
  assert.equal(ctx.numeroEtapa('12. Encaixe'), 12);
  assert.equal(ctx.numeroEtapa('17.Costura'), 17);
  assert.equal(ctx.numeroEtapa('Costura'), null);
});

const HOJE = '2026-10-19';

const MEDIAS = ctx.tabelaMedias([
  { tipo: 'DURACAO_PCP', etapa: 12, faixa: '', oficina_id: '', valor: 2, amostra: 9 },
  { tipo: 'DURACAO_GERAL', etapa: 13, faixa: '', oficina_id: '', valor: 1.5, amostra: 9 },
  { tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 3.5, amostra: 9 },
  { tipo: 'DURACAO', etapa: 17, faixa: '02. Médio', oficina_id: '', valor: 8, amostra: 9 },
  { tipo: 'DURACAO_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 7, amostra: 9 },
  { tipo: 'FILA', etapa: 14, faixa: '03. Grande', oficina_id: '', valor: 9, amostra: 3 },
  { tipo: 'FILA_GERAL', etapa: 14, faixa: '', oficina_id: '', valor: 4, amostra: 12 },
  { tipo: 'FILA', etapa: 17, faixa: '02. Médio', oficina_id: '', valor: 2.5, amostra: 6 },
  { tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 3, amostra: 20 },
  { tipo: 'COSTURA_OFICINA', etapa: 17, faixa: '02. Médio', oficina_id: 'of-1', valor: 6.2, amostra: 4 },
  { tipo: 'DURACAO', etapa: 18, faixa: '02. Médio', oficina_id: '', valor: '', amostra: 0 }
]);

test('duração e fila usadas: faixa, geral, PCP, marcos e mínimo de 5 cards', () => {
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 12, '03. Grande'), 2);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 13, '03. Grande'), 1.5);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 14, '02. Médio'), 1);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 15, '02. Médio'), 3.5);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 15, '03. Grande'), 1);
  assert.equal(ctx.duracaoEtapaPrevisao(MEDIAS, 18, '02. Médio'), 1);  // valor vazio não conta
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 13, '03. Grande'), 0);
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 14, '03. Grande'), 4);  // 3 cards < 5: vale o geral
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 17, '02. Médio'), 2.5);
  assert.equal(ctx.filaEtapaPrevisao(MEDIAS, 15, '02. Médio'), 0);
  assert.equal(ctx.temMedias(MEDIAS), true);
  assert.equal(ctx.temMedias(ctx.tabelaMedias([])), false);
});

test('projeção: OS na Preparação com oficina e média de Costura da oficina', () => {
  // FimBase = max(15/10 + 3,5; 19/10) = 19/10; Início(17) = 19/10 + 2,5 = 21,5/10; Fim = 21,5 + 6,2 = 27,7/10.
  const p = ctx.projetarOs({ etapa: 15, dtInicio: '2026-10-15', pecas: 100, oficinaId: 'of-1' }, MEDIAS, HOJE);
  assert.deepEqual(limpo(p), { inicioCostura: '2026-10-21', fimCostura: '2026-10-27' });
  // Sem oficina (ALOCAR): Fim = 21,5 + duração da Costura da faixa (8) = 29,5/10.
  const sem = ctx.projetarOs({ etapa: 15, dtInicio: '2026-10-15', pecas: 100, oficinaId: 'ALOCAR' }, MEDIAS, HOJE);
  assert.deepEqual(limpo(sem), { inicioCostura: '2026-10-21', fimCostura: '2026-10-29' });
});

test('projeção: OS no Encaixe soma as etapas do meio sem a 16', () => {
  // Início efetivo = hoje (fila 12 = 0); FimBase = 19 + 2 = 21/10.
  // Meio: 13 (1,5 + 0) + 14 (1 + 4) + 15 (1 + 0) = 7,5. Início(17) = 21 + 7,5 + 3 = 31,5/10.
  // Fim = 31,5 + 7 (geral da Costura) = 07,5/11.
  const p = ctx.projetarOs({ etapa: 12, dtInicio: '', pecas: 200, oficinaId: '' }, MEDIAS, HOJE);
  assert.deepEqual(limpo(p), { inicioCostura: '2026-10-31', fimCostura: '2026-11-07' });
});

test('projeção sem médias usa o fallback do BI (duração 1, fila 0); sem peças não prevê', () => {
  const vazio = ctx.tabelaMedias([]);
  assert.deepEqual(limpo(ctx.projetarOs({ etapa: 16, dtInicio: '', pecas: 30, oficinaId: '' }, vazio, HOJE)),
    { inicioCostura: '2026-10-20', fimCostura: '2026-10-21' });
  assert.equal(ctx.projetarOs({ etapa: 14, dtInicio: '', pecas: 0, oficinaId: '' }, vazio, HOJE), null);
  assert.equal(ctx.projetarOs({ etapa: 17, dtInicio: '', pecas: 30, oficinaId: '' }, vazio, HOJE), null);
  assert.equal(ctx.projetarOs({ etapa: 11, dtInicio: '', pecas: 30, oficinaId: '' }, vazio, HOJE), null);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd n8n && node --test test/previsao.test.js`
Expected: FAIL (`ctx.pecasPrevisao is not a function`: o arquivo ainda não existe nem está em `ARQUIVOS`).

- [ ] **Passo 3: Incluir o módulo no carregador**

Em `n8n/test/carregar.js`, troque a linha de `ARQUIVOS` por:

```js
const ARQUIVOS = ['util.js', 'auth.js', 'montarCaixas.js', 'acoes.js', 'pedidos.js', 'previsao.js', 'producao.js', 'whatsapp.js', 'envioPloomes.js', 'planilhaLote.js', 'api.js'];
```

(O `gerar-code-nodes.js` usa a mesma lista: todo Code node passa a carregar `previsao.js`.)

- [ ] **Passo 4: Implementar**

Crie `n8n/src/previsao.js`:

```js
// ===== src/previsao.js =====
// Motor de previsão das etapas 12 a 19, fiel ao modelo Power BI do dono
// (spec 2026-10-19-visao-futuro-carga-design.md, seção 3). Funções puras, ES5,
// sem import/export. Datas são 'aaaa-mm-dd' no fuso de São Paulo; o cálculo
// carrega frações de dia e a data exibida corta a fração para baixo.

var MARCADOR_HISTORICO_PREVISAO = 60151285;
var FUNIL_PCP = 60011710;
var FUNIL_PRODUCAO = 60015827;
var ETAPA_ENCAIXE = 12;
var ETAPA_PRIMEIRA_PECA = 16;
var ETAPA_COSTURA = 17;
var ETAPA_ULTIMA_PREVISTA = 16;  // a previsão mostra OS de 12 (Encaixe) a 16 (Primeira Peça)
var ETAPAS_FILA_PREVISAO = [14, 15, 17, 18, 19];
var ETAPAS_MARCO_PREVISAO = { 14: 1, 19: 1 };
var JANELA_HISTORICO_DIAS = 180;
var LIMITE_DIAS_PREVISAO = 180;
var MINIMO_CARDS_FILA_FAIXA = 5;
var FAIXAS_VOLUME = [
  { ate: 50, nome: '01. Pequeno' },
  { ate: 150, nome: '02. Médio' },
  { ate: 300, nome: '03. Grande' },
  { ate: 450, nome: '04. Industrial' }
];
var FAIXA_MAIOR = '05. Industrial+';

// ---------- datas (dia = número de dias desde 1970-01-01, pode ter fração) ----------

function diaNumero(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto(iso));
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

// Corta a fração para baixo, como o Gantt do BI.
function isoDoDia(n) {
  if (n === null || n === undefined || !isFinite(n)) return '';
  return new Date(Math.floor(n) * 86400000).toISOString().slice(0, 10);
}

// São Paulo não tem horário de verão desde 2019: UTC−3 fixo.
function hojeSaoPaulo(agoraMs) {
  return new Date(agoraMs - 3 * 3600000).toISOString().slice(0, 10);
}

// Data de campo do Ploomes ('2026-10-25T03:00:00Z', '2026-10-25T00:00:00-03:00',
// '25/10/2026' ou '2026-10-25') -> 'aaaa-mm-dd' em São Paulo; '' se não reconhece.
function dataSaoPaulo(v) {
  var t = texto(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) {
    var ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(t) ? t : t + 'Z');
    return isFinite(ms) ? hojeSaoPaulo(ms) : '';
  }
  var d = dataISO(t, 0);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d.indexOf('0-') !== 0 ? d : '';
}

// ---------- estatística ----------

function numerosValidos(valores) {
  return (valores || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
}

// PERCENTILE.INC do Excel/DAX: interpolação linear entre as posições (n−1)·p.
function percentilInc(valores, p) {
  var v = numerosValidos(valores).slice().sort(function (a, b) { return a - b; });
  if (!v.length) return null;
  var h = (v.length - 1) * p;
  var baixo = Math.floor(h);
  var alto = Math.min(baixo + 1, v.length - 1);
  return v[baixo] + (h - baixo) * (v[alto] - v[baixo]);
}

// Remove o que fica fora de Q1 − 1,5·IQR … Q3 + 1,5·IQR (limites inclusos).
function filtrarIqr(valores) {
  var v = numerosValidos(valores);
  if (!v.length) return [];
  var q1 = percentilInc(v, 0.25);
  var q3 = percentilInc(v, 0.75);
  var iqr = q3 - q1;
  var min = q1 - 1.5 * iqr;
  var max = q3 + 1.5 * iqr;
  return v.filter(function (x) { return x >= min && x <= max; });
}

function mediaSimples(valores) {
  var v = numerosValidos(valores);
  if (!v.length) return null;
  return v.reduce(function (s, x) { return s + x; }, 0) / v.length;
}

function mediana(valores) {
  return percentilInc(valores, 0.5);
}

function arredondar4(n) {
  return Math.round(n * 10000) / 10000;
}

// ---------- faixa, etapa e campos ----------

// Peças do corte real; se em branco, do pedido; senão 0.
function pecasPrevisao(pecasCorte, pecasPedido) {
  var corte = numero(pecasCorte);
  if (corte !== null && !isNaN(corte)) return corte;
  var pedido = numero(pecasPedido);
  if (pedido !== null && !isNaN(pedido)) return pedido;
  return 0;
}

function faixaVolume(pecas) {
  var n = Number(pecas) || 0;
  for (var i = 0; i < FAIXAS_VOLUME.length; i++) {
    if (n <= FAIXAS_VOLUME[i].ate) return FAIXAS_VOLUME[i].nome;
  }
  return FAIXA_MAIOR;
}

// "12. Encaixe" -> 12; sem número antes do "." -> null.
function numeroEtapa(nome) {
  var m = /^\s*(\d{1,2})\s*\./.exec(texto(nome));
  return m ? Number(m[1]) : null;
}
// ---------- projeção (sync da produção) ----------

// Linhas da aba -> { 'TIPO|etapa|faixa|oficina': valor }; valor vazio fica de fora.
function tabelaMedias(linhas) {
  var t = {};
  (linhas || []).forEach(function (l) {
    var v = numero(l && l.valor);
    if (v === null || isNaN(v)) return;
    t[semAcento(l.tipo) + '|' + texto(l.etapa) + '|' + texto(l.faixa) + '|' + texto(l.oficina_id)] = { valor: v, amostra: Number(numero(l.amostra)) || 0 };
  });
  return t;
}

function valorMedia(t, tipo, etapa, faixa, oficinaId) {
  var x = t && t[tipo + '|' + etapa + '|' + (faixa || '') + '|' + (oficinaId || '')];
  return x ? x : null;
}

function temMedias(t) {
  return !!t && Object.keys(t).length > 0;
}

function duracaoEtapaPrevisao(t, etapa, faixa) {
  if (ETAPAS_MARCO_PREVISAO[etapa]) return 1;
  var x = etapa <= ETAPA_ENCAIXE ? valorMedia(t, 'DURACAO_PCP', etapa) : valorMedia(t, 'DURACAO', etapa, faixa);
  if (x) return x.valor;
  x = valorMedia(t, 'DURACAO_GERAL', etapa);
  return x ? x.valor : 1;
}

function filaEtapaPrevisao(t, etapa, faixa) {
  if (ETAPAS_FILA_PREVISAO.indexOf(etapa) < 0) return 0;
  var x = valorMedia(t, 'FILA', etapa, faixa);
  if (x && x.amostra >= MINIMO_CARDS_FILA_FAIXA) return x.valor;
  x = valorMedia(t, 'FILA_GERAL', etapa);
  return x ? x.valor : 0;
}

// os = { etapa, dtInicio, chegada, pecas, oficinaId }. Devolve
// { inicioCostura, fimCostura } ('aaaa-mm-dd', fração cortada) ou null
// (etapa fora de 12–16 ou OS sem peças, que não recebe previsão a partir da 14).
function projetarOs(os, t, hojeISO) {
  os = os || {};
  var s = Number(os.etapa);
  if (!(s >= ETAPA_ENCAIXE && s <= ETAPA_ULTIMA_PREVISTA)) return null;
  if (!(Number(os.pecas) > 0)) return null;
  var faixa = faixaVolume(os.pecas);
  var hoje = diaNumero(hojeISO);
  var dtInicio = diaNumero(os.dtInicio);
  var chegada = diaNumero(os.chegada);
  var inicioEfetivo = dtInicio !== null ? dtInicio : Math.max(chegada !== null ? chegada : hoje, hoje) + filaEtapaPrevisao(t, s, faixa);
  var fimBase = Math.max(inicioEfetivo + duracaoEtapaPrevisao(t, s, faixa), hoje);
  var meio = 0;
  for (var o = s + 1; o < ETAPA_COSTURA; o++) {
    if (o === ETAPA_PRIMEIRA_PECA) continue;
    meio += duracaoEtapaPrevisao(t, o, faixa) + filaEtapaPrevisao(t, o, faixa);
  }
  var inicio = fimBase + meio + filaEtapaPrevisao(t, ETAPA_COSTURA, faixa);
  var oficina = texto(os.oficinaId);
  var porOficina = oficina && semAcento(oficina) !== 'ALOCAR' ? valorMedia(t, 'COSTURA_OFICINA', ETAPA_COSTURA, faixa, oficina) : null;
  var fim = inicio + (porOficina ? porOficina.valor : duracaoEtapaPrevisao(t, ETAPA_COSTURA, faixa));
  return { inicioCostura: isoDoDia(inicio), fimCostura: isoDoDia(fim) };
}

```

- [ ] **Passo 5: Rodar e ver passar**

Run: `cd n8n && node --test test/previsao.test.js && npm test`
Expected: PASS (8 testes novos; suíte inteira verde).

Conferência à mão dos casos (fica no teste como comentário): OS na 15 desde 15/10 com 100 peças e oficina com média de Costura 6,2 → `FimBase = max(15/10 + 3,5; 19/10) = 19/10`, `Início(17) = 19/10 + fila(17, Médio) 2,5 = 21,5/10` → **21/10**, `Fim = 21,5 + 6,2 = 27,7/10` → **27/10**. OS no Encaixe com 200 peças: `FimBase = 19 + 2 (PCP) = 21/10`; meio = 13 (1,5 + 0) + 14 (1 + 4, fila da faixa com 3 cards cai no geral) + 15 (1 + 0) = 7,5; `Início(17) = 21 + 7,5 + 3 = 31,5/10` → **31/10**; `Fim = 31,5 + 7 = 7,5/11` → **07/11**.

- [ ] **Passo 6: Build e commit**

```bash
cd n8n && npm run build
cd .. && git add n8n/src/previsao.js n8n/test/previsao.test.js n8n/test/carregar.js n8n/build
git commit -m "feat: motor de previsão da Costura fiel ao BI (faixa, IQR, filas e projeção)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Médias a partir dos registros do Ploomes e linhas da PREVISAO_MEDIAS

**Files:**
- Modify: `n8n/src/previsao.js` (acrescentar no fim)
- Modify: `n8n/src/planilhaLote.js` (leitura, destinos e `ABAS_F4`)
- Test: `n8n/test/previsao.test.js` (acrescentar), `n8n/test/planilha-lote.test.js` (acrescentar)

**Interfaces:**
- Consumes: Tarefa 1 (`diaNumero`, `faixaVolume`, `pecasPrevisao`, `filtrarIqr`, `mediaSimples`, `mediana`, `arredondar4`, constantes); de `n8n/src/producao.js`: `propriedadeDoDeal(deal, campo)`, `valorPropriedadePloomes(prop)`, `idObjetoPloomes(prop)`, `CAMPO_OFICINA_PLOOMES`, `CAMPO_PECAS_CORTE`; de `n8n/src/planilhaLote.js`: `requisicoesDeEscrita`, `planilhaDoLote`.
- Produces:
  - Constantes de FieldKey a configurar: `CAMPO_PECAS_PEDIDO`, `CAMPO_PCP_COMPLETO`, `CAMPO_REGISTRO_INICIO`, `CAMPO_REGISTRO_TERMINO`, `CAMPOS_ENTRADA_ETAPA` (12 a 16), todas `'CONFIGURAR_…'`; `campoConfigurado(chave): boolean`.
  - `etapaDoTextoRegistro(conteudo): number|null`, `simNaoPloomes(prop): boolean`, `valorCampoDeal(deal, chave)`.
  - `normalizarRegistroPrevisao(reg): { dealId, etapa, inicio, termino }`, `normalizarDealPrevisao(deal): { dealId, pecas, oficinaId, pcpCompleto }`.
  - `calcularMediasPrevisao(registros, deals: {[dealId]: {pecas, oficinaId, pcpCompleto}}, hojeISO): Array<{ tipo, etapa: number, faixa, oficina_id, valor, amostra }>`.
  - `chaveMediaPrevisao(linha): string` (= `tipo|etapa|faixa|oficina_id`).
  - `operacoesMediasPrevisao(novas, atuais, calculadoEm): operacao[]` (aba `PREVISAO_MEDIAS`, chave `chave`: `update` de `valor`/`amostra`/`calculado_em`, `append` da chave nova, `update` com `valor: ''`/`amostra: 0` para a chave que sumiu).
  - `montarAtualizacaoMedias(registrosPloomes, dealsPloomes, linhasAtuais, hojeISO, calculadoEm): { ok: true, registros: number, operacoes } | { ok: false, erro: string }`.
  - Em `planilhaLote.js`: `LEITURAS_MEDIAS_PREVISAO = ['PREVISAO_MEDIAS']`; destinos `{ aba: 'PREVISAO_MEDIAS', operacao: 'append'|'update', chave: 'chave' }`; `PREVISAO_MEDIAS` em `ABAS_F4` (coluna ausente falha antes de gravar).
  - Cabeçalho da aba nova (linha 1, nesta ordem): `tipo` | `etapa` | `faixa` | `oficina_id` | `valor` | `amostra` | `calculado_em` | `chave`.

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no fim de `n8n/test/previsao.test.js` (usa `HOJE`, `ctx` e `limpo` já declarados na Tarefa 1):

```js

test('etapa no texto do registro de interação (parser tolerante; formato real a confirmar)', () => {
  assert.equal(ctx.etapaDoTextoRegistro('<p>Etapa: 17</p><p>Início 01/10</p>'), 17);
  assert.equal(ctx.etapaDoTextoRegistro('Passagem pelo estágio 14 concluída'), 14);
  assert.equal(ctx.etapaDoTextoRegistro('Mudou para 15. Preparação 1 em 02/10/2026'), 15);
  assert.equal(ctx.etapaDoTextoRegistro('Sem número de etapa'), null);
  assert.equal(ctx.etapaDoTextoRegistro('Etapa 99'), null);
});

test('FieldKeys por configurar são lidas como vazias', () => {
  assert.equal(ctx.campoConfigurado('CONFIGURAR_CAMPO_PCP_COMPLETO'), false);
  assert.equal(ctx.campoConfigurado('deal_00000000-0000-0000-0000-000000000000'), true);
  const deal = { Id: 1, OtherProperties: [{ FieldKey: 'CONFIGURAR_CAMPO_PECAS_PEDIDO', IntegerValue: 999 }] };
  assert.equal(ctx.normalizarDealPrevisao(deal).pecas, 0);
  assert.equal(ctx.normalizarDealPrevisao(deal).pcpCompleto, false);
});

// Histórico fictício: hoje = 19/10/2026, janela a partir de 22/04/2026.
const DEALS = {
  800001: { dealId: '800001', pecas: 100, oficinaId: 'of-1', pcpCompleto: true },
  800002: { dealId: '800002', pecas: 120, oficinaId: 'of-1', pcpCompleto: false },
  800003: { dealId: '800003', pecas: 40, oficinaId: 'of-2', pcpCompleto: true }
};
const r = (dealId, etapa, inicio, termino) => ({ dealId, etapa, inicio, termino });
const REGISTROS = [
  r('800001', 15, '2026-10-01', '2026-10-04'),  // 3 dias
  r('800002', 15, '2026-09-01', '2026-09-06'),  // 5 dias
  r('800003', 13, '2026-09-10', '2026-09-11'),  // 1 dia (Pequeno); 13 não é produção
  r('800001', 15, '2026-03-01', '2026-03-11'),  // fora da janela
  r('800002', 15, '2026-10-10', ''),            // em aberto: entra só como destino de fila
  r('800001', 16, '2026-10-04', '2026-10-05'),  // 16 não conta como etapa anterior na fila
  r('800001', 17, '2026-10-05', '2026-10-11'),  // 6 dias; fila 17 = 1 (desde 04/10)
  r('800002', 17, '2026-09-08', '2026-09-16'),  // 8 dias; fila 17 = 2 (desde 06/09)
  r('800001', 17, '2025-12-01', '2025-12-05'),  // fora da janela, mas entra na média da oficina
  r('800001', 19, '2026-10-12', '2026-10-12'),  // marco: 0 dia entra; fila 19 = 1
  r('800003', 19, '2026-09-12', '2026-09-12'),  // não passou pela produção: fora
  r('800001', 18, '2026-09-20', '2026-09-20')   // 0 dia fora; fila negativa fora
];

test('médias por etapa/faixa, gerais, só PCP, filas e Costura por oficina', () => {
  const linhas = limpo(ctx.calcularMediasPrevisao(REGISTROS, DEALS, HOJE));
  const l = (tipo, etapa, faixa, oficina_id, valor, amostra) => ({ tipo, etapa, faixa, oficina_id, valor, amostra });
  assert.deepEqual(linhas, [
    l('COSTURA_OFICINA', 17, '02. Médio', 'of-1', 6, 3),
    l('DURACAO', 13, '01. Pequeno', '', 1, 1),
    l('DURACAO', 15, '02. Médio', '', 4, 2),
    l('DURACAO', 16, '02. Médio', '', 1, 1),
    l('DURACAO', 17, '02. Médio', '', 7, 2),
    l('DURACAO', 19, '02. Médio', '', 0, 1),
    l('DURACAO_GERAL', 13, '', '', 1, 1),
    l('DURACAO_GERAL', 15, '', '', 4, 2),
    l('DURACAO_GERAL', 16, '', '', 1, 1),
    l('DURACAO_GERAL', 17, '', '', 7, 2),
    l('DURACAO_GERAL', 19, '', '', 0, 1),
    l('DURACAO_PCP', 13, '', '', 1, 1),
    l('DURACAO_PCP', 15, '', '', 3, 1),
    l('DURACAO_PCP', 16, '', '', 1, 1),
    l('DURACAO_PCP', 17, '', '', 6, 1),
    l('DURACAO_PCP', 19, '', '', 0, 1),
    l('FILA', 17, '02. Médio', '', 1.5, 2),
    l('FILA', 19, '02. Médio', '', 1, 1),
    l('FILA_GERAL', 17, '', '', 1.5, 2),
    l('FILA_GERAL', 19, '', '', 1, 1)
  ]);
});

test('médias tiram outliers por IQR antes da média da faixa', () => {
  const regs = [3, 4, 5, 4, 60].map((d, i) => r('80000' + (i + 1), 15, '2026-09-01', ctx.isoDoDia(ctx.diaNumero('2026-09-01') + d)));
  const deals = {};
  regs.forEach((x) => { deals[x.dealId] = { dealId: x.dealId, pecas: 100, oficinaId: '', pcpCompleto: false }; });
  const linha = limpo(ctx.calcularMediasPrevisao(regs, deals, HOJE)).find((x) => x.tipo === 'DURACAO');
  assert.deepEqual(linha, { tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 4, amostra: 4 });
});

test('operações da PREVISAO_MEDIAS: atualiza valores, anexa chave nova e esvazia a que sumiu, sem apagar', () => {
  const novas = [
    { tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 4, amostra: 2 },
    { tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 1.5, amostra: 2 }
  ];
  const atuais = [
    { row_number: 2, tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 3, amostra: 1, chave: 'DURACAO|15|02. Médio|' },
    { row_number: 3, tipo: 'DURACAO', etapa: 18, faixa: '02. Médio', oficina_id: '', valor: 2, amostra: 1, chave: 'DURACAO|18|02. Médio|' },
    { row_number: 4, tipo: 'DURACAO', etapa: 13, faixa: '02. Médio', oficina_id: '', valor: '', amostra: 0, chave: 'DURACAO|13|02. Médio|' }
  ];
  assert.deepEqual(limpo(ctx.operacoesMediasPrevisao(novas, atuais, 'T1')), [
    { aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave', linha: { chave: 'DURACAO|15|02. Médio|', valor: 4, amostra: 2, calculado_em: 'T1' } },
    { aba: 'PREVISAO_MEDIAS', operacao: 'append', chave: 'chave', linha: { tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 1.5, amostra: 2, calculado_em: 'T1', chave: 'FILA_GERAL|17||' } },
    { aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave', linha: { chave: 'DURACAO|18|02. Médio|', valor: '', amostra: 0, calculado_em: 'T1' } }
  ]);
});

test('montarAtualizacaoMedias: sem registro reconhecido não grava nada', () => {
  const r0 = limpo(ctx.montarAtualizacaoMedias([{ DealId: 1, Content: 'Etapa: 17' }], [], [], HOJE, 'T1'));
  assert.equal(r0.ok, false);
  assert.match(r0.erro, /Nenhum registro de etapa reconhecido/);
});

test('montarAtualizacaoMedias: com as FieldKeys configuradas lê registros e negócios do Ploomes', () => {
  const c = carregar();
  c.CAMPO_REGISTRO_INICIO = 'record_INICIO_FICTICIO';
  c.CAMPO_REGISTRO_TERMINO = 'record_TERMINO_FICTICIO';
  const reg = (dealId, etapa, ini, fim) => ({
    DealId: dealId, Content: `<p>Etapa: ${etapa}</p>`,
    OtherProperties: [
      { FieldKey: 'record_INICIO_FICTICIO', DateTimeValue: ini + 'T03:00:00Z' },
      { FieldKey: 'record_TERMINO_FICTICIO', DateTimeValue: fim + 'T03:00:00Z' }
    ]
  });
  const deal = { Id: 800001, OtherProperties: [
    { FieldKey: 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', IntegerValue: 100 },
    { FieldKey: 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4', UserValueId: 501, UserValueName: 'OFICINA FICTÍCIA' }
  ] };
  const r1 = limpo(c.montarAtualizacaoMedias([reg(800001, 17, '2026-10-05', '2026-10-11')], [deal], [], HOJE, 'T1'));
  assert.equal(r1.ok, true);
  assert.equal(r1.registros, 1);
  assert.deepEqual(r1.operacoes.map((o) => o.linha.chave), ['COSTURA_OFICINA|17|02. Médio|501', 'DURACAO|17|02. Médio|', 'DURACAO_GERAL|17||']);
});
```

Acrescente no fim de `n8n/test/planilha-lote.test.js`:

```js
test('PREVISAO_MEDIAS: append da chave nova depois da última linha e update só de valor/amostra/calculado_em', () => {
  const CAB = ['tipo', 'etapa', 'faixa', 'oficina_id', 'valor', 'amostra', 'calculado_em', 'chave'];
  const p = planilha([['PREVISAO_MEDIAS', [CAB, ['DURACAO', 15, '02. Médio', '', 3, 1, 'T0', 'DURACAO|15|02. Médio|']]]]);
  const ops = ctx.operacoesMediasPrevisao([
    { tipo: 'DURACAO', etapa: 15, faixa: '02. Médio', oficina_id: '', valor: 4, amostra: 2 },
    { tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 1.5, amostra: 2 }
  ], p.linhas.PREVISAO_MEDIAS, 'T1');
  const r = req(ops, [], p);
  assert.equal(r.length, 2);
  assert.equal(decodeURIComponent(r[0].url), BASE + "/'PREVISAO_MEDIAS'!A3:append?valueInputOption=RAW&insertDataOption=OVERWRITE");
  assert.deepEqual(r[0].body.values, [['FILA_GERAL', 17, '', '', 1.5, 2, 'T1', 'FILA_GERAL|17||']]);
  assert.deepEqual(r[1].body.data, [{ range: "'PREVISAO_MEDIAS'!E2:G2", values: [[4, 2, 'T1']] }]);
  assert.equal(r[1].repetir, true);
});

test('PREVISAO_MEDIAS sem a coluna chave: falha antes de qualquer requisição', () => {
  const p = planilha([['PREVISAO_MEDIAS', [['tipo', 'etapa', 'faixa', 'oficina_id', 'valor', 'amostra', 'calculado_em']]]]);
  const ops = ctx.operacoesMediasPrevisao([{ tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 1.5, amostra: 2 }], [], 'T1');
  assert.throws(() => req(ops, [], p), /Cabeçalho obrigatório ausente: PREVISAO_MEDIAS\.chave/);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd n8n && node --test test/previsao.test.js test/planilha-lote.test.js`
Expected: FAIL (`ctx.etapaDoTextoRegistro is not a function`, `ctx.operacoesMediasPrevisao is not a function`).

- [ ] **Passo 3: Implementar as médias**

Acrescente no fim de `n8n/src/previsao.js`:

```js

// ---------- registros do Ploomes e médias (workflow diário) ----------

// FieldKeys ainda não conferidas numa leitura real (spec, seção 8). Enquanto
// começarem por CONFIGURAR_, o campo é lido como vazio: a previsão cai no
// fallback do BI e o workflow de médias não grava nada. Trocar pela chave real
// (não é segredo) na homologação, rodar npm test && npm run build e commitar.
var CAMPO_PECAS_PEDIDO = 'CONFIGURAR_CAMPO_PECAS_PEDIDO';
var CAMPO_PCP_COMPLETO = 'CONFIGURAR_CAMPO_PCP_COMPLETO';
var CAMPO_REGISTRO_INICIO = 'CONFIGURAR_CAMPO_REGISTRO_INICIO';
var CAMPO_REGISTRO_TERMINO = 'CONFIGURAR_CAMPO_REGISTRO_TERMINO';
var CAMPOS_ENTRADA_ETAPA = {
  12: 'CONFIGURAR_CAMPO_ENTRADA_12',
  13: 'CONFIGURAR_CAMPO_ENTRADA_13',
  14: 'CONFIGURAR_CAMPO_ENTRADA_14',
  15: 'CONFIGURAR_CAMPO_ENTRADA_15',
  16: 'CONFIGURAR_CAMPO_ENTRADA_16'
};

function campoConfigurado(chave) {
  return texto(chave) !== '' && texto(chave).indexOf('CONFIGURAR_') !== 0;
}


// Número da etapa no texto do registro de interação. O formato real ainda será
// confirmado numa leitura na homologação (spec, seção 8): por isso o parser é
// tolerante e isolado. Aceita "Etapa: 17", "Estágio 17", "17. Costura" e
// "Etapa 17. Costura" (com ou sem HTML); devolve null quando não acha 1–30.
function etapaDoTextoRegistro(conteudo) {
  var t = texto(conteudo).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
  var m = /(?:etapa|est[aá]gio)\s*:?\s*(\d{1,2})(?!\d)/i.exec(t);
  if (!m) m = /(?:^|[^\d])(\d{1,2})\s*\.\s*[A-Za-zÀ-ÿ]/.exec(t);
  if (!m) return null;
  var n = Number(m[1]);
  return n >= 1 && n <= 30 ? n : null;
}

// Sim/não do Ploomes: campo booleano (BoolValue) ou texto "Sim".
function simNaoPloomes(prop) {
  if (!prop) return false;
  if (prop.BoolValue === true) return true;
  var v = semAcento(valorPropriedadePloomes(prop));
  return v === 'SIM' || v === 'S' || v === 'TRUE' || v === '1';
}

function valorCampoDeal(deal, chave) {
  if (!campoConfigurado(chave)) return '';
  return valorPropriedadePloomes(propriedadeDoDeal(deal, chave));
}

// Registro de interação marcado -> { dealId, etapa, inicio, termino }.
function normalizarRegistroPrevisao(reg) {
  reg = reg || {};
  return {
    dealId: texto(reg.DealId),
    etapa: etapaDoTextoRegistro(reg.Content),
    inicio: dataSaoPaulo(valorCampoDeal(reg, CAMPO_REGISTRO_INICIO)),
    termino: dataSaoPaulo(valorCampoDeal(reg, CAMPO_REGISTRO_TERMINO))
  };
}

// Negócio -> { dealId, pecas, oficinaId, pcpCompleto } para as médias.
function normalizarDealPrevisao(deal) {
  deal = deal || {};
  var oficina = propriedadeDoDeal(deal, CAMPO_OFICINA_PLOOMES);
  var nomeOficina = semAcento(oficina && (oficina.UserValueName || oficina.ObjectValueName));
  return {
    dealId: texto(deal.Id),
    pecas: pecasPrevisao(valorPropriedadePloomes(propriedadeDoDeal(deal, CAMPO_PECAS_CORTE)), valorCampoDeal(deal, CAMPO_PECAS_PEDIDO)),
    oficinaId: nomeOficina === 'ALOCAR' ? '' : idObjetoPloomes(oficina),
    pcpCompleto: campoConfigurado(CAMPO_PCP_COMPLETO) && simNaoPloomes(propriedadeDoDeal(deal, CAMPO_PCP_COMPLETO))
  };
}

// ---------- médias (workflow diário) ----------

function juntarEm(mapa, chave, valor) {
  if (!mapa[chave]) mapa[chave] = [];
  mapa[chave].push(valor);
}

// registros: [{ dealId, etapa, inicio, termino }]; deals: { dealId: { pecas, oficinaId, pcpCompleto } }.
// Devolve as linhas da PREVISAO_MEDIAS (sem calculado_em/chave), em ordem fixa.
function calcularMediasPrevisao(registros, deals, hojeISO) {
  var hoje = diaNumero(hojeISO);
  var inicioJanela = hoje - JANELA_HISTORICO_DIAS;
  deals = deals || {};
  var validos = (registros || []).filter(function (r) {
    return r && texto(r.dealId) && typeof r.etapa === 'number' && diaNumero(r.inicio) !== null;
  });
  var passouProducao = {};
  var porDeal = {};
  validos.forEach(function (r) {
    if (r.etapa >= 14 && r.etapa <= 18) passouProducao[r.dealId] = 1;
    juntarEm(porDeal, r.dealId, r);
  });
  var dur = {};
  var durGeral = {};
  var durPcp = {};
  var costura = {};
  validos.forEach(function (r) {
    if (diaNumero(r.termino) === null) return;
    var d = Math.max(0, diaNumero(r.termino) - diaNumero(r.inicio));
    var deal = deals[r.dealId] || null;
    var faixa = deal ? faixaVolume(deal.pecas) : '';
    // Média de Costura por oficina: sem janela e sem IQR, como no BI.
    if (r.etapa === ETAPA_COSTURA && d >= 1 && d <= LIMITE_DIAS_PREVISAO && deal && texto(deal.oficinaId)) {
      juntarEm(costura, faixa + '|' + texto(deal.oficinaId), d);
    }
    if (diaNumero(r.inicio) < inicioJanela) return;
    if (!ETAPAS_MARCO_PREVISAO[r.etapa] && (d < 1 || d > LIMITE_DIAS_PREVISAO)) return;
    if (r.etapa === 19 && !passouProducao[r.dealId]) return;
    juntarEm(durGeral, String(r.etapa), d);
    if (faixa) juntarEm(dur, r.etapa + '|' + faixa, d);
    if (deal && deal.pcpCompleto) juntarEm(durPcp, String(r.etapa), d);
  });

  // Fila: um card por (deal, destino) — a passagem mais recente na janela.
  var destinos = {};
  validos.forEach(function (r) {
    if (ETAPAS_FILA_PREVISAO.indexOf(r.etapa) < 0) return;
    if (diaNumero(r.inicio) < inicioJanela) return;
    if (r.etapa === 19 && !passouProducao[r.dealId]) return;
    var chave = r.dealId + '|' + r.etapa;
    if (!destinos[chave] || diaNumero(r.inicio) > diaNumero(destinos[chave].inicio)) destinos[chave] = r;
  });
  var fila = {};
  var filaGeral = {};
  Object.keys(destinos).forEach(function (chave) {
    var r = destinos[chave];
    var anterior = null;
    porDeal[r.dealId].forEach(function (x) {
      if (x.etapa >= r.etapa || x.etapa === ETAPA_PRIMEIRA_PECA || diaNumero(x.termino) === null) return;
      if (anterior === null || diaNumero(x.termino) > anterior) anterior = diaNumero(x.termino);
    });
    if (anterior === null) return;
    var gap = diaNumero(r.inicio) - anterior;
    if (gap < 0 || gap > LIMITE_DIAS_PREVISAO) return;
    var deal = deals[r.dealId] || null;
    juntarEm(filaGeral, String(r.etapa), gap);
    if (deal) juntarEm(fila, r.etapa + '|' + faixaVolume(deal.pecas), gap);
  });

  var linhas = [];
  function linha(tipo, etapa, faixa, oficinaId, valor, amostra) {
    if (valor === null) return;
    linhas.push({ tipo: tipo, etapa: Number(etapa), faixa: faixa, oficina_id: oficinaId, valor: arredondar4(valor), amostra: amostra });
  }
  Object.keys(dur).forEach(function (k) {
    var p = k.split('|');
    var v = filtrarIqr(dur[k]);
    linha('DURACAO', p[0], p[1], '', mediaSimples(v), v.length);
  });
  Object.keys(durGeral).forEach(function (k) {
    var v = filtrarIqr(durGeral[k]);
    linha('DURACAO_GERAL', k, '', '', mediaSimples(v), v.length);
  });
  Object.keys(durPcp).forEach(function (k) {
    var v = filtrarIqr(durPcp[k]);
    linha('DURACAO_PCP', k, '', '', mediaSimples(v), v.length);
  });
  Object.keys(fila).forEach(function (k) {
    var p = k.split('|');
    linha('FILA', p[0], p[1], '', mediana(fila[k]), fila[k].length);
  });
  Object.keys(filaGeral).forEach(function (k) {
    linha('FILA_GERAL', k, '', '', mediana(filaGeral[k]), filaGeral[k].length);
  });
  Object.keys(costura).forEach(function (k) {
    var p = k.split('|');
    linha('COSTURA_OFICINA', ETAPA_COSTURA, p[0], p[1], mediaSimples(costura[k]), costura[k].length);
  });
  return linhas.sort(function (a, b) {
    if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
    if (a.etapa !== b.etapa) return a.etapa - b.etapa;
    var ca = chaveMediaPrevisao(a);
    var cb = chaveMediaPrevisao(b);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
}

// Chave da linha na aba: tipo|etapa|faixa|oficina_id (coluna chave, no fim).
function chaveMediaPrevisao(l) {
  return [semAcento(l && l.tipo), texto(l && l.etapa), texto(l && l.faixa), texto(l && l.oficina_id)].join('|');
}

// Linhas novas x aba atual: chave existente = update só de valor/amostra/calculado_em;
// chave nova = append; chave que sumiu do cálculo = valor vazio e amostra 0 (nunca apaga).
function operacoesMediasPrevisao(novas, atuais, calculadoEm) {
  var existentes = {};
  (atuais || []).forEach(function (l) {
    var c = texto(l && l.chave);
    if (c) existentes[c] = l;
  });
  var vistas = {};
  var ops = [];
  (novas || []).forEach(function (l) {
    var chave = chaveMediaPrevisao(l);
    vistas[chave] = 1;
    if (existentes[chave]) {
      ops.push({ aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave',
        linha: { chave: chave, valor: l.valor, amostra: l.amostra, calculado_em: calculadoEm } });
      return;
    }
    ops.push({ aba: 'PREVISAO_MEDIAS', operacao: 'append', chave: 'chave', linha: {
      tipo: l.tipo, etapa: l.etapa, faixa: l.faixa, oficina_id: l.oficina_id, valor: l.valor,
      amostra: l.amostra, calculado_em: calculadoEm, chave: chave
    } });
  });
  Object.keys(existentes).forEach(function (chave) {
    if (vistas[chave] || texto(existentes[chave].valor) === '') return;
    ops.push({ aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave',
      linha: { chave: chave, valor: '', amostra: 0, calculado_em: calculadoEm } });
  });
  return ops;
}

// Ploomes cru -> operações da PREVISAO_MEDIAS. Sem nenhum registro reconhecido
// (FieldKeys por configurar, texto em outro formato, leitura vazia) não grava
// nada: as médias anteriores ficam e o adaptador registra o aviso no ERROS_APP.
function montarAtualizacaoMedias(registrosPloomes, dealsPloomes, linhasAtuais, hojeISO, calculadoEm) {
  var registros = (registrosPloomes || []).map(normalizarRegistroPrevisao).filter(function (r) {
    return r.dealId && r.etapa !== null && r.inicio;
  });
  if (!registros.length) {
    return { ok: false, erro: 'Nenhum registro de etapa reconhecido no Ploomes; médias anteriores mantidas.' };
  }
  var deals = {};
  (dealsPloomes || []).forEach(function (d) {
    var n = normalizarDealPrevisao(d);
    if (n.dealId) deals[n.dealId] = n;
  });
  var medias = calcularMediasPrevisao(registros, deals, hojeISO);
  return { ok: true, registros: registros.length, operacoes: operacoesMediasPrevisao(medias, linhasAtuais, calculadoEm) };
}
```

Conferência à mão do histórico fictício (hoje 19/10/2026, janela desde 22/04/2026): etapa 15 da faixa Médio = média de 3 e 5 dias = **4** (o registro de março fica fora; o aberto não entra na duração); geral da 15 = 4; só PCP = 3. Costura (17) na janela = média de 6 e 8 = **7**; da oficina of-1 sem janela = média de 6, 8 e 4 = **6**. Fila da 17: deal 1 terminou a 15 em 04/10 (a 16 em 05/10 não conta) e começou a 17 em 05/10 → 1 dia; deal 2: 06/09 → 08/09 = 2 dias; mediana **1,5**. Etapa 19 do deal 3 fica fora (só passou pela 13). Fila da 18 do deal 1 é negativa (fora).

- [ ] **Passo 4: Leitura, destinos e conferência de cabeçalho da aba nova**

Em `n8n/src/planilhaLote.js`, logo depois da linha `var LEITURAS_RETENTAR_INTERPRETACAO = ['PRODUCAO', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];`, acrescente:

```js
// Workflow diário "PCP MRBL - Médias de Previsão".
var LEITURAS_MEDIAS_PREVISAO = ['PREVISAO_MEDIAS'];
```

No fim de `DESTINOS_ESCRITA`, troque

```js
  { aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id' }
];
```

por

```js
  { aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id' },
  // Médias da previsão (19/10): linha casada pela coluna chave (tipo|etapa|faixa|oficina_id).
  { aba: 'PREVISAO_MEDIAS', operacao: 'append', chave: 'chave' },
  { aba: 'PREVISAO_MEDIAS', operacao: 'update', chave: 'chave' }
];
```

E troque `ABAS_F4` por:

```js
var ABAS_F4 = { PRODUCAO: 1, OFICINAS: 1, WHATSAPP_MENSAGENS: 1, WHATSAPP_SUGESTOES: 1, PREVISAO_MEDIAS: 1 };
```

- [ ] **Passo 5: Rodar e ver passar**

Run: `cd n8n && npm test`
Expected: PASS (todos; 7 testes novos em `previsao.test.js` e 2 em `planilha-lote.test.js`).

- [ ] **Passo 6: Build e commit**

```bash
cd n8n && npm run build
cd .. && git add n8n/src/previsao.js n8n/src/planilhaLote.js n8n/test/previsao.test.js n8n/test/planilha-lote.test.js n8n/build
git commit -m "feat: médias de duração, fila e Costura por oficina a partir do histórico do Ploomes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Workflow "PCP MRBL - Médias de Previsão"

**Files:**
- Create: `n8n/adaptadores/montar-medias-previsao.js`, `n8n/adaptadores/montar-erro-medias.js`
- Modify: `n8n/scripts/gerar-code-nodes.js` (objeto `NODES`)
- Modify: `n8n/scripts/gerar-workflow-sdk.js` (helper `buscarPloomes`, workflow novo e gravação do arquivo)
- Test: `n8n/test/workflow-medias-previsao.test.js` (novo)
- Gerados: `n8n/build/montar-medias-previsao.js`, `n8n/build/montar-erro-medias.js`, `n8n/workflows/pcp-medias-previsao.sdk.js`, `n8n/workflows/json/pcp-medias-previsao.json` (e os demais `build/*.js`, que passam a conter `previsao.js`)

**Interfaces:**
- Consumes: Tarefas 1 e 2 (`montarAtualizacaoMedias`, `hojeSaoPaulo`, `MARCADOR_HISTORICO_PREVISAO`, `FUNIL_PCP`, `FUNIL_PRODUCAO`, `LEITURAS_MEDIAS_PREVISAO`); de `producao.js`: `avaliarPaginaProducao(resposta, pagina, tamanho)`; de `planilhaLote.js`: `planilhaDoLote`, `requisicoesDeEscrita`, `linhaErroApp`, `requisicaoErroApp`, `PLANILHA_ID`.
- Produces:
  - Workflow `pcp-mrbl-medias-previsao` / "PCP MRBL - Médias de Previsão": nodes `Todo dia às 3h` → `Ler Médias Atuais` → `Buscar Registros no Ploomes` → `Buscar Negócios no Ploomes` (executeOnce) → `Montar Médias` → `Tem Escritas?` → `Loop Escritas Médias` → `Repetir Escrita?` → `Gravar Médias` (batchUpdate, com retry) / `Anexar Médias` (append, sem retry); erros → `Montar Erro Médias` → `Registrar Erro Médias`.
  - Helper do gerador `buscarPloomes(varName, nome, url, extra)` e as constantes `PLOOMES`, `FUNIS_PREVISAO`, `URL_COSTURA` (usadas também na Tarefa 4).
  - Linha do `ERROS_APP` com tipo `medias_previsao` quando a leitura falha ou nenhum registro é reconhecido.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `n8n/test/workflow-medias-previsao.test.js`:

```js
// Workflow "PCP MRBL - Médias de Previsão" (gerado) e o adaptador Montar Médias.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { converter } = require('../scripts/sdk-para-json');
const { ARQUIVOS, limpo } = require('./carregar');

const arquivo = path.join(__dirname, '..', 'workflows', 'pcp-medias-previsao.sdk.js');
const workflow = () => converter(arquivo);
const no = (w, nome) => w.nodes.find((n) => n.name === nome);
const destinos = (w, origem, saida) => (((w.connections[origem] || {}).main || [])[saida] || []).map((c) => c.node);

const CAB = ['tipo', 'etapa', 'faixa', 'oficina_id', 'valor', 'amostra', 'calculado_em', 'chave'];
const vr = (aba, values) => ({ range: "'" + aba + "'!A1:Z100", majorDimension: 'ROWS', values });

// campos: FieldKeys do registro a configurar no vm (null = deixa o marcador CONFIGURAR_).
function rodarAdaptador(snapshot, paginasRegistros, paginasNegocios, campos) {
  const ctx = vm.createContext({
    require,
    $: (nome) => {
      if (nome === 'Ler Médias Atuais') return { first: () => ({ json: snapshot }) };
      if (nome === 'Buscar Registros no Ploomes') return { all: () => paginasRegistros.map((json) => ({ json })) };
      throw new Error('node inesperado: ' + nome);
    },
    $input: { all: () => paginasNegocios.map((json) => ({ json })) }
  });
  for (const f of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  if (campos) {
    ctx.CAMPO_REGISTRO_INICIO = campos.inicio;
    ctx.CAMPO_REGISTRO_TERMINO = campos.termino;
  }
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'adaptadores', 'montar-medias-previsao.js'), 'utf8');
  return limpo(vm.runInContext('(function () {\n' + codigo + '\n})()', ctx, { filename: 'montar-medias-previsao.js' }));
}

const CAMPOS = { inicio: 'record_INICIO_FICTICIO', termino: 'record_TERMINO_FICTICIO' };
const registro = (dealId, etapa, ini, fim) => ({
  Id: dealId * 10 + etapa, DealId: dealId, Content: `<p>Etapa: ${etapa}</p>`,
  OtherProperties: [
    { FieldKey: CAMPOS.inicio, DateTimeValue: ini + 'T03:00:00Z' },
    { FieldKey: CAMPOS.termino, DateTimeValue: fim + 'T03:00:00Z' }
  ]
});
const negocio = (id, pecas) => ({ Id: id, OtherProperties: [{ FieldKey: 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', IntegerValue: pecas }] });
const pagina = (value) => ({ statusCode: 200, body: { value } });

test('médias: agenda diária às 3h em São Paulo, workflow novo e sem retenção de sucesso', () => {
  const w = workflow();
  assert.equal(w.name, 'PCP MRBL - Médias de Previsão');
  assert.deepEqual(no(w, 'Todo dia às 3h').parameters.rule.interval, [{ field: 'days', daysInterval: 1, triggerAtHour: 3 }]);
  assert.equal(w.settings.timezone, 'America/Sao_Paulo');
  assert.equal(w.settings.executionTimeout, 1800);
  assert.equal(w.settings.saveDataSuccessExecution, 'none');
});

test('médias: lê registros com o marcador 60151285 e negócios dos funis PCP e Produção, paginando', () => {
  const w = workflow();
  const reg = no(w, 'Buscar Registros no Ploomes');
  assert.match(reg.parameters.url, /^https:\/\/public-api2\.ploomes\.com\/InteractionRecords\?/);
  assert.match(reg.parameters.url, /TagId%20eq%2060151285/);
  assert.match(reg.parameters.url, /&\$orderby=Id(&|$)/);
  const neg = no(w, 'Buscar Negócios no Ploomes');
  assert.match(neg.parameters.url, /PipelineId%20eq%2060011710/);
  assert.match(neg.parameters.url, /PipelineId%20eq%2060015827/);
  assert.equal(neg.executeOnce, true);
  for (const n of [reg, neg]) {
    assert.equal(n.parameters.options.pagination.pagination.requestInterval, 700);
    assert.equal(n.retryOnFail, true);
    assert.equal(n.waitBetweenTries, 30000);
    assert.equal(n.onError, 'continueErrorOutput');
    assert.equal(n.credentials.httpHeaderAuth.id, 'QfXOyNly69oAqwH2');
  }
  assert.match(no(w, 'Ler Médias Atuais').parameters.url, /PREVISAO_MEDIAS/);
});

test('médias: ordem dos nodes, loop de gravação e erros no ERROS_APP; nada apaga linhas', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Todo dia às 3h', 0), ['Ler Médias Atuais']);
  assert.deepEqual(destinos(w, 'Ler Médias Atuais', 0), ['Buscar Registros no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Registros no Ploomes', 0), ['Buscar Negócios no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Negócios no Ploomes', 0), ['Montar Médias']);
  assert.deepEqual(destinos(w, 'Montar Médias', 0), ['Tem Escritas?']);
  assert.deepEqual(destinos(w, 'Loop Escritas Médias', 1), ['Repetir Escrita?']);
  assert.deepEqual(destinos(w, 'Repetir Escrita?', 0), ['Gravar Médias']);
  assert.deepEqual(destinos(w, 'Repetir Escrita?', 1), ['Anexar Médias']);
  for (const n of ['Ler Médias Atuais', 'Buscar Registros no Ploomes', 'Buscar Negócios no Ploomes', 'Gravar Médias', 'Anexar Médias']) {
    assert.deepEqual(destinos(w, n, 1), ['Montar Erro Médias'], n);
  }
  assert.deepEqual(destinos(w, 'Montar Erro Médias', 0), ['Registrar Erro Médias']);
  assert.equal(no(w, 'Anexar Médias').retryOnFail, undefined);
  const http = w.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
  assert.ok(http.every((n) => !/clear|delete/i.test(String(n.parameters.url))));
});

test('adaptador: grava append da chave nova e update da existente', () => {
  const snapshot = { valueRanges: [vr('PREVISAO_MEDIAS', [CAB, ['DURACAO_GERAL', 17, '', '', 9, 3, 'T0', 'DURACAO_GERAL|17||']])] };
  const regs = pagina([registro(800001, 17, '2026-10-05', '2026-10-11')]);
  const reqs = rodarAdaptador(snapshot, [regs], [pagina([negocio(800001, 100)])], CAMPOS);
  assert.deepEqual(reqs.map((r) => r.json.repetir), [false, true]);
  assert.match(decodeURIComponent(reqs[0].json.url), /'PREVISAO_MEDIAS'!A3:append/);
  assert.deepEqual(reqs[0].json.body.values.map((l) => l[7]), ['DURACAO|17|02. Médio|']);
  assert.deepEqual(reqs[1].json.body.data.map((d) => d.range), ["'PREVISAO_MEDIAS'!E2:G2"]);
  assert.equal(reqs[1].json.body.data[0].values[0][0], 6);
});

test('adaptador: FieldKeys por configurar ou página inválida não gravam médias, só o ERROS_APP', () => {
  const snapshot = { valueRanges: [vr('PREVISAO_MEDIAS', [CAB])] };
  const semCampos = rodarAdaptador(snapshot, [pagina([registro(800001, 17, '2026-10-05', '2026-10-11')])], [pagina([])], null);
  assert.equal(semCampos.length, 1);
  assert.match(decodeURIComponent(semCampos[0].json.url), /'ERROS_APP'!/);
  assert.equal(semCampos[0].json.body.values[0][2], 'medias_previsao');
  assert.match(semCampos[0].json.body.values[0][6], /Nenhum registro de etapa reconhecido/);

  const invalida = rodarAdaptador(snapshot, [{ statusCode: 200, body: { erro: 'fictício' } }], [pagina([])], CAMPOS);
  assert.equal(invalida.length, 1);
  assert.match(invalida[0].json.body.values[0][6], /Resposta inválida do Ploomes/);
  assert.doesNotMatch(JSON.stringify(invalida), /fictício/);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd n8n && node --test test/workflow-medias-previsao.test.js`
Expected: FAIL (`ENOENT ... workflows/pcp-medias-previsao.sdk.js` e `adaptadores/montar-medias-previsao.js`).

- [ ] **Passo 3: Adaptadores**

Crie `n8n/adaptadores/montar-medias-previsao.js`:

```js
// ===== adaptador: Montar Médias de Previsão =====
// Junta as páginas do Ploomes (registros marcados e negócios), calcula as médias
// (src/previsao.js) e transforma em requisições para a PREVISAO_MEDIAS. Qualquer
// falha de leitura ou de conferência vira uma linha no ERROS_APP e nada mais é
// gravado: as médias anteriores continuam valendo.
var agora = new Date().toISOString();
function lerPaginasPloomes(itens) {
  var lista = [];
  for (var i = 0; i < itens.length; i++) {
    var resposta = itens[i] && itens[i].json ? itens[i].json : {};
    if (resposta.statusCode === undefined && resposta.body === undefined && Array.isArray(resposta.value)) {
      resposta = { statusCode: 200, body: resposta };
    }
    var pagina = avaliarPaginaProducao(resposta, i + 1, 100);
    if (!pagina.ok) return { ok: false, erro: pagina.erro };
    lista = lista.concat(pagina.itens);
  }
  return { ok: true, itens: lista };
}
var reqs;
try {
  var planilha = planilhaDoLote($('Ler Médias Atuais').first().json, LEITURAS_MEDIAS_PREVISAO);
  var registros = lerPaginasPloomes($('Buscar Registros no Ploomes').all());
  var negocios = registros.ok ? lerPaginasPloomes($input.all()) : registros;
  var resultado = !negocios.ok ? negocios
    : montarAtualizacaoMedias(registros.itens, negocios.itens, planilha.linhas.PREVISAO_MEDIAS, hojeSaoPaulo(Date.parse(agora)), agora);
  if (!resultado.ok) throw new Error(resultado.erro);
  reqs = requisicoesDeEscrita(resultado.operacoes, [], planilha, PLANILHA_ID);
} catch (e) {
  var linhaErro = linhaErroApp({ agora: Date.parse(agora), sessao: { nome: 'sistema' }, corpo: { tipo: 'medias_previsao' }, erro: e });
  reqs = [requisicaoErroApp(linhaErro, PLANILHA_ID)];
}
if (!reqs.length) return [{ json: { vazio: true } }];
return reqs.map(function (r, i) {
  return { json: { vazio: false, passo: i + 1, de: reqs.length, method: r.method, url: r.url, body: r.body, repetir: r.repetir === true } };
});
```

Crie `n8n/adaptadores/montar-erro-medias.js`:

```js
// ===== adaptador: Montar Erro Médias =====
// Registra somente metadados técnicos; nunca inclui resposta do Ploomes,
// cabeçalhos, credenciais ou linhas da planilha.
function tentarMedias(f) {
  try { return f(); } catch (e) { return undefined; }
}
var erroEntrada = tentarMedias(function () { return $input.first().json; }) || {};
var loteMedias = tentarMedias(function () { return $('Loop Escritas Médias').first().json; }) || {};
var linhaErro = linhaErroApp({
  agora: Date.now(),
  sessao: { nome: 'sistema' },
  corpo: { tipo: 'medias_previsao' },
  lote: loteMedias,
  erro: erroEntrada.error !== undefined ? erroEntrada.error : erroEntrada
});
var reqErro = requisicaoErroApp(linhaErro, PLANILHA_ID);
return [{ json: { method: reqErro.method, url: reqErro.url, body: reqErro.body } }];
```

Em `n8n/scripts/gerar-code-nodes.js`, troque a última entrada de `NODES`

```js
  'marcar-tentativas-interpretacao': 'Marcar Tentativas'
```

por

```js
  'marcar-tentativas-interpretacao': 'Marcar Tentativas',
  'montar-medias-previsao': 'Montar Médias',
  'montar-erro-medias': 'Montar Erro Médias'
```

- [ ] **Passo 4: Helper de busca paginada no Ploomes (refatoração sem mudança no sync)**

Em `n8n/scripts/gerar-workflow-sdk.js`, imediatamente antes da linha `posAtual = POS_SYNC_PRODUCAO;`, acrescente:

```js
// GET paginado no Ploomes por $skip (100 por página, 700 ms entre páginas), com
// 3 tentativas a cada 30 s (429/5xx) e saída de erro para o registro no ERROS_APP.
// extra: executeOnce quando o node vem depois de outro que devolve várias páginas.
const buscarPloomes = (varName, nome, url, extra) => `const ${varName} = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: '${nome}',
    ${extra || ''}retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 30000,
    onError: 'continueErrorOutput',
    parameters: {
      method: 'GET',
      url: '${url}',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      options: {
        response: { response: { fullResponse: true, neverError: false } },
        pagination: { pagination: {
          paginationMode: 'updateAParameterInEachRequest',
          parameters: { parameters: [{ type: 'qs', name: '$skip', value: expr('{{ $pageCount * 100 }}') }] },
          paginationCompleteWhen: 'other',
          completeExpression: expr('{{ !Array.isArray($response.body.value) || $response.body.value.length < 100 }}'),
          requestInterval: 700
        } },
        timeout: 30000
      }
    },
    credentials: { httpHeaderAuth: { id: 'QfXOyNly69oAqwH2', name: 'Header Auth account' } },
    position: ${posicao(nome)}
  },
  output: [{ statusCode: 200, body: { value: [] } }]
});`;

const PLOOMES = 'https://public-api2.ploomes.com/';
const FUNIS_PREVISAO = '(PipelineId%20eq%20' + lote.FUNIL_PCP + '%20or%20PipelineId%20eq%20' + lote.FUNIL_PRODUCAO + ')';
const URL_COSTURA = PLOOMES + 'Deals?$filter=PipelineId%20eq%2060015827%20and%20StageId%20eq%2060073488&$expand=OtherProperties&$select=Id,Title,ContactName,LastUpdateDate&$orderby=Id&$top=100';
```

Ainda no array `syncProducao`, substitua o template inteiro do node da Costura — o item que começa em

```js
  `const buscarProducao = node({
```

e vai até o fechamento desse template (a linha `});` seguida de crase e vírgula), logo antes de `code('montarSyncProducao', 'Montar Sincronização', 'sincronizar-producao'),` — por uma linha só:

```js
  buscarPloomes('buscarProducao', 'Buscar Produção no Ploomes', URL_COSTURA),
```

O JSON gerado do sync não muda nesta tarefa (mesmos parâmetros, na mesma ordem).

- [ ] **Passo 5: Workflow novo**

Ainda em `n8n/scripts/gerar-workflow-sdk.js`, imediatamente antes da linha `fs.mkdirSync(path.join(raiz, 'workflows'), { recursive: true });`, acrescente:

```js
// Médias de Previsão (19/10): todo dia às 3h lê os registros de etapa marcados no
// Ploomes e os negócios dos funis PCP e Produção, calcula durações, filas e a
// Costura por oficina e grava a PREVISAO_MEDIAS (update por chave, append da chave
// nova, nunca apaga). Falha de leitura: médias anteriores ficam e vai para ERROS_APP.
// Todos os registros com o marcador (a média de Costura por oficina não tem janela)
// e os negócios dos dois funis, em qualquer situação.
const URL_REGISTROS_PREVISAO = PLOOMES + 'InteractionRecords?$filter=Tags/any(t:%20t/TagId%20eq%20' + lote.MARCADOR_HISTORICO_PREVISAO + ')&$expand=OtherProperties&$select=Id,DealId,Content&$orderby=Id&$top=100';
const URL_NEGOCIOS_PREVISAO = PLOOMES + 'Deals?$filter=' + FUNIS_PREVISAO + '&$expand=OtherProperties&$select=Id&$orderby=Id&$top=100';
const POS_MEDIAS = {};
[['Todo dia às 3h', 0, 0], ['Ler Médias Atuais', 1, 0], ['Buscar Registros no Ploomes', 2, 0],
  ['Buscar Negócios no Ploomes', 3, 0], ['Montar Médias', 4, 0], ['Tem Escritas?', 5, 0],
  ['Loop Escritas Médias', 6, 0], ['Repetir Escrita?', 7, 0], ['Gravar Médias', 8, -100], ['Anexar Médias', 8, 100],
  ['Montar Erro Médias', 7, 260], ['Registrar Erro Médias', 8, 260]]
  .forEach(([n, c, y]) => { POS_MEDIAS[n] = [c * DX, y]; });
posAtual = POS_MEDIAS;
RETRY = RETRY_API;
const mediasPrevisao = IMPORT_API + [
  `const agendaMedias = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: {
    name: 'Todo dia às 3h',
    parameters: { rule: { interval: [{ field: 'days', daysInterval: 1, triggerAtHour: 3 }] } },
    position: ${posicao('Todo dia às 3h')}
  },
  output: [{}]
});`,
  httpGoogle('lerMediasAtuais', 'Ler Médias Atuais', 'GET', JSON.stringify(lote.urlLeitura(DOC, lote.LEITURAS_MEDIAS_PREVISAO)), false, ERRO_SAIDA),
  buscarPloomes('buscarRegistros', 'Buscar Registros no Ploomes', URL_REGISTROS_PREVISAO),
  buscarPloomes('buscarNegocios', 'Buscar Negócios no Ploomes', URL_NEGOCIOS_PREVISAO, unico),
  code('montarMedias', 'Montar Médias', 'montar-medias-previsao'),
  'const temEscritasMedias = ' + condicao('Tem Escritas?', '{{ $json.vazio === true }}', 'boolean', 'false', "''")
    .replace("operation: 'false' }", "operation: 'false', singleValue: true }") + ';',
  `const loopEscritasMedias = splitInBatches({
  version: 3,
  config: {
    name: 'Loop Escritas Médias',
    parameters: { batchSize: 1, options: {} },
    position: ${posicao('Loop Escritas Médias')}
  }
});`,
  'const repetirEscritaMedias = ' + condicao('Repetir Escrita?', '{{ $json.repetir }}', 'boolean', 'true', "''")
    .replace("operation: 'true' }", "operation: 'true', singleValue: true }") + ';',
  httpGoogle('gravarMedias', 'Gravar Médias', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA),
  httpGoogle('anexarMedias', 'Anexar Médias', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, ''),
  code('montarErroMedias', 'Montar Erro Médias', 'montar-erro-medias'),
  httpGoogle('registrarErroMedias', 'Registrar Erro Médias', 'POST', "expr('{{ $json.url }}')", true,
    "onError: 'continueRegularOutput',\n    ", '')
].join('\n\n') + `

export default workflow('pcp-mrbl-medias-previsao', 'PCP MRBL - Médias de Previsão', {
  timezone: 'America/Sao_Paulo',
  executionTimeout: 1800,
  saveDataSuccessExecution: 'none',
  saveDataErrorExecution: 'all'
})
  .add(agendaMedias)
  .to(lerMediasAtuais
    .onError(montarErroMedias.to(registrarErroMedias))
    .to(buscarRegistros
      .onError(montarErroMedias.to(registrarErroMedias))
      .to(buscarNegocios
        .onError(montarErroMedias.to(registrarErroMedias))
        .to(montarMedias)
        .to(temEscritasMedias
          .onTrue(loopEscritasMedias
            .onEachBatch(repetirEscritaMedias
              .onTrue(gravarMedias
                .onError(montarErroMedias.to(registrarErroMedias))
                .to(nextBatch(loopEscritasMedias)))
              .onFalse(anexarMedias
                .onError(montarErroMedias.to(registrarErroMedias))
                .to(nextBatch(loopEscritasMedias)))))))));
`;

```

E, junto das outras gravações no fim do arquivo, antes de `fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-producao-sync.sdk.js'), syncProducao);`, acrescente:

```js
fs.writeFileSync(path.join(raiz, 'workflows', 'pcp-medias-previsao.sdk.js'), mediasPrevisao);
console.log('workflows/pcp-medias-previsao.sdk.js');
```

- [ ] **Passo 6: Build, rodar e ver passar**

Run: `cd n8n && npm run build && npm test`
Expected: o build lista `workflows/json/pcp-medias-previsao.json: 12 nodes`; todos os testes passam (5 novos). `git diff --stat n8n/workflows/json/pcp-producao-sync.json` mostra só a mudança do `jsCode` (que agora inclui `previsao.js`), nenhum parâmetro de node.

- [ ] **Passo 7: Commit**

```bash
git add n8n/adaptadores/montar-medias-previsao.js n8n/adaptadores/montar-erro-medias.js n8n/scripts/gerar-code-nodes.js n8n/scripts/gerar-workflow-sdk.js n8n/test/workflow-medias-previsao.test.js n8n/build n8n/workflows
git commit -m "feat: workflow diário Médias de Previsão grava a PREVISAO_MEDIAS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Sync da produção ampliado para as etapas 12 a 16

**Files:**
- Modify: `n8n/src/planilhaLote.js` (`LEITURAS_SYNC_PRODUCAO`)
- Modify: `n8n/src/producao.js` (`linhaProducao`, previstas, `montarSincronizacaoProducao`)
- Modify: `n8n/adaptadores/sincronizar-producao.js` (reescrito)
- Modify: `n8n/scripts/gerar-workflow-sdk.js` (node "Buscar Previstas no Ploomes", posições e ligações)
- Test: `n8n/test/producao.test.js`, `n8n/test/workflow-producao-sync.test.js`
- Gerados: `n8n/build/*.js`, `n8n/workflows/pcp-producao-sync.sdk.js`, `n8n/workflows/json/pcp-producao-sync.json`

**Interfaces:**
- Consumes: Tarefas 1 e 2 (`numeroEtapa`, `dataSaoPaulo`, `valorCampoDeal`, `campoConfigurado`, `simNaoPloomes`, `pecasPrevisao`, `CAMPOS_ENTRADA_ETAPA`, `CAMPO_PCP_COMPLETO`, `CAMPO_PECAS_PEDIDO`, `ETAPA_ENCAIXE`, `ETAPA_ULTIMA_PREVISTA`, `ETAPA_COSTURA`, `tabelaMedias`, `projetarOs`, `hojeSaoPaulo`); Tarefa 3 (`buscarPloomes`, `PLOOMES`, `FUNIS_PREVISAO`, `URL_COSTURA`, `unico` já existente no gerador).
- Produces:
  - `LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS', 'PREVISAO_MEDIAS']` em `planilhaLote.js` (o adaptador e o gerador usam esta, sem cópia local).
  - Colunas novas no fim da `PRODUCAO` (nesta ordem, depois de `valor_corte`): `etapa_ordem` | `etapa_nome` | `etapa_inicio` | `prevista` | `inicio_costura_previsto` | `fim_costura_previsto`. `linhaProducao` (Costura) grava `17`, `'17. Costura'`, `''`, `'NAO'`, `''`, `''`.
  - `ETAPA_NOME_COSTURA = '17. Costura'`.
  - `normalizarDealPrevisto(deal)`: o card de `normalizarDealProducao` + `etapaOrdem`, `etapaNome`, `etapaInicio`, `pcpCompleto`, `pecasPrevisao`.
  - `separarPrevistas(deals, dealsCostura): { cards, dealsMantidos }`.
  - `linhaPrevista(card, medias, hojeISO, sincronizadoEm)`: linha da `PRODUCAO` com `em_costura: 'NAO'`, `prevista: 'SIM'` e as datas projetadas.
  - `montarSincronizacaoProducao(cards, producaoAtual, oficinasAtuais, sincronizadoEm, dealsMantidos, previstas)` — `previstas` é uma lista de linhas prontas; encerramento grava `{ deal_id, em_costura: 'NAO', prevista: 'NAO', sincronizado_em }`.
  - Workflow do sync: `Buscar Produção no Ploomes` → `Buscar Previstas no Ploomes` (executeOnce, saída de erro para `Montar Erro Produção`) → `Montar Sincronização`. O adaptador lê a Costura por `$('Buscar Produção no Ploomes').all()` e as previstas por `$input.all()`.

- [ ] **Passo 1: Escrever os testes que falham**

Em `n8n/test/producao.test.js`, troque o fim do teste `linhaProducao normaliza o snapshot e usa ALOCAR sem oficina`:

Troque

```js
    em_costura: 'SIM', atualizado_em_ploomes: 'v1', sincronizado_em: '2026-10-13T12:00:00.000Z',
    valor_corte: 12345.67
  });
  assert.equal(ctx.linhaProducao(prod({ valorCorte: null }), '2026-10-13T12:00:00.000Z').valor_corte, '');
  // A coluna nova fica no fim do contrato da aba PRODUCAO.
  assert.equal(Object.keys(ctx.linhaProducao(prod(), '2026-10-13T12:00:00.000Z')).pop(), 'valor_corte');
});
```

por

```js
    em_costura: 'SIM', atualizado_em_ploomes: 'v1', sincronizado_em: '2026-10-13T12:00:00.000Z',
    valor_corte: 12345.67,
    etapa_ordem: 17, etapa_nome: '17. Costura', etapa_inicio: '', prevista: 'NAO',
    inicio_costura_previsto: '', fim_costura_previsto: ''
  });
  assert.equal(ctx.linhaProducao(prod({ valorCorte: null }), '2026-10-13T12:00:00.000Z').valor_corte, '');
  // As colunas novas ficam no fim do contrato da aba PRODUCAO, nesta ordem.
  assert.deepEqual(Object.keys(ctx.linhaProducao(prod(), '2026-10-13T12:00:00.000Z')).slice(-7),
    ['valor_corte', 'etapa_ordem', 'etapa_nome', 'etapa_inicio', 'prevista', 'inicio_costura_previsto', 'fim_costura_previsto']);
});
```


E acrescente no fim de `n8n/test/producao.test.js`:

```js
// ---------- OS previstas (19/10) ----------

const CAMPO_OS = 'deal_C06992BA-FF1E-47A8-9330-5242026E691E';
const CAMPO_PECAS = 'deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD';
const CAMPO_OFICINA = 'deal_89DE05E0-467F-4012-9B82-F1E077F968E4';
function dealPrevisto(id, etapa, extra) {
  return Object.assign({
    Id: id, Title: 'PEÇA PREVISTA', ContactName: 'CLIENTE FICTÍCIO', LastUpdateDate: 'v-' + id,
    Stage: { Id: 1, Name: etapa },
    OtherProperties: [
      { FieldKey: CAMPO_OS, StringValue: String(id).slice(-5) },
      { FieldKey: CAMPO_PECAS, IntegerValue: 100 },
      { FieldKey: CAMPO_OFICINA, UserValueId: 501, UserValueName: 'OFICINA FICTÍCIA' }
    ]
  }, extra);
}

test('separarPrevistas: etapas 12 a 16, 12 e 13 só com PCP completo, sem repetir a Costura', () => {
  const c = carregar();
  c.CAMPO_PCP_COMPLETO = 'deal_PCP_COMPLETO_FICTICIO';
  const pcp = (sim) => ({ FieldKey: 'deal_PCP_COMPLETO_FICTICIO', BoolValue: sim });
  const comPcp = (d, sim) => { d.OtherProperties.push(pcp(sim)); return d; };
  const deals = [
    comPcp(dealPrevisto(710012, '12. Encaixe'), true),
    comPcp(dealPrevisto(710013, '13. Estratégico 2'), false),
    dealPrevisto(710015, '15. Preparação 1'),
    dealPrevisto(710016, '16. Primeira Peça'),
    dealPrevisto(710017, '17. Costura'),
    dealPrevisto(710011, '11. Ficha técnica'),
    dealPrevisto(710099, '14. Corte'),
    Object.assign(dealPrevisto(710014, '14. Corte'), { OtherProperties: [] })
  ];
  const r = limpo(c.separarPrevistas(deals, ['710099']));
  assert.deepEqual(r.cards.map((x) => [x.dealId, x.etapaOrdem]), [['710012', 12], ['710015', 15], ['710016', 16]]);
  assert.deepEqual(r.dealsMantidos, ['710014']);
  // Sem a FieldKey configurada, nada nas etapas 12 e 13 entra.
  assert.deepEqual(limpo(ctx.separarPrevistas(deals, [])).cards.map((x) => x.dealId), ['710015', '710016', '710099']);
});

test('linhaPrevista: em_costura NAO, prevista SIM e datas projetadas; sem peças fica sem datas', () => {
  const card = ctx.normalizarDealPrevisto(dealPrevisto(710015, '15. Preparação 1'));
  const linha = limpo(ctx.linhaPrevista(card, ctx.tabelaMedias([]), '2026-10-19', 'T1'));
  assert.equal(linha.em_costura, 'NAO');
  assert.equal(linha.prevista, 'SIM');
  assert.equal(linha.etapa_ordem, 15);
  assert.equal(linha.etapa_nome, '15. Preparação 1');
  assert.equal(linha.oficina_id, '501');
  // Sem médias (fallback do BI): FimBase = 19 + 1 = 20/10; Início(17) = 20 + 0 = 20/10; Fim = 21/10.
  assert.equal(linha.inicio_costura_previsto, '2026-10-20');
  assert.equal(linha.fim_costura_previsto, '2026-10-21');
  const semPecas = ctx.normalizarDealPrevisto(Object.assign(dealPrevisto(710016, '16. Primeira Peça'), {
    OtherProperties: [{ FieldKey: CAMPO_OS, StringValue: '10016' }]
  }));
  const vazia = limpo(ctx.linhaPrevista(semPecas, ctx.tabelaMedias([]), '2026-10-19', 'T1'));
  assert.equal(vazia.pecas, '');
  assert.equal(vazia.inicio_costura_previsto, '');
  assert.equal(vazia.fim_costura_previsto, '');
});

test('sincronização com previstas: upsert das previstas e encerramento nas duas colunas', () => {
  const cards = [prod({ dealId: '700001' })];
  const prevista = limpo(ctx.linhaPrevista(ctx.normalizarDealPrevisto(dealPrevisto(710015, '15. Preparação 1')), ctx.tabelaMedias([]), '2026-10-19', 'T1'));
  const atuais = [
    { deal_id: '700001', em_costura: 'SIM', prevista: 'NAO' },
    { deal_id: '710016', em_costura: 'NAO', prevista: 'SIM' },
    { deal_id: '710099', em_costura: 'NAO', prevista: 'NAO' }
  ];
  const r = limpo(ctx.montarSincronizacaoProducao(cards, atuais, [], 'T1', [], [prevista]));
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'PRODUCAO').map((o) => [o.operacao, o.linha.deal_id, o.linha.em_costura, o.linha.prevista]), [
    ['appendOrUpdate', '700001', 'SIM', 'NAO'],
    ['appendOrUpdate', '710015', 'NAO', 'SIM'],
    ['update', '710016', 'NAO', 'NAO']
  ]);
  assert.deepEqual(r.operacoes.filter((o) => o.aba === 'OFICINAS').map((o) => o.linha.ploomes_id), ['of-1', '501']);
});
```

Em `n8n/test/workflow-producao-sync.test.js`, faça estas trocas:

Troque

```js
function rodarAdaptador(snapshot, paginas) {
  const ctx = vm.createContext({
    require,
    $: (nome) => {
      assert.equal(nome, 'Ler Snapshot Produção');
      return { first: () => ({ json: snapshot }) };
    },
    $input: { all: () => paginas.map((json) => ({ json })) }
  });
```

por

```js
// paginas: Costura ("Buscar Produção no Ploomes"); previstas: etapas 12–16 ($input).
function rodarAdaptador(snapshot, paginas, previstas) {
  const paginasPrevistas = previstas || [{ statusCode: 200, body: { value: [] } }];
  const ctx = vm.createContext({
    require,
    $: (nome) => {
      if (nome === 'Ler Snapshot Produção') return { first: () => ({ json: snapshot }) };
      if (nome === 'Buscar Produção no Ploomes') return { all: () => paginas.map((json) => ({ json })) };
      throw new Error('node inesperado: ' + nome);
    },
    $input: { all: () => paginasPrevistas.map((json) => ({ json })) }
  });
```

Troque

```js
const CAB_PRODUCAO = ['deal_id', 'os', 'oficina_id', 'oficina_nome', 'inicio_costura', 'data_combinada', 'lead_time', 'pecas', 'cliente', 'peca', 'referencia', 'em_costura', 'atualizado_em_ploomes', 'sincronizado_em', 'valor_corte'];
const CAB_OFICINAS = ['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em'];
```

por

```js
const CAB_PRODUCAO = ['deal_id', 'os', 'oficina_id', 'oficina_nome', 'inicio_costura', 'data_combinada', 'lead_time', 'pecas', 'cliente', 'peca', 'referencia', 'em_costura', 'atualizado_em_ploomes', 'sincronizado_em', 'valor_corte',
  'etapa_ordem', 'etapa_nome', 'etapa_inicio', 'prevista', 'inicio_costura_previsto', 'fim_costura_previsto'];
const CAB_OFICINAS = ['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em'];
const CAB_MEDIAS = ['tipo', 'etapa', 'faixa', 'oficina_id', 'valor', 'amostra', 'calculado_em', 'chave'];
const MEDIAS_VAZIAS = () => vr('PREVISAO_MEDIAS', [CAB_MEDIAS]);
```

Troque

```js
test('sync lê PRODUCAO e OFICINAS antes de montar escritas e não apaga linhas', () => {
  const w = workflow();
  const ler = no(w, 'Ler Snapshot Produção');
  assert.match(ler.parameters.url, /values:batchGet/);
  assert.match(ler.parameters.url, /PRODUCAO/);
  assert.match(ler.parameters.url, /OFICINAS/);

  assert.deepEqual(destinos(w, 'A cada 5 minutos', 0), ['Ler Snapshot Produção']);
  assert.deepEqual(destinos(w, 'Ler Snapshot Produção', 0), ['Buscar Produção no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Produção no Ploomes', 0), ['Montar Sincronização']);
```

por

```js
test('sync lê PRODUCAO, OFICINAS e PREVISAO_MEDIAS antes de montar escritas e não apaga linhas', () => {
  const w = workflow();
  const ler = no(w, 'Ler Snapshot Produção');
  assert.match(ler.parameters.url, /values:batchGet/);
  assert.match(ler.parameters.url, /PRODUCAO/);
  assert.match(ler.parameters.url, /OFICINAS/);
  assert.match(ler.parameters.url, /PREVISAO_MEDIAS/);

  assert.deepEqual(destinos(w, 'A cada 5 minutos', 0), ['Ler Snapshot Produção']);
  assert.deepEqual(destinos(w, 'Ler Snapshot Produção', 0), ['Buscar Produção no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Produção no Ploomes', 0), ['Buscar Previstas no Ploomes']);
  assert.deepEqual(destinos(w, 'Buscar Previstas no Ploomes', 0), ['Montar Sincronização']);
  assert.deepEqual(destinos(w, 'Buscar Previstas no Ploomes', 1), ['Montar Erro Produção']);
```

Troque

```js
    vr('OFICINAS', [CAB_OFICINAS, ['of-1', 'OFICINA ANTIGA', 'grupo-ficticio@g.us', 'GRUPO FICTÍCIO', 'NAO', 'T0']])
  ] };
  const reqs = rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [
```

por

```js
    vr('OFICINAS', [CAB_OFICINAS, ['of-1', 'OFICINA ANTIGA', 'grupo-ficticio@g.us', 'GRUPO FICTÍCIO', 'NAO', 'T0']]),
    MEDIAS_VAZIAS()
  ] };
  const reqs = rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [
```

Troque

```js
test('adaptador cancela antes de montar escritas quando o Ploomes devolve formato inválido', () => {
  const snapshot = { valueRanges: [vr('PRODUCAO', [CAB_PRODUCAO]), vr('OFICINAS', [CAB_OFICINAS])] };
  assert.throws(
    () => rodarAdaptador(snapshot, [{ statusCode: 200, body: { erro: 'resposta fictícia' } }]),
    /Resposta inválida do Ploomes/
  );
});
```

por

```js
test('adaptador cancela antes de montar escritas quando o Ploomes devolve formato inválido', () => {
  const snapshot = { valueRanges: [vr('PRODUCAO', [CAB_PRODUCAO]), vr('OFICINAS', [CAB_OFICINAS]), MEDIAS_VAZIAS()] };
  assert.throws(
    () => rodarAdaptador(snapshot, [{ statusCode: 200, body: { erro: 'resposta fictícia' } }]),
    /Resposta inválida do Ploomes/
  );
  // Página inválida das previstas também cancela: nada é encerrado por engano.
  assert.throws(
    () => rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [] } }], [{ statusCode: 200, body: { erro: 'resposta fictícia' } }]),
    /Resposta inválida do Ploomes/
  );
});
```

Troque

```js
    vr('OFICINAS', [CAB_OFICINAS, ['of-1', 'OFICINA A', 'grupo-ficticio@g.us', 'GRUPO FICTÍCIO', 'SIM', 'T0']])
  ] };
  const semOs = deal(700002, '', 'of-1', 'OFICINA A');
```

por

```js
    vr('OFICINAS', [CAB_OFICINAS, ['of-1', 'OFICINA A', 'grupo-ficticio@g.us', 'GRUPO FICTÍCIO', 'SIM', 'T0']]),
    MEDIAS_VAZIAS()
  ] };
  const semOs = deal(700002, '', 'of-1', 'OFICINA A');
```

Troque

```js
test('só card sem OS: ainda registra o aviso', () => {
  const snapshot = { valueRanges: [vr('PRODUCAO', [CAB_PRODUCAO]), vr('OFICINAS', [CAB_OFICINAS])] };
```

por

```js
test('só card sem OS: ainda registra o aviso', () => {
  const snapshot = { valueRanges: [vr('PRODUCAO', [CAB_PRODUCAO]), vr('OFICINAS', [CAB_OFICINAS]), MEDIAS_VAZIAS()] };
```


E acrescente no fim de `n8n/test/workflow-producao-sync.test.js`:

```js
test('sync consulta as previstas dos funis PCP e Produção em aberto, uma vez só, com o estágio', () => {
  const w = workflow();
  const prev = no(w, 'Buscar Previstas no Ploomes');
  assert.equal(prev.executeOnce, true);
  assert.match(prev.parameters.url, /PipelineId%20eq%2060011710/);
  assert.match(prev.parameters.url, /PipelineId%20eq%2060015827/);
  assert.match(prev.parameters.url, /StatusId%20eq%201/);
  assert.match(prev.parameters.url, /Stage\(\$select=Id,Name\)/);
  assert.match(prev.parameters.url, /&\$orderby=Id(&|$)/);
  assert.equal(prev.retryOnFail, true);
  assert.equal(prev.onError, 'continueErrorOutput');
});

test('adaptador grava a OS prevista com a projeção das médias e encerra a prevista que saiu', () => {
  const snapshot = { valueRanges: [
    vr('PRODUCAO', [CAB_PRODUCAO,
      ['710016', '10016', '', 'ALOCAR', '', '', '', 30, '', '', '', 'NAO', 'v0', 'T0', '', 16, '16. Primeira Peça', '', 'SIM', '2026-10-20', '2026-10-21']]),
    vr('OFICINAS', [CAB_OFICINAS]),
    vr('PREVISAO_MEDIAS', [CAB_MEDIAS, ['FILA_GERAL', 17, '', '', 2, 9, 'T0', 'FILA_GERAL|17||']])
  ] };
  const prevista = {
    Id: 710015, Title: 'PEÇA PREVISTA', ContactName: 'CLIENTE FICTÍCIO', LastUpdateDate: 'v1', Stage: { Id: 1, Name: '15. Preparação 1' },
    OtherProperties: [prop('deal_C06992BA-FF1E-47A8-9330-5242026E691E', { StringValue: '10015' }), prop('deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD', { IntegerValue: 80 })]
  };
  const reqs = rodarAdaptador(snapshot, [{ statusCode: 200, body: { value: [] } }], [{ statusCode: 200, body: { value: [prevista] } }]);
  const anexo = reqs.find((r) => /'PRODUCAO'!A3:append/.test(decodeURIComponent(r.json.url)));
  const linha = anexo.json.body.values[0];
  const col = (nome) => linha[CAB_PRODUCAO.indexOf(nome)];
  assert.equal(col('deal_id'), '710015');
  assert.equal(col('prevista'), 'SIM');
  assert.equal(col('em_costura'), 'NAO');
  assert.equal(col('etapa_ordem'), 15);
  // inicio = hoje + 1 (duração 15) + 2 (fila 17); fim = inicio + 1.
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const mais = (d) => new Date(Date.parse(hoje + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
  assert.equal(col('inicio_costura_previsto'), mais(3));
  assert.equal(col('fim_costura_previsto'), mais(4));
  const atualizacoes = reqs.flatMap((x) => (x.json.body && x.json.body.data) || []);
  assert.ok(atualizacoes.some((x) => x.range === "'PRODUCAO'!S2" && x.values[0][0] === 'NAO'));
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd n8n && node --test test/producao.test.js test/workflow-producao-sync.test.js`
Expected: FAIL (`ctx.separarPrevistas is not a function`; colunas novas ausentes em `linhaProducao`; node `Buscar Previstas no Ploomes` inexistente).

- [ ] **Passo 3: Leitura do sync na planilhaLote**

Em `n8n/src/planilhaLote.js`, logo depois de `var LEITURAS_RETENTAR_INTERPRETACAO = …;`, acrescente:

```js
// Sync da produção (a cada 5 min): as médias da previsão entram na projeção das OS previstas.
var LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS', 'PREVISAO_MEDIAS'];
```

- [ ] **Passo 4: Regras do sync em `n8n/src/producao.js`**

Faça estas trocas em `n8n/src/producao.js`:

Troque

```js
    // Coluna acrescentada no fim do contrato da aba (16/10).
    valor_corte: numeroOuNulo(p.valorCorte) === null ? '' : numeroOuNulo(p.valorCorte)
  };
}
```

por

```js
    // Coluna acrescentada no fim do contrato da aba (16/10).
    valor_corte: numeroOuNulo(p.valorCorte) === null ? '' : numeroOuNulo(p.valorCorte),
    // Visão de futuro (19/10), no fim da aba. OS na Costura segue a regra atual
    // (combinada ou lead time): as colunas de previsão ficam vazias.
    etapa_ordem: ETAPA_COSTURA,
    etapa_nome: ETAPA_NOME_COSTURA,
    etapa_inicio: '',
    prevista: 'NAO',
    inicio_costura_previsto: '',
    fim_costura_previsto: ''
  };
}

var ETAPA_NOME_COSTURA = '17. Costura';

// Card dos funis PCP e Produção nas etapas 12 a 16: o card da produção mais a
// etapa (pelo nome do estágio), a data de entrada nela, o "PCP completo pelo
// Ploomes?" e as peças usadas na faixa (corte, senão pedido).
function normalizarDealPrevisto(deal) {
  deal = deal || {};
  var card = normalizarDealProducao(deal);
  var etapaNome = texto(deal.Stage && deal.Stage.Name);
  var etapa = numeroEtapa(etapaNome);
  card.etapaOrdem = etapa;
  card.etapaNome = etapaNome;
  card.etapaInicio = etapa !== null && CAMPOS_ENTRADA_ETAPA[etapa] ? dataSaoPaulo(valorCampoDeal(deal, CAMPOS_ENTRADA_ETAPA[etapa])) : '';
  card.pcpCompleto = campoConfigurado(CAMPO_PCP_COMPLETO) && simNaoPloomes(propriedadeDoDeal(deal, CAMPO_PCP_COMPLETO));
  card.pecasPrevisao = pecasPrevisao(card.pecas, valorCampoDeal(deal, CAMPO_PECAS_PEDIDO));
  return card;
}

// Entram as etapas 12 a 16; nas 12 e 13 só com "PCP completo pelo Ploomes?" = sim
// (como no BI). Card que já veio na consulta da Costura fica de fora. Card sem OS é
// pulado sem aviso (o funil PCP tem muitos) e, se já tinha linha, não é encerrado.
function separarPrevistas(deals, dealsCostura) {
  var costura = Object.create(null);
  (dealsCostura || []).forEach(function (id) { if (texto(id)) costura[texto(id)] = 1; });
  var cards = [];
  var mantidos = [];
  (deals || []).forEach(function (deal) {
    var card = normalizarDealPrevisto(deal);
    if (!card.dealId || costura[card.dealId]) return;
    var etapa = card.etapaOrdem;
    if (!(etapa >= ETAPA_ENCAIXE && etapa <= ETAPA_ULTIMA_PREVISTA)) return;
    if (etapa <= 13 && !card.pcpCompleto) return;
    if (!card.os) {
      mantidos.push(card.dealId);
      return;
    }
    cards.push(card);
  });
  return { cards: cards, dealsMantidos: mantidos };
}

// Linha da PRODUCAO de uma OS prevista: em_costura NAO, prevista SIM e as datas
// da projeção (vazias para OS sem peças).
function linhaPrevista(card, medias, hojeISO, sincronizadoEm) {
  var linha = linhaProducao(card, sincronizadoEm);
  var semOficina = !texto(card.oficinaId) || semAcento(card.oficina) === 'ALOCAR';
  var projecao = projetarOs({
    etapa: card.etapaOrdem, dtInicio: card.etapaInicio, pecas: card.pecasPrevisao,
    oficinaId: semOficina ? '' : texto(card.oficinaId)
  }, medias, hojeISO);
  linha.pecas = card.pecasPrevisao > 0 ? card.pecasPrevisao : '';
  linha.em_costura = 'NAO';
  linha.etapa_ordem = card.etapaOrdem;
  linha.etapa_nome = texto(card.etapaNome);
  linha.etapa_inicio = texto(card.etapaInicio);
  linha.prevista = 'SIM';
  linha.inicio_costura_previsto = projecao ? projecao.inicioCostura : '';
  linha.fim_costura_previsto = projecao ? projecao.fimCostura : '';
  return linha;
}
```

Troque

```js
// as paginas do Ploomes sem erro (qualquer pagina invalida cancela o sync).
function montarSincronizacaoProducao(cards, producaoAtual, oficinasAtuais, sincronizadoEm, dealsMantidos) {
```

por

```js
// as paginas do Ploomes sem erro (qualquer pagina invalida cancela o sync).
// previstas (19/10): linhas prontas (linhaPrevista) das OS nas etapas 12 a 16.
function montarSincronizacaoProducao(cards, producaoAtual, oficinasAtuais, sincronizadoEm, dealsMantidos, previstas) {
```

Troque

```js
  var operacoes = [];
  ordemDeals.forEach(function (dealId) {
    operacoes.push({ aba: 'PRODUCAO', operacao: 'appendOrUpdate', chave: 'deal_id', linha: linhaProducao(porDeal[dealId], sincronizadoEm) });
  });
  var encerrados = Object.create(null);
  (producaoAtual || []).forEach(function (linha) {
    var dealId = texto(linha && linha.deal_id);
    if (!dealId || porDeal[dealId] || mantidos[dealId] || encerrados[dealId] || !VALORES_ATIVO_PRODUCAO[semAcento(linha.em_costura)]) return;
    encerrados[dealId] = 1;
    operacoes.push({
      aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id',
      linha: { deal_id: dealId, em_costura: 'NAO', sincronizado_em: texto(sincronizadoEm) }
    });
  });
```

por

```js
  var previstasPorDeal = Object.create(null);
  var ordemPrevistas = [];
  (previstas || []).forEach(function (linha) {
    var dealId = texto(linha && linha.deal_id);
    if (!dealId || porDeal[dealId]) return;
    if (!previstasPorDeal[dealId]) ordemPrevistas.push(dealId);
    previstasPorDeal[dealId] = linha;
  });

  var operacoes = [];
  ordemDeals.forEach(function (dealId) {
    operacoes.push({ aba: 'PRODUCAO', operacao: 'appendOrUpdate', chave: 'deal_id', linha: linhaProducao(porDeal[dealId], sincronizadoEm) });
  });
  ordemPrevistas.forEach(function (dealId) {
    operacoes.push({ aba: 'PRODUCAO', operacao: 'appendOrUpdate', chave: 'deal_id', linha: previstasPorDeal[dealId] });
  });
  // Saiu da Costura e das etapas 12 a 16 (ou perdeu o "PCP completo"): NAO nas duas colunas.
  var encerrados = Object.create(null);
  (producaoAtual || []).forEach(function (linha) {
    var dealId = texto(linha && linha.deal_id);
    var ativa = VALORES_ATIVO_PRODUCAO[semAcento(linha && linha.em_costura)] || VALORES_ATIVO_PRODUCAO[semAcento(linha && linha.prevista)];
    if (!dealId || porDeal[dealId] || previstasPorDeal[dealId] || mantidos[dealId] || encerrados[dealId] || !ativa) return;
    encerrados[dealId] = 1;
    operacoes.push({
      aba: 'PRODUCAO', operacao: 'update', chave: 'deal_id',
      linha: { deal_id: dealId, em_costura: 'NAO', prevista: 'NAO', sincronizado_em: texto(sincronizadoEm) }
    });
  });
```

Troque

```js
  var oficinasVistas = Object.create(null);
  ordemDeals.forEach(function (dealId) {
    var card = porDeal[dealId];
    var id = texto(card && card.oficinaId);
    var nome = texto(card && card.oficina);
    if (!id || !nome || oficinasVistas[id]) return;
```

por

```js
  var oficinasVistas = Object.create(null);
  var origens = ordemDeals.map(function (dealId) {
    return { id: texto(porDeal[dealId].oficinaId), nome: texto(porDeal[dealId].oficina) };
  }).concat(ordemPrevistas.map(function (dealId) {
    return { id: texto(previstasPorDeal[dealId].oficina_id), nome: texto(previstasPorDeal[dealId].oficina_nome) };
  }));
  origens.forEach(function (origem) {
    var id = origem.id;
    var nome = origem.nome;
    if (!id || !nome || oficinasVistas[id]) return;
```


Na mesma função `montarSincronizacaoProducao`, o laço das oficinas termina igual (`oficinasVistas[id] = 1; var linha = …; operacoes.push(…)`), agora dentro de `origens.forEach(function (origem) { … });` — confira que o fechamento `});` do antigo `ordemDeals.forEach` passou a fechar o `origens.forEach`.

- [ ] **Passo 5: Adaptador**

Substitua todo o conteúdo de `n8n/adaptadores/sincronizar-producao.js` por:

```js
// ===== adaptador: Montar Sincronizacao de Producao =====
// Consolida as paginas do Ploomes (Costura e, desde 19/10, as OS previstas das
// etapas 12 a 16), normaliza OtherProperties, projeta a Costura das previstas com
// as medias da PREVISAO_MEDIAS e transforma tudo em requisicoes idempotentes
// para PRODUCAO e OFICINAS.
var planilha = planilhaDoLote($('Ler Snapshot Produção').first().json, LEITURAS_SYNC_PRODUCAO);
function dealsDasPaginas(itens) {
  var deals = [];
  itens.forEach(function (item, indice) {
    var resposta = item && item.json ? item.json : {};
    if (resposta.statusCode === undefined && resposta.body === undefined && Array.isArray(resposta.value)) {
      resposta = { statusCode: 200, body: resposta };
    }
    var pagina = avaliarPaginaProducao(resposta, indice + 1, 100);
    if (!pagina.ok) throw new Error(pagina.erro);
    deals = deals.concat(pagina.itens);
  });
  return deals;
}
var deals = dealsDasPaginas($('Buscar Produção no Ploomes').all());
var dealsPrevistos = dealsDasPaginas($input.all());
// Todas as paginas lidas sem erro: so agora a ausencia de um card encerra a OS.
var separados = separarCardsSincronizacao(deals);
var agora = new Date().toISOString();
var idsCostura = separados.cards.map(function (c) { return c.dealId; }).concat(separados.dealsMantidos);
var previstos = separarPrevistas(dealsPrevistos, idsCostura);
var medias = tabelaMedias(planilha.linhas.PREVISAO_MEDIAS);
var hoje = hojeSaoPaulo(Date.parse(agora));
var linhasPrevistas = previstos.cards.map(function (card) { return linhaPrevista(card, medias, hoje, agora); });
var resultado = montarSincronizacaoProducao(separados.cards, planilha.linhas.PRODUCAO, planilha.linhas.OFICINAS, agora,
  separados.dealsMantidos.concat(previstos.dealsMantidos), linhasPrevistas);
var reqs = requisicoesDeEscrita(resultado.operacoes, [], planilha, PLANILHA_ID);
// Avisos de card pulado vao para ERROS_APP (append, sem retry), so com o deal_id.
separados.avisos.forEach(function (aviso) {
  var linhaAviso = linhaErroApp({
    agora: Date.parse(agora), sessao: { nome: 'sistema' },
    corpo: { tipo: 'sincronizar_producao', dealId: aviso.dealId }, erro: aviso.erro
  });
  reqs.push(requisicaoErroApp(linhaAviso, PLANILHA_ID));
});
if (!reqs.length) return [{ json: { vazio: true } }];
return reqs.map(function (r, i) {
  return { json: { vazio: false, passo: i + 1, de: reqs.length, method: r.method, url: r.url, body: r.body, repetir: r.repetir === true } };
});
```

(A antiga declaração local `var LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS'];` sai: valeria por cima da de `planilhaLote.js`.)

- [ ] **Passo 6: Gerador**

Em `n8n/scripts/gerar-workflow-sdk.js`:

1. Troque as posições do sync:

```js
[['A cada 5 minutos', 0, 0], ['Ler Snapshot Produção', 1, 0], ['Buscar Produção no Ploomes', 2, 0],
  ['Montar Sincronização', 3, 0], ['Tem Escritas?', 4, 0], ['Loop Escritas Produção', 5, 0],
  ['Repetir Escrita?', 6, 0], ['Gravar Produção', 7, -100], ['Anexar Produção', 7, 100],
  ['Montar Erro Produção', 6, 260], ['Registrar Erro Produção', 7, 260]]
```

por

```js
[['A cada 5 minutos', 0, 0], ['Ler Snapshot Produção', 1, 0], ['Buscar Produção no Ploomes', 2, 0],
  ['Buscar Previstas no Ploomes', 3, 0], ['Montar Sincronização', 4, 0], ['Tem Escritas?', 5, 0],
  ['Loop Escritas Produção', 6, 0], ['Repetir Escrita?', 7, 0], ['Gravar Produção', 8, -100], ['Anexar Produção', 8, 100],
  ['Montar Erro Produção', 7, 260], ['Registrar Erro Produção', 8, 260]]
```

2. Logo depois da constante `URL_COSTURA` (Tarefa 3), acrescente:

```js
// Etapas 12 a 16 (previstas): OS em aberto dos funis PCP e Produção. A etapa sai do
// nome do estágio ("12. Encaixe"); o filtro 12–16 fica no Code node (separarPrevistas).
const URL_PREVISTAS = PLOOMES + 'Deals?$filter=' + FUNIS_PREVISAO + '%20and%20StatusId%20eq%201&$expand=OtherProperties,Stage($select=Id,Name)&$select=Id,Title,ContactName,LastUpdateDate,StageId&$orderby=Id&$top=100';
```

3. Troque

```js
const LEITURAS_SYNC_PRODUCAO = ['PRODUCAO', 'OFICINAS'];
const urlSnapshotProducao = lote.urlLeitura(DOC, LEITURAS_SYNC_PRODUCAO);
```

por

```js
const urlSnapshotProducao = lote.urlLeitura(DOC, lote.LEITURAS_SYNC_PRODUCAO);
```

4. Troque

```js
  buscarPloomes('buscarProducao', 'Buscar Produção no Ploomes', URL_COSTURA),
```

por

```js
  buscarPloomes('buscarProducao', 'Buscar Produção no Ploomes', URL_COSTURA),
  buscarPloomes('buscarPrevistas', 'Buscar Previstas no Ploomes', URL_PREVISTAS, unico),
```

5. Nas ligações do `syncProducao`, troque

```js
    .to(buscarProducao
      .onError(montarErroProducao.to(registrarErroProducao))
      .to(montarSyncProducao)
```

por

```js
    .to(buscarProducao
      .onError(montarErroProducao.to(registrarErroProducao))
      .to(buscarPrevistas
        .onError(montarErroProducao.to(registrarErroProducao))
        .to(montarSyncProducao)
```

e acrescente um `)` no fechamento final da cadeia: a linha

```js
              .to(nextBatch(loopEscritasProducao))))))));
```

passa a ser

```js
              .to(nextBatch(loopEscritasProducao)))))))));
```

- [ ] **Passo 7: Build, rodar e ver passar**

Run: `cd n8n && npm run build && npm test`
Expected: `workflows/json/pcp-producao-sync.json: 12 nodes`; todos os testes passam.

- [ ] **Passo 8: Commit**

```bash
git add n8n/src/planilhaLote.js n8n/src/producao.js n8n/adaptadores/sincronizar-producao.js n8n/scripts/gerar-workflow-sdk.js n8n/test/producao.test.js n8n/test/workflow-producao-sync.test.js n8n/build n8n/workflows
git commit -m "feat: sync da produção lê as etapas 12 a 16 e grava a Costura prevista

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Capacidade da oficina no servidor (só ADM)

**Files:**
- Modify: `n8n/src/producao.js` (`oficinasProducaoBoard`, ação de capacidade)
- Modify: `n8n/src/api.js` (`preValidarAcao`, `processarAcao`, `processarAcaoCapacidade`)
- Modify: `n8n/src/planilhaLote.js` (destino `OFICINAS update`)
- Test: `n8n/test/capacidade-oficina.test.js` (novo), `n8n/test/board-producao.test.js`
- Gerados: `n8n/build/*.js`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json`

**Interfaces:**
- Consumes: de `producao.js`: `linhaAtivaProducao`, `numeroOuNulo`; de `acoes.js`: `erroAcao`; de `api.js`: `sessaoDoCabecalho`, `respostaDeAcao`.
- Produces:
  - Coluna nova no fim da `OFICINAS`: `capacidade_semana` (depois de `atualizado_em`).
  - Board: cada oficina ganha `capacidadeSemana: number|null`.
  - `TIPO_CAPACIDADE_OFICINA = 'alterar_capacidade_oficina'`, `ERRO_CAPACIDADE_SO_ADM`, `MAX_CAPACIDADE_OFICINA = 1000000`.
  - `validarCapacidadeOficina(corpo): { ok: true, acao: { oficinaId, capacidade: number|'' } } | erro`.
  - `processarCapacidadeOficina(corpo, linhas, ctx: { agora }): { ok, versao, ploomes: null, historicos: [], operacoes: [{ aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id', linha: { ploomes_id, capacidade_semana, atualizado_em } }] }`.
  - Corpo da ação (POST `/pcp-acao`): `{ tipo: 'alterar_capacidade_oficina', oficinaId: string, capacidade: number | null }`. Resposta 200 `{ ok: true, versao, historico: null }`; 400 (número inválido/sem oficina), 401, 403 (não ADM), 404 (oficina inexistente ou inativa).
  - Destino novo `{ aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id' }`.

- [ ] **Passo 1: Escrever os testes que falham**

Crie `n8n/test/capacidade-oficina.test.js`:

```js
// Ação alterar_capacidade_oficina (19/10): só ADM, só a aba OFICINAS.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { carregar, limpo } = require('./carregar');

const T0 = Date.parse('2026-10-19T14:00:00.000Z');
function contexto(perfil) {
  const ctx = carregar({ real: true });  // DEALS_PRODUCAO_EDITAVEIS = ['0']: capacidade não depende dela
  const estado = {};
  const usuario = [{ email: 'pcp@teste.local', nome: 'Pessoa PCP', perfil, senha_hash: ctx.gerarHash(crypto, 'senha-ficticia-forte'), ativo: 'SIM' }];
  const login = ctx.processarLogin(crypto, estado, { email: 'pcp@teste.local', senha: 'senha-ficticia-forte' }, usuario, T0);
  return { ctx, estado, cab: 'Bearer ' + login.body.token };
}
const linhas = () => ({ oficinas: [
  { ploomes_id: 'of-1', nome: 'OFICINA A', ativo: 'SIM', capacidade_semana: '' },
  { ploomes_id: 'of-2', nome: 'OFICINA INATIVA', ativo: 'NAO', capacidade_semana: 100 }
] });

test('ADM grava a capacidade da oficina só na OFICINAS, sem Ploomes nem histórico', () => {
  const { ctx, estado, cab } = contexto('ADM');
  const corpo = { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 };
  assert.deepEqual(limpo(ctx.preValidarAcao(estado, cab, corpo, T0)), { ok: true });
  const r = limpo(ctx.processarAcao(estado, cab, corpo, linhas(), T0, () => 'X'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.operacoes, [{ aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id',
    linha: { ploomes_id: 'of-1', capacidade_semana: 600, atualizado_em: '2026-10-19T14:00:00.000Z' } }]);
  assert.deepEqual(r.historicos, []);
  assert.equal(r.ploomes, null);
  assert.equal(r.interpretar, null);
  assert.equal(r.body.versao, '2026-10-19T14:00:00.000Z');
});

test('capacidade vazia (null ou "") limpa o valor: sem capacidade, sem cor de alerta', () => {
  const { ctx, estado, cab } = contexto('ADM');
  for (const capacidade of [null, '']) {
    const r = limpo(ctx.processarAcao(estado, cab, { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade }, linhas(), T0, () => 'X'));
    assert.equal(r.status, 200);
    assert.equal(r.operacoes[0].linha.capacidade_semana, '');
  }
});

test('capacidade recusa não ADM, número inválido, oficina inexistente ou inativa', () => {
  const adm = contexto('ADM');
  const op = contexto('PCP');
  const corpo = { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 };
  assert.equal(op.ctx.preValidarAcao(op.estado, op.cab, corpo, T0).status, 403);
  assert.equal(op.ctx.processarAcao(op.estado, op.cab, corpo, linhas(), T0, () => 'X').status, 403);
  assert.equal(adm.ctx.preValidarAcao(adm.estado, 'Bearer ' + 'a'.repeat(64), corpo, T0).status, 401);
  for (const capacidade of [-1, 1.5, 'dez', '12a', 2000000]) {
    const r = adm.ctx.preValidarAcao(adm.estado, adm.cab, { ...corpo, capacidade }, T0);
    assert.equal(r.status, 400, String(capacidade));
    assert.match(r.body.erro, /número inteiro/);
  }
  assert.equal(adm.ctx.preValidarAcao(adm.estado, adm.cab, { ...corpo, oficinaId: '' }, T0).status, 400);
  assert.equal(adm.ctx.processarAcao(adm.estado, adm.cab, { ...corpo, oficinaId: 'of-9' }, linhas(), T0, () => 'X').status, 404);
  assert.equal(adm.ctx.processarAcao(adm.estado, adm.cab, { ...corpo, oficinaId: 'of-2' }, linhas(), T0, () => 'X').status, 404);
  assert.equal(adm.ctx.processarAcao(adm.estado, adm.cab, { ...corpo, capacidade: '450' }, linhas(), T0, () => 'X').status, 200);
});

test('gravação da capacidade exige a coluna capacidade_semana na OFICINAS', () => {
  const { ctx, estado, cab } = contexto('ADM');
  const r = ctx.processarAcao(estado, cab, { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 }, linhas(), T0, () => 'X');
  const planilha = (cab2) => ctx.planilhaDoLote({ valueRanges: [{ range: "'OFICINAS'!A1:Z9", values: [cab2, ['of-1', 'OFICINA A', '', '', 'SIM', 'T0', '']] }] }, ['OFICINAS']);
  assert.throws(() => ctx.requisicoesDeEscrita(r.operacoes, [], planilha(['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em']), 'DOC'),
    /Cabeçalho obrigatório ausente: OFICINAS\.capacidade_semana/);
  const reqs = limpo(ctx.requisicoesDeEscrita(r.operacoes, [], planilha(['ploomes_id', 'nome', 'grupo_jid', 'grupo_nome', 'ativo', 'atualizado_em', 'capacidade_semana']), 'DOC'));
  assert.deepEqual(reqs[0].body.data, [{ range: "'OFICINAS'!F2:G2", values: [['2026-10-19T14:00:00.000Z', 600]] }]);
});

test('board devolve a capacidade das oficinas (null quando vazia)', () => {
  const ctx = carregar();
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, { oficinas: [
    { ploomes_id: 'of-1', nome: 'OFICINA A', ativo: 'SIM', capacidade_semana: 600 },
    { ploomes_id: 'of-3', nome: 'OFICINA B', ativo: 'SIM', capacidade_semana: '' }
  ] })).body;
  assert.deepEqual(r.oficinas.map((o) => [o.nome, o.capacidadeSemana]), [['OFICINA A', 600], ['OFICINA B', null]]);
});
```

Em `n8n/test/board-producao.test.js`, no teste `board lista oficinas ativas e informa grupo configurado sem expor JIDs ou IDs da Evolution`, troque:

Troque

```js
    { ploomesId: 'of-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO MODELO' },
    { ploomesId: 'of-3', nome: 'OFICINA SEM GRUPO', grupoConfigurado: false, grupoNome: '' }
```

por

```js
    { ploomesId: 'of-1', nome: 'OFICINA MODELO', grupoConfigurado: true, grupoNome: 'GRUPO MODELO', capacidadeSemana: null },
    { ploomesId: 'of-3', nome: 'OFICINA SEM GRUPO', grupoConfigurado: false, grupoNome: '', capacidadeSemana: null }
```


- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd n8n && node --test test/capacidade-oficina.test.js test/board-producao.test.js`
Expected: FAIL (ação desconhecida responde 400/403 da validação de pedido; `capacidadeSemana` ausente no board).

- [ ] **Passo 3: Implementar em `n8n/src/producao.js`**

Troque

```js
function oficinasProducaoBoard(oficinas) {
  return (oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) && texto(o.nome) && linhaAtivaProducao(o.ativo);
  }).map(function (o) {
    return {
      ploomesId: texto(o.ploomes_id),
      nome: texto(o.nome),
      grupoConfigurado: texto(o.grupo_jid) !== '',
      grupoNome: texto(o.grupo_nome)
    };
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
}
```

por

```js
function oficinasProducaoBoard(oficinas) {
  return (oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) && texto(o.nome) && linhaAtivaProducao(o.ativo);
  }).map(function (o) {
    return {
      ploomesId: texto(o.ploomes_id),
      nome: texto(o.nome),
      grupoConfigurado: texto(o.grupo_jid) !== '',
      grupoNome: texto(o.grupo_nome),
      // Carga das oficinas (19/10): peças por semana; vazio = sem capacidade (sem cor de alerta).
      capacidadeSemana: numeroOuNulo(o.capacidade_semana)
    };
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
}

// ---------- capacidade das oficinas (19/10) ----------

var TIPO_CAPACIDADE_OFICINA = 'alterar_capacidade_oficina';
var ERRO_CAPACIDADE_SO_ADM = 'Só administradores podem alterar a capacidade das oficinas.';
var MAX_CAPACIDADE_OFICINA = 1000000;

// capacidade: inteiro >= 0 (peças por semana) ou vazio/null (sem capacidade).
function validarCapacidadeOficina(corpo) {
  corpo = corpo || {};
  var oficinaId = texto(corpo.oficinaId);
  if (!oficinaId) return erroAcao(400, 'Informe a oficina.');
  var v = corpo.capacidade;
  if (v === null || v === undefined || texto(v) === '') return { ok: true, acao: { oficinaId: oficinaId, capacidade: '' } };
  var n = typeof v === 'number' ? v : /^\d+$/.test(texto(v)) ? Number(texto(v)) : NaN;
  if (!isFinite(n) || n < 0 || Math.floor(n) !== n || n > MAX_CAPACIDADE_OFICINA) {
    return erroAcao(400, 'Informe a capacidade em peças por semana: número inteiro, 0 ou mais.');
  }
  return { ok: true, acao: { oficinaId: oficinaId, capacidade: n } };
}

// Só planilha (OFICINAS.capacidade_semana): não vai ao Ploomes nem ao HISTORICO_APP,
// que é por OS. Não depende de DEALS_PRODUCAO_EDITAVEIS: não é card.
function processarCapacidadeOficina(corpo, linhas, ctx) {
  var v = validarCapacidadeOficina(corpo);
  if (!v.ok) return v;
  var oficina = (linhas.oficinas || []).filter(function (o) {
    return o && texto(o.ploomes_id) === v.acao.oficinaId && linhaAtivaProducao(o.ativo);
  })[0];
  if (!oficina) return erroAcao(404, 'Oficina não encontrada.');
  return {
    ok: true, versao: ctx.agora, ploomes: null, historicos: [],
    operacoes: [{ aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id',
      linha: { ploomes_id: v.acao.oficinaId, capacidade_semana: v.acao.capacidade, atualizado_em: ctx.agora } }]
  };
}
```


- [ ] **Passo 4: Implementar em `n8n/src/api.js`**

Troque

```js
function preValidarAcao(estado, cabecalho, corpo, agora) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
```

por

```js
function preValidarAcao(estado, cabecalho, corpo, agora) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (corpo && corpo.tipo === TIPO_CAPACIDADE_OFICINA) {
    if (!sessao) return { ok: false, status: 401, body: { erro: 'Sessão expirada.' } };
    if (sessao.perfil !== 'ADM') return { ok: false, status: 403, body: { erro: ERRO_CAPACIDADE_SO_ADM } };
    var vCap = validarCapacidadeOficina(corpo);
    return vCap.ok ? { ok: true } : { ok: false, status: vCap.status, body: { erro: vCap.erro } };
  }
```

Troque

```js
// POST /pcp-acao. "linhas" = { faltantes, caixasPcp, ganhas?, pedidos?,
```

por

```js
// Capacidade da oficina (19/10): só ADM; grava só a OFICINAS.
function processarAcaoCapacidade(estado, sessao, corpo, linhas, agora) {
  if (sessao.perfil !== 'ADM') return { status: 403, body: { erro: ERRO_CAPACIDADE_SO_ADM } };
  var r = processarCapacidadeOficina(corpo, linhas || {}, { agora: new Date(agora).toISOString() });
  if (!r.ok) return { status: r.status, body: { erro: r.erro } };
  var saida = respostaDeAcao(estado, r.versao, r.operacoes, r.historicos);
  saida.ploomes = null;
  saida.interpretar = null;
  saida.gravacao = null;
  saida.historico = null;
  return saida;
}

// POST /pcp-acao. "linhas" = { faltantes, caixasPcp, ganhas?, pedidos?,
```

Troque

```js
function processarAcao(estado, cabecalho, corpo, linhas, agora, gerarId) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
```

por

```js
function processarAcao(estado, cabecalho, corpo, linhas, agora, gerarId) {
  var sessao = sessaoDoCabecalho(estado, cabecalho, agora);
  if (sessao && corpo && corpo.tipo === TIPO_CAPACIDADE_OFICINA) {
    return processarAcaoCapacidade(estado, sessao, corpo, linhas, agora);
  }
```


- [ ] **Passo 5: Destino de gravação**

Em `n8n/src/planilhaLote.js`, no fim de `DESTINOS_ESCRITA`, antes das duas linhas da `PREVISAO_MEDIAS`, acrescente:

```js
  { aba: 'OFICINAS', operacao: 'update', chave: 'ploomes_id' },  // capacidade_semana (só ADM)
```

- [ ] **Passo 6: Build, rodar e ver passar**

Run: `cd n8n && npm run build && npm test`
Expected: PASS. A ação passa pelo ramo existente do workflow da API sem mudança de nodes: `Montar Alteracao Ploomes` devolve `{ gravar: false }` (sem `ploomes`), `Montar Escritas` gera um `batchUpdate` na `OFICINAS` e `Pedir Interpretação?` fica falso (`interpretar: null`).

- [ ] **Passo 7: Commit**

```bash
git add n8n/src/producao.js n8n/src/api.js n8n/src/planilhaLote.js n8n/test/capacidade-oficina.test.js n8n/test/board-producao.test.js n8n/build n8n/workflows
git commit -m "feat: capacidade semanal das oficinas, editável só por ADM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Capacidade no front (tipos, fila otimista) e no simulador

**Files:**
- Modify: `web/src/api/tipos.ts` (`OficinaProducao`, `Acao`)
- Modify: `web/src/regras/acoes.ts` (`mensagemSucesso`, `chaveDaAcao`)
- Modify: `web/src/regras/otimista.ts` (`aplicarOtimista`, `acaoNoBoard`)
- Modify: `web/scripts/mock-api.mjs` (capacidade nas oficinas e ação nova)
- Test: `web/src/regras/acoes.test.ts`, `web/src/regras/otimista.test.ts`

**Interfaces:**
- Consumes: Tarefa 5 (contrato da ação e `capacidadeSemana` no board).
- Produces:
  - `OficinaProducao.capacidadeSemana?: number | null`.
  - `Acao` ganha `{ tipo: 'alterar_capacidade_oficina'; oficinaId: string; capacidade: number | null }` (sem `versao`, como `salvar_etapas`).
  - `chaveDaAcao` → `oficina:<oficinaId>`; `mensagemSucesso` → `Capacidade da oficina: 1.200 peças por semana` / `Capacidade da oficina removida`.
  - Otimista: aplica `capacidadeSemana` na hora (só oficina que está na lista); confirmada sai quando o board mostra o valor gravado; sem versão (`versaoNoBoard` → `undefined`).
  - Mock: `alterarCapacidade(corpo)` com as mesmas regras do servidor (403 sem ADM via `MOCK_PERFIL`, 400, 404).

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no fim de `web/src/regras/otimista.test.ts`:

```ts
describe('capacidade da oficina (19/10)', () => {
  const oficinas = [{ ploomesId: 'of-1', nome: 'OFICINA A', grupoConfigurado: false, grupoNome: '', capacidadeSemana: null }];
  it('aplica na hora e null limpa; oficina fora da lista não muda nada', () => {
    let b = aplicar(quadro({ oficinas }), { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 });
    expect(b.oficinas?.[0].capacidadeSemana).toBe(600);
    b = aplicar(b, { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: null });
    expect(b.oficinas?.[0].capacidadeSemana).toBeNull();
    const sem = quadro({ oficinas });
    expect(aplicar(sem, { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-9', capacidade: 10 })).toBe(sem);
  });
  it('confirmada sai quando o board mostra a capacidade gravada; não tem versão', () => {
    const acao: Acao = { tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 600 };
    const p = pend(1, acao, { estado: 'confirmada', confirmadaEm: 1, versaoNova: 't' });
    expect(pendentesVivos([p], quadro({ oficinas }), 5)).toEqual([p]);
    expect(pendentesVivos([p], quadro({ oficinas: [{ ...oficinas[0], capacidadeSemana: 600 }] }), 5)).toEqual([]);
    expect(versaoNoBoard(quadro({ oficinas }), acao)).toBeUndefined();
  });
});
```

Acrescente no fim de `web/src/regras/acoes.test.ts` (`chaveDaAcao` e `mensagemSucesso` já são importados no topo):

```ts
describe('capacidade da oficina (19/10)', () => {
  it('mensagem de sucesso e alvo próprio na fila', () => {
    expect(mensagemSucesso({ tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 1200 })).toBe('Capacidade da oficina: 1.200 peças por semana');
    expect(mensagemSucesso({ tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: null })).toBe('Capacidade da oficina removida');
    expect(chaveDaAcao({ tipo: 'alterar_capacidade_oficina', oficinaId: 'of-1', capacidade: 1 })).toBe('oficina:of-1');
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/regras/otimista.test.ts src/regras/acoes.test.ts`
Expected: FAIL (capacidade não muda no board; mensagem `undefined`; chave `caixa:undefined`). `npx tsc -b` também acusa o tipo de ação desconhecido.

- [ ] **Passo 3: Tipos**

Em `web/src/api/tipos.ts`:

Troque

```ts
export interface OficinaProducao {
  ploomesId: string;
  nome: string;
  grupoConfigurado: boolean;
  grupoNome: string;
}
```

por

```ts
export interface OficinaProducao {
  ploomesId: string;
  nome: string;
  grupoConfigurado: boolean;
  grupoNome: string;
  capacidadeSemana?: number | null; // peças por semana (aba OFICINAS); null/ausente = sem capacidade
}
```

Troque

```ts
  | { tipo: 'salvar_etapas'; etapas: { id?: string; nome: string }[] };
```

por

```ts
  | { tipo: 'salvar_etapas'; etapas: { id?: string; nome: string }[] }
  // Só ADM. capacidade null = sem capacidade (a carga aparece sem cor de alerta).
  | { tipo: 'alterar_capacidade_oficina'; oficinaId: string; capacidade: number | null };
```


- [ ] **Passo 4: Mensagem e alvo da fila**

Em `web/src/regras/acoes.ts`:

Troque

```ts
    case 'salvar_etapas':
      return 'Etapas do quadro salvas';
  }
}
```

por

```ts
    case 'salvar_etapas':
      return 'Etapas do quadro salvas';
    case 'alterar_capacidade_oficina':
      return acao.capacidade === null ? 'Capacidade da oficina removida' : `Capacidade da oficina: ${acao.capacidade.toLocaleString('pt-BR')} peças por semana`;
  }
}
```

Troque

```ts
  if (acao.tipo === 'salvar_etapas') return 'etapas';
```

por

```ts
  if (acao.tipo === 'salvar_etapas') return 'etapas';
  if (acao.tipo === 'alterar_capacidade_oficina') return `oficina:${acao.oficinaId}`;
```


- [ ] **Passo 5: Efeito otimista e confirmação**

Em `web/src/regras/otimista.ts` (o primeiro bloco fica no primeiro `switch` de `aplicarOtimista`, antes de `case 'gerar_pedido'`; o segundo no `switch` de `acaoNoBoard`):

Troque

```ts
    case 'salvar_etapas':
      return {
        ...board,
        etapasPedido: acao.etapas.map((e, k) => ({ id: e.id ?? `${PREFIXO_NOVO}${ctx.n}.${k}`, nome: e.nome.trim(), ordem: k + 1 }))
      };
```

por

```ts
    case 'salvar_etapas':
      return {
        ...board,
        etapasPedido: acao.etapas.map((e, k) => ({ id: e.id ?? `${PREFIXO_NOVO}${ctx.n}.${k}`, nome: e.nome.trim(), ordem: k + 1 }))
      };
    case 'alterar_capacidade_oficina':
      // Como o servidor: só oficina que está na lista; null limpa a capacidade.
      if (!board.oficinas?.some((o) => o.ploomesId === acao.oficinaId)) return board;
      return { ...board, oficinas: board.oficinas.map((o) => (o.ploomesId === acao.oficinaId ? { ...o, capacidadeSemana: acao.capacidade } : o)) };
```

Troque

```ts
    case 'salvar_etapas': {
      const atuais = etapasOrdenadas(board.etapasPedido ?? []).map((e) => e.nome.trim());
```

por

```ts
    case 'alterar_capacidade_oficina':
      return (board.oficinas?.find((o) => o.ploomesId === a.oficinaId)?.capacidadeSemana ?? null) === a.capacidade;
    case 'salvar_etapas': {
      const atuais = etapasOrdenadas(board.etapasPedido ?? []).map((e) => e.nome.trim());
```


- [ ] **Passo 6: Simulador**

Em `web/scripts/mock-api.mjs`:

Troque

```js
  oficinas: [
    { ploomesId: 'OF-01', nome: 'OFICINA SOL', grupoConfigurado: true, grupoNome: 'PRODUCAO · OFICINA SOL' },
    { ploomesId: 'OF-02', nome: 'OFICINA LUA', grupoConfigurado: false, grupoNome: '' }
  ],
```

por

```js
  oficinas: [
    { ploomesId: 'OF-01', nome: 'OFICINA SOL', grupoConfigurado: true, grupoNome: 'PRODUCAO · OFICINA SOL', capacidadeSemana: 300 },
    { ploomesId: 'OF-02', nome: 'OFICINA LUA', grupoConfigurado: false, grupoNome: '', capacidadeSemana: null }
  ],
```

Troque

```js
function decidirSugestao(c, usuario, aceitar) {
```

por

```js
// Capacidade da oficina (19/10): as mesmas regras de validarCapacidadeOficina (n8n/src/producao.js).
function alterarCapacidade(c) {
  if (PERFIL !== 'ADM') throw new Erro(403, 'Só administradores podem alterar a capacidade das oficinas.');
  if (!String(c.oficinaId ?? '').trim()) throw bad('Informe a oficina.');
  const v = c.capacidade;
  const vazio = v === null || v === undefined || String(v).trim() === '';
  const n = vazio ? null : typeof v === 'number' ? v : /^\d+$/.test(String(v).trim()) ? Number(v) : NaN;
  if (!vazio && (!Number.isInteger(n) || n < 0 || n > 1_000_000)) throw bad('Informe a capacidade em peças por semana: número inteiro, 0 ou mais.');
  const oficina = estado.oficinas.find((o) => o.ploomesId === c.oficinaId);
  if (!oficina) throw new Erro(404, 'Oficina não encontrada.');
  oficina.capacidadeSemana = n;
  return { ok: true, versao: agoraIso(), historico: null, historicos: [] };
}

function decidirSugestao(c, usuario, aceitar) {
```

Troque

```js
    case 'salvar_etapas':
      if (PERFIL !== 'ADM') throw new Erro(403, 'Só administradores podem alterar as etapas do quadro.');
```

por

```js
    case 'alterar_capacidade_oficina': return alterarCapacidade(corpo);
    case 'salvar_etapas':
      if (PERFIL !== 'ADM') throw new Erro(403, 'Só administradores podem alterar as etapas do quadro.');
```


- [ ] **Passo 7: Rodar e ver passar**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS (3 testes novos), sem erro de tipo.

- [ ] **Passo 8: Commit**

```bash
git add web/src/api/tipos.ts web/src/regras/acoes.ts web/src/regras/otimista.ts web/src/regras/acoes.test.ts web/src/regras/otimista.test.ts web/scripts/mock-api.mjs
git commit -m "feat: capacidade da oficina na fila otimista e no simulador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Board com as OS previstas e o aviso de previsão sem histórico

**Files:**
- Modify: `n8n/src/producao.js` (`producoesBoard`, `linhaEhPrevista`)
- Modify: `n8n/src/api.js` (`montarRespostaBoard`)
- Modify: `n8n/src/planilhaLote.js` (`LEITURAS_BOARD`)
- Modify: `n8n/adaptadores/montar-board.js`
- Modify: `web/src/api/tipos.ts` (`Producao`, `Board`)
- Test: `n8n/test/board-producao.test.js`, `n8n/test/planilha-lote.test.js`, `n8n/test/workflow-acao.test.js`, `n8n/test/auth-api.test.js`
- Gerados: `n8n/build/*.js`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json` (a URL de leitura do board muda nas duas APIs)

**Interfaces:**
- Consumes: Tarefa 4 (colunas `prevista`, `etapa_*`, `*_previsto` da `PRODUCAO`), Tarefa 1 (`tabelaMedias`, `temMedias`).
- Produces:
  - `LEITURAS_BOARD` termina em `'PREVISAO_MEDIAS'`; `montar-board.js` passa `extras.previsaoMedias`.
  - `linhaEhPrevista(l): boolean` (`em_costura` não ativo e `prevista` = SIM).
  - Board: `producao[]` inclui as previstas com os campos extras `prevista: true`, `etapaOrdem: number|null`, `etapaNome`, `etapaInicio`, `inicioCosturaPrevisto`, `fimCosturaPrevisto`; OS na Costura sem esses campos (contrato antigo intacto). `previsaoSemHistorico: boolean` no corpo.
  - Tipos do site: `Producao.prevista?`, `etapaOrdem?`, `etapaNome?`, `etapaInicio?`, `inicioCosturaPrevisto?`, `fimCosturaPrevisto?`; `Board.previsaoSemHistorico?`.

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no fim de `n8n/test/board-producao.test.js`:

```js
test('board inclui as OS previstas (etapas 12 a 16) com etapa e Costura projetada', () => {
  const e = extras();
  e.producao.push({
    deal_id: '710015', os: '10015', oficina_id: 'of-1', oficina_nome: 'OFICINA MODELO', pecas: 80,
    cliente: 'CLIENTE FICTICIO', peca: 'PEÇA PREVISTA', referencia: 'REF-P', em_costura: 'NAO', atualizado_em_ploomes: 'v9',
    etapa_ordem: 15, etapa_nome: '15. Preparação 1', etapa_inicio: '2026-10-15', prevista: 'SIM',
    inicio_costura_previsto: '2026-10-21', fim_costura_previsto: '2026-10-27'
  }, { deal_id: '710016', os: '10016', em_costura: 'NAO', prevista: 'NAO', atualizado_em_ploomes: 'v9' });
  const r = limpo(ctx.montarRespostaBoard({}, [], [], T0, e)).body;
  assert.deepEqual(r.producao.map((p) => p.dealId), ['700001', '710015']);
  const prevista = r.producao.find((p) => p.dealId === '710015');
  assert.deepEqual({
    prevista: prevista.prevista, etapaOrdem: prevista.etapaOrdem, etapaNome: prevista.etapaNome, etapaInicio: prevista.etapaInicio,
    inicioCosturaPrevisto: prevista.inicioCosturaPrevisto, fimCosturaPrevisto: prevista.fimCosturaPrevisto, pecas: prevista.pecas
  }, {
    prevista: true, etapaOrdem: 15, etapaNome: '15. Preparação 1', etapaInicio: '2026-10-15',
    inicioCosturaPrevisto: '2026-10-21', fimCosturaPrevisto: '2026-10-27', pecas: 80
  });
  // A OS na Costura continua sem os campos da previsão (contrato antigo intacto).
  assert.equal('prevista' in r.producao.find((p) => p.dealId === '700001'), false);
});

test('board avisa "previsão sem histórico" enquanto a PREVISAO_MEDIAS não tem valores', () => {
  assert.equal(limpo(ctx.montarRespostaBoard({}, [], [], T0, extras())).body.previsaoSemHistorico, true);
  const e = extras();
  e.previsaoMedias = [{ tipo: 'DURACAO_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: '', amostra: 0 }];
  assert.equal(limpo(ctx.montarRespostaBoard({}, [], [], T0, e)).body.previsaoSemHistorico, true);
  e.previsaoMedias.push({ tipo: 'FILA_GERAL', etapa: 17, faixa: '', oficina_id: '', valor: 2, amostra: 9 });
  assert.equal(limpo(ctx.montarRespostaBoard({}, [], [], T0, e)).body.previsaoSemHistorico, false);
});
```

Em `n8n/test/planilha-lote.test.js`, no teste `leituras do board e da acao`, troque a linha

```js
    'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES']);
```

(a terceira linha do primeiro `assert.deepEqual`, a do `LEITURAS_BOARD`) por

```js
    'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'PREVISAO_MEDIAS']);
```

Em `n8n/test/workflow-acao.test.js`, no teste `Montar Board: monta o board a partir do lote (mesmas linhas do node Sheets)`, troque

```js
      vr('WHATSAPP_MENSAGENS', [['id']]), vr('WHATSAPP_SUGESTOES', [['id']])
    ]
  };
  const [saida] = rodarNode('montar-board', { $: cifrao({ 'Ler Planilha': [leitura] }), $getWorkflowStaticData: () => s.estado });
```

por

```js
      vr('WHATSAPP_MENSAGENS', [['id']]), vr('WHATSAPP_SUGESTOES', [['id']]),
      vr('PREVISAO_MEDIAS', [['tipo', 'etapa', 'faixa', 'oficina_id', 'valor', 'amostra', 'calculado_em', 'chave']])
    ]
  };
  const [saida] = rodarNode('montar-board', { $: cifrao({ 'Ler Planilha': [leitura] }), $getWorkflowStaticData: () => s.estado });
```

e, no fim do mesmo teste, troque

```js
  assert.equal(saida.json.body.caixas[0].itens.length, 2);
});
```

por

```js
  assert.equal(saida.json.body.caixas[0].itens.length, 2);
  assert.equal(saida.json.body.previsaoSemHistorico, true);
});
```

Em `n8n/test/auth-api.test.js`, no teste `board: token valido sem cache pede leitura; com cache novo devolve o cache`, troque

```js
    producao: [], oficinas: [], mensagensWhatsappSemAssociacao: [], dealsProducaoEditaveis: ['0'] });
```

por

```js
    producao: [], oficinas: [], mensagensWhatsappSemAssociacao: [], dealsProducaoEditaveis: ['0'], previsaoSemHistorico: true });
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd n8n && npm test`
Expected: FAIL nos 5 testes tocados (previstas fora do board, `previsaoSemHistorico` ausente, `LEITURAS_BOARD` sem a aba nova, `Leitura em lote: esperava 14 abas, veio 15`).

- [ ] **Passo 3: Implementar**

Em `n8n/src/producao.js`:

Troque

```js
function producoesBoard(extras, caixas) {
  extras = extras || {};
  return ordenarProducoes((extras.producao || []).filter(function (l) {
    return l && VALORES_ATIVO_PRODUCAO[semAcento(l.em_costura)];
  }).map(function (l) {
```

por

```js
// OS prevista (19/10): ainda nas etapas 12 a 16, com a Costura projetada pelo sync.
function linhaEhPrevista(l) {
  return !VALORES_ATIVO_PRODUCAO[semAcento(l && l.em_costura)] && !!VALORES_ATIVO_PRODUCAO[semAcento(l && l.prevista)];
}

function producoesBoard(extras, caixas) {
  extras = extras || {};
  return ordenarProducoes((extras.producao || []).filter(function (l) {
    return l && (VALORES_ATIVO_PRODUCAO[semAcento(l.em_costura)] || linhaEhPrevista(l));
  }).map(function (l) {
```

Troque

```js
    if (p.pecas === null || isNaN(p.pecas)) p.pecas = null;
```

por

```js
    if (p.pecas === null || isNaN(p.pecas)) p.pecas = null;
    if (linhaEhPrevista(l)) {
      p.prevista = true;
      p.etapaOrdem = numeroOuNulo(l.etapa_ordem);
      p.etapaNome = texto(l.etapa_nome);
      p.etapaInicio = texto(l.etapa_inicio);
      p.inicioCosturaPrevisto = texto(l.inicio_costura_previsto);
      p.fimCosturaPrevisto = texto(l.fim_costura_previsto);
    }
```


Em `n8n/src/api.js`, em `montarRespostaBoard`:

Troque

```js
    producao: producao, oficinas: oficinas, mensagensWhatsappSemAssociacao: mensagensWhatsappSemAssociacao,
    dealsProducaoEditaveis: DEALS_PRODUCAO_EDITAVEIS.slice()
  };
```

por

```js
    producao: producao, oficinas: oficinas, mensagensWhatsappSemAssociacao: mensagensWhatsappSemAssociacao,
    dealsProducaoEditaveis: DEALS_PRODUCAO_EDITAVEIS.slice(),
    // A PREVISAO_MEDIAS ainda vazia (o workflow diário não rodou): a tela avisa "Previsão sem histórico".
    previsaoSemHistorico: !temMedias(tabelaMedias(extras.previsaoMedias))
  };
```


Em `n8n/src/planilhaLote.js`, na última linha de `LEITURAS_BOARD` (a que vem logo antes de `var LEITURAS_ACAO = …`), troque

```js
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES'];
```

por

```js
  'PRODUCAO', 'OFICINAS', 'WHATSAPP_MENSAGENS', 'WHATSAPP_SUGESTOES', 'PREVISAO_MEDIAS'];
```

(Atenção: a linha igual em `ORDEM_APPEND` **não** muda.) E atualize o comentário logo acima de `LEITURAS_BOARD` para lembrar que `PREVISAO_MEDIAS` também precisa existir antes de publicar.

Em `n8n/adaptadores/montar-board.js`, troque

```js
  whatsappSugestoes: abas['WHATSAPP_SUGESTOES']
};
```

por

```js
  whatsappSugestoes: abas['WHATSAPP_SUGESTOES'],
  previsaoMedias: abas['PREVISAO_MEDIAS']
};
```

Em `web/src/api/tipos.ts`:

Troque

```ts
  mensagens: MensagemProducao[];
  sugestoes: SugestaoProducao[];
  historico: EntradaHistorico[];
}
```

por

```ts
  mensagens: MensagemProducao[];
  sugestoes: SugestaoProducao[];
  historico: EntradaHistorico[];
  // OS prevista (19/10): ainda nas etapas 12 a 16, com a Costura projetada pelo servidor.
  // Ausentes nas OS que já estão na Costura (e na API antiga).
  prevista?: boolean;
  etapaOrdem?: number | null;
  etapaNome?: string;
  etapaInicio?: string; // 'aaaa-mm-dd' ou ''
  inicioCosturaPrevisto?: string; // chegada prevista à Costura, 'aaaa-mm-dd' ou '' (OS sem peças)
  fimCosturaPrevisto?: string;
}
```

Troque

```ts
  dealsProducaoEditaveis?: string[];
}
```

por

```ts
  dealsProducaoEditaveis?: string[];
  previsaoSemHistorico?: boolean; // PREVISAO_MEDIAS ainda vazia: a previsão usa o fallback (duração 1, fila 0)
}
```


- [ ] **Passo 4: Build, rodar e ver passar**

Run: `cd n8n && npm run build && npm test` e `cd web && npx tsc -b && npx vitest run`
Expected: PASS nos dois lados.

- [ ] **Passo 5: Commit**

```bash
git add n8n/src n8n/adaptadores/montar-board.js n8n/test n8n/build n8n/workflows web/src/api/tipos.ts
git commit -m "feat: board leva as OS previstas e avisa quando a previsão não tem histórico

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Regra pura da carga semanal

**Files:**
- Create: `web/src/regras/carga.ts`
- Test: `web/src/regras/carga.test.ts` (novo)

**Interfaces:**
- Consumes: Tarefa 7 (campos das previstas em `Producao`), Tarefa 6 (`OficinaProducao.capacidadeSemana`); de `web/src/regras/producao.ts`: `prazoProducao(p)`.
- Produces:
  - Tipos `CorCarga = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'SEM_CAPACIDADE'`, `SemanaCarga { inicio, fim, rotulo }`, `OsNaCelula { dealId, os, peca, pecas, prevista }`, `CelulaCarga { semana, pecas, capacidade, cor, os }`, `LinhaCarga { oficinaId, oficina, capacidade, celulas }`, `CelulaAlocar { semana, quantidadeOs, pecas, os }`, `Carga { semanas, linhas, alocar, semDatas }`.
  - `SEMANAS_CARGA = 9`, `somarDiasIso(d, n)`, `segundaDaSemana(d)`, `semanasCarga(hoje, quantidade?)`, `diasUteis(inicio, fim)`, `intervaloCostura(p, hoje)`, `corCarga(pecas, capacidade)`, `semOficina(p)`, `montarCarga(lista, oficinas, hoje, quantidade?)`, `textoCelula(c)`, `lerCapacidade(texto)`.

- [ ] **Passo 1: Escrever o teste que falha**

Crie `web/src/regras/carga.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { OficinaProducao, Producao } from '../api/tipos';
import { corCarga, diasUteis, intervaloCostura, lerCapacidade, montarCarga, segundaDaSemana, semanasCarga, textoCelula } from './carga';

// Quarta-feira, 21/10/2026: a semana atual começa na segunda 19/10.
const HOJE = '2026-10-21';
const prod = (extra: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'of-1', oficina: 'OFICINA A',
  inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 100, cliente: 'CLIENTE FICTICIO',
  peca: 'PECA TESTE', referencia: 'REF', versao: 'v1', faltasCostura: [], faltasAcabamento: [],
  mensagens: [], sugestoes: [], historico: [], ...extra
});
const oficina = (ploomesId: string, nome: string, capacidadeSemana: number | null): OficinaProducao =>
  ({ ploomesId, nome, grupoConfigurado: false, grupoNome: '', capacidadeSemana });

describe('semanas e dias úteis', () => {
  it('semana de segunda a domingo, da atual até 8 à frente', () => {
    expect(segundaDaSemana('2026-10-21')).toBe('2026-10-19');
    expect(segundaDaSemana('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(segundaDaSemana('2026-10-19')).toBe('2026-10-19');
    const s = semanasCarga(HOJE);
    expect(s).toHaveLength(9);
    expect(s[0]).toEqual({ inicio: '2026-10-19', fim: '2026-10-25', rotulo: '19/10' });
    expect(s[8].inicio).toBe('2026-12-14');
  });
  it('dias úteis de segunda a sexta, inclusive', () => {
    expect(diasUteis('2026-10-23', '2026-10-26')).toEqual(['2026-10-23', '2026-10-26']);
    expect(diasUteis('2026-10-24', '2026-10-25')).toEqual([]);
  });
});

describe('intervalo da costura', () => {
  it('prevista: da chegada prevista ao fim previsto; sem datas fica fora', () => {
    expect(intervaloCostura(prod({ prevista: true, inicioCosturaPrevisto: '2026-10-28', fimCosturaPrevisto: '2026-11-03' }), HOJE))
      .toEqual({ inicio: '2026-10-28', fim: '2026-11-03' });
    expect(intervaloCostura(prod({ prevista: true, inicioCosturaPrevisto: '', fimCosturaPrevisto: '' }), HOJE)).toBeNull();
  });
  it('real: início (ou hoje) até o prazo vigente; vencido conta até hoje; sem prazo fica fora', () => {
    expect(intervaloCostura(prod({ inicioCostura: '2026-10-19', dataCombinada: '2026-10-30' }), HOJE)).toEqual({ inicio: '2026-10-19', fim: '2026-10-30' });
    expect(intervaloCostura(prod({ dataCombinada: '', leadTime: '2026-10-30' }), HOJE)).toEqual({ inicio: HOJE, fim: '2026-10-30' });
    expect(intervaloCostura(prod({ inicioCostura: '2026-10-01', leadTime: '2026-10-15' }), HOJE)).toEqual({ inicio: '2026-10-01', fim: HOJE });
    expect(intervaloCostura(prod({ inicioCostura: '2026-11-10', dataCombinada: '2026-11-05' }), HOJE)).toEqual({ inicio: '2026-11-05', fim: '2026-11-05' });
    expect(intervaloCostura(prod(), HOJE)).toBeNull();
  });
});

describe('cor e texto da célula', () => {
  it('até 80% verde, até 100% amarelo, acima vermelho; sem capacidade sem alerta', () => {
    expect(corCarga(80, 100)).toBe('VERDE');
    expect(corCarga(81, 100)).toBe('AMARELO');
    expect(corCarga(100, 100)).toBe('AMARELO');
    expect(corCarga(101, 100)).toBe('VERMELHO');
    expect(corCarga(500, null)).toBe('SEM_CAPACIDADE');
    expect(corCarga(0, 0)).toBe('VERDE');
    expect(corCarga(1, 0)).toBe('VERMELHO');
  });
  it('"peças / capacidade", ou só as peças', () => {
    expect(textoCelula({ pecas: 1235.6, capacidade: 1500 })).toBe('1.236 / 1.500');
    expect(textoCelula({ pecas: 12, capacidade: null })).toBe('12');
  });
  it('capacidade digitada: vazio limpa, inteiro >= 0 vale, o resto recusa', () => {
    expect(lerCapacidade(' ')).toEqual({ ok: true, valor: null });
    expect(lerCapacidade('600')).toEqual({ ok: true, valor: 600 });
    expect(lerCapacidade('0')).toEqual({ ok: true, valor: 0 });
    expect(lerCapacidade('-1').ok).toBe(false);
    expect(lerCapacidade('1,5').ok).toBe(false);
  });
});

describe('montarCarga', () => {
  const lista: Producao[] = [
    // 100 peças em 10 dias úteis (19 a 30/10): 50 + 50.
    prod({ dealId: 'A', os: '1', inicioCostura: '2026-10-19', dataCombinada: '2026-10-30' }),
    // prevista: 60 peças em 5 dias úteis (28, 29, 30/10, 02 e 03/11): 36 + 24.
    prod({ dealId: 'B', os: '2', pecas: 60, prevista: true, inicioCosturaPrevisto: '2026-10-28', fimCosturaPrevisto: '2026-11-03' }),
    // 200 peças de 02 a 06/11: estoura a capacidade dessa semana.
    prod({ dealId: 'D', os: '4', pecas: 200, inicioCostura: '2026-11-02', dataCombinada: '2026-11-06' }),
    // vencida na OFICINA B (sem capacidade): 30 peças em 15 dias úteis (01 a 21/10) = 2 por dia; 3 dias nesta semana.
    prod({ dealId: 'C', os: '3', oficinaId: 'of-2', oficina: 'OFICINA B', pecas: 30, inicioCostura: '2026-10-01', leadTime: '2026-10-15' }),
    // só no fim de semana: tudo na semana do fim.
    prod({ dealId: 'W', os: '9', oficinaId: 'of-3', oficina: 'OFICINA C', pecas: 10, prevista: true, inicioCosturaPrevisto: '2026-10-24', fimCosturaPrevisto: '2026-10-25' }),
    // A alocar: prevista pela semana de chegada; real que já chegou conta na semana atual.
    prod({ dealId: 'E', os: '5', oficinaId: '', oficina: 'ALOCAR', pecas: 40, prevista: true, inicioCosturaPrevisto: '2026-10-27', fimCosturaPrevisto: '2026-10-29' }),
    prod({ dealId: 'F', os: '6', oficinaId: 'u-alocar', oficina: 'ALOCAR', pecas: 20, inicioCostura: '2026-10-10', dataCombinada: '2026-10-25' }),
    // sem datas: fora da carga, só contadas.
    prod({ dealId: 'G', os: '7', prevista: true, inicioCosturaPrevisto: '', fimCosturaPrevisto: '' }),
    prod({ dealId: 'H', os: '8' })
  ];
  const oficinas = [oficina('of-2', 'OFICINA B', null), oficina('of-1', 'OFICINA A', 100), oficina('of-3', 'OFICINA C', 50), oficina('u-alocar', 'ALOCAR', null)];
  const carga = montarCarga(lista, oficinas, HOJE);

  it('uma linha por oficina, em ordem alfabética, sem o usuário ALOCAR', () => {
    expect(carga.linhas.map((l) => l.oficina)).toEqual(['OFICINA A', 'OFICINA B', 'OFICINA C']);
    expect(carga.semanas).toHaveLength(9);
  });
  it('espalha as peças pelos dias úteis e soma por semana, com a cor da capacidade', () => {
    const a = carga.linhas[0].celulas;
    expect(a.slice(0, 3).map((c) => Math.round(c.pecas * 1000) / 1000)).toEqual([50, 86, 224]);
    expect(a.slice(0, 3).map((c) => c.cor)).toEqual(['VERDE', 'AMARELO', 'VERMELHO']);
    expect(a[1].os).toEqual([
      { dealId: 'A', os: '1', peca: 'PECA TESTE', pecas: 50, prevista: false },
      { dealId: 'B', os: '2', peca: 'PECA TESTE', pecas: 36, prevista: true }
    ]);
    expect(a[3]).toMatchObject({ pecas: 0, cor: 'VERDE', os: [] });
  });
  it('vencida conta até hoje; sem capacidade fica sem cor de alerta', () => {
    const b = carga.linhas[1].celulas;
    expect(b[0]).toMatchObject({ pecas: 6, capacidade: null, cor: 'SEM_CAPACIDADE' });
    expect(b[1].pecas).toBe(0);
  });
  it('intervalo só no fim de semana cai inteiro na semana do fim', () => {
    expect(carga.linhas[2].celulas[0]).toMatchObject({ pecas: 10, cor: 'VERDE' });
  });
  it('A alocar: quantidade de OS e peças pela semana de chegada', () => {
    expect(carga.alocar.slice(0, 2).map((c) => [c.quantidadeOs, c.pecas])).toEqual([[1, 20], [1, 40]]);
    expect(carga.alocar[1].os[0]).toEqual({ dealId: 'E', os: '5', peca: 'PECA TESTE', pecas: 40, prevista: true });
  });
  it('OS sem datas ficam fora e são contadas', () => {
    expect(carga.semDatas).toBe(2);
  });
  it('oficina da OS que não está na lista ganha linha sem capacidade', () => {
    const c = montarCarga([prod({ oficinaId: 'of-9', oficina: 'OFICINA NOVA', inicioCostura: '2026-10-19', dataCombinada: '2026-10-23' })], [], HOJE);
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0]).toMatchObject({ oficina: 'OFICINA NOVA', capacidade: null });
    expect(c.linhas[0].celulas[0]).toMatchObject({ pecas: 100, cor: 'SEM_CAPACIDADE' });
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/regras/carga.test.ts`
Expected: FAIL (`Failed to resolve import "./carga"`).

- [ ] **Passo 3: Implementar**

Crie `web/src/regras/carga.ts`:

```ts
import type { OficinaProducao, Producao } from '../api/tipos';
import { prazoProducao } from './producao';

// Visão Carga (19/10): quantas peças cada oficina tem por semana, somando o que já
// costura (real) com o que vem aí (OS previstas), contra a capacidade dela. Só mostra;
// quem decide a alocação é o PCP. Datas 'aaaa-mm-dd' sem fuso (meio-dia UTC).

export type CorCarga = 'VERDE' | 'AMARELO' | 'VERMELHO' | 'SEM_CAPACIDADE';
export interface SemanaCarga { inicio: string; fim: string; rotulo: string }
export interface OsNaCelula { dealId: string; os: string; peca: string; pecas: number; prevista: boolean }
export interface CelulaCarga { semana: string; pecas: number; capacidade: number | null; cor: CorCarga; os: OsNaCelula[] }
export interface LinhaCarga { oficinaId: string; oficina: string; capacidade: number | null; celulas: CelulaCarga[] }
export interface CelulaAlocar { semana: string; quantidadeOs: number; pecas: number; os: OsNaCelula[] }
export interface Carga { semanas: SemanaCarga[]; linhas: LinhaCarga[]; alocar: CelulaAlocar[]; semDatas: number }

export const SEMANAS_CARGA = 9; // a atual e mais 8 à frente

const DIA_MS = 86_400_000;
const ms = (iso: string): number => Date.parse(`${iso}T12:00:00Z`);
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const somarDiasIso = (d: string, n: number): string => iso(ms(d) + n * DIA_MS);

// Segunda-feira da semana (segunda a domingo) de uma data.
export function segundaDaSemana(d: string): string {
  const dia = new Date(ms(d)).getUTCDay(); // 0 = domingo
  return somarDiasIso(d, dia === 0 ? -6 : 1 - dia);
}

export function semanasCarga(hoje: string, quantidade: number = SEMANAS_CARGA): SemanaCarga[] {
  const primeira = segundaDaSemana(hoje);
  return Array.from({ length: quantidade }, (_, k) => {
    const inicio = somarDiasIso(primeira, 7 * k);
    const fim = somarDiasIso(inicio, 6);
    return { inicio, fim, rotulo: `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}` };
  });
}

// Dias úteis (segunda a sexta) de inicio a fim, inclusive.
export function diasUteis(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  for (let t = ms(inicio); t <= ms(fim); t += DIA_MS) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) dias.push(iso(t));
  }
  return dias;
}

// Quando a OS ocupa a oficina. Prevista: da chegada prevista ao fim previsto. Real: do
// início da costura (ou hoje, sem início) até o prazo vigente; prazo vencido conta até
// hoje, porque a oficina continua com as peças. Sem datas: null (fica fora da carga).
export function intervaloCostura(p: Producao, hoje: string): { inicio: string; fim: string } | null {
  if (p.prevista) {
    if (!p.inicioCosturaPrevisto || !p.fimCosturaPrevisto) return null;
    return { inicio: p.inicioCosturaPrevisto, fim: p.fimCosturaPrevisto < p.inicioCosturaPrevisto ? p.inicioCosturaPrevisto : p.fimCosturaPrevisto };
  }
  const prazo = prazoProducao(p).data;
  if (!prazo) return null;
  const fim = prazo < hoje ? hoje : prazo;
  const inicio = p.inicioCostura || hoje;
  return { inicio: inicio > fim ? fim : inicio, fim };
}

// Até 80% verde, até 100% amarelo, acima vermelho. Sem capacidade: sem cor de alerta.
export function corCarga(pecas: number, capacidade: number | null | undefined): CorCarga {
  if (capacidade === null || capacidade === undefined) return 'SEM_CAPACIDADE';
  if (capacidade <= 0) return pecas > 0 ? 'VERMELHO' : 'VERDE';
  const r = pecas / capacidade;
  return r <= 0.8 ? 'VERDE' : r <= 1 ? 'AMARELO' : 'VERMELHO';
}

export const semOficina = (p: Pick<Producao, 'oficinaId' | 'oficina'>): boolean =>
  !p.oficinaId || p.oficina.trim().toUpperCase() === 'ALOCAR';

const pecasDe = (p: Producao): number => (typeof p.pecas === 'number' && Number.isFinite(p.pecas) ? p.pecas : 0);

// Peças da OS em cada semana: espalhadas igualmente pelos dias úteis do intervalo. Sem dia
// útil (intervalo só no fim de semana), tudo cai na semana do fim.
function pecasPorSemana(p: Producao, intervalo: { inicio: string; fim: string }): Map<string, number> {
  const total = pecasDe(p);
  const porSemana = new Map<string, number>();
  const uteis = diasUteis(intervalo.inicio, intervalo.fim);
  if (!uteis.length) return porSemana.set(segundaDaSemana(intervalo.fim), total);
  for (const d of uteis) {
    const s = segundaDaSemana(d);
    porSemana.set(s, (porSemana.get(s) ?? 0) + total / uteis.length);
  }
  return porSemana;
}

// lista: OS já filtradas (os filtros gerais valem aqui), reais e previstas.
// oficinas: board.oficinas; toda oficina ativa vira linha, mesmo sem OS.
export function montarCarga(lista: Producao[], oficinas: OficinaProducao[], hoje: string, quantidade: number = SEMANAS_CARGA): Carga {
  const semanas = semanasCarga(hoje, quantidade);
  const indice = new Map(semanas.map((s, k) => [s.inicio, k]));
  const linhas = new Map<string, LinhaCarga>();
  const novaLinha = (oficinaId: string, oficina: string, capacidade: number | null): LinhaCarga => ({
    oficinaId, oficina, capacidade,
    celulas: semanas.map((s) => ({ semana: s.inicio, pecas: 0, capacidade, cor: corCarga(0, capacidade), os: [] }))
  });
  for (const o of oficinas) {
    if (o.nome.trim().toUpperCase() === 'ALOCAR') continue;
    linhas.set(o.ploomesId, novaLinha(o.ploomesId, o.nome, o.capacidadeSemana ?? null));
  }
  const alocar: CelulaAlocar[] = semanas.map((s) => ({ semana: s.inicio, quantidadeOs: 0, pecas: 0, os: [] }));
  let semDatas = 0;
  const atual = semanas[0].inicio;

  for (const p of lista) {
    const intervalo = intervaloCostura(p, hoje);
    if (!intervalo) { semDatas++; continue; }
    if (semOficina(p)) {
      // A alocar: a OS inteira na semana em que chega (a que já chegou conta na atual).
      const chegada = segundaDaSemana(intervalo.inicio);
      const k = indice.get(chegada < atual ? atual : chegada);
      if (k === undefined) continue;
      alocar[k].quantidadeOs++;
      alocar[k].pecas += pecasDe(p);
      alocar[k].os.push({ dealId: p.dealId, os: p.os, peca: p.peca, pecas: pecasDe(p), prevista: !!p.prevista });
      continue;
    }
    const linha = linhas.get(p.oficinaId) ?? novaLinha(p.oficinaId, p.oficina, null);
    linhas.set(p.oficinaId, linha);
    for (const [semana, pecas] of pecasPorSemana(p, intervalo)) {
      const k = indice.get(semana);
      if (k === undefined) continue;
      const c = linha.celulas[k];
      c.pecas += pecas;
      c.os.push({ dealId: p.dealId, os: p.os, peca: p.peca, pecas, prevista: !!p.prevista });
    }
  }
  for (const l of linhas.values()) for (const c of l.celulas) c.cor = corCarga(c.pecas, c.capacidade);
  return {
    semanas,
    linhas: [...linhas.values()].sort((a, b) => a.oficina.localeCompare(b.oficina, 'pt-BR')),
    alocar,
    semDatas
  };
}

// Texto da célula: "420 / 600" (sem capacidade, só as peças).
export function textoCelula(c: Pick<CelulaCarga, 'pecas' | 'capacidade'>): string {
  const pecas = Math.round(c.pecas).toLocaleString('pt-BR');
  return c.capacidade === null ? pecas : `${pecas} / ${c.capacidade.toLocaleString('pt-BR')}`;
}

// Capacidade digitada pelo ADM: vazio = sem capacidade; senão inteiro >= 0.
export function lerCapacidade(texto: string): { ok: true; valor: number | null } | { ok: false; erro: string } {
  const t = texto.trim();
  if (!t) return { ok: true, valor: null };
  if (!/^\d+$/.test(t) || Number(t) > 1_000_000) return { ok: false, erro: 'Informe a capacidade em peças por semana: número inteiro, 0 ou mais.' };
  return { ok: true, valor: Number(t) };
}
```

Conferência à mão: semana de 26/10 da OFICINA A = 50 (metade de 100 peças em 10 dias úteis) + 36 (60 peças em 5 dias úteis, 3 deles nesta semana) = **86 / 100** → amarelo; semana de 02/11 = 24 + 200 = **224 / 100** → vermelho.

- [ ] **Passo 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/regras/carga.test.ts && npx tsc -b`
Expected: PASS (14 testes).

- [ ] **Passo 5: Commit**

```bash
git add web/src/regras/carga.ts web/src/regras/carga.test.ts
git commit -m "feat: regra da carga semanal das oficinas (dias úteis, cores e A alocar)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Regras das OS previstas no Gantt e na Tabela

**Files:**
- Modify: `web/src/regras/producao.ts` (`FiltrosProducao`, `filtrarProducoes`, `indicadoresProducao`, `janelaGantt`, `tituloBarraPrevista`)
- Modify: `web/src/regras/producaoTabela.ts` (colunas `etapa` e `chegada`, `colunasVisiveis`, visão `CARGA`, preferência "Incluir previstas")
- Test: `web/src/regras/producao.test.ts`, `web/src/regras/producaoTabela.test.ts`

**Interfaces:**
- Consumes: Tarefa 7 (campos das previstas).
- Produces:
  - `FiltrosProducao.incluirPrevistas?: boolean` (sem ele as previstas ficam fora).
  - `indicadoresProducao` ignora as previstas; `janelaGantt` considera `inicioCosturaPrevisto`/`fimCosturaPrevisto`.
  - `tituloBarraPrevista(p): string` → `OS 10015 · prevista · 15. Preparação 1 · 21/10 a 20/12 · 80 pç`.
  - `ColunaProducao` ganha `'etapa' | 'chegada'`; `DefinicaoColuna.soPrevistas?: boolean`; colunas "Etapa atual" (select) e "Chegada prevista" (texto) no fim de `COLUNAS_PRODUCAO`; `colunasVisiveis(ocultas, incluirPrevistas = false)`.
  - `VisaoProducao = 'GANTT' | 'TABELA' | 'CARGA'`; `lerVisao()` aceita `CARGA`.
  - `lerIncluirPrevistas(): boolean` e `salvarIncluirPrevistas(v: boolean)` (chave `pcp-mrbl.producao.incluirPrevistas`, valores `SIM`/`NAO`).

- [ ] **Passo 1: Escrever os testes que falham**

Acrescente no fim de `web/src/regras/producao.test.ts`:

```ts
describe('OS previstas (19/10)', () => {
  const prevista = prod({
    dealId: '710015', os: '10015', prevista: true, etapaOrdem: 15, etapaNome: '15. Preparação 1',
    inicioCostura: '', dataCombinada: '', leadTime: '', inicioCosturaPrevisto: '2026-10-21', fimCosturaPrevisto: '2026-12-20', pecas: 80, valorCorte: null
  });
  it('ficam fora sem "Incluir previstas" e entram com ele', () => {
    const base = { busca: '', oficinaId: '', soComFalta: false };
    expect(filtrarProducoes([prod(), prevista], base).map((p) => p.dealId)).toEqual(['700001']);
    expect(filtrarProducoes([prod(), prevista], { ...base, incluirPrevistas: true }).map((p) => p.dealId)).toEqual(['700001', '710015']);
  });
  it('não entram nos indicadores da Costura', () => {
    expect(indicadoresProducao([prod(), prevista], '2026-10-13')).toMatchObject({ os: 1, pecas: 120 });
  });
  it('a janela do Gantt vai até o fim previsto', () => {
    expect(janelaGantt([prod({ inicioCostura: '2026-10-01', dataCombinada: '2026-10-20' }), prevista], '2026-10-13').fim).toBe('2026-12-20');
  });
  it('título da barra tracejada', () => {
    expect(tituloBarraPrevista(prevista)).toBe('OS 10015 · prevista · 15. Preparação 1 · 21/10 a 20/12 · 80 pç');
    expect(tituloBarraPrevista({ ...prevista, inicioCosturaPrevisto: '', fimCosturaPrevisto: '' })).toBe('OS 10015 · prevista · 15. Preparação 1 · sem previsão · 80 pç');
  });
});
```

E, no import da linha 3 desse arquivo, acrescente `tituloBarraPrevista` (antes de `tituloBarraProducao`).

Em `web/src/regras/producaoTabela.test.ts`:

Troque

```ts
  it('esconde as escolhidas, mas a OS fica sempre', () => {
    const visiveis = colunasVisiveis(['cliente', 'os']).map((c) => c.id);
    expect(visiveis).not.toContain('cliente');
    expect(visiveis[0]).toBe('os');
    expect(visiveis).toHaveLength(COLUNAS_PRODUCAO.length - 1);
  });
```

por

```ts
  it('esconde as escolhidas, mas a OS fica sempre', () => {
    const visiveis = colunasVisiveis(['cliente', 'os'], true).map((c) => c.id);
    expect(visiveis).not.toContain('cliente');
    expect(visiveis[0]).toBe('os');
    expect(visiveis).toHaveLength(COLUNAS_PRODUCAO.length - 1);
  });

  it('Etapa atual e Chegada prevista só aparecem com "Incluir previstas"', () => {
    expect(colunasVisiveis([]).map((c) => c.id)).not.toContain('etapa');
    expect(colunasVisiveis([]).map((c) => c.id)).not.toContain('chegada');
    expect(colunasVisiveis([], true).map((c) => c.id).slice(-2)).toEqual(['etapa', 'chegada']);
    expect(colunasVisiveis(['chegada'], true).map((c) => c.id)).not.toContain('chegada');
  });
```

Troque

```ts
  it('mostra traço quando não há falta nem sugestão pendente', () => {
```

por

```ts
  it('etapa atual e chegada prevista: a prevista mostra a etapa dela; a da Costura, "17. Costura"', () => {
    const [real, prevista] = linhasTabela([prod(), prod({
      dealId: '710015', prevista: true, etapaOrdem: 15, etapaNome: '15. Preparação 1', inicioCosturaPrevisto: '2026-10-21', fimCosturaPrevisto: '2026-10-27'
    })], HOJE);
    expect(real.valores.etapa).toEqual({ exibir: '17. Costura', ordem: 17, filtro: '17. Costura' });
    expect(real.valores.chegada.exibir).toBe('');
    expect(prevista.valores.etapa).toEqual({ exibir: '15. Preparação 1', ordem: 15, filtro: '15. Preparação 1' });
    expect(prevista.valores.chegada).toEqual({ exibir: '21/10/2026', ordem: '2026-10-21' });
    expect(filtrarLinhas([real, prevista], { etapa: '15. Preparação 1' }).map((l) => l.item.dealId)).toEqual(['710015']);
  });

  it('mostra traço quando não há falta nem sugestão pendente', () => {
```

Troque

```ts
  it('visão padrão é o Gantt e a escolha fica gravada', () => {
    expect(lerVisao()).toBe('GANTT');
    salvarVisao('TABELA');
    expect(lerVisao()).toBe('TABELA');
```

por

```ts
  it('visão padrão é o Gantt e a escolha fica gravada', () => {
    expect(lerVisao()).toBe('GANTT');
    salvarVisao('TABELA');
    expect(lerVisao()).toBe('TABELA');
    salvarVisao('CARGA');
    expect(lerVisao()).toBe('CARGA');
```

Troque

```ts
  it('agrupamento do Gantt: padrão Oficina e a escolha fica gravada', () => {
```

por

```ts
  it('"Incluir previstas": desligado por padrão e lembrado', () => {
    expect(lerIncluirPrevistas()).toBe(false);
    salvarIncluirPrevistas(true);
    expect(lerIncluirPrevistas()).toBe(true);
    salvarIncluirPrevistas(false);
    expect(lerIncluirPrevistas()).toBe(false);
  });

  it('agrupamento do Gantt: padrão Oficina e a escolha fica gravada', () => {
```

Troque

```ts
  COLUNAS_PRODUCAO, colunasVisiveis, dataBr, filtrarLinhas, lerAgrupamento, lerColunasOcultas, lerVisao, linhasTabela,
```

por

```ts
  COLUNAS_PRODUCAO, colunasVisiveis, dataBr, filtrarLinhas, lerAgrupamento, lerColunasOcultas, lerIncluirPrevistas, lerVisao, linhasTabela,
  salvarIncluirPrevistas,
```


- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/regras/producao.test.ts src/regras/producaoTabela.test.ts`
Expected: FAIL (previstas entram no filtro sem a opção; `tituloBarraPrevista`, `lerIncluirPrevistas` e as colunas novas não existem).

- [ ] **Passo 3: Implementar em `web/src/regras/producao.ts`**

Troque

```ts
export interface FiltrosProducao { busca: string; oficinaId: string; soComFalta: boolean; situacao?: SituacaoPrazo | ''; hoje?: string }
```

por

```ts
// incluirPrevistas (19/10): sem ele, as OS previstas (etapas 12 a 16) ficam fora.
export interface FiltrosProducao { busca: string; oficinaId: string; soComFalta: boolean; situacao?: SituacaoPrazo | ''; hoje?: string; incluirPrevistas?: boolean }
```

Troque

```ts
  return lista.filter((p) => {
    if (filtros.oficinaId && p.oficinaId !== filtros.oficinaId) return false;
```

por

```ts
  return lista.filter((p) => {
    if (p.prevista && !filtros.incluirPrevistas) return false;
    if (filtros.oficinaId && p.oficinaId !== filtros.oficinaId) return false;
```

Troque

```ts
export function indicadoresProducao(lista: Producao[], hoje: string) {
  const oficinas = new Set(lista.filter((p) => p.oficinaId).map((p) => p.oficinaId));
```

por

```ts
// Indicadores da Costura: as OS previstas não entram (ainda não chegaram).
export function indicadoresProducao(todas: Producao[], hoje: string) {
  const lista = todas.filter((p) => !p.prevista);
  const oficinas = new Set(lista.filter((p) => p.oficinaId).map((p) => p.oficinaId));
```

Troque

```ts
export function janelaGantt(lista: Producao[], hoje: string): { inicio: string; fim: string; dias: number } {
  const datas = lista.flatMap((p) => [p.inicioCostura, prazoProducao(p).data]).filter(Boolean);
```

por

```ts
export function janelaGantt(lista: Producao[], hoje: string): { inicio: string; fim: string; dias: number } {
  const datas = lista.flatMap((p) => p.prevista
    ? [p.inicioCosturaPrevisto ?? '', p.fimCosturaPrevisto ?? '']
    : [p.inicioCostura, prazoProducao(p).data]).filter(Boolean);
```

Troque

```ts
export function totaisProducao(lista: Pick<Producao, 'pecas' | 'valorCorte'>[]): { pecas: number; valor: number } {
```

por

```ts
// Barra tracejada da OS prevista: da chegada prevista ao fim previsto.
export function tituloBarraPrevista(p: Pick<Producao, 'os' | 'etapaNome' | 'inicioCosturaPrevisto' | 'fimCosturaPrevisto' | 'pecas' | 'valorCorte'>): string {
  const ini = p.inicioCosturaPrevisto ?? '';
  const fim = p.fimCosturaPrevisto ?? '';
  const periodo = ini && fim ? `${ini.slice(8, 10)}/${ini.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}` : 'sem previsão';
  return [`OS ${p.os}`, 'prevista', p.etapaNome ?? '', periodo, textoBarraProducao(p)].filter(Boolean).join(' · ');
}

export function totaisProducao(lista: Pick<Producao, 'pecas' | 'valorCorte'>[]): { pecas: number; valor: number } {
```


- [ ] **Passo 4: Implementar em `web/src/regras/producaoTabela.ts`**

Troque

```ts
  | 'leadTime' | 'prazo' | 'situacao' | 'faltasCostura' | 'faltasAcabamento' | 'sugestao';

export interface DefinicaoColuna { id: ColunaProducao; titulo: string; filtro: 'texto' | 'select'; numerica?: boolean }
```

por

```ts
  | 'leadTime' | 'prazo' | 'situacao' | 'faltasCostura' | 'faltasAcabamento' | 'sugestao' | 'etapa' | 'chegada';

// soPrevistas: coluna que só aparece com "Incluir previstas" ligado (19/10).
export interface DefinicaoColuna { id: ColunaProducao; titulo: string; filtro: 'texto' | 'select'; numerica?: boolean; soPrevistas?: boolean }
```

Troque

```ts
  { id: 'sugestao', titulo: 'Sugestão pendente', filtro: 'texto' }
];
```

por

```ts
  { id: 'sugestao', titulo: 'Sugestão pendente', filtro: 'texto' },
  { id: 'etapa', titulo: 'Etapa atual', filtro: 'select', soPrevistas: true },
  { id: 'chegada', titulo: 'Chegada prevista', filtro: 'texto', soPrevistas: true }
];
```

Troque

```ts
export type VisaoProducao = 'GANTT' | 'TABELA';
```

por

```ts
export type VisaoProducao = 'GANTT' | 'TABELA' | 'CARGA';
```

Troque

```ts
        sugestao: { exibir: pendente ? 'Sim' : '—', ordem: pendente ? 1 : 0 }
```

por

```ts
        sugestao: { exibir: pendente ? 'Sim' : '—', ordem: pendente ? 1 : 0 },
        etapa: p.prevista
          ? { exibir: p.etapaNome ?? '', ordem: p.etapaOrdem ?? null, filtro: p.etapaNome ?? '' }
          : { exibir: ETAPA_COSTURA, ordem: 17, filtro: ETAPA_COSTURA },
        chegada: data(p.prevista ? p.inicioCosturaPrevisto ?? '' : '')
```

Troque

```ts
const texto = (v: string): ValorCelula => ({ exibir: v, ordem: v.trim() ? v : null });
```

por

```ts
const ETAPA_COSTURA = '17. Costura';
const texto = (v: string): ValorCelula => ({ exibir: v, ordem: v.trim() ? v : null });
```

Troque

```ts
export function colunasVisiveis(ocultas: string[]): DefinicaoColuna[] {
  return COLUNAS_PRODUCAO.filter((c) => c.id === 'os' || !ocultas.includes(c.id));
}
```

por

```ts
export function colunasVisiveis(ocultas: string[], incluirPrevistas = false): DefinicaoColuna[] {
  return COLUNAS_PRODUCAO.filter((c) => c.id === 'os' || (!ocultas.includes(c.id) && (incluirPrevistas || !c.soPrevistas)));
}
```

Troque

```ts
const CHAVE_AGRUPAMENTO = 'pcp-mrbl.producao.agrupamento';

export function lerVisao(): VisaoProducao {
  try { return localStorage.getItem(CHAVE_VISAO) === 'TABELA' ? 'TABELA' : 'GANTT'; } catch { return 'GANTT'; }
}
```

por

```ts
const CHAVE_AGRUPAMENTO = 'pcp-mrbl.producao.agrupamento';
const CHAVE_PREVISTAS = 'pcp-mrbl.producao.incluirPrevistas';

export function lerVisao(): VisaoProducao {
  try {
    const v = localStorage.getItem(CHAVE_VISAO);
    return v === 'TABELA' || v === 'CARGA' ? v : 'GANTT';
  } catch { return 'GANTT'; }
}

// "Incluir previstas" (Gantt e Tabela): desligado por padrão.
export function lerIncluirPrevistas(): boolean {
  try { return localStorage.getItem(CHAVE_PREVISTAS) === 'SIM'; } catch { return false; }
}

export function salvarIncluirPrevistas(v: boolean): void {
  try { localStorage.setItem(CHAVE_PREVISTAS, v ? 'SIM' : 'NAO'); } catch { /* fica só nesta aba */ }
}
```


- [ ] **Passo 5: Rodar e ver passar**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS (toda a suíte; os testes antigos de `producaoTabela` continuam passando com `colunasVisiveis(…, true)`).

- [ ] **Passo 6: Commit**

```bash
git add web/src/regras/producao.ts web/src/regras/producaoTabela.ts web/src/regras/producao.test.ts web/src/regras/producaoTabela.test.ts
git commit -m "feat: regras das OS previstas no Gantt e na Tabela e visão Carga nas preferências

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: Visão Carga (Gantt | Tabela | Carga) com edição de capacidade por ADM

**Files:**
- Create: `web/src/telas/ProducaoCarga.tsx`
- Modify: `web/src/telas/Producao.tsx` (terceira visão, prop `ehAdm`, aviso de previsão sem histórico)
- Modify: `web/src/App.tsx:78` (passa `ehAdm` para `Producao`)
- Modify: `web/src/styles/f4.css` (acrescentar no fim)
- Test: `web/e2e/f4-carga.spec.ts` (novo)

**Interfaces:**
- Consumes: Tarefa 8 (`montarCarga`, `textoCelula`, `lerCapacidade`, `OsNaCelula`), Tarefa 9 (`VisaoProducao` com `CARGA`, `filtrarProducoes` com `incluirPrevistas`), Tarefa 6 (ação `alterar_capacidade_oficina`), `Executar` de `web/src/hooks/useAcao.ts` (`(acao, mensagemSucesso) => Promise<boolean>`).
- Produces:
  - `CargaProducao({ lista, oficinas, hojeIso, oficinaId, ehAdm, executar, onAbrir })` — tabela com `aria-label="Carga das oficinas"`; cabeçalhos `Semana dd/mm`; botão de célula com `aria-label` `"<OFICINA>, semana dd/mm: <peças / capacidade> peças"` e classe `carga__celula--verde|amarelo|vermelho|sem_capacidade`; linha "A alocar" (`aria-label` `"A alocar, semana dd/mm: N OS, P peças"`); lista da célula `region` "OS da célula" (OS, peça, "N pç no período", etiqueta `real`/`prevista`); ADM: botão `Editar capacidade de <OFICINA>` abre o campo `Capacidade de <OFICINA> (peças por semana)` com Salvar/Cancelar.
  - `Producao` passa a receber `ehAdm: boolean`.
  - Classes CSS: `.carga*`, `.etiqueta-prevista`, `.etiqueta-real`, `.gantt__barra--prevista`, `.producao-aviso` (as três últimas usadas também na Tarefa 11).

- [ ] **Passo 1: Escrever o E2E que falha**

Crie `web/e2e/f4-carga.spec.ts`:

```ts
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd web && CI=1 npx playwright test e2e/f4-carga.spec.ts`
Expected: FAIL (não existe o botão "Carga" no grupo Visão).

- [ ] **Passo 3: Componente da Carga**

Crie `web/src/telas/ProducaoCarga.tsx`:

```tsx
import { useMemo, useState } from 'react';
import type { OficinaProducao, Producao } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import { lerCapacidade, montarCarga, textoCelula, type OsNaCelula } from '../regras/carga';

// Visão Carga do Controle de produção (19/10): oficinas x semanas, "peças / capacidade"
// com cor. Recebe a lista já filtrada (reais e previstas). Clique na célula lista as OS;
// clique na OS abre o painel. ADM edita a capacidade clicando no nome da oficina.
const pc = (n: number) => Math.round(n).toLocaleString('pt-BR');

export function CargaProducao({ lista, oficinas, hojeIso, oficinaId, ehAdm, executar, onAbrir }: {
  lista: Producao[];
  oficinas: OficinaProducao[];
  hojeIso: string;
  oficinaId: string; // filtro geral de oficina: só a linha dela
  ehAdm: boolean;
  executar: Executar;
  onAbrir: (dealId: string) => void;
}) {
  const carga = useMemo(() => montarCarga(lista, oficinas, hojeIso), [lista, oficinas, hojeIso]);
  const linhas = oficinaId ? carga.linhas.filter((l) => l.oficinaId === oficinaId) : carga.linhas;
  const [celula, setCelula] = useState<{ titulo: string; os: OsNaCelula[] } | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState('');

  const editar = (id: string, capacidade: number | null) => {
    setEditando(id);
    setValor(capacidade === null ? '' : String(capacidade));
    setErro('');
  };
  const salvar = (id: string) => {
    const r = lerCapacidade(valor);
    if (!r.ok) return setErro(r.erro);
    setEditando(null);
    void executar({ tipo: 'alterar_capacidade_oficina', oficinaId: id, capacidade: r.valor },
      r.valor === null ? 'Capacidade da oficina removida' : 'Capacidade da oficina atualizada');
  };

  return <section className="carga" aria-label="Carga das oficinas">
    <div className="carga__rolagem">
      <table className="carga__tabela">
        <thead><tr>
          <th scope="col">Oficina</th>
          {carga.semanas.map((s) => <th key={s.inicio} scope="col">Semana {s.rotulo}</th>)}
        </tr></thead>
        <tbody>
          {linhas.map((l) => <tr key={l.oficinaId}>
            <th scope="row">
              {editando === l.oficinaId ? <form className="carga__capacidade" onSubmit={(e) => { e.preventDefault(); salvar(l.oficinaId); }}>
                <label>Capacidade de {l.oficina} (peças por semana)
                  <input inputMode="numeric" value={valor} autoFocus onChange={(e) => setValor(e.target.value)} placeholder="Sem capacidade" />
                </label>
                {erro && <span className="campo__erro" role="alert">{erro}</span>}
                <div><button type="submit" className="botao botao--signal">Salvar</button>
                  <button type="button" className="botao botao--contorno" onClick={() => setEditando(null)}>Cancelar</button></div>
              </form> : <>
                {ehAdm ? <button type="button" className="carga__oficina" onClick={() => editar(l.oficinaId, l.capacidade)}
                  aria-label={`Editar capacidade de ${l.oficina}`}>{l.oficina}</button> : <strong>{l.oficina}</strong>}
                <small>{l.capacidade === null ? 'Sem capacidade' : `${pc(l.capacidade)} pç/semana`}</small>
              </>}
            </th>
            {l.celulas.map((c, k) => <td key={c.semana}>
              <button type="button" className={`carga__celula carga__celula--${c.cor.toLowerCase()}`}
                aria-label={`${l.oficina}, semana ${carga.semanas[k].rotulo}: ${textoCelula(c)} peças`}
                onClick={() => setCelula({ titulo: `${l.oficina} · semana ${carga.semanas[k].rotulo}`, os: c.os })}>{textoCelula(c)}</button>
            </td>)}
          </tr>)}
          <tr className="carga__alocar">
            <th scope="row"><strong>A alocar</strong><small>pela semana de chegada</small></th>
            {carga.alocar.map((c, k) => <td key={c.semana}>
              <button type="button" className="carga__celula carga__celula--alocar"
                aria-label={`A alocar, semana ${carga.semanas[k].rotulo}: ${c.quantidadeOs} OS, ${pc(c.pecas)} peças`}
                onClick={() => setCelula({ titulo: `A alocar · semana ${carga.semanas[k].rotulo}`, os: c.os })}>
                {c.quantidadeOs ? `${c.quantidadeOs} OS · ${pc(c.pecas)} pç` : '—'}</button>
            </td>)}
          </tr>
        </tbody>
      </table>
    </div>
    {carga.semDatas > 0 && <p className="producao-vazio">{carga.semDatas} {carga.semDatas === 1 ? 'OS sem datas fica' : 'OS sem datas ficam'} fora da carga.</p>}
    {celula && <section className="carga__detalhe" aria-label="OS da célula">
      <header><strong>{celula.titulo}</strong>
        <button type="button" className="producao-painel__fechar" aria-label="Fechar lista" onClick={() => setCelula(null)}>×</button></header>
      {celula.os.length === 0 ? <p className="producao-vazio">Nenhuma OS nesta semana.</p>
        : <ul>{celula.os.map((o) => <li key={o.dealId}>
          <button type="button" onClick={() => onAbrir(o.dealId)}>
            <strong>OS {o.os}</strong><span>{o.peca || 'Sem descrição'}</span><span>{pc(o.pecas)} pç no período</span>
            <em className={o.prevista ? 'etiqueta-prevista' : 'etiqueta-real'}>{o.prevista ? 'prevista' : 'real'}</em>
          </button>
        </li>)}</ul>}
    </section>}
  </section>;
}
```

- [ ] **Passo 4: Ligar a visão na tela**

Em `web/src/telas/Producao.tsx`:

Troque

```tsx
import { TabelaProducao } from './ProducaoTabela';
```

por

```tsx
import { TabelaProducao } from './ProducaoTabela';
import { CargaProducao } from './ProducaoCarga';
```

Troque

```tsx
export function Producao({ board, q, hoje, executar }: { board: Board; q: string; hoje: Date; executar: Executar }) {
```

por

```tsx
export function Producao({ board, q, hoje, executar, ehAdm }: { board: Board; q: string; hoje: Date; executar: Executar; ehAdm: boolean }) {
```

Troque

```tsx
  const filtradas = useMemo(() => filtrarProducoes(producao, { busca: q, oficinaId, soComFalta, situacao, hoje: hojeIso }), [producao, q, oficinaId, soComFalta, situacao, hojeIso]);
```

por

```tsx
  const filtradas = useMemo(() => filtrarProducoes(producao, { busca: q, oficinaId, soComFalta, situacao, hoje: hojeIso }), [producao, q, oficinaId, soComFalta, situacao, hojeIso]);
  // A Carga sempre soma o que vem aí: inclui as previstas.
  const paraCarga = useMemo(() => visao === 'CARGA' ? filtrarProducoes(producao, { busca: q, oficinaId, soComFalta, situacao, hoje: hojeIso, incluirPrevistas: true }) : PRODUCAO_VAZIA,
    [visao, producao, q, oficinaId, soComFalta, situacao, hojeIso]);
```

Troque

```tsx
        {(['GANTT', 'TABELA'] as const).map((v) => <button key={v} type="button" aria-pressed={visao === v} onClick={() => trocarVisao(v)}>{v === 'GANTT' ? 'Gantt' : 'Tabela'}</button>)}
```

por

```tsx
        {(['GANTT', 'TABELA', 'CARGA'] as const).map((v) => <button key={v} type="button" aria-pressed={visao === v} onClick={() => trocarVisao(v)}>{v === 'GANTT' ? 'Gantt' : v === 'TABELA' ? 'Tabela' : 'Carga'}</button>)}
```

Troque

```tsx
    {visao === 'TABELA' ? <TabelaProducao lista={ordemGantt} hojeIso={hojeIso} onAbrir={setAberta} /> : <div className="gantt__rolagem">
```

por

```tsx
    {visao === 'CARGA' && board.previsaoSemHistorico && <p className="producao-aviso" role="status">Previsão sem histórico: as OS previstas usam duração de 1 dia por etapa e fila zero até o cálculo diário das médias.</p>}
    {visao === 'CARGA' ? <CargaProducao lista={paraCarga} oficinas={board.oficinas ?? []} hojeIso={hojeIso} oficinaId={oficinaId} ehAdm={ehAdm} executar={executar} onAbrir={setAberta} />
      : visao === 'TABELA' ? <TabelaProducao lista={ordemGantt} hojeIso={hojeIso} onAbrir={setAberta} /> : <div className="gantt__rolagem">
```


Em `web/src/App.tsx`, troque

```tsx
          : tela === 'producao' ? <Producao board={board} q={q} hoje={hoje} executar={executar} />
```

por

```tsx
          : tela === 'producao' ? <Producao board={board} q={q} hoje={hoje} executar={executar} ehAdm={ehAdm} />
```

- [ ] **Passo 5: Estilos**

Acrescente no fim de `web/src/styles/f4.css`:

```css

/* Visão de futuro e carga das oficinas (19/10) */
.etiqueta-prevista, .etiqueta-real { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; font: 700 10px var(--font-sans); font-style: normal; text-transform: lowercase; vertical-align: middle; }
.etiqueta-prevista { border: 1px dashed #466cc8; color: #2f4f9e; background: #eef2fb; }
.etiqueta-real { border: 1px solid var(--borda); color: var(--suave); background: #fff; }
.gantt__barra--prevista { background: repeating-linear-gradient(135deg, rgba(70,108,200,.18) 0, rgba(70,108,200,.18) 6px, rgba(70,108,200,.32) 6px, rgba(70,108,200,.32) 12px); color: #2f4f9e; box-shadow: inset 0 0 0 1.5px #466cc8; border: 1.5px dashed #466cc8; }
.producao-aviso { margin: 0; padding: 8px 12px; border: 1px solid #e8c47c; border-radius: var(--raio); background: #fff8e8; color: #7a5410; font-size: 12.5px; }
.carga { flex: 1; min-height: 220px; display: flex; flex-direction: column; gap: 10px; }
.carga__rolagem { overflow: auto; border: 1px solid var(--borda); border-radius: var(--raio); background: #fff; }
.carga__tabela { width: max-content; min-width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
.carga__tabela thead th { position: sticky; top: 0; z-index: 2; padding: 8px 10px; border-bottom: 1px solid var(--borda); background: #fff; color: var(--suave); font: 650 12px var(--font-sans); text-align: center; white-space: nowrap; }
.carga__tabela thead th:first-child, .carga__tabela tbody th { position: sticky; left: 0; z-index: 1; text-align: left; background: #fff; }
.carga__tabela tbody th { min-width: 180px; padding: 8px 10px; border-bottom: 1px solid #eef0f4; font-weight: 400; }
.carga__tabela tbody th strong, .carga__oficina { display: block; font: 700 12.5px var(--font-sans); color: var(--texto); }
.carga__oficina { padding: 0; border: 0; background: none; text-align: left; text-decoration: underline dotted; cursor: pointer; }
.carga__tabela tbody th small { color: var(--suave); font-size: 11.5px; }
.carga__tabela td { padding: 4px; border-bottom: 1px solid #eef0f4; }
.carga__celula { width: 100%; min-width: 96px; height: 34px; border: 1px solid var(--borda); border-radius: 4px; background: #fff; color: var(--texto); font: 650 12px var(--font-sans); font-variant-numeric: tabular-nums; cursor: pointer; }
.carga__celula:focus-visible, .carga__oficina:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.carga__celula--verde { background: #e7f5ec; border-color: #9fd3b2; color: #1d6b3c; }
.carga__celula--amarelo { background: #fff4d9; border-color: #e8c47c; color: #7a5410; }
.carga__celula--vermelho { background: #fde8e8; border-color: #e9a3a3; color: #9c2525; }
.carga__celula--alocar { background: #f7f8fa; color: var(--suave); }
.carga__alocar th { background: #f7f8fa; }
.carga__capacidade { display: flex; flex-direction: column; gap: 6px; }
.carga__capacidade label { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--suave); }
.carga__capacidade input { height: 28px; padding: 0 8px; border: 1px solid var(--borda); border-radius: 3px; font: 12.5px var(--font-sans); }
.carga__capacidade div { display: flex; gap: 6px; }
.carga__capacidade .botao { height: 28px; padding: 0 10px; font-size: 12px; }
.carga__detalhe { padding: 10px 12px; border: 1px solid var(--borda); border-radius: var(--raio); background: #fff; }
.carga__detalhe header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.carga__detalhe ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.carga__detalhe li button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 8px; border: 1px solid #eef0f4; border-radius: 4px; background: #fff; font: 12.5px var(--font-sans); text-align: left; cursor: pointer; }
.carga__detalhe li button:hover { background: var(--canvas); }
```

- [ ] **Passo 6: Rodar e ver passar**

Run: `cd web && npx tsc -b && npx vitest run && CI=1 npx playwright test e2e/f4-carga.spec.ts e2e/f4.spec.ts`
Expected: PASS (4 testes novos; os 18 do `f4.spec.ts` continuam passando).

- [ ] **Passo 7: Commit**

```bash
git add web/src/telas/ProducaoCarga.tsx web/src/telas/Producao.tsx web/src/App.tsx web/src/styles/f4.css web/e2e/f4-carga.spec.ts
git commit -m "feat: visão Carga das oficinas por semana com capacidade editável por ADM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: "Incluir previstas" no Gantt e na Tabela e painel da OS prevista

**Files:**
- Modify: `web/src/telas/Producao.tsx` (filtro, barra tracejada, painel)
- Modify: `web/src/telas/ProducaoTabela.tsx` (colunas novas, filtro de etapa, etiqueta)
- Modify: `web/src/componentes/Legenda.tsx` (amostra "Prevista")
- Test: `web/e2e/f4-carga.spec.ts` (acrescentar)

**Interfaces:**
- Consumes: Tarefa 9 (`lerIncluirPrevistas`, `salvarIncluirPrevistas`, `tituloBarraPrevista`, `colunasVisiveis(ocultas, incluirPrevistas)`), Tarefa 10 (classes CSS e aviso).
- Produces:
  - Checkbox `Incluir previstas` (Gantt e Tabela; some na Carga), desligado por padrão e lembrado no navegador.
  - Gantt: linha `.gantt__linha--prevista`, etiqueta `.etiqueta-prevista` "prevista", barra `.gantt__barra--prevista` com `title` = `tituloBarraPrevista(p)`; sem datas, botão "Sem previsão".
  - `TabelaProducao({ lista, hojeIso, incluirPrevistas?, onAbrir })`: colunas "Etapa atual" (filtro por seleção) e "Chegada prevista"; etiqueta "prevista" na célula da OS.
  - Painel: seção `region` "Previsão da OS" (etapa atual, na etapa desde, chegada prevista, fim previsto); para OS prevista, a mensagem à oficina fica indisponível ("A mensagem para a oficina fica disponível quando a OS chegar à Costura.").
  - Aviso "Previsão sem histórico" também no Gantt/Tabela com previstas ligadas.

- [ ] **Passo 1: Escrever o E2E que falha**

Acrescente no fim de `web/e2e/f4-carga.spec.ts`:

```ts

test('Incluir previstas: Gantt com barra tracejada e Tabela com Etapa atual e Chegada prevista; escolha lembrada', async ({ page }) => {
  await entrar(page, { semHistorico: true });
  await expect(page.getByRole('button', { name: /OS 10015/ })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Previsão sem histórico' })).toHaveCount(0);
  await page.getByLabel('Incluir previstas').check();
  await expect(page.getByRole('status').filter({ hasText: 'Previsão sem histórico' })).toBeVisible();
  const barra = page.getByTitle('OS 10015 · prevista · 15. Preparação 1 · 28/10 a 03/11 · 60 pç');
  await expect(barra).toHaveClass(/gantt__barra--prevista/);
  await expect(page.locator('.gantt__linha--prevista .etiqueta-prevista').first()).toHaveText('prevista');
  // Indicadores da Costura não contam as previstas.
  await expect(page.getByText('OS na Costura').locator('..')).toContainText('2');

  await page.getByRole('group', { name: 'Visão' }).getByRole('button', { name: 'Tabela' }).click();
  await expect(page.getByRole('columnheader', { name: 'Etapa atual' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Chegada prevista' })).toBeVisible();
  const linha = page.locator('.producao-tabela tbody tr').filter({ hasText: '10015' });
  await expect(linha).toContainText('prevista');
  await expect(linha).toContainText('15. Preparação 1');
  await expect(linha).toContainText('28/10/2026');
  await page.getByLabel('Filtrar Etapa atual').selectOption('17. Costura');
  await expect(page.locator('.producao-tabela tbody tr td:first-child')).toHaveText(['20001', '20002']);

  await page.reload();
  await expect(page.getByLabel('Incluir previstas')).toBeChecked();
  await page.getByLabel('Incluir previstas').uncheck();
  await expect(page.getByRole('columnheader', { name: 'Etapa atual' })).toHaveCount(0);
});

test('painel da OS prevista mostra a etapa e as datas previstas e não oferece mensagem à oficina', async ({ page }) => {
  await entrar(page);
  await page.getByLabel('Incluir previstas').check();
  await page.getByRole('button', { name: /OS 10015/ }).first().click();
  const painel = page.getByRole('complementary', { name: 'Detalhes da OS 10015' });
  const previsao = painel.getByRole('region', { name: 'Previsão da OS' });
  await expect(previsao).toContainText('15. Preparação 1');
  await expect(previsao).toContainText('28/10');
  await expect(previsao).toContainText('03/11');
  await expect(painel).toContainText('A mensagem para a oficina fica disponível quando a OS chegar à Costura.');
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd web && CI=1 npx playwright test e2e/f4-carga.spec.ts`
Expected: FAIL nos 2 testes novos (não existe o checkbox "Incluir previstas").

- [ ] **Passo 3: Tela de produção**

Em `web/src/telas/Producao.tsx` (depois da Tarefa 10):

Troque

```tsx
import { lerAgrupamento, lerVisao, salvarAgrupamento, salvarVisao, type AgrupamentoGantt, type VisaoProducao } from '../regras/producaoTabela';
import { agruparPorOficina, chaveEnvioWhatsapp, filtrarProducoes, SITUACOES_PRAZO, type SituacaoPrazo, indicadoresProducao, janelaGantt, modeloMensagemProducao, ordenarPorEntrega, prazoProducao, resumoFaltasAviamentos, statusProducao, textoBarraProducao, tituloBarraProducao, validarMudancaProducao, type ModeloMensagemProducao } from '../regras/producao';
```

por

```tsx
import { lerAgrupamento, lerIncluirPrevistas, lerVisao, salvarAgrupamento, salvarIncluirPrevistas, salvarVisao, type AgrupamentoGantt, type VisaoProducao } from '../regras/producaoTabela';
import { agruparPorOficina, chaveEnvioWhatsapp, filtrarProducoes, SITUACOES_PRAZO, type SituacaoPrazo, indicadoresProducao, janelaGantt, modeloMensagemProducao, ordenarPorEntrega, prazoProducao, resumoFaltasAviamentos, statusProducao, textoBarraProducao, tituloBarraPrevista, tituloBarraProducao, validarMudancaProducao, type ModeloMensagemProducao } from '../regras/producao';
```

Troque

```tsx
        <a className="producao-link" href={`https://app10.ploomes.com/deal/${item.dealId}`} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
```

por

```tsx
        {item.prevista && <section className="producao-secao producao-previsao" aria-label="Previsão da OS">
          <h3>OS prevista <em className="etiqueta-prevista">prevista</em></h3>
          <div className="producao-resumo">
            <div><span>Etapa atual</span><strong>{item.etapaNome || '—'}</strong></div>
            <div><span>Na etapa desde</span><strong>{ddmm(item.etapaInicio ?? '') || '—'}</strong></div>
            <div><span>Chegada prevista à Costura</span><strong>{ddmm(item.inicioCosturaPrevisto ?? '') || '—'}</strong></div>
            <div><span>Fim previsto da Costura</span><strong>{ddmm(item.fimCosturaPrevisto ?? '') || '—'}</strong></div>
          </div>
          {!item.inicioCosturaPrevisto && <p className="producao-vazio">OS sem peças informadas: sem previsão a partir do Corte.</p>}
        </section>}
        <a className="producao-link" href={`https://app10.ploomes.com/deal/${item.dealId}`} target="_blank" rel="noreferrer">Abrir card no Ploomes</a>
```

Troque

```tsx
          <h3>Mensagem para a oficina</h3>
          {!item.oficinaId ? <p className="producao-vazio">Aloque uma oficina antes de preparar a mensagem.</p>
```

por

```tsx
          <h3>Mensagem para a oficina</h3>
          {item.prevista ? <p className="producao-vazio">A mensagem para a oficina fica disponível quando a OS chegar à Costura.</p>
            : !item.oficinaId ? <p className="producao-vazio">Aloque uma oficina antes de preparar a mensagem.</p>
```

Troque

```tsx
  const [aberta, setAberta] = useState<string | null>(null);
  const hojeIso = diaIso(hoje);
```

por

```tsx
  const [aberta, setAberta] = useState<string | null>(null);
  const [incluirPrevistas, setIncluirPrevistas] = useState(lerIncluirPrevistas);
  const hojeIso = diaIso(hoje);
```

Troque

```tsx
  const filtradas = useMemo(() => filtrarProducoes(producao, { busca: q, oficinaId, soComFalta, situacao, hoje: hojeIso }), [producao, q, oficinaId, soComFalta, situacao, hojeIso]);
```

por

```tsx
  const filtradas = useMemo(() => filtrarProducoes(producao, { busca: q, oficinaId, soComFalta, situacao, hoje: hojeIso, incluirPrevistas }), [producao, q, oficinaId, soComFalta, situacao, hojeIso, incluirPrevistas]);
```

Troque

```tsx
  const trocarAgrupamento = (a: AgrupamentoGantt) => { setAgrupamento(a); salvarAgrupamento(a); };
```

por

```tsx
  const trocarAgrupamento = (a: AgrupamentoGantt) => { setAgrupamento(a); salvarAgrupamento(a); };
  const trocarPrevistas = (v: boolean) => { setIncluirPrevistas(v); salvarIncluirPrevistas(v); };
```

Troque

```tsx
  const linhaGantt = (p: ProducaoItem, comOficina: boolean) => {
    const prazo = prazoProducao(p);
```

por

```tsx
  const linhaGantt = (p: ProducaoItem, comOficina: boolean) => {
    if (p.prevista) return linhaPrevista(p, comOficina);
    const prazo = prazoProducao(p);
```

Troque

```tsx
  return <div className="producao-tela">
```

por

```tsx
  // OS prevista: barra tracejada da chegada prevista ao fim previsto, com a etiqueta "prevista".
  const linhaPrevista = (p: ProducaoItem, comOficina: boolean) => {
    const ini = p.inicioCosturaPrevisto ?? '';
    const fim = p.fimCosturaPrevisto ?? '';
    const esquerda = ini ? Math.max(0, indiceDia(ini, janela.inicio)) * LARGURA_DIA : 0;
    const largura = ini && fim ? Math.max(16, (Math.min(janela.dias - 1, indiceDia(fim, janela.inicio)) - Math.max(0, indiceDia(ini, janela.inicio)) + 1) * LARGURA_DIA - 6) : 14;
    return <div className="gantt__linha gantt__linha--prevista" key={p.dealId}>
      <button className="gantt__os gantt__fixo" type="button" onClick={() => setAberta(p.dealId)}><strong>OS {p.os}</strong>
        <span className="gantt__os-texto"><span>{p.peca || p.referencia || 'Sem descrição'}</span>{comOficina && <span className={`gantt__oficina ${p.oficina === 'ALOCAR' ? 'gantt__oficina--alocar' : ''}`}>{p.oficina || 'Sem oficina'}</span>}</span>
        <em className="etiqueta-prevista">prevista</em></button>
      <div className="gantt__pista" style={{ width: janela.dias * LARGURA_DIA }}>
        {ini && fim ? <button type="button" onClick={() => setAberta(p.dealId)} title={tituloBarraPrevista(p)}
          className="gantt__barra gantt__barra--prevista" style={{ left: esquerda + 3, width: largura }}><span>{textoBarraProducao(p)}</span></button>
          : <button type="button" className="gantt__sem-prazo" onClick={() => setAberta(p.dealId)}>Sem previsão</button>}
      </div>
    </div>;
  };

  return <div className="producao-tela">
```

Troque

```tsx
      <label className="producao-check"><input type="checkbox" checked={soComFalta} onChange={(e) => setSoComFalta(e.target.checked)} /> Só com falta na costura</label>
```

por

```tsx
      <label className="producao-check"><input type="checkbox" checked={soComFalta} onChange={(e) => setSoComFalta(e.target.checked)} /> Só com falta na costura</label>
      {visao !== 'CARGA' && <label className="producao-check"><input type="checkbox" checked={incluirPrevistas} onChange={(e) => trocarPrevistas(e.target.checked)} /> Incluir previstas</label>}
```

Troque

```tsx
    {visao === 'CARGA' && board.previsaoSemHistorico && <p className="producao-aviso" role="status">Previsão sem histórico: as OS previstas usam duração de 1 dia por etapa e fila zero até o cálculo diário das médias.</p>}
```

por

```tsx
    {(visao === 'CARGA' || incluirPrevistas) && board.previsaoSemHistorico && <p className="producao-aviso" role="status">Previsão sem histórico: as OS previstas usam duração de 1 dia por etapa e fila zero até o cálculo diário das médias.</p>}
```

Troque

```tsx
      : visao === 'TABELA' ? <TabelaProducao lista={ordemGantt} hojeIso={hojeIso} onAbrir={setAberta} /> : <div className="gantt__rolagem">
```

por

```tsx
      : visao === 'TABELA' ? <TabelaProducao lista={ordemGantt} hojeIso={hojeIso} incluirPrevistas={incluirPrevistas} onAbrir={setAberta} /> : <div className="gantt__rolagem">
```


- [ ] **Passo 4: Tabela**

Em `web/src/telas/ProducaoTabela.tsx`:

Troque

```tsx
export function TabelaProducao({ lista, hojeIso, onAbrir }: { lista: Producao[]; hojeIso: string; onAbrir: (dealId: string) => void }) {
```

por

```tsx
export function TabelaProducao({ lista, hojeIso, incluirPrevistas = false, onAbrir }: { lista: Producao[]; hojeIso: string; incluirPrevistas?: boolean; onAbrir: (dealId: string) => void }) {
```

Troque

```tsx
  const colunas = colunasVisiveis(ocultas);
  const oficinas = useMemo(() => [...new Set(lista.map((p) => p.oficina))], [lista]);
```

por

```tsx
  const colunas = colunasVisiveis(ocultas, incluirPrevistas);
  const oficinas = useMemo(() => [...new Set(lista.map((p) => p.oficina))], [lista]);
  const etapas = useMemo(() => [...new Set(linhas.map((l) => l.valores.etapa.exibir).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })), [linhas]);
```

Troque

```tsx
        <div>{COLUNAS_PRODUCAO.map((c) => <label key={c.id}>
```

por

```tsx
        <div>{COLUNAS_PRODUCAO.filter((c) => incluirPrevistas || !c.soPrevistas).map((c) => <label key={c.id}>
```

Troque

```tsx
              : c.id === 'situacao' ? <select aria-label={`Filtrar ${c.titulo}`} value={filtros.situacao ?? ''} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value })}>
                <option value="">Todas</option>{SITUACOES_PRAZO.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select>
```

por

```tsx
              : c.id === 'situacao' ? <select aria-label={`Filtrar ${c.titulo}`} value={filtros.situacao ?? ''} onChange={(e) => setFiltros({ ...filtros, situacao: e.target.value })}>
                <option value="">Todas</option>{SITUACOES_PRAZO.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select>
              : c.id === 'etapa' ? <select aria-label={`Filtrar ${c.titulo}`} value={filtros.etapa ?? ''} onChange={(e) => setFiltros({ ...filtros, etapa: e.target.value })}>
                <option value="">Todas</option>{etapas.map((e) => <option key={e} value={e}>{e}</option>)}</select>
```

Troque

```tsx
            {l.valores[c.id].exibir || '—'}</td>)}
```

por

```tsx
            {l.valores[c.id].exibir || '—'}
            {c.id === 'os' && l.item.prevista && <em className="etiqueta-prevista">prevista</em>}</td>)}
```


- [ ] **Passo 5: Legenda**

Em `web/src/componentes/Legenda.tsx`, logo depois da linha da amostra "Sem início", acrescente:

```tsx
      <span title="OS ainda antes da Costura (Encaixe a Primeira Peça), com a Costura prevista pelo histórico"><i className="legenda__barra gantt__barra gantt__barra--prevista" />Prevista</span>
```

- [ ] **Passo 6: Rodar e ver passar**

Run: `cd web && npx tsc -b && npx vitest run && CI=1 npx playwright test e2e/f4-carga.spec.ts e2e/f4.spec.ts`
Expected: PASS (6 testes em `f4-carga.spec.ts`; `f4.spec.ts` intacto: sem a opção ligada, nada muda no Gantt e na Tabela).

- [ ] **Passo 7: Revisão de boas práticas React** dos TSX alterados nas Tarefas 10 e 11 (foco, rótulos, chaves de lista, `useMemo` com dependências completas, nada de largura fixa no conteúdo empurrado pelo painel). Corrija os achados antes do commit.

- [ ] **Passo 8: Commit**

```bash
git add web/src/telas/Producao.tsx web/src/telas/ProducaoTabela.tsx web/src/componentes/Legenda.tsx web/e2e/f4-carga.spec.ts
git commit -m "feat: filtro Incluir previstas no Gantt e na Tabela e painel da OS prevista

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 12: Simulador com OS previstas, MOCK_FOTO coerente e E2E contra o mock

**Files:**
- Modify: `web/scripts/mock-api.mjs`
- Test: `web/e2e/mock-servidor.spec.ts` (acrescentar)

**Interfaces:**
- Consumes: Tarefas 6, 7, 10 e 11.
- Produces:
  - Mock com duas OS previstas fictícias (`700009` na OFICINA SOL, etapa 15; `700010` ALOCAR, etapa 13), `previsaoSemHistorico` (`MOCK_SEM_HISTORICO=1` liga o aviso).
  - `MOCK_FOTO`: as previstas vêm da foto com a projeção do servidor; só as OS da Costura ficam editáveis; `previsaoSemHistorico` da foto; a mensagem simulada sem associação usa uma OS da Costura; o log informa quantas são previstas. A foto continua fora do repositório.

- [ ] **Passo 1: Escrever o E2E que falha**

Acrescente no fim de `web/e2e/mock-servidor.spec.ts`:

```ts
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `cd web && CI=1 npx playwright test e2e/mock-servidor.spec.ts -g "Carga"`
Expected: FAIL (a faixa "A alocar" não tem a OS prevista `1 OS · 120 pç`).

- [ ] **Passo 3: Implementar**

Em `web/scripts/mock-api.mjs`:

Troque

```js
        { id: 'MSG-H-FILA', quando: new Date(Date.now() - 1_200_000).toISOString(), participanteNome: 'PCP Teste', direcao: 'ENVIADA', texto: 'Bom dia. A entrega de *PECA TESTE H*, 45 peças, está prevista para a data combinada. Segue dentro do prazo?', associacao: 'MANUAL', statusEnvio: 'PENDENTE', tipoConteudo: 'TEXTO', envioTentativas: 2 }
      ], sugestoes: [], historico: [] }
  ]
};
```

por

```js
        { id: 'MSG-H-FILA', quando: new Date(Date.now() - 1_200_000).toISOString(), participanteNome: 'PCP Teste', direcao: 'ENVIADA', texto: 'Bom dia. A entrega de *PECA TESTE H*, 45 peças, está prevista para a data combinada. Segue dentro do prazo?', associacao: 'MANUAL', statusEnvio: 'PENDENTE', tipoConteudo: 'TEXTO', envioTentativas: 2 }
      ], sugestoes: [], historico: [] },
    // OS previstas (19/10): ainda nas etapas 12 a 16; a Costura projetada vem do servidor.
    { dealId: '700009', os: '90009', oficinaId: 'OF-01', oficina: 'OFICINA SOL', inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 200, valorCorte: null, cliente: 'CLIENTE GAMA', peca: 'PECA TESTE I', referencia: 'REF-09', versao: 'v1',
      prevista: true, etapaOrdem: 15, etapaNome: '15. Preparação 1', etapaInicio: diaIso(-1), inicioCosturaPrevisto: diaIso(5), fimCosturaPrevisto: diaIso(12), mensagens: [], sugestoes: [], historico: [] },
    { dealId: '700010', os: '90010', oficinaId: '', oficina: 'ALOCAR', inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 120, valorCorte: null, cliente: 'CLIENTE ALFA', peca: 'PECA TESTE J', referencia: 'REF-10', versao: 'v1',
      prevista: true, etapaOrdem: 13, etapaNome: '13. Estratégico 2', etapaInicio: '', inicioCosturaPrevisto: diaIso(9), fimCosturaPrevisto: diaIso(15), mensagens: [], sugestoes: [], historico: [] }
  ],
  // MOCK_SEM_HISTORICO=1 simula a PREVISAO_MEDIAS ainda vazia.
  previsaoSemHistorico: !!process.env.MOCK_SEM_HISTORICO
};
```

Troque

```js
  estado.dealsProducaoEditaveis = estado.producao.map((p) => p.dealId);
  estado.oficinas = foto.oficinas;
```

por

```js
  // As previstas (etapas 12 a 16) vêm na foto com a projeção do servidor; só as da Costura ficam editáveis.
  estado.dealsProducaoEditaveis = estado.producao.filter((p) => !p.prevista).map((p) => p.dealId);
  estado.oficinas = foto.oficinas;
  estado.previsaoSemHistorico = !!foto.previsaoSemHistorico;
```

Troque

```js
  const comOficina = estado.producao.find((p) => p.oficinaId && p.oficina.toUpperCase() !== 'ALOCAR');
```

por

```js
  const comOficina = estado.producao.find((p) => !p.prevista && p.oficinaId && p.oficina.toUpperCase() !== 'ALOCAR');
```

Troque

```js
  console.log(`[mock] foto carregada: ${estado.producao.length} OS, ${estado.caixas.length} caixas (geradoEm ${foto.geradoEm})`);
```

por

```js
  const previstas = estado.producao.filter((p) => p.prevista).length;
  console.log(`[mock] foto carregada: ${estado.producao.length} OS (${previstas} previstas), ${estado.caixas.length} caixas (geradoEm ${foto.geradoEm})`);
```

Troque

```js
    dealsProducaoEditaveis: estado.dealsProducaoEditaveis,
    oficinas: estado.oficinas,
```

por

```js
    dealsProducaoEditaveis: estado.dealsProducaoEditaveis,
    oficinas: estado.oficinas,
    previsaoSemHistorico: estado.previsaoSemHistorico,
```


- [ ] **Passo 4: Rodar e ver passar**

Run: `cd web && CI=1 npx playwright test e2e/mock-servidor.spec.ts`
Expected: PASS (10 testes).

- [ ] **Passo 5: Conferência manual do simulador**

Run: `cd web && node scripts/dev-mock.mjs` e abra http://localhost:5174/pcp-mrbl/#producao (qualquer login). Confira: Gantt sem previstas; "Incluir previstas" mostra as barras tracejadas de 90009 e 90010; Carga com OFICINA SOL (300 pç/semana) e "A alocar"; editar a capacidade da OFICINA LUA. Repita com `MOCK_SEM_HISTORICO=1` para ver o aviso. Pare o simulador.

- [ ] **Passo 6: Commit**

```bash
git add web/scripts/mock-api.mjs web/e2e/mock-servidor.spec.ts
git commit -m "feat: simulador com OS previstas e foto coerente com a visão de futuro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 13: Roteiro de publicação e revisão final da branch

**Files:**
- Modify: `n8n/workflows/README.md`

**Interfaces:**
- Consumes: tudo acima.
- Produces: roteiro com a aba nova, as colunas novas, as FieldKeys a configurar e a ordem de publicação; branch revisada e verde, pronta para mostrar ao dono.

- [ ] **Passo 1: Atualizar o README**

Em `n8n/workflows/README.md`, na seção "Preparação da F4":

1. No parágrafo em destaque ("**Obrigatório antes de publicar qualquer API desta branch…**"), troque "crie as abas **PRODUCAO**, **OFICINAS**, **WHATSAPP_MENSAGENS** e **WHATSAPP_SUGESTOES**" por "crie as abas **PRODUCAO**, **OFICINAS**, **WHATSAPP_MENSAGENS**, **WHATSAPP_SUGESTOES** e **PREVISAO_MEDIAS**" e "já lê essas quatro abas" por "já lê essas cinco abas".
2. No fim do item **PRODUCAO**, acrescente: `Visão de futuro (19/10): mais seis colunas no fim, nesta ordem e depois de valor_corte: etapa_ordem | etapa_nome | etapa_inicio | prevista | inicio_costura_previsto | fim_costura_previsto. A OS na Costura fica em_costura = SIM e prevista = NAO; a OS das etapas 12 a 16 fica em_costura = NAO e prevista = SIM. Crie-as antes de publicar o Sincronizar Produção: o sync grava todas e recusa a gravação inteira se faltar uma.`
3. No fim do item **OFICINAS**, acrescente: `Visão de futuro (19/10): capacidade_semana no fim (depois de atualizado_em), em peças por semana; vazio = sem capacidade. Só a ação alterar_capacidade_oficina (ADM) grava essa coluna; o sync não mexe nela.`
4. Acrescente o item novo:
   `- **PREVISAO_MEDIAS** (19/10): tipo | etapa | faixa | oficina_id | valor | amostra | calculado_em | chave. Gravada só pelo workflow PCP MRBL - Médias de Previsão. chave = tipo|etapa|faixa|oficina_id (a linha é casada por ela). tipo: DURACAO (etapa, faixa), DURACAO_GERAL, DURACAO_PCP, FILA (etapa, faixa; vale só com amostra >= 5), FILA_GERAL, COSTURA_OFICINA (17, faixa, oficina_id). Chave que sumiu do cálculo fica com valor vazio e amostra 0: nunca ordene nem apague linhas. Aba só com o cabeçalho funciona (a tela avisa "Previsão sem histórico").`
5. Depois do parágrafo do "PCP MRBL - Retentar Interpretação", acrescente a subseção:

```markdown
**Visão de futuro e carga das oficinas (19/10).** O motor de previsão (`n8n/src/previsao.js`) reimplementa a regra do BI do dono. O workflow novo **PCP MRBL - Médias de Previsão** (`workflows/json/pcp-medias-previsao.json`) roda todo dia às 3h (fuso de São Paulo): lê todos os registros de interação com o marcador 60151285 e os negócios dos funis PCP (60011710) e Produção (60015827), calcula durações, filas e a Costura por oficina e grava a `PREVISAO_MEDIAS`. Falha de leitura, página inválida ou nenhum registro reconhecido: nada é gravado (as médias anteriores ficam) e vai uma linha `medias_previsao` para o `ERROS_APP`. O **Sincronizar Produção** passa a ler também as OS em aberto desses dois funis (node **Buscar Previstas no Ploomes**), filtra as etapas 12 a 16 pelo número no nome do estágio (12 e 13 só com "PCP completo pelo Ploomes?" = sim) e grava a chegada e o fim previstos da Costura nas colunas novas da `PRODUCAO`.

Marcadores `CONFIGURAR_*` em `n8n/src/previsao.js` (não são segredo; trocar pelas chaves reais na homologação, rodar `npm test && npm run build` e commitar): `CAMPO_PECAS_PEDIDO`, `CAMPO_PCP_COMPLETO`, `CAMPO_REGISTRO_INICIO`, `CAMPO_REGISTRO_TERMINO` e `CAMPOS_ENTRADA_ETAPA` (12 a 16). Enquanto houver marcador, o campo é lido como vazio: nenhuma OS das etapas 12 e 13 entra, a previsão usa o fallback (duração 1, fila 0) e o Médias de Previsão só registra o aviso. Conferir também, numa leitura real, o formato do texto dos registros (onde fica o número da etapa; o parser é `etapaDoTextoRegistro`) e se o filtro `Tags/any(t: t/TagId eq 60151285)` é aceito pelo Ploomes.

**Ordem de publicação da visão de futuro, depois do aceite do dono:**

0. **Planilha:** crie a aba `PREVISAO_MEDIAS` (só o cabeçalho), as seis colunas novas no fim da `PRODUCAO` e `capacidade_semana` no fim da `OFICINAS`, sem reordenar nada. O board e o sync leem a aba nova: sem ela, o `batchGet` dá 400.
1. **Homologação dos campos:** numa leitura real (sem gravar), confirme o texto dos registros marcados e as FieldKeys; troque os `CONFIGURAR_*`, rode os testes e o build e commite.
2. **Conferência com o BI (fora do repositório):** calcule a previsão de 5 OS reais e compare com o BI do dono antes de seguir.
3. **PCP MRBL - Médias de Previsão:** crie a partir do JSON (commit fixo), execute uma vez à mão, confira a `PREVISAO_MEDIAS` e só então ative.
4. **PCP MRBL - Sincronizar Produção:** republique com o JSON novo (passa a ter 12 nodes).
5. **API:** homologação (`dI2NUYzxfApYM8iA`) e, com o ok do dono, produção (`WpuXpcSa5oGiEkTm`).
6. **Site:** merge na `main` e push; peça para todo mundo recarregar.

Rollback: volte API, sync e site juntos e desative o Médias de Previsão. As colunas e a aba novas podem ficar (as versões anteriores não as leem).
```

6. Na seção "F. Regras permanentes da planilha", acrescente: `- A PREVISAO_MEDIAS é só do workflow de médias: não edite à mão, não ordene e não apague linhas.`

- [ ] **Passo 2: Suítes completas**

Run:
- `cd n8n && npm test && npm run build`
- `cd web && npm test && npm run build`
- `cd web && CI=1 npx playwright test`

Expected: tudo verde; `git status` sem gerados pendentes depois do build.

- [ ] **Passo 3: Revisão final contra o spec** — confira item a item (seções 2 a 7 do spec), `DEALS_PRODUCAO_EDITAVEIS` ainda `['0']`, nenhum dado real em testes/mock/README, nenhum `let`/`const`/arrow em `n8n/src` e `n8n/adaptadores` (`grep -nE "\b(let|const)\b|=>" n8n/src/*.js n8n/adaptadores/*.js` só pode achar texto em comentário ou string), colunas novas sempre no fim, nenhuma operação de apagar/ordenar linhas. Corrija os achados e repita as suítes.

- [ ] **Passo 4: Commit**

```bash
git add n8n/workflows/README.md
git commit -m "docs: roteiro de publicação da visão de futuro e carga das oficinas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Passo 5: Mostrar ao dono** — suba o simulador (`cd web && node scripts/dev-mock.mjs`), entregue a URL e um roteiro curto (Carga, cores, clique na célula, capacidade, Incluir previstas). Junte os ajustes numa rodada só. Nenhuma publicação nesta tarefa.

## Definição de pronto

- Seções 3 a 7 do spec cobertas por testes (funções puras, conferência com o histórico fictício, E2E da Carga e de "Incluir previstas").
- `n8n` e `web` verdes (unitários, build e Playwright), gerados commitados.
- Roteiro atualizado; nenhuma publicação feita; dono viu no simulador local.
