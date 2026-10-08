> **08/10/2026 (Resolvido e previsão por item):** decisões do dono.
> - **"Resolvido" é a última etapa.** As etapas padrão passam a ser A pedir · Solicitado · Aguardando entrega · **Resolvido** (id `entregue` mantido, só o nome muda, para os dados existentes continuarem valendo). A última etapa (maior ordem) é sempre a "Resolvido", qualquer que seja o nome. **Mover um pedido para ela dá a baixa** (a mesma regra do `baixar_pedido`: `qtd_baixada += min(qtd, resta)` por item, pula SUBSTITUIDO) e grava `baixado_em` (finalizado). Vale para `mover_pedido`, `editar_pedido` com etapa = última (com as quantidades já editadas) e `dividir_pedido` com destino na última (a baixa é só da parte nova). Histórico por OS: `Lucca moveu PED-0044 para Resolvido e deu baixa: 20 MT de VIÉS (resta 80 MT)`. Depois da baixa o pedido não sai mais da última etapa (409 `Pedido finalizado não pode ser alterado.`). O `baixar_pedido` continua no servidor por compatibilidade, mas sai da tela o botão "Dar baixa nas caixas": soltar o card em Resolvido, ou escolher Resolvido na Etapa do painel e salvar, ou dividir para Resolvido abre a confirmação na própria tela `Mover para Resolvido dá baixa de N itens em M OS. A baixa não pode ser desfeita.` com Confirmar (ouro) e Cancelar. Em Solicitações, os finalizados aparecem na coluna Resolvido com o filtro Todos ou Finalizados (Em aberto continua escondendo).
> - **Previsão por item.** PEDIDOS_ITENS ganha `previsao` (aaaa-mm-dd, opcional; vazia = a do pedido). `gerar_pedido` e `editar_pedido` aceitam `previsao` por item (resumo `previsão de <item>: a → b`, comparando a previsão que vale); `dividir_pedido` leva a previsão do item para a parte. Ação nova `dividir_por_previsao { pedidoId, versao }`: agrupa os itens pela previsão que vale; a data mais próxima fica no pedido e cada outra data vira uma parte `<PAI>.<n>` na etapa do pedido, com a previsão do grupo (sem data por último); 400 `Os itens têm a mesma previsão.` com uma data só; resposta com `pedidoId` (a primeira parte) e `partes`. Histórico por OS: `Lucca dividiu PED-0044 por previsão: 6 UN de ZÍPER foram para PED-0044.1 (previsão 20/10)`. No board, o item do pedido traz `previsao` (a que vale) e o pedido ganha `previsaoMaisProxima` e `previsoesDiferentes`. Telas: campo "Previsão" por item no Gerar pedido (vazio = "Igual à do pedido") e no painel; o card mostra a data mais próxima e o selo "previsões diferentes"; a seção Dividir tem o atalho **Dividir por previsão** (só com previsões diferentes) com a prévia das partes.
> - **Saídas com falta:** colunas **Sem pedido** (só com caixa nela) · as etapas de Solicitações **menos a última** · **Resolvido** (sem item aberto, ou todos os pedidos abertos dos itens abertos na última etapa; mostra "Enviar à oficina" em ouro) · **Enviado à oficina** · **Concluído** (`tratativa = RECEBIDO`, visível por 30 dias). `enviar_oficina` continua com o 409 quando falta material: passa com a caixa sem item aberto (tudo baixado) ou com todo item aberto em pedido e todos esses pedidos na última etapa.
> - **Planilha (produção):** na ETAPAS_PEDIDO, trocar o `nome` da linha `entregue` de "Entregue" para "Resolvido" (manter id e ordem); na PEDIDOS_ITENS, criar a coluna `previsao` no cabeçalho (depois de `fornecedor`; linhas antigas ficam vazias).

> **08/10/2026 (Saídas segue Solicitações):** decisão do dono: toda falta é tratada antes de a caixa ir à oficina, então Saídas com falta conversa com Solicitações de faltas. As colunas de Saídas passam a ser **Sem pedido** (só aparece quando alguma caixa tem item aberto sem pedido) + **as mesmas etapas do quadro de Solicitações, na ordem dele** + Enviado à oficina + Resolvido; saem Sem tratativa, Aguardando material e Material no almoxarifado. A caixa fica na etapa do **pedido mais atrasado** dos seus itens abertos (pedido em etapa que saiu do quadro conta como a primeira e aparece como "Outra etapa"). **Enviar à oficina** só aparece (em ouro) com todo o material na última etapa; o servidor recusa com 409 `O material desta caixa ainda não chegou (etapa <última etapa>).`

