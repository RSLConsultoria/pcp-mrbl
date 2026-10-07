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
