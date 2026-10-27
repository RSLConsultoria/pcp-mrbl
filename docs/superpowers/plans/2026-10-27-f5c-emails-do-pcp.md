# F5c · E-mails do PCP — plano

Spec: `docs/superpowers/specs/2026-10-27-f5c-emails-do-pcp-design.md` (fonte da verdade). Tarefas pequenas, testes primeiro, um commit por tarefa.

## Restrições globais
- pt-BR em commits, comentários e interface. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Repositório público: domínio, nomes e e-mails só fictícios (`@confeccao-exemplo.com.br`, OS 9000x, deals 7000x). O domínio real nunca entra no código: o node **Config** do workflow tem o marcador `CONFIGURAR_DOMINIO`.
- `n8n/src` e `n8n/adaptadores`: ES5 puro (sem arrow, template string, `const`/`let`, import/export). Depois de mexer: `cd n8n && npm test && npm run build` e commitar `n8n/build`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json`.
- Planilha: só append e update por `id` na aba nova **EMAILS_PCP** (nunca apaga nem ordena); colunas exatamente: `id | thread_id | quando | de_nome | assunto | os | modelo | texto | tipo | valor | itens | resumo | evidencia | confianca | status | tentativas | decidido_em | decidido_por`. A gravação nunca cria coluna nessa aba (como as abas da F4).
- Gmail: credencial OAuth2 só leitura, nó Gmail só `getAll`; nenhum nó envia, apaga ou marca e-mail. Credenciais com marcadores (`CONFIGURAR_CREDENCIAL_GMAIL`, `CONFIGURAR_CREDENCIAL_GROQ`) e o subworkflow com `CONFIGURAR_INTERPRETE_EMAIL`.
- Nada é publicado no n8n, na planilha, no Ploomes ou no Gmail nesta entrega.

## Decisões de desenho (além do spec)
- **Caixas da sugestão** (`dealsAlvoEmailPcp`, igual no servidor e no site): os deals dos itens citados; sem itens, as caixas da OS com item em aberto; sem nenhuma em aberto, todas as caixas da OS. O bloco aparece no painel de cada uma; a decisão grava em todas e exige que todas estejam em `DEALS_EDITAVEIS` (lista vazia = todas). OS sem caixa: Aceitar dá 404; Ignorar só com a lista vazia.
- **Itens citados**: o modelo devolve nomes (ou ids); valem os que batem com itens em aberto da OS pelo nome normalizado (igual, ou um contém o outro com 4+ letras) ou pelo id. PREVISAO que citou itens e nenhum bateu vira OBSERVACAO (não espalha a data pela caixa). QUANTIDADE sem item válido ou sem número vira OBSERVACAO. CHAMADO cujo número não está no texto vira OBSERVACAO.
- **Tentativas**: o e-mail novo entra na aba já com `status = ERRO` e `tentativas = 1` (reserva) antes de chamar o modelo; sucesso troca para `PENDENTE`. A cada 10 min, linhas `ERRO` com menos de 3 tentativas são reinterpretadas a partir do `texto` já limpo da planilha. No máximo 10 interpretações por rodada.
- **Versão**: `decidir_email_pcp` não confere versão de caixa ou item (o `versao` do corpo é aceito e ignorado); a idempotência vem do `status` da linha (a mesma decisão de novo = ok sem gravar; decisão contrária depois de decidida = 409).
- **Board** traz `emailsPcp` só com PENDENTE e os decididos nos últimos 7 dias, mais novos primeiro, no máximo 300.
- **Revisão final (27/10):** itens lidos da CAIXAS GANHAS (não editáveis) não vão ao intérprete; o nome exato do item vence e a substring só vale com um candidato; a limpeza corta a citação quebrada em até 3 linhas e apaga endereços que sobrarem; "Enviado:/Sent:" sozinhos não cortam (no Outlook vêm depois de "De:/From:"); confiança em percentual (95) vale 0,95; no máximo 4 interpretações por rodada (cabe nos 10 min); reserva gravada só em parte não manda nada ao intérprete; pendente com mais de 30 dias sai do board; faixa e selo mostram só as sugestões que dá para decidir (todas as caixas liberadas), o painel mostra as outras com os botões desligados.
- O intérprete roda num subworkflow gerado no repositório (**PCP MRBL - Intérprete E-mail do PCP (Groq)**), no molde do intérprete do WhatsApp (`openai/gpt-oss-120b`, `temperature 0`, `reasoning_effort low`, JSON).

## Tarefa 1 — Assunto, modelo e limpeza (`n8n/src/emailsPcp.js`)
Teste `n8n/test/emails-pcp.test.js` primeiro. `osDoAssuntoEmailPcp` ("OS:123", "-OS: 123", "RE: …"; sem OS → ''), `modeloDoAssuntoEmailPcp` (CAIXA_SEPARADA, POS_CORTE, RECEBIDOS_SP, OUTRO, sem acento e sem caixa), `limparTextoEmailPcp` (corta em "De:", "From:", "Em … escreveu:" mesmo quebrado em duas linhas, "On … wrote:", "-----Original", "Enviado:", "Sent:", linhas citadas com ">", e na assinatura "Atenciosamente", "Att", "Regards", "--", "Enviado do meu", "Sent from my"; máximo 1500). `carregar.js` e `gerar-code-nodes.js` ganham o arquivo.

## Tarefa 2 — Intérprete: entrada, prompt e validação
`itensAbertosDaOsEmailPcp(caixas, os)`, `entradaInterpreteEmailPcp(linha, itens)` (texto, assunto, OS, modelo, quando, itens em aberto com id e nome; sem remetente), `INSTRUCOES_INTERPRETE_EMAIL_PCP`, `SCHEMA_INTERPRETE_EMAIL_PCP`, `pedidoGroqEmailPcp(entrada)`, `respostaGroqEmailPcp(resposta)` e `validarInterpretacaoEmailPcp(valor, ctx)`: evidência na mensagem pela regra do WhatsApp (`evidenciaNaMensagemWhatsapp`) e obrigatória fora de OBSERVACAO; confiança < 0,7 → OBSERVACAO; data por `resolverDataInterpretada` (dd/mm sem ano distante → OBSERVACAO); itens só os que batem.

## Tarefa 3 — Linhas da aba e seleção da rodada
`COLUNAS_EMAILS_PCP`, `emailDoGmailPcp(json)` (formato do nó Gmail com `simple: false`; nome do remetente, nunca o endereço), `buscaGmailEmailsPcp(dominio)` (marcador ou domínio inválido → ''), `selecionarEmailsPcp(gmail, dados, dominio, agora)` → `{ operacoes, pedidos }` (append da linha nova com status ERRO/tentativas 1; update das ERRO com < 3 tentativas; ignora sem OS, de fora do domínio, do Ploomes, já gravados e repetidos; até 10), `concluirEmailPcp(pedido, resposta)` → update PENDENTE. `planilhaLote.js`: `LEITURAS_EMAILS_PCP`, destinos `EMAILS_PCP` append/update por `id` e a aba no conjunto que nunca cria coluna.

## Tarefa 4 — Board e ação `decidir_email_pcp`
`emailsPcpBoard(linhas, agora)`; `LEITURAS_BOARD` e `LEITURAS_ACAO` com `EMAILS_PCP`; adaptadores `montar-board` e `processar-acao`; `dealsAlvoEmailPcp`; `decidirEmailPcp(corpo, linhas, ctx)` (PREVISAO por `aplicarAcao` de `previsao_item`/`previsao_caixa`, histórico "… aceitou sugestão do e-mail: previsão dd/mm para ITEM"; QUANTIDADE/CHAMADO/OBSERVACAO viram linha `EMAIL_PCP_ACEITA` no HISTORICO_APP de cada caixa; IGNORAR só marca) e o roteamento em `preValidarAcao`/`processarAcao` com a allowlist.

## Tarefa 5 — Workflows gerados
`gerar-workflow-sdk.js`: **PCP MRBL - Ler E-mails do PCP** (`pcp-emails.sdk.js`): A cada 10 minutos → Config (Set, `dominio = CONFIGURAR_DOMINIO`) → Montar Busca → Buscar E-mails (Gmail getAll, `simple: false`, limite 50) → Ler Planilha E-mails → Selecionar E-mails → Gravar Reservas → Montar Pedidos de Interpretação → Interpretar E-mail (Execute Workflow `each`) → Reler E-mails → Finalizar E-mails → Gravar Interpretações; erros técnicos → ERROS_APP. **PCP MRBL - Intérprete E-mail do PCP (Groq)** (`pcp-interprete-email.sdk.js`): Receber Contexto → Montar Pedido Groq → Chamar Groq → Devolver Interpretação. `ids-subworkflows.js` com `INTERPRETE_EMAIL`. Teste `workflow-emails-pcp.test.js`: estrutura, ligações, Gmail só leitura, nenhum nó que envie/apague/marque e-mail, sem domínio real, adaptadores rodando com dados fictícios.

## Tarefa 6 — Site: contrato, regras e otimista
`tipos.ts` (`EmailPcp`, `emailsPcp`, ação), `regras/emailsPcp.ts` (`dealsAlvoEmailPcp`, `emailsPendentesDaCaixa`, `textoSugestaoEmail`, `emailsDaOs`), `acoes.ts` (chave `email:<id>`, mensagem), `otimista.ts` (marca o status; PREVISAO aceita põe a data nos itens ou nas caixas) e `acaoNoBoard` pelo status. Vitest primeiro.

## Tarefa 7 — Site: telas
Faixa azul `FaixaEmailsPcp` abaixo dos Insights ("N sugestões novas dos e-mails do PCP"; abre a lista; cada item abre a caixa no No Ploomes ou, sem caixa, a Visão da peça); bloco azul "Sugestão do e-mail do PCP" no `PainelCaixa` com Aceitar/Ignorar; selo "e-mail do PCP" no `CardCaixa`; aba "E-mails do PCP" na Visão da peça. CSS em `f5.css`, sem rolagem horizontal em 375 px.

## Tarefa 8 — Simulador e e2e
`mock-api.mjs` com e-mails fictícios que acendem PREVISAO (com item e sem item), QUANTIDADE, CHAMADO, OBSERVACAO e um já decidido; `decidir_email_pcp` no simulador. `e2e/f5c-emails.spec.ts`: faixa, bloco no painel, aceitar previsão (data aparece no item), ignorar, selo e aba da Visão da peça; `mock-servidor.spec.ts` se preciso.

## Tarefa 9 — Roteiro
`n8n/workflows/README.md`: aba EMAILS_PCP com o cabeçalho, credencial Gmail OAuth2 só leitura, subworkflow do intérprete (id no repositório), domínio no Config (reaplicar depois de cada deploy), ordem de publicação e rollback.

## Verificação
`cd n8n && npm test && npm run build`; `cd web && npx vitest run && npm run build`; `cd web && CI=1 npx playwright test`. Revisão final independente do diff contra o spec.
