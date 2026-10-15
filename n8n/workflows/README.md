# Workflows n8n do PCP MRBL

## Checklist da release (branch `perf-lote` → `main`)

Esta release leva junto: leitura/gravação em lote, registro compilado no Ploomes, fornecedor e responsável obrigatórios, etapas novas (baixa na penúltima, Concluído na última), Saídas divididas, Nova demanda pós-saída e o registro de falhas na ERROS_APP. **Esta lista é a única instrução de deploy válida**; as seções em "Histórico" mais abaixo só explicam como se chegou aqui e não devem ser seguidas.

Siga na ordem. Cada item de planilha é "confira e, se faltar, faça".

## Preparação da F4 — ainda não executar na planilha real

Esta seção documenta o contrato já implementado e testado localmente para o Gantt e o intérprete silencioso. Ela **não autoriza criação de abas, deploy ou conexão com grupos reais**. Esses passos só entram na homologação da F4 depois da demonstração local e do aceite do dono.

Quando a homologação for autorizada, crie as abas abaixo somente com o cabeçalho exato na linha 1. Nunca ordene nem apague suas linhas.

- **PRODUCAO**: `deal_id` | `os` | `oficina_id` | `oficina_nome` | `inicio_costura` | `data_combinada` | `lead_time` | `pecas` | `cliente` | `peca` | `referencia` | `em_costura` | `atualizado_em_ploomes` | `sincronizado_em`.
- **OFICINAS**: `ploomes_id` | `nome` | `grupo_jid` | `grupo_nome` | `ativo` | `atualizado_em`. O sync só pode alterar `ploomes_id`, `nome` e `atualizado_em`; os demais campos são humanos.
- **WHATSAPP_MENSAGENS**: `id` | `evolution_id` | `quando` | `grupo_jid` | `grupo_nome` | `participante_jid` | `participante_nome` | `direcao` | `tipo` | `tipo_conteudo` | `texto` | `resposta_a_evolution_id` | `deal_id` | `os` | `oficina_id` | `associacao` | `status_envio` | `erro` | `criado_em`.
- **WHATSAPP_SUGESTOES**: `id` | `mensagem_id` | `deal_id` | `os` | `tipo` | `valor` | `resumo` | `evidencia` | `confianca` | `status` | `criado_em` | `decidido_em` | `decidido_por` | `versao`.

As operações da F4 recusam a ação antes da primeira escrita se faltar uma coluna usada por ela. O navegador não recebe `grupo_jid`, `participante_jid`, IDs internos da Evolution nem credenciais. O workflow de entrada apenas registra e sugere: ele não pode conter node de envio ou resposta ao grupo.

O workflow agendado da produção é gerado em `workflows/json/pcp-producao-sync.json` com o nome **PCP MRBL - Sincronizar Produção**. Ele consulta a etapa Costura a cada cinco minutos, faz upsert por `deal_id`, marca como `NAO` as linhas que saíram da etapa e atualiza em `OFICINAS` somente os campos vindos do Ploomes. O arquivo gerado é um workflow novo e inativo; não o importe, ative ou execute antes da homologação autorizada da F4.

O envio da fila é gerado em `workflows/json/pcp-whatsapp-saida.json` com o nome **PCP MRBL - Enviar WhatsApp**. A cada dois minutos ele escolhe somente a pendência mais antiga, grava `ENVIANDO` antes da chamada e usa o contrato instalado da Evolution (`POST /message/sendText/producao`, corpo `number` + `text`). Sucesso grava `evolution_id` e `ENVIADA`; 4xx, 429, 5xx, timeout ou resposta sem ID ficam como `ERRO` para conferência e reenvio humano. Uma tentativa `ENVIANDO` abandonada por mais de dez minutos também vira `ERRO` sem reenvio automático. Execução manual para antes da leitura da fila; o timeout de 90 segundos é menor que o intervalo de 120 segundos, impedindo duas chamadas concorrentes pelo próprio workflow. Dados de execuções com erro não são retidos pelo n8n. O arquivo é novo e inativo; não o importe ou ative antes da homologação autorizada, com grupo fictício exclusivo e deal de produção incluído na allowlist.

### A. Antes do deploy: credencial e planilha

Nada daqui muda o que a API atual (antiga) faz.