> **08/10/2026 (dividir pedido):** quando parte de um pedido chega (entrega parcial do fornecedor ou do cliente), o painel do pedido tem **Dividir pedido**: marca os itens que chegaram, opcionalmente só parte da quantidade (ex.: 20 de 52 UN), e a etapa de destino. Isso vira um pedido novo `<PAI>.<n>` (`PED-0002.1`; n = maior parte existente da família + 1) ligado ao original pela coluna `pai` da PEDIDOS, com origem/quem/local/previsão/responsável copiados. O original fica com o resto na etapa dele (item que foi todo vira `qtd` 0 na PEDIDOS_ITENS e é ignorado na leitura). Mover o pedido inteiro continua sendo arrastar o card (400 `Para mover o pedido inteiro, arraste o card.`). Dividir uma parte cria outra parte da mesma raiz. Ação `dividir_pedido { pedidoId, versao, etapa, itens: [{ itemId, qtd }] }`, resposta com `pedidoId` = id da parte nova; histórico por OS: `Lucca dividiu PED-0002: 20 UN de ZÍPER METAL foram para PED-0002.1 (Recebidos)` (vários itens separados por `; `). Cada parte tem baixa própria. Um item pode estar em vários pedidos abertos **da mesma família**; de outra família continua 409. No board, o pedido ganha `pai` ('' no original) e o item ganha `pedidoIds` (todos os pedidos abertos com o item; `pedidoId` = o primeiro).

> **08/10/2026:** finalizado = pedido com baixa registrada (baixado_em), independente da etapa — evita reabrir pedidos ao mudar as etapas.

# F3: Solicitações de faltas e Saídas com falta

Data: 08/10/2026 · Autor: Lucca (RSL Consultoria) · Status: aprovado em conversa. A conferência é local, antes de publicar.

Terceira de cinco fases. Usa a base da F2: `pcp-acao`, HISTORICO_APP, envio assíncrono ao Ploomes e restrição de edição. Referências: README do handoff (telas 2 e 3) e protótipo `PCP MRBL.dc.html`.

## Decisões

- O pedido existe **só no app**, na planilha, e gera um registro de interação **em cada OS envolvida**. Não há card de Compras no Ploomes.
- "Enviar à oficina" **não manda WhatsApp na F3**. Só marca, grava no histórico e registra no Ploomes. O aviso por WhatsApp entra na F4.
- **Tudo é testado só na OS de teste** (negócio 607479158). Ações que envolvem qualquer outro negócio respondem 403. As listas `DEALS_EDITAVEIS` e `DEALS_PERMITIDOS` continuam como estão.
- **Visual:** segue a direção da tela No Ploomes (`web/src/styles/app.css`).
  - Uma barra escura e o fundo claro frio `#F2F3F6`.
  - Cards brancos com faixa colorida à esquerda.
  - Ouro só no botão principal de cada tela ("Gerar pedido", "Confirmar" de mover para Resolvido, "Enviar à oficina").
  - Nada de monoespaçada.
  - Pedidos: faixa navy (`--navy`) quando a origem é Fornecedor e ouro (`--signal`) quando é Cliente.
  - Saídas: faixa na cor da caixa. O selo "saiu há N dias" fica vermelho (`--erro-text`) a partir de 7 dias.
- As guias "Saídas com falta" e "Solicitações de faltas" passam a funcionar. Controle de produção e Visão das peças continuam desabilitadas.
- **Conferência local:** antes de publicar, o dono vê as telas no ambiente local com o servidor simulado. Os workflows do n8n ficam em rascunho até o ok dele.

## Dados (abas novas na planilha)

**PEDIDOS** (chave `id`)

| Coluna | Conteúdo |
|---|---|
| `id` | `PED-0001`… |
| `etapa` | id da etapa |
| `origem` | `FORNECEDOR` \| `CLIENTE` |
| `quem` | texto |
| `local` | `BRAGANCA` \| `SAO_PAULO` |
| `previsao` | `aaaa-mm-dd` |
| `responsavel` | |
| `criado_em` | ISO |
| `criado_por` | |
| `baixado_em` | ISO ou vazio |
| `atualizado_em` | ISO; é a versão |

