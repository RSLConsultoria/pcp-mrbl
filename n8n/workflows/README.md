# Workflows n8n do PCP MRBL

## Checklist da release (branch `perf-lote` → `main`)

Esta release leva junto: leitura/gravação em lote, registro compilado no Ploomes, fornecedor e responsável obrigatórios, etapas novas (baixa na penúltima, Concluído na última), Saídas divididas, Nova demanda pós-saída e o registro de falhas na ERROS_APP. **Esta lista é a única instrução de deploy válida**; as seções em "Histórico" mais abaixo só explicam como se chegou aqui e não devem ser seguidas.

Siga na ordem. Cada item de planilha é "confira e, se faltar, faça".

## Preparação da F4 — ainda não executar na planilha real

Esta seção documenta o contrato já implementado e testado localmente para o Gantt e o intérprete silencioso. Ela **não autoriza criação de abas, deploy ou conexão com grupos reais**. Esses passos só entram na homologação da F4 depois da demonstração local e do aceite do dono.

Quando a homologação for autorizada, crie as abas abaixo somente com o cabeçalho exato na linha 1. Nunca ordene nem apague suas linhas.

> **Obrigatório antes de publicar qualquer API desta branch, inclusive a homologação:** crie as abas **PRODUCAO**, **OFICINAS**, **WHATSAPP_MENSAGENS**, **WHATSAPP_SUGESTOES** e **PREVISAO_MEDIAS**, com os cabeçalhos abaixo, **antes** de rodar o Utilitário Deploy. O homolog usa a mesma planilha, e o `values:batchGet` do board e da ação já lê essas cinco abas: aba inexistente dá 400 e derruba o board e todas as ações (inclusive as da F3).

- **PRODUCAO**: `deal_id` | `os` | `oficina_id` | `oficina_nome` | `inicio_costura` | `data_combinada` | `lead_time` | `pecas` | `cliente` | `peca` | `referencia` | `em_costura` | `atualizado_em_ploomes` | `sincronizado_em` | `valor_corte`. A coluna `valor_corte` (16/10, "Valor Total - Corte Real" do Ploomes, número em R$) entra **no fim**, sem reordenar as existentes. **Crie-a antes de publicar o Sincronizar Produção:** o sync grava essa coluna e recusa a gravação inteira se ela faltar na aba. Visão de futuro (19/10): mais seis colunas no fim, nesta ordem e depois de valor_corte: etapa_ordem | etapa_nome | etapa_inicio | prevista | inicio_costura_previsto | fim_costura_previsto. A OS na Costura fica em_costura = SIM e prevista = NAO; a OS das etapas 12 a 16 fica em_costura = NAO e prevista = SIM. Crie-as antes de publicar o Sincronizar Produção: o sync grava todas e recusa a gravação inteira se faltar uma.
- **OFICINAS**: `ploomes_id` | `nome` | `grupo_jid` | `grupo_nome` | `ativo` | `atualizado_em`. O sync só pode alterar `ploomes_id`, `nome` e `atualizado_em`; os demais campos são humanos. Visão de futuro (19/10): capacidade_semana no fim (depois de atualizado_em), em peças por semana; vazio = sem capacidade. Só a ação alterar_capacidade_oficina (ADM) grava essa coluna; o sync não mexe nela.
- **WHATSAPP_MENSAGENS**: `id` | `evolution_id` | `quando` | `grupo_jid` | `grupo_nome` | `participante_jid` | `participante_nome` | `direcao` | `tipo` | `tipo_conteudo` | `texto` | `resposta_a_evolution_id` | `deal_id` | `os` | `oficina_id` | `associacao` | `status_envio` | `erro` | `criado_em` | `envio_tentativas` | `envio_proxima` | `interpretacao_status` | `interpretacao_tentativas` | `interpretacao_proxima`. As cinco últimas (novas tentativas do envio e do intérprete, 16/10) entram **no fim**, nessa ordem, sem reordenar as colunas existentes. **Crie-as antes de publicar a API, a entrada e o Interpretar WhatsApp:** a entrada e a associação manual gravam `interpretacao_*`, e a gravação recusa a operação inteira se faltar a coluna (a entrada responderia 503 à Evolution). Ids das mensagens enviadas pelo site: `WA-E-<chave do clique>` (a mesma ação repetida não cria segunda linha) e, no reenvio, `WA-RE-<id da original>` (um reenvio por original; a linha existente é o vínculo).
- **WHATSAPP_SUGESTOES**: `id` | `mensagem_id` | `deal_id` | `os` | `tipo` | `valor` | `resumo` | `evidencia` | `confianca` | `status` | `criado_em` | `decidido_em` | `decidido_por` | `versao`.
- **PREVISAO_MEDIAS** (19/10): tipo | etapa | faixa | oficina_id | valor | amostra | calculado_em | chave. Gravada só pelo workflow PCP MRBL - Médias de Previsão. chave = tipo|etapa|faixa|oficina_id (a linha é casada por ela). tipo: DURACAO (etapa, faixa), DURACAO_GERAL, DURACAO_PCP, FILA (etapa, faixa; vale só com amostra >= 5), FILA_GERAL, COSTURA_OFICINA (17, faixa, oficina_id). Chave que sumiu do cálculo fica com valor vazio e amostra 0: nunca ordene nem apague linhas. Aba só com o cabeçalho funciona (a tela avisa "Previsão sem histórico").