1. **Credencial `Google Sheets - MRBL`** (googleApi, service account, id `72hvCT9jkADwOOo1`): ligue **"Set up for use in HTTP Request node"**, com o escopo `https://www.googleapis.com/auth/spreadsheets`. Sem isso Ler Planilha, Ler Planilha Acao, Gravar Lote, Gravar Anexo e Gravar Erro falham com 401/403. O JSON gerado já traz a credencial em todos os nodes que a usam: não é preciso religar nada à mão.
2. **Abas novas**, com o cabeçalho exato na linha 1 (aba só com cabeçalho funciona):
   - **FORNECEDORES**: `id` | `nome` | `ativo`. `ativo` vazio ou `SIM` aparece na lista, `NAO` esconde; o pedido grava o `nome`.
   - **RESPONSAVEIS**: `nome` | `ativo`, semeada com Gi, Fátima, Cesar, Luana, Lucca e Renata, todos com `ativo` = `SIM`.
   - **ERROS_APP**: `quando` | `usuario` | `tipo` | `deal_id` | `passo` | `url` | `erro` (nessa ordem: a linha é gravada por posição, a partir da coluna A).

   FORNECEDORES e RESPONSAVEIS entram no `values:batchGet` do board: aba ausente derruba o board inteiro (400). ERROS_APP não é lida; sem ela, só o registro da falha se perde.
3. **Cabeçalhos novos**, na próxima coluna livre da linha 1:
   - **PEDIDOS**: `concluido_em`. Confira também `pai`.
   - **FALTANTES**: `origem`. Confira também `atualizado_em_app`.
   - **PEDIDOS_ITENS**: confira `previsao` (logo depois de `fornecedor`).

   Crie à mão antes do deploy: se duas ações criarem a mesma coluna ao mesmo tempo, as duas escolhem a mesma coluna livre e uma sobrescreve a outra (veja o comentário em `src/planilhaLote.js`).
4. **ETAPAS_PEDIDO: não mexa ainda** (é o passo D). Com a API antiga, a maior `ordem` é a etapa que dá a baixa: uma linha `concluido` com ordem 5 agora faria a baixa só em Concluído.

### B. Build e commit fixado

1. `cd n8n && npm test && npm run build`. O build regenera `n8n/build/`, `workflows/*.sdk.js` e `workflows/json/`; depois dele `git status` não pode mostrar diferença nesses arquivos.
2. No site: `cd web && npm test && npm run build && CI=1 npx playwright test`.
3. Faça o push da branch `perf-lote` (sem merge na `main`: o merge publica o site) e anote o hash do commit. É esse commit que o utilitário de deploy vai baixar.

### C. Homolog, só no card de teste

1. Atualize o **"PCP MRBL - API (homolog)"** (webhooks `pcp-login-h`, `pcp-board-h`, `pcp-acao-h`; mesma planilha da produção) com `workflows/json/pcp-api-homolog.json` do commit fixado, pelo **"Utilitario - Deploy PCP (manual)"**.
2. Teste com o site local apontando para os webhooks `-h`, **só na OS de teste** (deal 607479158): baixa (F2); gerar pedido (com fornecedor e responsável); mover; mover para **Enviado ao destino final** (dá a baixa, pede confirmação); arrastar para **Concluído**; dividir em Aguardando entrega; Nova demanda na caixa que saiu da OS de teste. Confira na planilha: PEDIDOS com `baixado_em`/`concluido_em`, FALTANTES com as linhas `POS_SAIDA` e a coluna `origem`, HISTORICO_APP com uma linha por ação, nada gravado fora das colunas da operação, ERROS_APP vazia.
3. **Atenção, salvar etapas:** a ETAPAS_PEDIDO é global e a planilha é a mesma. "Salvar etapas" no homolog **edita a ETAPAS_PEDIDO da produção**, e a API de produção ainda é a antiga. Além do nome que você renomear, o salvar grava a linha `concluido` (ordem 5) que a aba antiga não tem, e a API antiga passa a dar a baixa em Concluído. Por isso **não teste salvar etapas no homolog**; teste depois do deploy (passo D). Se já testou: desfaça o nome renomeado e deixe `nome` e `ordem` da linha `concluido` vazios (não apague a linha).

### D. Produção (n8n)