**PEDIDOS_ITENS** (chave `id` = `<pedido>|<item_id>`): `pedido_id`, `item_id` (id da FALTANTES), `deal_id`, `os`, `nome`, `un`, `qtd`, `fornecedor`, `previsao` (aaaa-mm-dd ou vazia = a do pedido).

**ETAPAS_PEDIDO** (chave `id`): `id`, `nome`, `ordem`.
- Se a aba estiver vazia, vale o padrão: `a_pedir` "A pedir", `solicitado` "Solicitado", `aguardando` "Aguardando entrega", `entregue` "Resolvido".
- A última etapa (maior ordem) é sempre a "Resolvido": entrar nela dá a baixa nas caixas.

**CAIXAS_PCP** ganha `tratativa` (`''` | `ENVIADO` | `RECEBIDO`) e `tratativa_em`.

Um item da FALTANTES pertence a no máximo **um** pedido aberto, ou a várias partes da mesma família (`PED-0002`, `PED-0002.1`…). Os pedidos finalizados (com `baixado_em`) não contam.

## Board (GET pcp-board) devolve também

- `pedidos`: lista de `{ id, pai, etapa, origem, quem, local, previsao, previsaoMaisProxima, previsoesDiferentes, responsavel, criadoEm, baixadoEm, versao, finalizado, itens: [{ itemId, dealId, os, nome, un, qtd, fornecedor, previsao }] }`. `finalizado` é verdadeiro quando o pedido tem `baixadoEm`. A `previsao` do item é a que vale (a dele ou a do pedido).
- `etapasPedido`: lista de `{ id, nome, ordem }`, ordenada.
- No item: `pedidoId` (pedido aberto que contém o item, ou `''`).
- Na caixa: `tratativa` e `tratativaEm`.

## Ações novas (POST pcp-acao)

Cada ação gera, para cada OS envolvida, uma linha no HISTORICO_APP no formato da F2. O envio ao Ploomes fica com o mesmo workflow.

| tipo | Corpo | Efeito | Texto do histórico (por OS) |
|---|---|---|---|
| `gerar_pedido` | `{ itens: [{ itemId, dealId, qtd, fornecedor, previsao? }], origem, quem, local, previsao, responsavel }` | Cria o PEDIDOS na primeira etapa e as linhas de PEDIDOS_ITENS. O id é o maior PED existente + 1. | `Lucca gerou PED-0044 · 2 itens desta OS · Fornecedor <quem>` |
| `editar_pedido` | `{ pedidoId, versao, campos: { etapa?, origem?, quem?, local?, previsao?, responsavel? }, itens?: [{ itemId, qtd, fornecedor, previsao? }] }` | Atualiza o pedido e seus itens. Etapa = última dá a baixa (com as quantidades editadas). | `Lucca alterou PED-0044: <resumo das mudanças>` |
| `mover_pedido` | `{ pedidoId, versao, etapa }` | Muda a etapa. Para a última etapa, dá a baixa e grava `baixado_em`. | `Lucca moveu PED-0044 para <etapa>` (+ ` e deu baixa: 20 MT de VIÉS (resta 80 MT)` na última) |
| `dividir_pedido` | `{ pedidoId, versao, etapa, itens: [{ itemId, qtd }] }` | Cria a parte `<PAI>.<n>` na etapa escolhida com os itens/quantidades que chegaram; o original fica com o resto. Na última etapa a parte já nasce com a baixa. | `Lucca dividiu PED-0002: 20 UN de ZÍPER METAL foram para PED-0002.1 (Recebidos)` |
| `dividir_por_previsao` | `{ pedidoId, versao }` | Uma parte por data de previsão dos itens, na etapa do pedido; a data mais próxima fica. 400 com uma data só. | `Lucca dividiu PED-0044 por previsão: 6 UN de ZÍPER foram para PED-0044.1 (previsão 20/10)` |
| `baixar_pedido` | `{ pedidoId, versao }` | Compatibilidade (sem botão na tela). Só na última etapa. Dá baixa da `qtd` de cada item na FALTANTES (soma em `qtd_baixada`, limitada ao que resta) e grava `baixado_em`. | `Lucca deu baixa do PED-0044: 20 MT de VIÉS… (resta 80 MT)` |
| `salvar_etapas` | `{ etapas: [{ id?, nome }] }` | Regrava a ETAPAS_PEDIDO. Só perfil ADM (403 `Só administradores podem alterar as etapas do quadro.`). Valida: no mínimo 2 etapas, nomes não vazios e únicos, não remove etapa que tenha pedido aberto, e a última etapa atual (Resolvido) continua por último: pode ser renomeada, mas não removida nem movida (400 `A última etapa (Resolvido) precisa continuar por último.`). | Não gera histórico de OS. |
| `enviar_oficina` | `{ dealId, versao }` | Só com a caixa sem item aberto (tudo baixado) ou com todo o material na última etapa (todo item aberto com pedido aberto e todos os pedidos abertos dele, original e partes, na última etapa); senão 409 `O material desta caixa ainda não chegou (etapa <nome da última etapa>).` Grava `tratativa = ENVIADO`. | `Lucca enviou o material faltante à oficina` |
| `oficina_recebeu` | `{ dealId, versao }` | Baixa total dos itens abertos da caixa e `tratativa = RECEBIDO`. | `Lucca registrou que a oficina recebeu o material` |

