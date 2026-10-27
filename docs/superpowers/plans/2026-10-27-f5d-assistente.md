# F5d · Assistente — plano

Spec: `docs/superpowers/specs/2026-10-27-f5d-assistente-design.md` (fonte da verdade). Tarefas pequenas, testes primeiro, um commit por tarefa.

## Restrições globais
- pt-BR em commits, comentários e interface. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Repositório público: só dados fictícios (OS 9000x, deals 7000x, oficinas "OFICINA SOL/LUA/MAR").
- `n8n/src` e `n8n/adaptadores`: ES5 puro (sem arrow, template string, `const`/`let`, import/export). Depois de mexer: `cd n8n && npm test && npm run build` e commitar `n8n/build`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json`.
- Nada é publicado no n8n, na planilha, no Ploomes, no WhatsApp ou no Groq nesta entrega. Nada grava na planilha: o assistente não tem histórico no servidor.
- O modelo nunca recebe uma ferramenta que envia ou grava. O envio só nasce do clique em "Confirmar e enviar (N)", pela ação `enviar_whatsapp` de hoje (mesma chave, fila e tela otimista).

## Decisões de desenho (além do spec)
- **Protocolo** (site ↔ `pcp-assistente`): `POST { hoje: 'aaaa-mm-dd', mensagens: [...] }` com `Authorization: Bearer <token>` como os outros webhooks (o `token` no corpo também é aceito). Mensagens: `{ papel: 'usuario', texto }`, `{ papel: 'assistente', texto }`, `{ papel: 'assistente', chamadas: [{ id, nome, argumentos }] }` (argumentos = objeto) e `{ papel: 'ferramenta', id, nome, resultado }` (resultado = texto JSON). Resposta 200: `{ texto }` ou `{ chamadas }`. Erros: 400 (pedido inválido), 401, 429, 502.
- **Últimas 20 mensagens**: depois do corte, as do começo que não são do usuário saem (uma resposta de ferramenta sem a chamada derruba o pedido no Groq). Texto do usuário e do assistente até 2000 caracteres; resultado de ferramenta até 6000.
- **Limite 30/h**: conta só pedidos válidos (sessão e corpo ok), por e-mail da sessão, no static data do workflow da API (`estado.assistente`), janela deslizante de 1 h.
- **Modelo**: `openai/gpt-oss-120b` (o mesmo dos intérpretes), `temperature 0.2`, `reasoning_effort low`, `tool_choice auto`, `max_completion_tokens 1200`. Até 5 chamadas por resposta (as de mais são cortadas).
- **Credencial Groq**: o id fica numa constante só (`n8n/scripts/credenciais.js`, `ID_CREDENCIAL_GROQ`, marcador `CONFIGURAR_CREDENCIAL_GROQ` até o dono pôr o id real, que não é segredo). Vale para o intérprete de e-mails e para a API: com o id no repositório, o deploy da API não volta o marcador.
- **Hoje**: o site manda o dia de São Paulo; data inválida → o servidor usa a de São Paulo (UTC−3).
- **Ferramentas reaproveitam as regras**: `prazosEstourando` e `caixasParadas` (Insights) ganham um parâmetro opcional de dias (padrão 3 e 7); `cobrancasSemResposta`, `statusProducao`/`prazoProducao`, `modeloMensagemProducao`, `etapaFinal`, `quemDoPedido`, `itensAbertos`, `normalizar`.
- **`listar_atrasadas` e alvo `atrasadas`** usam a mesma regra (vencidas e até `dias_ate_vencer`, padrão 3). `todas` = todas as OS na Costura; `oficinas` = todas as OS das oficinas pedidas (nome sem acento, contido). `oficinas` também filtra os outros alvos.
- **Cartão de cobrança**: no máximo 30 linhas (como as ferramentas), com "mostrando 30 de N". Travas, nesta ordem: sem oficina/ALOCAR ("Sem oficina alocada"), oficina sem grupo ("Oficina sem grupo de WhatsApp"), fora de `dealsProducaoEditaveis` quando a lista não está vazia ("Edição liberada em breve para esta OS"). No Confirmar, cada linha é conferida de novo no board atual (versão de agora; OS que saiu da Costura ou ficou travada é pulada). Texto vazio ou com mais de 1500 caracteres bloqueia o Confirmar com aviso.
- **Laço**: no máximo 5 chamadas de ferramenta por pergunta; se o modelo pedir mais, o site para e responde "Parei aqui: essa pergunta pediu consultas demais. Tente algo mais específico." Erro do servidor: a pergunta fica na conversa, o que veio no meio é descartado e aparece "Não consegui responder agora. Tente de novo." (429 mostra a mensagem do servidor; 401 sai do app). O pedido ao assistente espera até 45 s.
- **Links de OS**: números de 4 a 9 dígitos que são OS do board (caixas ou produção) viram link para `#peca/<OS>`.
- **Painel**: fica montado e só se esconde ao fechar (a conversa continua até recarregar ou sair). A moldura vira uma linha: app à esquerda, painel de 380 px à direita; até 720 px o painel cobre a tela.
- **Simulador**: oficina fictícia OFICINA MAR (com grupo) e OS 90013 (venceu ontem) e 90014 (vence em 2 dias), editáveis, para "Cobrar as atrasadas" ter linhas enviáveis e travadas.