As operações da F4 recusam a ação antes da primeira escrita se faltar uma coluna usada por ela. O navegador não recebe `grupo_jid`, `participante_jid`, IDs internos da Evolution nem credenciais. O workflow de entrada apenas registra e sugere: ele não pode conter node de envio ou resposta ao grupo.

O workflow agendado da produção é gerado em `workflows/json/pcp-producao-sync.json` com o nome **PCP MRBL - Sincronizar Produção**. Ele consulta a etapa Costura a cada cinco minutos, faz upsert por `deal_id`, marca como `NAO` as linhas que saíram da etapa e atualiza em `OFICINAS` somente os campos vindos do Ploomes. O arquivo gerado é um workflow novo e inativo; não o importe, ative ou execute antes da homologação autorizada da F4.

O envio da fila é gerado em `workflows/json/pcp-whatsapp-saida.json` com o nome **PCP MRBL - Enviar WhatsApp**. A cada dois minutos ele escolhe somente a pendência mais antiga, grava `ENVIANDO` antes da chamada e usa o contrato instalado da Evolution (`POST /message/sendText/producao`, corpo `number` + `text`). Sucesso grava `evolution_id` e `ENVIADA`. **Novas tentativas automáticas (16/10):** a função pura `classificarEnvioWhatsapp` separa os casos. Antes do envio, o node **Consultar Conexão** faz `GET /instance/connectionState/producao`; se o estado não for `open` (ou a consulta falhar de qualquer jeito), o `sendText` nem é chamado e **Resultado sem Conexão** devolve a mensagem à fila (é certeza de que não saiu). No `sendText`, há certeza de que não saiu só com conexão recusada, DNS, host inalcançável, HTTP 429 ou 404 de instância inexistente ("does not exist"/"instance not found"); então a linha volta para `PENDENTE` com `envio_tentativas` + 1 e `envio_proxima` com espera de 5, 15, 30 e 60 minutos; a seleção só pega `PENDENTE` cuja `envio_proxima` já passou; na 5ª falha vira `ERRO` com o botão Reenviar. Quando é incerto (timeout, conexão cortada, 5xx, 2xx sem ID), continua como antes: `ERRO` e reenvio humano, sem repetição automática. Qualquer outro 4xx vira `ERRO` sem repetir: a Evolution v2 embrulha em 400, com texto livre, falhas que podem acontecer depois de a mensagem sair. A tela mostra "Aguardando nova tentativa (n de 5)". O node "Gravar Resultado WhatsApp" grava as colunas novas pelo Google Sheets (se faltarem, ele as cria no fim), mas crie-as antes para manter a ordem. Uma tentativa `ENVIANDO` abandonada por mais de dez minutos também vira `ERRO` sem reenvio automático. Execução manual para antes da leitura da fila; o timeout de 90 segundos é menor que o intervalo de 120 segundos, impedindo duas chamadas concorrentes pelo próprio workflow. Dados de execuções com erro não são retidos pelo n8n. O arquivo é novo e inativo; não o importe ou ative antes da homologação autorizada, com grupo fictício exclusivo e deal de produção incluído na allowlist.