**Validações:**
- Todos os `dealId` envolvidos têm que ser editáveis; se não forem, a resposta é 403.
- Item inexistente ou já em pedido aberto: 409 `Item já está no PED-00xx.`
- Quantidade maior que 0 e no máximo igual ao que resta.
- Versão diferente: 409 com o texto da F2.

**n8n:** o "Processar Acao" passa a devolver uma **lista de operações** `{ aba, operacao: 'update'|'append'|'appendOrUpdate', chave, linha }` e uma lista de linhas de histórico. O workflow aplica as operações agrupadas por aba e operação. A F2 vira o caso de uma operação só.

## Telas

### Saídas com falta

- **Colunas:** Sem pedido (ponto vermelho; só aparece quando alguma caixa está nela) · **as etapas do quadro de Solicitações de faltas menos a última, com os mesmos nomes e na mesma ordem** (`etapasPedido`) · **Resolvido** (nome da última etapa) · Enviado à oficina · Concluído. Se as etapas mudam em Solicitações, as colunas de Saídas mudam junto.
- **Etapa da caixa** (só caixas que saíram com falta), na ordem:
  1. `tratativa = RECEBIDO` → Concluído;
  2. `tratativa = ENVIADO` → Enviado à oficina;
  3. sem itens abertos (tudo baixado) → Resolvido;
  4. algum item aberto sem pedido → Sem pedido, com o selo "parcial · N de M com pedido" quando parte dos itens já tem pedido;
  5. senão → a etapa do **pedido mais atrasado** (menor ordem) entre todos os pedidos abertos (original e partes, `pedidoIds`) dos itens abertos; na última etapa → Resolvido. Pedido em etapa que não existe mais conta como a primeira etapa.
- "Concluído" fica visível por 30 dias depois da última ação. "Resolvido" fica até a caixa ir à oficina; mas a caixa sem item aberto e sem tratativa só aparece se a última atividade (saída, último histórico ou última baixa de item) for de até 30 dias, senão sai de Saídas (caixas antigas já resolvidas não se acumulam). Caixa com item aberto coberto por pedidos na última etapa aparece sempre.
- **Card:** OS, peça, cliente, até 3 itens com o que resta e o(s) pedido(s) com a etapa (`PED-0044 · Solicitado`; pedido em etapa que saiu do quadro: `PED-0044 · Outra etapa`) ou "sem pedido", e o selo "saiu dd/mm · há N dias". Quando os pedidos da caixa estão em etapas diferentes, o selo "pedidos em etapas diferentes".
- **Painel:** os mesmos dados mais os botões:
  - **Selecionar para pedido:** abre Solicitações com os itens da caixa já marcados (principal quando a coluna é Sem pedido);
  - **Enviar à oficina:** só aparece, em ouro, na coluna Resolvido (sem item aberto, ou todos os pedidos abertos de todos os itens abertos na última etapa e nenhum item sem pedido). Senão o painel explica: "Para enviar à oficina, todo o material precisa estar na última etapa (<nome>)." O servidor aplica a mesma regra (409);
  - **Oficina recebeu:** pede confirmação dentro do painel, sem `confirm()`.
  - Também mostra o histórico.

### Solicitações de faltas

- **Esquerda, 360 px, "Faltas sem pedido":**
  - itens abertos e editáveis sem `pedidoId`, agrupados por caixa;
  - caixa de seleção por item e por caixa;
  - contagem selecionada no topo.
