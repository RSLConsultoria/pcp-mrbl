# Associador de mensagens por IA (WhatsApp das oficinas) — desenho

Data: 22/10/2026. Complementa a F4 (`2026-10-13-f4-gantt-whatsapp-design.md`). Aprovado pelo dono em 22/10.

## 1. Problema

As oficinas conhecem a peça, não o número da OS, e muitas vezes respondem sem citar a mensagem do PCP. Hoje a resposta só é ligada a uma OS por três regras fixas (citação, número da OS no texto, única cobrança pendente do grupo em 72 h). Fora disso a mensagem fica "aguardando associação" e alguém do PCP precisa ligar à mão. No QA de 22/10, a resposta real "Devo ter que adiar para o dia 27" ficou sem associação.

## 2. Objetivo

Uma IA (o **associador**) lê a conversa do grupo e descobre de qual OS da oficina a mensagem fala. Quando tem certeza, liga sozinha. Quando fica em dúvida entre peças, **pergunta no grupo** qual é. Quando a mensagem não é sobre OS nenhuma, fica calada.

Fica como está: o intérprete (que transforma a resposta em sugestão de data, prazo confirmado etc.), a decisão humana de aceitar a sugestão e a gravação no Ploomes.

## 3. Fluxo

1. Chega uma mensagem de texto de um grupo cadastrado (fluxo atual do "Receber WhatsApp").
2. As regras atuais rodam primeiro, na mesma ordem: citação → número da OS no texto → única cobrança pendente. Se alguma resolve, segue como hoje.
3. **Pergunta aberta no grupo** (ver 3.3)? A mensagem é tratada como possível resposta a ela.
4. Senão, se a oficina tem pelo menos uma OS na Costura, chama o associador.
5. Conforme o resultado:
   - **OS** com confiança ≥ 0,8 → a mensagem é ligada (`associacao = IA`) e vai para o intérprete, como hoje.
   - **DUVIDA** entre 2 ou 3 OS → a mensagem fica `IA_DUVIDA` e a pergunta é enfileirada no grupo.
   - **NAO_OS** → a mensagem fica `NAO_OS`, sem pergunta e sem aparecer em "aguardando associação".
   - Falha da IA, resposta inválida, confiança baixa sem candidatos válidos, ou oficina sem OS na Costura → `SEM_ASSOCIACAO`, como hoje (associação manual no app).

### 3.1 Candidatos

Somente as OS ativas da oficina dona do grupo que estão na Costura (não previstas). Para cada uma o associador recebe: OS, peça, referência, quantidade, prazo vigente e status do prazo, data e texto da última mensagem do PCP sobre ela.

### 3.2 Entrada e saída do associador

Entrada: o texto da mensagem, a hora, a lista de candidatos e as últimas 10 mensagens do grupo (direção, hora, texto cortado em 500 caracteres; quando a mensagem já está ligada, a OS dela). Nunca vão telefone, JID nem nome de participante.

Saída (JSON validado pelo código; qualquer desvio = falha):

```
{ "resultado": "OS" | "DUVIDA" | "NAO_OS",
  "os": "<número de um candidato>",            // só em OS
  "candidatos": ["<os>", "<os>"],              // só em DUVIDA: 2 ou 3, todos da lista
  "confianca": 0..1,
  "motivo": "<frase curta>" }
```

`OS` com confiança abaixo de 0,8 vira `DUVIDA` se vierem 2 ou 3 candidatos válidos; senão `SEM_ASSOCIACAO`. Um `os` fora da lista é falha.

### 3.3 Pergunta no grupo

- Texto montado pelo código (a IA só escolhe as OS), citando a mensagem da oficina:
  - 2 peças: `Olá! Essa mensagem é sobre *PEÇA A* ou *PEÇA B*?`
  - 3 peças: `Olá! Essa mensagem é sobre *PEÇA A*, *PEÇA B* ou *PEÇA C*?`
  - Se duas peças têm o mesmo nome, acrescenta a quantidade: `*BLUSA ANTONIA* (11 peças)`; se ainda empatar, a referência.
- Sai sozinha, pela fila de envio existente (linha `ENVIADA`, `tipo = PERGUNTA_ASSOCIACAO`, `status_envio = PENDENTE`). O "Enviar WhatsApp" passa a mandar a citação quando a linha tem `resposta_a_evolution_id`.
- Travas: no máximo **1 pergunta aberta por grupo**; nunca duas perguntas sobre a mesma mensagem. Com uma pergunta aberta, outra mensagem em dúvida fica `SEM_ASSOCIACAO`.
- Pergunta **aberta** = enviada há menos de 24 h e ainda não respondida. Depois de 24 h ela fecha e a mensagem original passa a aparecer em "aguardando associação" (`SEM_ASSOCIACAO`).

### 3.4 Resposta à pergunta