A entrada da Evolution é gerada em `workflows/json/pcp-whatsapp-entrada.json` com o nome **PCP MRBL - Receber WhatsApp**. Ela aceita somente `MESSAGES_UPSERT` da instância `producao`, ignora mensagens próprias e grupos fora da aba `OFICINAS`, deduplica por `evolution_id`, grava a mensagem antes da interpretação e nunca responde ao grupo. O webhook confirma HTTP 200 somente depois de persistir a mensagem, ou ao reconhecer um evento que deve ser ignorado; falha anterior à gravação retorna 503 para permitir a reentrega. A interpretação acontece depois da confirmação e uma falha nela preserva a mensagem recebida. O modelo recebe o texto, o horário e o contexto da OS montado por `montarContextoInterpretacao` (peça, quantidade, oficina, datas, prazo vigente e status, faltas abertas de costura e acabamento e as últimas 10 mensagens da conversa daquela OS, com textos cortados em 500 caracteres); por isso o workflow lê também `FALTANTES` e `CAIXAS GANHAS`. Telefone, participante e JID do grupo não seguem para o intérprete. Falhas técnicas são resumidas em `ERROS_APP`, sem payload ou texto integral, e os dados das execuções não ficam retidos.

Mensagens recebidas e suas sugestões usam IDs determinísticos. A leitura do board consolida linhas repetidas com o mesmo ID e, para sugestões, prefere a decisão humana já registrada. Isso contém uma entrega simultânea duplicada sem mostrar duas conversas ou duas sugestões; a planilha pode manter duas linhas físicas iguais nessa corrida rara, porque o Google Sheets não oferece uma restrição única atômica. A homologação deve disparar duas entregas iguais e confirmar esse comportamento antes da ativação.

Esse workflow contém dois bloqueios intencionais de ativação: o caminho `pcp-whatsapp-entrada-CONFIGURAR_SEGREDO` e o subworkflow `CONFIGURAR_INTERPRETE`. **Atenção:** publicar este workflow pelo Utilitário Deploy grava o JSON do repositório e volta o caminho do webhook de entrada para `pcp-whatsapp-entrada-CONFIGURAR_SEGREDO` (e o subworkflow para `CONFIGURAR_INTERPRETE`); depois de cada deploy, reaplique no n8n o caminho secreto e o intérprete e só então reative, senão a Evolution passa a receber 404 e as mensagens se perdem. Antes da homologação, crie fora do repositório um caminho aleatório para o webhook, escolha a credencial/modelo no n8n e configure um subworkflow que receba o contexto e devolva `{ "interpretacao": { "tipo", "valor", "resumo", "evidencia", "confianca" } }`. Não publique nem ative enquanto qualquer marcador `CONFIGURAR_` existir. O telefonista atual encaminha o payload bruto da Evolution; preserve o fluxo existente e acrescente o novo destino somente no teste de homologação autorizado.