- **Subnav:** busca, filtro `Em aberto | Finalizados | Todos` (padrão Em aberto), "Etapas do quadro" (só ADM) e **Gerar pedido** (ouro, desabilitado sem seleção).
- **Direita:** quadro com as etapas configuradas, arrastar e soltar (a coluna de destino fica com fundo `--signal-tint` e anel em ouro).
  - **Card:** id, selo Fornecedor/Cliente, quem (ou "Vários fornecedores"), até 3 linhas "item · qtd · OS", previsão, local e "Ploomes · N OS".
  - Previsão: a mais próxima dos itens; selo "previsões diferentes" quando os itens têm datas diferentes.
  - Soltar o card na última etapa (Resolvido) abre a confirmação na coluna (`Mover para Resolvido dá baixa de N itens em M OS. A baixa não pode ser desfeita.`, Confirmar em ouro / Cancelar). Os finalizados ficam na última coluna (filtros Todos e Finalizados).
- **Janela "Gerar pedido"** (larga):
  - uma linha por item com a quantidade editável (padrão = o que resta), o fornecedor opcional e a previsão opcional ("Igual à do pedido");
  - Solicitar a (Fornecedor/Cliente), Fornecedor/Cliente (quem), Local (Bragança/São Paulo), Previsão e Responsável;
  - **Confirmar e gerar**.
  - Aviso de sucesso: `PED-0044 gerado · 3 itens · registrado em 2 OS no Ploomes`.
- **Painel do pedido (460 px):**
  - edita etapa, previsão, local, responsável, origem, quem, e qtd/fornecedor/previsão por item; escolher a última etapa e salvar pede a mesma confirmação da baixa;
  - Dividir pedido (com confirmação quando o destino é a última etapa) e o atalho **Dividir por previsão** (só com previsões diferentes), com a prévia das partes;
  - mostra o **resumo exato** do que vai ser gravado antes de **Salvar alterações** ("Nada alterado" desabilitado);
  - mostra o histórico do pedido (as linhas do HISTORICO_APP que citam o PED).
- **Janela "Etapas do quadro":** renomear, adicionar, remover, com as regras acima. "+ Adicionar etapa" insere antes da última; a última não tem Remover e mostra "Etapa final: mover um pedido para cá dá baixa nas caixas."

## Testes

- **n8n (`node:test`):** cada ação nova (validações, 403, 409, operações geradas, textos), montagem de pedidos/etapas/tratativa no board e a derivação de "finalizado".
- **Web (Vitest):** derivação da coluna de Saídas, filtros de pedidos, resumo de alterações, validação das etapas.
- **e2e (Playwright, n8n simulado):**
  - gerar pedido com 2 itens;
  - mover por arraste;
  - soltar em Resolvido → confirmação → `mover_pedido` (a baixa);
  - previsão por item no gerar e no editar; dividir por previsão;
  - Saídas: caixa em Resolvido → enviar à oficina e "Oficina recebeu" (Concluído);
  - etapas: renomear, adicionar e a regra de bloqueio;
  - caixa não editável sem botões.
- **Conferência local com o dono** (servidor simulado). Depois, teste real só na OS de teste:
  - marcar o card de teste como ganho, pela API, para ele virar "saiu";
  - rodar o "Sync Caixas Ganhas" uma vez;
  - gerar pedido, mover, baixar e conferir as abas e os registros no Ploomes.

## Fora do escopo da F3

- WhatsApp (F4).
- Card de Compras no Ploomes.
- Edição de pedidos finalizados.
- Pedidos com itens de caixas não editáveis (bloqueados até o go-live).

## Revisão final (08/10/2026)

- **Ordem das escritas do ramo acao:** PEDIDOS append, PEDIDOS update, PEDIDOS_ITENS append, PEDIDOS_ITENS update, ETAPAS_PEDIDO appendOrUpdate, ETAPAS_PEDIDO update, FALTANTES update, CAIXAS_PCP appendOrUpdate, HISTORICO_APP append. Uma falha no meio deixa baixa a menos (corrigível), nunca baixa em dobro.
- Todo Google Sheets do workflow da API com `retryOnFail` (3 tentativas, 3 s).
- Sem a leitura `Ler HISTORICO_APP Acao` (o Processar Acao não usa). Cache do board de 55 s.
- A baixa ao entrar na última etapa só vale para linhas ABERTO/PARCIAL.
