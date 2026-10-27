# F5b · Insights do dia — plano

Spec: `docs/superpowers/specs/2026-10-27-f5b-insights-do-dia-design.md`. Só `web/`; nada de n8n, endpoint novo ou gravação.

## Tarefa 1 — Regras puras (`web/src/regras/insights.ts`)
TDD em `insights.test.ts`, com o dia como 'aaaa-mm-dd' e o "agora" como Date (cobrança):
- `prazosEstourando(producao, hoje)`: OS na Costura (sem `prevista`), prazo vigente (`prazoProducao`) vencido ou em até 3 dias; texto "venceu há N dias" / "vence hoje" / "vence em N dias"; mais atrasada primeiro, empate pela OS.
- `caixasParadas(caixas, hoje)`: algum item com resta > 0, não saiu, registrada há 7 dias ou mais; mais antiga primeiro, empate pela OS e pelo tipo.
- `oficinasComAtraso(producao, hoje)`: soma dos dias de atraso das vencidas, por oficina, sem ALOCAR nem OS sem oficina; maior soma primeiro, top 5.
- `cobrancasSemResposta(producao, agora)`: última mensagem da conversa é ENVIADA com status ENVIADA há mais de 24 h; quem espera há mais tempo primeiro.
- `insightsDoDia(board, agora)` junta os quatro e `resumoInsights` monta a linha recolhida.
- Limites: 3 dias (entra) / 4 (fora); 7 dias (entra) / 6 (fora); 24 h (fora) / 24 h + 1 min (entra); previstas, ALOCAR e caixa que saiu fora; empates.

## Tarefa 2 — Preferência aberta/recolhida
`lerInsightsAbertos` / `salvarInsightsAbertos` com try/catch (padrão recolhida). Teste com localStorage que lança.

## Tarefa 3 — Componente `FaixaInsights`
Linha de resumo (botão "Ver insights"/"Recolher"); aberta, 4 cartões com título, contagem, até 5 linhas e "ver todas (N)". Linhas 1, 2 e 4 são links para `#peca/<OS>`; a de oficina chama `onOficina(oficinaId)`. CSS em `f5.css`: grade de 4 colunas, empilha em tela estreita, sem rolagem horizontal em 375 px.

## Tarefa 4 — Moldura
`App.tsx`: faixa logo abaixo da navbar em todas as telas. Clique de oficina vai ao Controle de produção com `oficinaId` aplicado (prop com sequência, para valer também quando a guia já está aberta), limpando a busca e os demais filtros da produção.

## Tarefa 5 — Simulador
`mock-api.mjs`: OS vencida numa oficina real e OS com cobrança enviada há 2 dias sem resposta, para os 4 cartões acenderem (prazo e caixas paradas já acendem).

## Tarefa 6 — E2E (`e2e/f5b-insights.spec.ts`)
Recolhida por padrão; abre e fica lembrada após recarregar; clique leva a `#peca/<OS>`; cartão de oficina filtra a produção; 375 px sem rolagem horizontal.

## Verificação
`cd web && npx vitest run && npm run build && CI=1 npx playwright test`.