1. Anote o `activeVersionId` atual do **"PCP MRBL - API"** (`WpuXpcSa5oGiEkTm`) e do **"PCP MRBL - Enviar ao Ploomes"** (`z9misKW25YTuDhJ6`), para o rollback.
2. Rode o **"Utilitario - Deploy PCP (manual)"** com o commit fixado: ele baixa `workflows/json/pcp-api.json` (e `pcp-envio.json`) daquele commit e faz PUT no workflow. **PUT num workflow ativo publica na hora** (não fica rascunho). O utilitário mantém os `webhookId`, então as URLs `pcp-login`, `pcp-board` e `pcp-acao` continuam as mesmas. `DEALS_PERMITIDOS` do envio continua só com o card de teste (`['607479158']`) até o go-live.
3. Logo em seguida, **ETAPAS_PEDIDO**:
   - linha de id `entregue`: `nome` = **Enviado ao destino final** (não mexa em `id` nem em `ordem` = 4);
   - linha nova: `id` = `concluido`, `nome` = **Concluído**, `ordem` = **5**;
   - etapas personalizadas: `entregue` com a penúltima ordem e `concluido` com a maior.

   Agora é seguro: a API nova, sem a linha `concluido`, acrescenta uma etapa Concluído virtual no fim (então `entregue` já é a etapa da baixa), e pedido que a API antiga levou à última etapa com `baixado_em` e sem `concluido_em` conta como concluído. Dá para fazer pelo próprio app (Salvar etapas, perfil ADM, renomeando `entregue`): o salvar grava a linha `concluido`. Pedidos que estavam em "Resolvido" (com `baixado_em`) aparecem em **Enviado ao destino final**, em aberto: o dono arrasta para Concluído quando o destino confirmar.

### E. Site

1. Merge da `perf-lote` na `main` e push, **depois** do passo D (o site novo manda `dividir_pedido` sem etapa, `confirmouBaixa` e `nova_demanda`, que a API antiga não entende).
2. Assim que o site novo estiver no ar, **peça a todos para recarregar a página**. Uma aba aberta com o site antigo recebe 409 "Atualize a página: o site mudou." quando divide mandando outra etapa ou move para a etapa da baixa sem a confirmação nova (não dá baixa nem divide errado), mas continua com as telas antigas até recarregar.

### F. Regras permanentes da planilha

- **Nunca ordene nem apague linhas** nas abas PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, FALTANTES, CAIXAS_PCP, HISTORICO_APP e ERROS_APP. A gravação casa pelo número da linha lido na mesma ação e o append começa logo depois da última linha com dados. Etapa removida = `nome` e `ordem` vazios, nunca a linha apagada.
- **Nunca rode** o "Utilitario - Limpar Planilha Faltantes (manual)": ele apaga a FALTANTES inteira, inclusive as demandas pós-saída, que não voltam pelo sync.
- O **"Sync Faltantes - Google Sheets"** (`s4mbblVXykIvkA8M`) não mexe nas linhas `POS_SAIDA`: só fecha órfãs com o mesmo `deal_id` **e** o mesmo `ciclo` (`PEDIDO`/`CORTE`) e grava por `id`; as demandas têm `ciclo` = `POS_SAIDA`, `origem` = `POS_SAIDA` e id `<deal>|POS_SAIDA|<uuid>`. Esse workflow vive só no n8n: se for alterado, confira de novo.
- O **"Faltantes Painel"** lê a FALTANTES e **mostra as linhas `POS_SAIDA`**. Avise quem usa o painel.
- Falha de gravação: o site mostra "Falha ao gravar na planilha. Avise o PCP antes de tentar de novo." e a ERROS_APP ganha uma linha (parte da ação pode ter sido gravada). Confira a aba antes de repetir a ação.
- O cache do board dura 55 s: mudança feita direto na planilha pode levar até isso para aparecer.

### G. Rollback (os dois lados juntos)

1. **Planilha primeiro:** na ETAPAS_PEDIDO, deixe `nome` e `ordem` da linha `concluido` vazios (não apague a linha) e volte o `nome` de `entregue` para "Resolvido". Pedidos com `etapa` = `concluido`: troque a célula `etapa` para `entregue` (a API antiga não conhece `concluido`). Sem isso a API antiga daria a baixa em Concluído.
2. **n8n:** `restore_workflow_version` para os `activeVersionId` anotados no passo D.1 (API e envio) e publique.
3. **Site:** reverta o merge na `main` e peça para todos recarregarem.

