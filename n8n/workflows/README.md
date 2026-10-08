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