## Tarefa 1 — Lógica do assistente no n8n (`n8n/src/assistente.js`)
Teste `n8n/test/assistente.test.js` primeiro: `FERRAMENTAS_ASSISTENTE` (8 nomes do spec, sem nenhuma que envie/grave; esquema JSON de cada uma), `INSTRUCOES_ASSISTENTE`, `mensagensGroqAssistente` (conversão para o formato do Groq, corte em 20 com início no usuário, cortes de texto e de resultado), `pedidoGroqAssistente(mensagens, hoje)`, `validarPedidoAssistente(estado, cabecalho, corpo, agora)` (401 sem sessão; 400 em corpo inválido, papel desconhecido, chamada com nome fora da lista, última mensagem do assistente; 429 na 31ª em 1 h e volta depois da janela; por usuário), `respostaGroqAssistente(resposta)` (`{ texto }`, `{ chamadas }`, nome desconhecido, argumentos que não são JSON/objeto, status do Groq ≠ 200, resposta vazia → 502 amigável). `carregar.js` e `gerar-code-nodes.js` ganham o arquivo.

## Tarefa 2 — Webhook `pcp-assistente` na API (produção e homolog)
`adaptadores/validar-assistente.js` e `adaptadores/montar-resposta-assistente.js`; `scripts/credenciais.js` (`ID_CREDENCIAL_GROQ`, usado também pelo intérprete de e-mails). Ramo: **Assistente** (POST `pcp-assistente` / `pcp-assistente-h`) → **Validar Assistente** → **Assistente Pronto?** → sim: **Responder Assistente**; não: **Chamar Groq (Assistente)** (HTTP, `groqApi`, resposta completa sem erro, 40 s, segue em falha) → **Montar Resposta do Assistente** → **Responder Assistente**. Teste `workflow-assistente.test.js`: estrutura, ligações, credencial (marcador ou id), nenhum Google Sheets no ramo, adaptadores rodando com `$` falso (401, 429, pronto → corpo do Groq, resposta → `{ texto }`/`{ chamadas }`/502).

## Tarefa 3 — Ferramentas puras no site (`web/src/regras/assistente.ts`)
Vitest primeiro (`assistente.test.ts`): `prazosEstourando`/`caixasParadas` com dias opcionais (insights.test continua verde); `buscar_os` (OS, peça, cliente, oficina, sem acento, sem repetir OS), `listar_atrasadas` (oficina, dias), `faltas_da_os`, `caixas_paradas`, `pedidos_abertos` (fora da última etapa, OS, fornecedor), `sem_resposta`, `abrir_tela` (5 telas, inválida), corte em 30 com `total`, argumentos estranhos não derrubam. Os nomes batem com os de `n8n/src/assistente.js` (o teste lê o arquivo).

## Tarefa 4 — Cartão de cobrança, laço e links (puro) + cliente da API
`montarCartaoCobranca` (alvos, oficinas, travas com motivo, texto do modelo "Cobrança de prazo", previstas fora, 30 linhas), `resumoCobranca` (o que volta ao modelo: N mensagens, sem textos), `acoesDoCartao` (uma `enviar_whatsapp` por linha marcada e destravada, versão do board atual, chave nova; cancelado ou confirmado → nenhuma), `erroCartao`; `conversar` (até 5 chamadas, erro do servidor, chamadas de mais); `partesComOs`. `tipos.ts` (mensagens do assistente) e `client.ts` (`urlAssistente`, `perguntarAssistente` com 45 s e validação da resposta).

## Tarefa 5 — Painel, botão e moldura
`componentes/Assistente.tsx` e `componentes/CartaoCobranca.tsx`; ícone `ai`; botão **Assistente** na navbar (à direita, `aria-expanded`); `App.tsx` com a moldura e a navegação de `abrir_tela`; CSS em `f5.css` (380 px empurrando; tela cheia até 720 px; sem rolagem horizontal em 375 px).

## Tarefa 6 — Simulador e e2e
`mock-api.mjs`: rota `POST /pcp-assistente` com respostas prontas por palavra-chave (ferramentas, abrir tela, cobrança, erro) e os dados novos. `e2e/f5d-assistente.spec.ts` contra o simulador: abrir/fechar, exemplos, pergunta com link de OS, abrir tela, cobrar atrasadas (travadas com motivo), desmarcar uma, confirmar, ação na fila e mensagem na conversa da OS, cartão só leitura, cancelar sem ação, erro sem perder a conversa, 375 px.

## Tarefa 7 — Roteiro
`n8n/workflows/README.md`: F5d (credencial, homolog primeiro com o card de teste, produção, site, rollback).

## Verificação
`cd n8n && npm test && npm run build`; `cd web && npm test && npm run build`; `cd web && CI=1 npx playwright test`. Revisão final independente do diff contra o spec.
