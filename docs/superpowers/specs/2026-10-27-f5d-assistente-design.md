# F5d · Assistente — desenho

Data: 27/10/2026. Quarta e última parte da F5. Aprovado pelo dono em 27/10. Base: `design_handoff_pcp_mrbl/README.md` (Shell, "Assistente"; fora do Git).

## 1. Objetivo
Um chat que responde perguntas sobre os dados do app, abre telas e OS, e monta cobranças em lote no WhatsApp. **Nada é enviado sem "Confirmar e enviar".**

## 2. Decisões do dono
- Escopo da primeira versão: consultar, abrir telas e cobrar. Não grava baixa, previsão, observação nem pedido.
- Modelo: Groq (credencial já existente `WhatsPCPGroq`), com chamada de funções (tools).
- Acesso: todos os usuários logados. A cobrança segue as mesmas travas de hoje (`enviar_whatsapp`).
- Arquitetura A: as ferramentas rodam no site, sobre o board já carregado; o n8n só guarda a chave e repassa a conversa.

## 3. Interface
- Botão **Assistente** (ícone `ai`) na navbar, à direita. Abre um painel de 380px à direita que empurra o conteúdo (no celular ocupa a largura toda, por cima). Fecha no X ou no mesmo botão.
- Conversa só na memória do navegador (some ao recarregar ou sair). Campo de texto + Enviar (Enter envia, Shift+Enter quebra linha). Mensagem inicial com 3 exemplos clicáveis: "Quais OS estão atrasadas?", "Cobrar as atrasadas", "Faltas da OS 12345".
- Respostas da IA em texto simples; OS citadas viram links para `#peca/<OS>`.
- Enquanto espera: "pensando…". Erro: aviso no próprio chat ("Não consegui responder agora. Tente de novo."), sem perder a conversa.

## 4. Servidor (n8n)
- Webhook novo `pcp-assistente` (homolog `pcp-assistente-h`), na API. Corpo: `{ token, mensagens: [{ papel, texto | chamadas | resultado }] }`.
- Confere a sessão como os outros webhooks (401 sem login).
- Limite: 120 pedidos por hora (uma pergunta gasta de 2 a 6) por usuário (contagem em memória estática do workflow; acima disso 429 com "Muitas perguntas seguidas. Espere alguns minutos.").
- Monta o pedido ao Groq: prompt de sistema fixo + lista de ferramentas (definida no `n8n/src`, espelhada no site) + até as últimas 20 mensagens, cortando textos longos (resultado de ferramenta com no máximo 6000 caracteres).
- Devolve `{ texto }` ou `{ chamadas: [{ id, nome, argumentos }] }`. Valida que os nomes estão na lista e os argumentos são JSON; senão devolve erro tratado.
- Nada é gravado na planilha (sem histórico de conversa no servidor). Falha do Groq → 502 com mensagem amigável.

## 5. Ferramentas (funções puras no site, `web/src/regras/assistente.ts`)
Todas leem só o board já carregado e devolvem JSON curto (no máximo 30 linhas; com `total` quando cortar).
- `buscar_os({ texto })` — por número de OS, peça, cliente ou oficina (ignora acentos).
- `listar_atrasadas({ oficina? , dias_ate_vencer? })` — mesma regra do cartão "Prazo estourando" dos Insights (padrão: vencidas e até 3 dias).
- `faltas_da_os({ os })` — caixas da OS com itens em aberto, previsão e pedido.
- `caixas_paradas({ dias? })` — mesma regra dos Insights (padrão 7).
- `pedidos_abertos({ os?, fornecedor? })` — pedidos fora da última etapa.
- `sem_resposta({})` — mesma regra do cartão "Cobrança sem resposta".
- `abrir_tela({ tela, os? })` — `no-ploomes | saidas | solicitacoes | producao | peca`; o site navega e responde "Abri …".
- `preparar_cobranca({ oficinas?, alvo: 'atrasadas' | 'todas' | 'oficinas' })` — **não envia**. Devolve ao modelo só o resumo (N mensagens) e mostra no chat um **cartão de cobrança**.

Reaproveitar as regras dos Insights (`insights.ts`) e do Controle de produção, sem duplicar lógica.

## 6. Cartão de cobrança
- Uma linha por OS na Costura do alvo: checkbox (marcado), OS · peça · oficina, prazo, e o texto do modelo "Cobrança de prazo" já usado na tela de produção (editável).
- OS sem grupo de WhatsApp da oficina ou fora da allowlist (`DEALS_PRODUCAO_EDITAVEIS`) aparece desmarcada e travada, com o motivo.
- Botões **Confirmar e enviar (N)** e **Cancelar**. Confirmar enfileira um `enviar_whatsapp` por linha marcada (mesma ação, chave e tela otimista de hoje) e mostra "N cobranças na fila". Depois de confirmado ou cancelado, o cartão fica só leitura.
- O modelo nunca tem uma ferramenta que envia: o envio só nasce do clique.

## 7. Prompt de sistema (resumo)
Português do Brasil, respostas curtas. Só responder com dados vindos das ferramentas; se não achar, dizer que não achou. Nunca inventar OS, datas ou nomes. Para cobrar, sempre usar `preparar_cobranca` e avisar que o envio depende da confirmação. Hoje = data de São Paulo (enviada no pedido). No máximo 5 chamadas de ferramenta por pergunta (o site também corta).

## 8. Segurança
- A chave do Groq fica só no n8n.
- O site manda ao Groq só os resultados das ferramentas (dados do board que o usuário já vê).
- Nenhuma ferramenta grava. O cartão de cobrança usa a ação existente, com as mesmas travas e allowlists.
- Repositório público: exemplos e testes só com dados fictícios.

## 9. Testes
- Vitest: cada ferramenta (filtros, limites, acentos, corte em 30), o laço de conversa (máx. 5 chamadas, erro do servidor), o cartão (linhas travadas, confirmar gera N ações, cancelar não gera nada).
- n8n: validação do pedido, montagem do corpo do Groq, validação da resposta (nome de ferramenta desconhecido, JSON inválido), limite por usuário.
- Simulador: `pcp-assistente` com respostas prontas por palavra-chave (sem Groq); e2e: abrir painel, pergunta, link da OS, cobrar atrasadas, desmarcar uma, confirmar, ver na fila; 375px.
- Homologação: depois de publicar a API homolog, testar com o Groq real só cobrando o card de teste.