Com pergunta aberta no grupo, a próxima mensagem recebida (citando a pergunta ou não) vai ao associador no modo resposta: candidatos = os da pergunta, mais a mensagem original no contexto.

- Escolheu uma OS: a mensagem original e a resposta são ligadas a ela (`IA`), a pergunta fecha e **a original** vai para o intérprete. A resposta ("é a blusa") não gera sugestão.
- Não respondeu à pergunta: a pergunta continua aberta e a mensagem nova segue o fluxo normal a partir do passo 4 (sem nova pergunta, pela trava).

## 4. Dados

Aba `WHATSAPP_MENSAGENS`, colunas novas no fim:

| coluna | uso |
|---|---|
| `associacao_confianca` | confiança da IA (vazio quando não foi a IA) |
| `associacao_motivo` | frase curta da IA |
| `pergunta_candidatos` | na linha da pergunta: deal_ids separados por `;` |
| `pergunta_mensagem_id` | na linha da pergunta: id da mensagem da oficina |
| `pergunta_fechada_em` | quando a pergunta foi respondida ou expirou |

Valores novos de `associacao`: `IA`, `IA_DUVIDA`, `NAO_OS`. Valor novo de `tipo`: `PERGUNTA_ASSOCIACAO`. Gravações por id, sem ordenar nem apagar linhas.

## 5. n8n

- Subworkflow novo **"PCP MRBL - Associador WhatsApp (Groq)"**, no molde do intérprete (`openai/gpt-oss-120b`, `reasoning_effort: low`, credencial WhatsPCPGroq). Só devolve JSON; nunca envia.
- "Receber WhatsApp": depois de preparar, se a mensagem precisa do associador, monta o contexto, chama o subworkflow, valida e grava (ligação, pergunta enfileirada ou `NAO_OS`). Lógica pura em `n8n/src/whatsapp.js` (ou `associador.js`), ES5, com testes.
- "Enviar WhatsApp": manda `quoted` à Evolution quando a linha tem `resposta_a_evolution_id`. O corpo é montado num Code node próprio ("Montar Envio WhatsApp"), porque a Evolution não guarda mensagens: a citação leva id, grupo, participante e texto da mensagem original. Campos extras nunca passam pelos nós que gravam na planilha (o mapeamento automático criaria colunas).
- A chamada ao associador acontece no "Receber WhatsApp", depois de confirmar o recebimento; quando a mensagem precisa de interpretação, ele dispara o workflow "Interpretar WhatsApp" que já existe (sem esperar).
- Expiração das perguntas: o agendamento "Retentar Interpretação" (15 min) também fecha perguntas com mais de 24 h e passa a original para `SEM_ASSOCIACAO`.
- Falhas do Groq: registram em ERROS_APP; a mensagem fica `SEM_ASSOCIACAO` (sem nova tentativa automática da associação).

## 6. App

- Conversa da OS: selo **"ligada pela IA"** nas mensagens `IA`, com o motivo no título; a pergunta da IA aparece como mensagem do PCP com o selo **"pergunta da IA"**.
- **Trocar OS**: numa mensagem `IA`, o PCP pode ligar a outra OS da mesma oficina (ação `associar_whatsapp` passa a aceitar `IA`, além de `SEM_ASSOCIACAO`). Uma sugestão pendente gerada por ela vira `IGNORADA`; sem sugestão, a mensagem é interpretada para a nova OS. (Cada mensagem tem no máximo uma sugestão, com id fixo; depois de trocar, o PCP ajusta a data à mão se precisar.)
- `NAO_OS` não aparece em "aguardando associação". `IA_DUVIDA` aparece lá com a etiqueta "perguntado à oficina".
- Regras otimistas espelhadas em `web/src/regras/otimista.ts`; simulador (`mock-api.mjs`) com associador falso.

## 7. Limites e segurança

- Até o go-live, só os grupos cadastrados na OFICINAS recebem perguntas (hoje, só o grupo de teste da FAUSTINO BP).
- A IA nunca grava no Ploomes e nunca decide data: só liga mensagem a OS e escolhe peças para a pergunta.
- Repositório público: testes e fixtures só com dados fictícios.

## 8. Testes

- Funções puras: candidatos da oficina; validação do JSON (OS fora da lista, candidatos repetidos, confiança fora de 0..1); limite de 0,8; texto da pergunta (2, 3, nomes iguais); travas (pergunta aberta, mesma mensagem); resposta à pergunta (escolheu, não respondeu); expiração em 24 h; troca de OS com sugestão pendente.
- Workflows gerados: ligações dos nós, citação no envio.
- E2E no simulador: selo "ligada pela IA", pergunta na conversa, trocar OS.
- Homologação no grupo de teste: mensagem sem citação de uma peça só → ligada; mensagem ambígua → pergunta no grupo → resposta → ligada e interpretada; "bom dia" → ignorada.
