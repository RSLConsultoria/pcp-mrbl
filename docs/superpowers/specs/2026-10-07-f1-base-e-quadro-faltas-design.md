# F1 — Base do app e quadro "No Ploomes" (somente leitura)

Data: 07/10/2026 · Autor: Lucca (RSL Consultoria) · Status: aguardando revisão

Primeira de cinco fases do software de PCP da MRBL. Referências de produto: `design_handoff_pcp_mrbl/README.md` (telas e tokens) e `design_handoff_pcp_mrbl/referencias/MRBL-app-faltas-oficinas.md` (regras de negócio). Os dois ficam só na máquina local e não vão para o repositório público.

## Fases do projeto

| Fase | Entrega |
|---|---|
| **F1** | Repositório, deploy, login, moldura do app, leitura do Sheets e quadro "No Ploomes" só para consulta |
| F2 | Escritas: baixa (`qtd_baixada`), previsão, responsável, observação, mover com justificativa, histórico e registro de interação no Ploomes |
| F3 | Solicitações de faltas (pedidos) e Saídas com falta |
| F4 | Controle de produção (Gantt) e cobrança por WhatsApp (Evolution, via telefonista da VPS) |
| F5 | Visão das peças, insights do dia, leitura de e-mail do PCP e assistente |

Cada fase tem sua própria spec e seu próprio plano.

## Decisões

- **Backend:** n8n self-hosted na VPS. O front chama só webhooks do n8n. Todas as credenciais (Ploomes, Google, Evolution, e-mail) ficam no n8n.
- **Front:** Vite + React + TypeScript, publicado no GitHub Pages pelo GitHub Actions.
- **Banco:** a planilha `1OauQaEaK3qMwb4gjFAqpTUblnAaAWeFfE-brZNFY2ww`. A F1 lê as abas FALTANTES, CAIXAS GANHAS e USUARIOS (esta última é nova).
- **Login:** e-mail e senha, com token emitido pelo n8n e válido por 12h.
- **Atraso de "saiu":** a CAIXAS GANHAS continua sendo atualizada de hora em hora (7h–19h, dias úteis). Aceito por enquanto.

## Arquitetura

```
repo pcp-mrbl (GitHub, público)
├─ web/        Vite + React + TS  → Actions → GitHub Pages
├─ n8n/        workflows versionados (*.sdk.js) + código dos Code nodes com testes
└─ docs/       specs e planos
```

- A URL base do n8n entra no build por `VITE_API_URL`. O código do front não contém nenhum segredo.
- O repositório é público, porque o GitHub Pages gratuito exige isso. Ele não contém dados de clientes nem credenciais. A pasta `design_handoff_pcp_mrbl/` fica fora dele (`.gitignore`).

### Webhooks

Os dois webhooks ficam no **mesmo workflow**, "PCP MRBL - API". Assim as sessões, o controle de tentativas e o cache ficam juntos no static data global desse workflow, sem precisar de tabela extra. Se o n8n reiniciar e as sessões se perderem, o único efeito é a pessoa ter que entrar de novo.

**`POST /pcp/login`**
- Entrada: `{ email, senha }`.
- Lê a aba USUARIOS (`email, nome, perfil, senha_hash, ativo`).
- Confere o hash no formato `pbkdf2$<iterações>$<salt hex>$<hash hex>` (PBKDF2-SHA256), usando `require('crypto')` no Code node.
  - Se o n8n não liberar o módulo `crypto`, é preciso definir `NODE_FUNCTION_ALLOW_BUILTIN=crypto` no container. A tarefa 1 do plano confere isso.
- Em caso de sucesso, gera um token aleatório de 32 bytes e grava em `sessoes` (`email, nome, perfil, expira`).
- Resposta de sucesso: `{ token, nome, perfil, expiraEm }`.
- Falha: responde `401` com mensagem genérica.
- Proteção contra tentativas: depois de 5 falhas em 15 minutos para o mesmo e-mail, responde `429` até a janela passar.

**`GET /pcp/board`**
- Exige o cabeçalho `Authorization: Bearer <token>`. Token inexistente ou vencido recebe `401`.
- Lê as abas FALTANTES e CAIXAS GANHAS e monta as caixas.
- Guarda o resultado em cache por 30 segundos (static data do workflow).
- Resposta: `{ geradoEm, caixas: Caixa[], avisos: string[] }`.

**CORS:** os dois webhooks liberam só a origem do GitHub Pages e `http://localhost:5173`.

### Montagem das caixas (Code node do `board`)

**Agrupamento.** Uma caixa por `deal_id`, ou seja, um card por caixa física.
- Se o negócio já tem linhas do ciclo CORTE, a caixa fica com `ciclo = CORTE`. Ela inclui os itens do CORTE e também os itens do PEDIDO que ainda estiverem abertos (o sync não mexe em material que não aparece no corte).
- Se não houver linhas de CORTE, a caixa fica com `ciclo = PEDIDO`.

**Campos da caixa:**
- `id` (= `dealId`), `os`, `ciclo`, `tipo` (`secao`: COSTURA/ACABAMENTO), `referencia`, `peca` (`descricao_peca`) e `cliente`.
- `registradoEm`: a menor `data_separacao` entre as linhas.
- `responsavel`: o primeiro valor não vazio da coluna humana `responsavel`.
- A previsão geral da caixa só aparece na F2, quando a coluna dela for criada.