**Interpretação da associação manual (ajuste de 16/10).** O workflow gerado em `workflows/json/pcp-interpretar-whatsapp.json`, com o nome **PCP MRBL - Interpretar WhatsApp**, começa por um Execute Workflow Trigger (`passthrough`) que recebe `{ mensagemId, dealId }`. Ele lê as mesmas abas da entrada (OFICINAS, PRODUCAO, WHATSAPP_MENSAGENS, WHATSAPP_SUGESTOES, FALTANTES, CAIXAS GANHAS), monta o mesmo contexto do intérprete (`prepararInterpretacaoManualWhatsapp` → `montarContextoInterpretacao`), chama o mesmo subworkflow do modelo (`CONFIGURAR_INTERPRETE`), valida com `validarInterpretacaoWhatsapp` (via `concluirEntradaWhatsapp`) e grava a sugestão `PENDENTE` com o id determinístico `WA-S-…`. Mensagem que já tem sugestão (de qualquer status), não textual ou que mudou de OS não é interpretada. Falhas vão resumidas para `ERROS_APP` (tipo `WHATSAPP_INTERPRETAR`, só o `deal_id`, sem o texto). Nunca responde nem envia ao grupo.

Na API (`pcp-api` e `pcp-api-homolog`), depois de gravar uma `associar_whatsapp` de mensagem textual sem sugestão, o caminho Limpar Cache → **Pedir Interpretação?** → **Montar Pedido de Interpretação** → **Disparar Interpretação** (Execute Workflow com `waitForSubWorkflow` = false e `onError` = continuar) → Responder Acao dispara o workflow novo sem esperar; a resposta ao site não muda e uma falha no disparo não muda a resposta. Os ids dos subworkflows ficam numa constante só, `n8n/scripts/ids-subworkflows.js` (marcadores `CONFIGURAR_INTERPRETE` e `CONFIGURAR_INTERPRETAR_WHATSAPP` até o workflow existir no n8n).

**Novas tentativas do intérprete (16/10).** Toda mensagem que precisa do intérprete fica com `interpretacao_status` = `PENDENTE`, `interpretacao_tentativas` e `interpretacao_proxima`. A entrada já grava a mensagem com a 1ª tentativa reservada (tentativas 1, próxima em 10 min); a associação manual grava tentativas 0 e próxima em 10 min (se o disparo falhar, o agendamento pega); o Interpretar WhatsApp reserva cada tentativa (node **Gravar Tentativa de Interpretação**, tentativas + 1, próxima em 10 min) antes de chamar o modelo. Se a chamada falhar (erro, cota, fora do ar, resposta inválida), nada mais é gravado além do `ERROS_APP`. O workflow novo **PCP MRBL - Retentar Interpretação** (`workflows/json/pcp-retentar-interpretacao.json`), a cada 15 minutos, lê PRODUCAO, WHATSAPP_MENSAGENS e WHATSAPP_SUGESTOES, deduplica as linhas físicas (vale a primeira) e, num batchUpdate só (**Marcar Tentativas** → **Gravar Tentativas**), marca `ERRO` nas mensagens que já tiveram 5 tentativas sem sugestão (a conversa mostra "Não foi possível interpretar esta mensagem.") e **conta a tentativa** das vencidas (tentativas + 1, próxima em 10 min). Só depois de gravar manda até 10 vencidas por rodada, uma a uma, ao Interpretar WhatsApp (Execute Workflow `each`) com `reservada: true`; nesse caso o Interpretar só renova a próxima, sem contar de novo. Assim, mesmo que o Interpretar nunca chegue a rodar (id errado, falha ao ler o contexto), a mensagem vira `ERRO` depois de 5 rodadas. Se a gravação das tentativas falhar, o workflow para sem disparar. Sucesso é ter sugestão para a mensagem (uma por mensagem, em qualquer status): por isso não é preciso limpar o status. Interpretação válida, inclusive `OBSERVACAO`, gera sugestão e encerra as tentativas.

**Ordem de publicação da F4 (WhatsApp).** Não publique a F4 sozinha: o go-live é conjunto com a visão de futuro e vale a **sequência única** da seção seguinte. Os passos abaixo detalham as etapas da F4 que entram nela:

