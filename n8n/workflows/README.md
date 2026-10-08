# Workflows n8n do PCP MRBL

## PCP MRBL - API (id: WpuXpcSa5oGiEkTm)

| Webhook | URL de produção |
|---|---|
| Login (POST) | https://mrbl-automacoes.duckdns.org/webhook/pcp-login |
| Board (GET) | https://mrbl-automacoes.duckdns.org/webhook/pcp-board |

O `triggerInfo` do MCP mostra as URLs com o webhookId no caminho (`/webhook/<id>/pcp-login`), mas essas não ficam registradas. As que funcionam são as curtas acima, conferidas com curl em 07/10/2026.

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
4. O `pcp-api.sdk.js` é regenerado pelo `npm run build`.

**Credencial.** Os três nodes Google Sheets usam a credencial `Google Sheets - MRBL` (googleApi, service account). O SDK não grava a credencial na criação, então ela foi ligada depois com `update_workflow` (`setNodeCredential`). Faça o mesmo se recriar o workflow a partir do `pcp-api.sdk.js`.

**Requisito da VPS.** O container do n8n (`/opt/n8n/docker-compose.yml`) precisa de `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, senão o login falha com "Module 'crypto' is disallowed".

O static data guarda as sessões, as tentativas e o cache. Se ele for perdido (reinício, reimportação), o efeito é só que as pessoas precisam entrar de novo.

Execuções não são salvas (`saveData*: none`), porque o corpo do login traz a senha.

## F2: acao, envio ao Ploomes e allowlist

- **Webhook `/webhook/pcp-acao`** (POST, workflow "PCP MRBL - API"): processa baixa/previsao/obs/coluna manual; grava em FALTANTES (por `id`) ou CAIXAS_PCP (por `deal_id`) e registra no HISTORICO_APP (um unico "Preparar Historico" alimentado por Gravar Item e Gravar Caixa, depois Gravar Historico e Responder Acao). Antes de ler a planilha, "Pre Validar Acao" confere sessao e corpo; falha (401/400) responde direto por "Responder Pre" (IF "Pre OK?"). O "Processar Acao" repete as checagens.
- **Workflow "PCP MRBL - Enviar ao Ploomes"** (`pcp-envio.sdk.js`): a cada 2 min le o HISTORICO_APP e cria InteractionRecords no Ploomes. 429 deixa so aquela linha PENDENTE; Buscar Contato 429/5xx descarta o item ate a proxima rodada; outro nao-2xx (ex. 404) segue sem ContactId. Os dois HTTP (Buscar Contato, Criar Registro) tem timeout de 30 s e `onError: continueRegularOutput`: erro de rede/timeout vira item com `$json.error` e sem `statusCode`; no Buscar Contato o item e pulado, no Criar Registro conta como tentativa falha.
- **`DEALS_PERMITIDOS`** em `adaptadores/selecionar-envio.js`: hoje `['607479158']` (so o card de teste). **No go-live, esvazie a lista de proposito** (`[]` = todos os deals), rode `npm run build` e atualize o node "Selecionar Envio"; enquanto ela tiver o card de teste, nenhum outro deal e enviado.
- **Credenciais**: apos criar a partir do SDK, religue as credenciais (Google Sheets - MRBL e Header Auth do Ploomes) com `update_workflow`; o SDK nao as grava de forma confiavel.

### Estado do deploy (rascunho: API com acao ainda não publicada)

- Workflow "PCP MRBL - Enviar ao Ploomes": id z9misKW25YTuDhJ6, inativo; DEALS_PERMITIDOS = ['607479158'] (igual no arquivo e no node).
- Rascunho: API com acao ainda não publicada (a versão ativa do PCP MRBL - API continua a anterior ate o publish).

## F3: deploy da escrita genérica no "PCP MRBL - API"

**Atenção: publique tudo junto.** Os Code nodes da F3 (`Processar Acao`, `Montar Board`, `Pre Validar Acao`, gerados a partir de `src/` com pedidos) e a fiação abaixo vão no mesmo publish. O `Processar Acao` novo devolve `operacoes[]`/`historicos[]`; o rabo antigo (Preparar Gravacao → E Item? → Gravar Item | Gravar Caixa → Preparar Historico → Gravar Historico) só entende `gravacao`/`historico` e mandaria qualquer ação F3 para CAIXAS_PCP. E o código novo com o rabo novo, mas sem as leituras novas, quebra (`$('Ler PEDIDOS Acao')` inexistente). `ACOES_F3_ATIVAS` (src/api.js, hoje `true`) só recusa os tipos F3; não protege um deploy parcial.

Fonte da verdade: `workflows/pcp-api.sdk.js` (gerado por `npm run build`; posições já definidas no gerador, `scripts/gerar-workflow-sdk.js`). Os destinos de escrita ficam em `scripts/destinos.js`.

### 1. Ramo Board: 3 leituras novas antes do Montar Board

| Node (Google Sheets, read) | Aba | Opções |
|---|---|---|
| Ler PEDIDOS | PEDIDOS | executeOnce, alwaysOutputData |
| Ler PEDIDOS_ITENS | PEDIDOS_ITENS | executeOnce, alwaysOutputData |
| Ler ETAPAS_PEDIDO | ETAPAS_PEDIDO | executeOnce, alwaysOutputData |

Conexões: `Ler USUARIOS Board → Ler PEDIDOS → Ler PEDIDOS_ITENS → Ler ETAPAS_PEDIDO → Montar Board` (remova `Ler USUARIOS Board → Montar Board`). Cole `build/montar-board.js` no Montar Board.

### 2. Ramo Acao: 4 leituras novas antes do Processar Acao

| Node (Google Sheets, read) | Aba |
|---|---|
| Ler PEDIDOS Acao | PEDIDOS |
| Ler PEDIDOS_ITENS Acao | PEDIDOS_ITENS |
| Ler ETAPAS_PEDIDO Acao | ETAPAS_PEDIDO |
| Ler HISTORICO_APP Acao | HISTORICO_APP |

Todas com executeOnce e alwaysOutputData. Conexões: `Ler CAIXAS GANHAS Acao → Ler PEDIDOS Acao → Ler PEDIDOS_ITENS Acao → Ler ETAPAS_PEDIDO Acao → Ler HISTORICO_APP Acao → Processar Acao`. Cole `build/processar-acao.js` no Processar Acao e `build/pre-validar-acao.js` no Pre Validar Acao.

### 3. Ramo Acao: troque o rabo de gravação

Apague: `Preparar Gravacao`, `E Item?`, `Gravar Item`, `Gravar Caixa`, `Preparar Historico`, `Gravar Historico`.

Crie 9 destinos, nesta ordem. Cada um tem 3 nodes: Code `Filtrar <ABA> <op>` (jsCode = `build/filtrar-<aba>-<op>.js`, modo runOnceForAllItems), IF `Tem <ABA> <op>?` (condição: `{{ $json._vazio === true }}` é **false**, boolean, singleValue) e o Google Sheets de escrita (alwaysOutputData; mapping autoMapInputData; `cellFormat: RAW`, `handlingExtraData: insertInNewColumn`).

| # | Code | IF | Sheets | Operação | Aba | Coluna de casamento |
|---|---|---|---|---|---|---|
| 0 | Filtrar FALTANTES update | Tem FALTANTES update? | Atualizar FALTANTES | update | FALTANTES | id |
| 1 | Filtrar CAIXAS_PCP appendOrUpdate | Tem CAIXAS_PCP appendOrUpdate? | Gravar CAIXAS_PCP | appendOrUpdate | CAIXAS_PCP | deal_id |
| 2 | Filtrar PEDIDOS append | Tem PEDIDOS append? | Incluir PEDIDOS | append | PEDIDOS | — |
| 3 | Filtrar PEDIDOS update | Tem PEDIDOS update? | Atualizar PEDIDOS | update | PEDIDOS | id |
| 4 | Filtrar PEDIDOS_ITENS append | Tem PEDIDOS_ITENS append? | Incluir PEDIDOS_ITENS | append | PEDIDOS_ITENS | — |
| 5 | Filtrar PEDIDOS_ITENS update | Tem PEDIDOS_ITENS update? | Atualizar PEDIDOS_ITENS | update | PEDIDOS_ITENS | id |
| 6 | Filtrar ETAPAS_PEDIDO appendOrUpdate | Tem ETAPAS_PEDIDO appendOrUpdate? | Gravar ETAPAS_PEDIDO | appendOrUpdate | ETAPAS_PEDIDO | id |
| 7 | Filtrar ETAPAS_PEDIDO update | Tem ETAPAS_PEDIDO update? | Atualizar ETAPAS_PEDIDO | update | ETAPAS_PEDIDO | id |
| 8 | Filtrar HISTORICO_APP append | Tem HISTORICO_APP append? | Incluir HISTORICO_APP | append | HISTORICO_APP | — |

Conexões (para cada `i`, com `próximo` = `Filtrar` do destino `i+1`, ou `Responder Acao` depois do 8):
- `Acao OK?` (true) → `Filtrar FALTANTES update`; `Acao OK?` (false) → `Responder Acao` (como antes).
- `Filtrar i → Tem i?`
- `Tem i?` (true) → `Sheets i` → `próximo`
- `Tem i?` (false) → `próximo`

### 4. Credenciais e publish

- Religue a credencial **Google Sheets - MRBL** (googleApi, id `72hvCT9jkADwOOo1`) nos 7 nodes de leitura novos e nos 9 de escrita (`setNodeCredential` no `update_workflow`; o SDK não a grava de forma confiável).
- As abas PEDIDOS, PEDIDOS_ITENS e ETAPAS_PEDIDO precisam existir com cabeçalho na linha 1 (o update/appendOrUpdate casa pela coluna `id`).
- Teste no rascunho com uma ação F2 (baixa) e uma F3 (gerar pedido) no card de teste; confira que nenhuma linha vazia entrou e que o HISTORICO_APP ganhou uma linha por OS. Só então publique.