Abas, colunas e linhas novas (FORNECEDORES, RESPONSAVEIS, ERROS_APP, `concluido_em`, `origem`, linhas `POS_SAIDA`) podem ficar: a API antiga não as lê ou as trata como itens comuns da caixa. Linhas já marcadas ENVIADO pelo envio compilado ficam como estão.

## Referência

### PCP MRBL - API (id: WpuXpcSa5oGiEkTm)

| Webhook | URL de produção |
|---|---|
| Login (POST) | https://mrbl-automacoes.duckdns.org/webhook/pcp-login |
| Board (GET) | https://mrbl-automacoes.duckdns.org/webhook/pcp-board |
| Ação (POST) | https://mrbl-automacoes.duckdns.org/webhook/pcp-acao |

O `triggerInfo` do MCP mostra as URLs com o webhookId no caminho (`/webhook/<id>/pcp-login`), mas essas não ficam registradas. As que funcionam são as curtas acima (conferidas com curl em 07/10/2026).

Fonte da verdade: `n8n/src/` e `n8n/adaptadores/`. `npm run build` gera os Code nodes em `n8n/build/`, os `workflows/*.sdk.js` (`scripts/gerar-workflow-sdk.js`) e os `workflows/json/*.json` (`scripts/sdk-para-json.js`, com ids e `webhookId` estáveis e as credenciais). Mudou a lógica: edite `src/`, rode `npm test && npm run build`, faça commit dos arquivos gerados e faça o deploy pelo checklist acima.

Nodes hoje:
- **Login**: Login → Ler USUARIOS (Google Sheets) → Processar Login → Responder Login.
- **Board**: Board → Validar Pedido → Precisa Ler? → (sim) Ler Planilha (`values:batchGet` de FALTANTES, CAIXAS GANHAS, CAIXAS_PCP, HISTORICO_APP, USUARIOS, PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, FORNECEDORES, RESPONSAVEIS) → Montar Board → Responder Board; (não, cache de 55 s) → Responder Board.
- **Ação**: Acao → Pre Validar Acao → Pre OK? → Ler Planilha Acao → Processar Acao → Acao OK? → Montar Alteracao Ploomes → Tem Alteracao Ploomes?. Quando houver alteração de produção, o workflow faz o PATCH do negócio e só libera a planilha depois de resposta 2xx; se o Ploomes falhar, responde 502 e não grava localmente. Depois segue por Montar Escritas → Tem Escritas? → Loop Escritas (1 requisição por vez) → Repetir? → Gravar Lote (batchUpdate, retry 3×) ou Gravar Anexo (append, sem retry: repetir um append que deu certo duplicaria linhas) → de volta ao Loop; ao terminar, Limpar Cache → Responder Acao. Saída de erro do Gravar Lote/Gravar Anexo → Montar Erro → Gravar Erro (append na ERROS_APP, sem retry) → Responder Erro (500).
- Ordem das gravações (`src/planilhaLote.js`): cabeçalhos novos → appends (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, CAIXAS_PCP, FALTANTES; começam logo depois da última linha com dados lida, OVERWRITE) → um batchUpdate → append no HISTORICO_APP (INSERT_ROWS).

**Homolog:** "PCP MRBL - API (homolog)" (`workflows/json/pcp-api-homolog.json`) é o mesmo workflow com webhooks `pcp-login-h`, `pcp-board-h`, `pcp-acao-h`. Usa a **mesma planilha**: edição só no card de teste, e cuidado com o que é global (ETAPAS_PEDIDO).

**Envio ao Ploomes** (`z9misKW25YTuDhJ6`, `workflows/json/pcp-envio.json`): a cada 2 min lê o HISTORICO_APP, agrupa as linhas PENDENTE por deal (libera o grupo quando a linha mais nova tem 10 min; até 30 linhas por registro e 20 grupos por rodada) e cria um InteractionRecord compilado por grupo (`[PCP · OS x] Atualizações do app PCP`, uma linha `• HH:mm texto` por ação). 429 deixa o grupo PENDENTE. **`DEALS_PERMITIDOS`** (`adaptadores/selecionar-envio.js`) hoje é `['607479158']` (só o card de teste); no go-live esvazie de propósito (`[]` = todos os deals), rode `npm run build` e faça o deploy.