0. **Colunas:** acrescente as cinco colunas novas no fim da `WHATSAPP_MENSAGENS` (`envio_tentativas`, `envio_proxima`, `interpretacao_status`, `interpretacao_tentativas`, `interpretacao_proxima`), sem reordenar.
1. **Subworkflow do intérprete:** crie-o no n8n (modelo e credencial ficam fora do repositório) e **publique-o**. No n8n 2.x o Execute Workflow chama a **versão publicada** do subworkflow; um rascunho salvo não vale.
2. **PCP MRBL - Interpretar WhatsApp:** crie-o a partir de `workflows/json/pcp-interpretar-whatsapp.json` e **publique-o** também (ele não tem gatilho próprio; roda quando a API ou o Retentar o chamam, sempre na versão publicada).
3. **Ids:** em `n8n/scripts/ids-subworkflows.js` troque `CONFIGURAR_INTERPRETE` e `CONFIGURAR_INTERPRETAR_WHATSAPP` pelos ids reais (não são segredo), rode `npm test && npm run build` e commite. Os testes aceitam o marcador ou um id real e recusam vazio. Com os ids no repositório, nenhum deploy volta o marcador. Republique o Interpretar WhatsApp com o JSON novo (agora com o id do intérprete).
4. **Receber WhatsApp e Enviar WhatsApp:** republique os dois com o JSON novo, só depois das colunas do passo 0. O deploy do Receber volta o caminho do webhook para `pcp-whatsapp-entrada-CONFIGURAR_SEGREDO`: reaplique o caminho secreto (e o id do intérprete, se ainda estiver como `CONFIGURAR_INTERPRETE`) antes de reativar, senão a Evolution recebe 404.
5. **API:** publique o homolog e, com o ok do dono, a produção.
6. **PCP MRBL - Retentar Interpretação:** crie a partir de `workflows/json/pcp-retentar-interpretacao.json` e ative.

Se a API for publicada com o marcador, a associação continua funcionando, mas nenhuma interpretação é disparada (o disparo falha e segue para a resposta); a mensagem fica a interpretar e o Retentar a pega quando o id estiver certo.

**Visão de futuro e carga das oficinas (19/10).** O motor de previsão (`n8n/src/previsao.js`) reimplementa a regra do BI do dono. O workflow novo **PCP MRBL - Médias de Previsão** (`workflows/json/pcp-medias-previsao.json`) roda todo dia às 3h (fuso de São Paulo): lê todos os registros de interação com o marcador 60151285 e os negócios dos funis PCP (60011710) e Produção (60015827), calcula durações, filas e a Costura por oficina e grava a `PREVISAO_MEDIAS`. Falha de leitura, página inválida ou nenhum registro reconhecido: nada é gravado (as médias anteriores ficam) e vai uma linha `medias_previsao` para o `ERROS_APP`. O **Sincronizar Produção** passa a ler também as OS em aberto desses dois funis (node **Buscar Previstas no Ploomes**), filtra as etapas 12 a 16 pelo número no nome do estágio (12 e 13 só com "PCP completo pelo Ploomes?" = sim) e grava a chegada e o fim previstos da Costura nas colunas novas da `PRODUCAO`.

O Sincronizar Produção passa a depender também da consulta das previstas (todos os cards em aberto dos funis PCP e Produção a cada 5 min): se ela falhar após os retries, o ciclo vai para o erro e a Costura também não atualiza. Acompanhe a duração e os 429 na homologação.

FieldKeys de `n8n/src/previsao.js` **confirmadas em leitura real do Ploomes em 19/10/2026** e já gravadas no código: `CAMPO_PECAS_PEDIDO`, `CAMPO_PCP_COMPLETO` (sim/não em `BoolValue`), `CAMPO_REGISTRO_INICIO`, `CAMPO_REGISTRO_TERMINO` e `CAMPOS_ENTRADA_ETAPA` (12 a 16). O texto real do registro é "Dado data 12. Encaixe" (o parser `etapaDoTextoRegistro` lê o número) e o filtro `Tags/any(t: t/TagId eq 60151285)` foi aceito pelo Ploomes. Se uma chave ficar vazia ou com `CONFIGURAR_`, o campo é lido como vazio: a previsão usa o fallback (duração 1, fila 0) e o Médias de Previsão só registra o aviso.