**Itens.** Cada linha vira um item:
- `id`, `nome` (`descricao_item`), `cor` (`nome_cor`, ou `cor` se `nome_cor` estiver vazio), `un` (`unidade`).
- `necessaria` / `separada` / `falta` (`qtd_necessaria` / `qtd_separada` / `qtd_falta`) e `faltaG` (`qtd_falta_g`).
- `status`, `obs` (`obs_almoxarifado` e `observacao_pcp` juntas com " · "), `previsao` (coluna humana `previsao`, por item) e `resolvidoEm` (`data_resolucao`).
- **Item aberto** = `status` ABERTO ou PARCIAL e `falta > 0`.
- Linhas SUBSTITUIDO não aparecem como item: foram trocadas pela linha do ciclo CORTE.
- "+ N itens já resolvidos" conta os itens com status RESOLVIDO.

**Saída do almoxarifado.** `saiu` e `saiuComFalta` vêm da CAIXAS GANHAS, cruzando pelo `deal_id` (`saiu_com_falta = SIM`). `saiuEm` vem de `data_ganho`.

**Caixas que só existem na CAIXAS GANHAS.**
- Com `saiu_com_falta = NÃO` ou `SEM REGISTRO`: entram com `itens = []`.
- Com `saiu_com_falta = SIM`: os itens são lidos do texto `itens_faltando` (`DESC (falta N UN); …`), com status ABERTO, para o card cair em "Saiu com faltas".

**Linhas inválidas.** Linha sem `deal_id` ou sem `os`, ou com quantidade não numérica, é ignorada e gera uma entrada em `avisos`. O quadro nunca quebra por causa de uma linha.

**Testes.** Essa lógica fica em `n8n/src/montarCaixas.js`. É JavaScript puro e sem imports, para o mesmo arquivo rodar no Code node. É testada com `node:test` usando fixtures da planilha real. O script `n8n/scripts/gerar-code-nodes.js` monta o texto de cada Code node (mesmo padrão do hubPecas).

### Front

**Telas**
- **Login:** e-mail, senha, botão Entrar, erro em uma linha. O token fica em `localStorage`, com leitura e escrita protegidas por try/catch.
- **Moldura:** navbar de 58px conforme o README do handoff.
  - Na F1 só a guia "No Ploomes" funciona. As outras quatro aparecem desabilitadas, com "em breve".
  - O botão Assistente e a faixa de insights ficam ocultos na F1.
  - O indicador "Ploomes · sincronizado HH:MM" usa o `geradoEm`.
  - O avatar mostra as iniciais e tem a opção "Sair".
- **Subnav:** busca de 380px que ignora acentos. Procura em OS, referência, peça, cliente, responsável e nome/cor dos itens.
- **Quadro:** 6 colunas de 296px que vão até o fim da página, com cabeçalho sticky de 44px (ponto, título e contagem). A coluna é calculada por:
  ```
  saiu ? (aberto ? SAIU_COM : SAIU_SEM) : (aberto ? FALTA_ : COMPLETA_) + ciclo
  ```
  Aqui `aberto` significa "existe pelo menos um item aberto". A coluna "Saiu sem faltas" mostra só as caixas com `saiuEm` nos últimos 30 dias.
- **Card:** conforme o README.
  - Mostra todos os itens abertos. Linha e fio aparecem em cones e em gramas.
  - Mostra "+ N itens já resolvidos" quando houver.
  - Ordem dentro da coluna: o card mais antigo (`registradoEm`) fica primeiro.
- **Painel de 480px (só leitura):**
  - Cabeçalho com o link `https://app10.ploomes.com/deal/{dealId}`.
  - Responsável, etapa atual e dias desde o registro.
  - Um bloco por item com "necessário · separado · falta", status, observação e previsão.
  - Datas de separação e de resolução.
  - Nenhum campo é editável na F1.
- **Atualização:** busca o `board` a cada 60 segundos e também quando a aba volta a ficar visível.

**Estado e erros**
- O último `board` válido fica em memória.
- Quando uma busca falha, o quadro continua mostrando esse último `board`, com uma faixa amarela "Sem conexão desde HH:MM — tentando de novo". A faixa some quando uma busca dá certo.
- Uma resposta `401` limpa o token e volta para o login com "Sua sessão expirou".

**Visual:** tokens do Soccius DS com as sobrescritas MRBL do README, copiados para `web/src/styles/`. As fontes Hanken Grotesk, Space Grotesk e Space Mono vêm do Google Fonts.

**Lógica pura com testes (Vitest):**
- `colunaDaCaixa`
- `filtrarBusca` (normalização de acentos)
- `visivelNoQuadro` (regra dos 30 dias)
- `formatarQtd` (cones e gramas)
- `diasDesde`

## Usuário inicial

A aba USUARIOS começa com uma linha: `lucca@rslconsultoria.com`, nome Lucca, perfil ADM, ativo.

A senha **nunca passa pelo chat nem pelo repositório**. O repositório traz o script `npm run hash-senha`, que roda localmente, pergunta a senha e imprime o `senha_hash` (com o salt). Você cola o resultado na planilha.

## Testes e aceite

1. Testes unitários do front e do `montarCaixas` passando no CI (o Actions roda os testes antes do deploy).
2. Teste de ponta a ponta com Playwright contra um n8n simulado: login, quadro com fixtures, busca "acai" encontrando "AÇAI", abrir o painel, sessão expirada.
3. Conferência manual com dados reais: duas OS reais escolhidas pelo dono aparecem na coluna certa, com os itens e as quantidades iguais aos da planilha.

## Fora do escopo da F1

- Qualquer escrita.
- Observação geral da caixa.
- Sugestões de e-mail.
- Histórico (MOVIMENTOS).
- As outras 4 telas.
- Insights do dia e Assistente.
- Perfis além de ADM.
- Limite de itens por card (decidir com os dados reais).