**Requisito da VPS.** O container do n8n (`/opt/n8n/docker-compose.yml`) precisa de `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, senão o login falha com "Module 'crypto' is disallowed".

O static data guarda as sessões, as tentativas e o cache. Se ele for perdido (reinício, reimportação), o efeito é só que as pessoas precisam entrar de novo. Execuções não são salvas (`saveData*: none`), porque o corpo do login traz a senha; por isso a falha de gravação vai para a ERROS_APP.

## Histórico (não siga: substituído pelo checklist acima)

As seções abaixo registram as mudanças anteriores. Nodes, passos de deploy e credenciais citados aqui podem não existir mais.

### F2: ação, envio ao Ploomes e allowlist (histórico)

- Webhook `/webhook/pcp-acao` passou a processar baixa/previsão/obs/coluna manual, gravando em FALTANTES (por `id`) ou CAIXAS_PCP (por `deal_id`) e registrando no HISTORICO_APP. "Pre Validar Acao" confere sessão e corpo antes de ler a planilha.
- Workflow "PCP MRBL - Enviar ao Ploomes" criado (um InteractionRecord por linha na época; hoje é compilado).
- A allowlist `DEALS_PERMITIDOS` nasceu aqui (veja a Referência).

### F3: escrita genérica no "PCP MRBL - API" (histórico)

Primeira versão das ações de pedido (gerar, mover, dividir, etapas): um Google Sheets por aba e operação, com Code `Filtrar`/IF `Tem` antes de cada um, pedidos gravando antes da baixa e o histórico por último. Substituída pela leitura/gravação em lote: esses nodes e o `scripts/destinos.js` não existem mais. Planilha da época: `previsao` em PEDIDOS_ITENS e `pai` em PEDIDOS (continuam valendo e estão no checklist).

### Desempenho: leitura e gravação em lote, registro compilado (08/10/2026, histórico)

Desenho: `docs/superpowers/specs/2026-10-08-desempenho-e-compilado-design.md`. Trocou as dezenas de nodes Google Sheets por um `batchGet` por ramo e gravações HTTP em lote (`src/planilhaLote.js`), e o envio passou a ser compilado (`src/envioPloomes.js`). Criou o homolog e a regra de que gravar um workflow ativo pela API pública publica na hora. Exigiu a credencial habilitada para HTTP Request (passo A.1). Os nodes atuais estão na Referência.

### Fornecedor e responsável obrigatórios no pedido (08/10/2026, histórico)

Gerar pedido passou a exigir **Fornecedor** (ou o cliente, quando "Solicitar a" = Cliente) e **Responsável**, escolhidos em listas lidas das abas FORNECEDORES e RESPONSAVEIS (passo A.2). O servidor só confere que os campos não vêm vazios (`gerar_pedido` 400 "Informe o fornecedor." / "Informe o cliente." / "Informe o responsável."; `editar_pedido` não deixa limpar). "Local de entrega" ganhou `OFICINA` e `CLIENTE`. O responsável da caixa (No Ploomes) continua vindo da aba USUARIOS.

### Etapas novas, Saídas divididas e demanda pós-saída (09/10/2026, histórico)

Desenho: `docs/superpowers/specs/2026-10-09-f3-etapas-saidas-demanda-design.md`. Plano: `docs/superpowers/plans/2026-10-09-f3-etapas-saidas-demanda.md`.

No servidor: a **penúltima** etapa (pela ordem) dá a baixa e a **última** finaliza o pedido (`concluido_em`); pedido com baixa só vai para a última; `editar_pedido` não muda etapa; `dividir_pedido` só da antepenúltima ("Aguardando entrega") e a parte vai para a penúltima com a baixa; `salvar_etapas` exige 3 etapas e mantém as duas últimas no fim; saem `enviar_oficina`/`oficina_recebeu`; entra `nova_demanda` (append na FALTANTES com ciclo e origem `POS_SAIDA`, no máximo 30 itens).

A primeira versão deste runbook mandava mudar a ETAPAS_PEDIDO **antes** do deploy. Depois da etapa Concluído virtual (a API nova se adapta à aba antiga), a ordem certa é a do checklist: a aba muda **depois** do deploy (passo D.3), porque a API antiga daria a baixa em Concluído.