O usuário "ALOCAR" do Ploomes ("Será produzido por") pode aparecer como linha na OFICINAS: é de propósito (escolher ALOCAR na tela grava esse usuário); a Carga não o mostra como oficina e manda essas OS para "A alocar".

As ações de produção (alterar, WhatsApp, sugestões, associação) recusam OS prevista com 409 "Esta OS ainda não chegou na Costura.".

**Sequência única de publicação (F4 + visão de futuro), depois do aceite do dono.** O go-live é conjunto; siga esta ordem e use os passos da F4 acima como detalhe:

1. **Planilha primeiro, antes de qualquer API ou sync:** todas as abas e colunas das duas frentes, sem reordenar nada. F4: abas `PRODUCAO`, `OFICINAS`, `WHATSAPP_MENSAGENS`, `WHATSAPP_SUGESTOES` e as cinco colunas novas no fim da `WHATSAPP_MENSAGENS` (passo 0 da F4). Visão de futuro: aba `PREVISAO_MEDIAS` (só o cabeçalho), as seis colunas novas no fim da `PRODUCAO` e `capacidade_semana` no fim da `OFICINAS`. O board e o sync leem as abas novas: sem elas, o `batchGet` dá 400.
2. **Homologação dos campos (feita em 19/10):** FieldKeys, formato do texto dos registros, filtro de `Tags` e StageIds das etapas 12 a 16 confirmados numa leitura real e aplicados; a URL das previstas já filtra pelos 5 StageIds. O `$expand=OtherProperties` já está restrito às FieldKeys realmente lidas (`OtherProperties($filter=FieldKey eq '...' or ...)`, sintaxe testada numa leitura real em Deals e InteractionRecords; lista derivada de `fieldKeysConsulta` em `src/previsao.js`, com teste que compara as chaves lidas pelo código com as da URL). **Pendente:** medir memória e tempo na primeira execução manual.
3. **Conferência com o BI (fora do repositório):** calcule a previsão de 5 OS reais e compare com o BI do dono, incluindo uma com peças do corte = 0, antes de seguir. O caso da etapa 16 já está resolvido por decisão do dono (19/10): a duração da própria etapa 16 não entra no cálculo, porque a fila até a Costura já contém esse tempo.
4. **Workflows:** subworkflow do intérprete e Interpretar WhatsApp (publicados), ids em `ids-subworkflows.js`, Receber e Enviar WhatsApp (reaplicar o caminho secreto), **PCP MRBL - Médias de Previsão** (a partir do JSON em commit fixo, execute uma vez à mão, confira a `PREVISAO_MEDIAS` e só então ative), **Sincronizar Produção** (JSON novo, 12 nodes) e **Retentar Interpretação** (ativar por último, depois da API).
5. **API:** homologação (`dI2NUYzxfApYM8iA`) e, com o ok do dono, produção (`WpuXpcSa5oGiEkTm`).
6. **Site:** merge na `main` e push; peça para todo mundo recarregar.

Rollback: volte API, sync e site juntos e desative o Médias de Previsão. As colunas e a aba novas podem ficar (as versões anteriores não as leem).

### A. Antes do deploy: credencial e planilha

Nada daqui muda o que a API atual (antiga) faz.

