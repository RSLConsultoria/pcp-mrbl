# F3: Solicitações de faltas e Saídas com falta (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Spec:** `docs/superpowers/specs/2026-10-08-f3-pedidos-e-saidas-design.md`. Os textos, contratos e regras da spec valem literalmente. Este plano define só a divisão e a ordem.

## Global Constraints

- O repositório é **público**: só dados fictícios, nenhum segredo.
- O n8n segue o padrão de `n8n/src`: JS puro, sem import/export, testado com `node:test` via `test/carregar.js`. O build gera os Code nodes.
- Restrição de edição: `DEALS_EDITAVEIS = ['607479158']` (403 para qualquer outro negócio envolvido) e envio ao Ploomes com `DEALS_PERMITIDOS = ['607479158']`. Nada é testado fora da OS de teste.
- Escrita no Sheets sempre com `cellFormat: RAW`. A chave de casamento vai sempre na linha.
- Visual: a direção de `web/src/styles/app.css` (No Ploomes). Ouro só no botão principal. Sem monoespaçada.
- Front: React 19 + TS estrito + erasableSyntaxOnly. Precisam passar `npm test`, `npm run build` e `npm run e2e`.
- **Não publicar** nada (n8n e site) antes da conferência local com o dono.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tarefas

1. **Preparar planilha** (controlador, via MCP)
   - Criar as abas PEDIDOS, PEDIDOS_ITENS e ETAPAS_PEDIDO com cabeçalho. ETAPAS_PEDIDO já leva as 4 etapas padrão.
   - Criar as colunas `tratativa` e `tratativa_em` na CAIXAS_PCP.
2. **n8n: operações genéricas e ações da F3** (`n8n/src/pedidos.js` e refatoração de `acoes.js`/`api.js`)
   - `aplicarAcao` passa a devolver `operacoes[]` e `historicos[]`. A F2 continua com os mesmos efeitos.
   - Entram as 7 ações novas com as validações da spec.
   - TDD.
3. **n8n: board da F3** (`montarCaixas.js`/`api.js`)
   - pedidos, etapasPedido, `item.pedidoId`, `caixa.tratativa`, finalizado.
   - TDD.
4. **n8n: workflows**
   - Adaptadores, gerador SDK e rascunhos no n8n, **sem publicar**.
   - O ramo de ação aplica `operacoes[]` agrupadas (Switch por aba/operação) e acrescenta `historicos[]`.
   - O board lê as abas novas.
5. **Web: tipos, regras e cliente da F3**
   - Tipos de Pedido/Etapa, ações novas e `colunaSaida(caixa, pedidos, etapas)`.
   - Filtros de pedidos, `resumoAlteracoes`, `validarEtapas`.
   - TDD.
6. **Web: tela Saídas com falta**
   - Guia ativa, quadro de 5 colunas, card, painel com as 3 ações e o histórico.
7. **Web: tela Solicitações de faltas**
   - Lista à esquerda com seleção, quadro com arraste, janela Gerar pedido, painel do pedido com resumo, janela Etapas do quadro e Dar baixa.
8. **e2e da F3 e servidor simulado para conferência local**
   - `web/e2e/f3.spec.ts`.
   - Servidor simulado completo da F3 em `web/scripts/mock-api.mjs` (dados fictícios), com o comando `npm run dev:mock`.
9. **Conferência local com o dono, depois publicação na ordem certa**
   - n8n primeiro, depois o merge.
   - Teste real só na OS de teste: card ganho pela API e Sync Caixas Ganhas rodado uma vez.
