# F5c · Leitura dos e-mails do PCP — desenho

Data: 27/10/2026. Terceira parte da F5. Aprovado pelo dono em 27/10. Base: `design_handoff_pcp_mrbl/referencias/MRBL-app-faltas-oficinas.md` §4.5 (fora do Git).

## 1. Contexto (visto na caixa real em 27/10, só leitura)
- O Ploomes (`noreply@ploomes.com`) dispara e-mails com a OS no assunto, em 3 modelos: **"Caixa separada - OS:X | Ref: R | Desc: D"**, **"Itens faltando pós corte - OS:X | …"** e **"Itens recebidos SP -OS:X | …"**, para a conta Google Workspace do PCP e a equipe.
- A equipe (domínio da confecção) responde na mesma conversa ("RE: …"). Exemplos de conteúdo: pedido de conferência de quantidade, "item verificado, quantidade N", "chamado aberto #NNNNNNN", e às vezes previsão de chegada.
- O texto da resposta traz o histórico citado e a assinatura.

## 2. Objetivo
Transformar essas respostas em **sugestões** no app, que só gravam depois do **Aceitar**.

## 3. Leitura (workflow novo "PCP MRBL - Ler E-mails do PCP", a cada 10 min)
- Gmail pela API (HTTP Request: `GET users/me/messages?q=<busca>&maxResults=50` e, para cada id, `GET users/me/messages/{id}?format=full`), com credencial **OAuth2 genérica** (`oAuth2Api`) de escopo só `https://www.googleapis.com/auth/gmail.readonly`, criada pelo dono no n8n: o "só leitura" é garantido pelo Google, não só pelo workflow (decisão do dono, 27/10; a credencial Gmail OAuth2 nativa vem com escopos de envio e modificação). Busca `from:(@<domínio da confecção>) subject:"OS:" -from:noreply@ploomes.com newer_than:7d`. O domínio fica numa constante de configuração (não no código público: vem de uma variável do workflow/credencial ou da aba de configuração; no repositório só um marcador).
- Cada mensagem é tratada uma vez: id do Gmail na aba nova **EMAILS_PCP** (append; nunca apaga nem ordena).
- **OS** = número depois de "OS:" no assunto. Sem OS → ignora.
- **Limpeza** (função pura): corta o histórico citado (linhas a partir de "De:", "From:", "Em … escreveu:", "-----Original", "Enviado:") e a assinatura (a partir de "Atenciosamente", "Att", "--"); máximo 1500 caracteres.
- **Intérprete** (subworkflow novo no Groq, como o do WhatsApp): recebe o texto limpo, o assunto e os itens em aberto das caixas da OS (do board); devolve JSON validado pelo código:
  - `PREVISAO` (data + itens citados, quando houver),
  - `QUANTIDADE` (item + quantidade conferida),
  - `CHAMADO` (número),
  - `OBSERVACAO` (o resto),
  com `resumo`, `evidencia`, `confianca`. Mesma regra do WhatsApp: a evidência tem que estar no texto do e-mail; senão vira OBSERVACAO. Confiança < 0,7 → OBSERVACAO. Itens citados só valem se baterem com itens em aberto da OS (por nome).
- Falha do Groq: a linha fica `ERRO` com tentativas; o próprio agendamento tenta de novo até 3 vezes.

### Aba EMAILS_PCP (colunas, no fim e nessa ordem)
`id | thread_id | quando | de_nome | assunto | os | modelo | texto | tipo | valor | itens | resumo | evidencia | confianca | status | tentativas | decidido_em | decidido_por`
- `modelo`: CAIXA_SEPARADA, POS_CORTE, RECEBIDOS_SP ou OUTRO (pelo assunto).
- `itens`: ids dos itens das caixas da OS, separados por `;`.
- `status`: PENDENTE, ACEITA, IGNORADA, ERRO.

## 4. No app
- **Board** traz `emailsPcp` (os PENDENTE + os decididos dos últimos 7 dias): id, quando, de, assunto, os, modelo, texto, tipo, valor, itens, resumo, evidencia, confianca, status.
- **Faixa** azul abaixo dos Insights quando houver pendentes: "N sugestões novas dos e-mails do PCP" (clique abre a lista; cada item abre a caixa).
- **Painel da caixa (No Ploomes):** bloco azul "Sugestão do e-mail do PCP": remetente, assunto, trecho (evidência) e o que a IA entendeu; **Aceitar** / **Ignorar**.
  - PREVISAO aceita: grava a previsão nos itens citados (ou na previsão geral da caixa, se não citar itens), pela mesma regra da ação de previsão existente; histórico "<usuário> aceitou sugestão do e-mail: previsão dd/mm para ITEM".
  - QUANTIDADE, CHAMADO, OBSERVACAO aceitos: viram anotação no histórico da caixa ("… aceitou sugestão do e-mail: chamado #N"), que vai ao registro compilado do Ploomes.
  - Ignorar: só marca IGNORADA.
- Selo **"e-mail do PCP"** no card da caixa com sugestão pendente (No Ploomes).
- **Visão da peça:** a aba "E-mails do PCP" lista os e-mails da OS (data, de, assunto, texto limpo, sugestão e status).
- Ação nova `decidir_email_pcp` `{ id, decisao: 'ACEITAR'|'IGNORAR', versao? }`. Allowlist: `DEALS_EDITAVEIS` (cards de caixa) até o go-live. Tela otimista.

## 5. Segurança e privacidade
- Credencial do Gmail só leitura (OAuth2 genérica, escopo `gmail.readonly`); nunca envia, apaga ou marca e-mail. O workflow só faz GET em `messages` e `messages/{id}`.
- Repositório público: domínio, nomes e e-mails reais nunca entram no código nem nos testes (dados fictícios; domínio vem de configuração).
- O intérprete recebe o texto limpo sem assinatura.

## 6. Testes
- Puros: OS do assunto, modelo, limpeza (histórico/assinatura em PT e EN), validação do intérprete (evidência, itens, confiança), decisão (previsão em itens, anotação).
- Workflows: estrutura e ligações; nenhum nó nativo do Gmail nem de envio; o Gmail só por GET na `gmail.googleapis.com`, nos caminhos `messages` e `messages/{id}`, com a credencial `oAuth2Api`.
- Simulador com e-mails fictícios; e2e do bloco no painel, faixa, aceitar/ignorar e aba na Visão da peça.
- Homologação: depois que o dono criar a credencial do Gmail no n8n.