1. **Credencial `Google Sheets - MRBL`** (googleApi, service account, id `72hvCT9jkADwOOo1`): ligue **"Set up for use in HTTP Request node"**, com o escopo `https://www.googleapis.com/auth/spreadsheets`. Sem isso Ler Planilha, Ler Planilha Acao, Gravar Lote, Gravar Anexo e Gravar Erro falham com 401/403. O JSON gerado já traz a credencial em todos os nodes que a usam: não é preciso religar nada à mão.
2. **Abas novas**, com o cabeçalho exato na linha 1 (aba só com cabeçalho funciona). Nesta branch (F4), inclua também **PRODUCAO**, **OFICINAS**, **WHATSAPP_MENSAGENS** e **WHATSAPP_SUGESTOES** com os cabeçalhos da seção "Preparação da F4": elas entram no `values:batchGet` do board e da ação, e precisam existir antes de publicar qualquer API (homolog ou produção):
   - **FORNECEDORES**: `id` | `nome` | `ativo`. `ativo` vazio ou `SIM` aparece na lista, `NAO` esconde; o pedido grava o `nome`.
   - **RESPONSAVEIS**: `nome` | `ativo`, semeada com Gi, Fátima, Cesar, Luana, Lucca e Renata, todos com `ativo` = `SIM`.
   - **ERROS_APP**: `quando` | `usuario` | `tipo` | `deal_id` | `passo` | `url` | `erro` (nessa ordem: a linha é gravada por posição, a partir da coluna A).

   FORNECEDORES, RESPONSAVEIS e as quatro abas da F4 entram no `values:batchGet` do board (e as da F4 também no da ação): aba ausente derruba o board inteiro e as ações (400). ERROS_APP não é lida; sem ela, só o registro da falha se perde.
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
- A PREVISAO_MEDIAS é só do workflow de médias: não edite à mão, não ordene e não apague linhas.

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
- **Board**: Board → Validar Pedido → Precisa Ler? → (sim) Ler Planilha (`values:batchGet` de FALTANTES, CAIXAS GANHAS, CAIXAS_PCP, HISTORICO_APP, USUARIOS, PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, FORNECEDORES, RESPONSAVEIS, PRODUCAO, OFICINAS, WHATSAPP_MENSAGENS, WHATSAPP_SUGESTOES) → Montar Board → Responder Board; (não, cache de 55 s) → Responder Board.
- **Ação**: Acao → Pre Validar Acao → Pre OK? → Ler Planilha Acao (`values:batchGet` de FALTANTES, CAIXAS_PCP, CAIXAS GANHAS, PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, PRODUCAO, OFICINAS, WHATSAPP_MENSAGENS, WHATSAPP_SUGESTOES e o cabeçalho do HISTORICO_APP) → Processar Acao → Acao OK? → Montar Alteracao Ploomes → Tem Alteracao Ploomes?. Quando houver alteração de produção, o workflow faz o PATCH do negócio e só libera a planilha depois de resposta 2xx; se o Ploomes falhar, responde 502 e não grava localmente. Depois segue por Montar Escritas → Tem Escritas? → Loop Escritas (1 requisição por vez) → Repetir? → Gravar Lote (batchUpdate, retry 3×) ou Gravar Anexo (append, sem retry: repetir um append que deu certo duplicaria linhas) → de volta ao Loop; ao terminar, Limpar Cache → Pedir Interpretação? → (associação manual de texto sem sugestão) Montar Pedido de Interpretação → Disparar Interpretação (sem esperar) → Responder Acao; (demais ações) → Responder Acao. Saída de erro do Gravar Lote/Gravar Anexo → Montar Erro → Gravar Erro (append na ERROS_APP, sem retry) → Responder Erro (500).
- Ordem das gravações (`src/planilhaLote.js`): cabeçalhos novos → appends (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, CAIXAS_PCP, FALTANTES; começam logo depois da última linha com dados lida, OVERWRITE) → um batchUpdate → append no HISTORICO_APP (INSERT_ROWS).

**Homolog:** "PCP MRBL - API (homolog)" (`workflows/json/pcp-api-homolog.json`) é o mesmo workflow com webhooks `pcp-login-h`, `pcp-board-h`, `pcp-acao-h`. Usa a **mesma planilha**: edição só no card de teste, e cuidado com o que é global (ETAPAS_PEDIDO).

**Card de teste do funil Produção (F4):** deal `607612577` (card fictício criado pelo dono). É o único em `DEALS_PRODUCAO_EDITAVEIS` (`src/api.js`), que libera a edição de produção e o envio de WhatsApp da F4; não há outra allowlist de WhatsApp. No go-live esvazie a lista (`[]` = todos).

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
