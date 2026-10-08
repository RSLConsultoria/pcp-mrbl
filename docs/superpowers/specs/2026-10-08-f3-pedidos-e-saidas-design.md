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
  - Ouro só no botão principal de cada tela ("Gerar pedido", "Dar baixa nas caixas").
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

**PEDIDOS_ITENS** (chave `id` = `<pedido>|<item_id>`): `pedido_id`, `item_id` (id da FALTANTES), `deal_id`, `os`, `nome`, `un`, `qtd`, `fornecedor`.

**ETAPAS_PEDIDO** (chave `id`): `id`, `nome`, `ordem`.
- Se a aba estiver vazia, vale o padrão: `a_pedir` "A pedir", `solicitado` "Solicitado", `aguardando` "Aguardando entrega", `entregue` "Entregue".

**CAIXAS_PCP** ganha `tratativa` (`''` | `ENVIADO` | `RECEBIDO`) e `tratativa_em`.

Um item da FALTANTES pertence a no máximo **um** pedido aberto. Os pedidos finalizados (com `baixado_em`) não contam.

## Board (GET pcp-board) devolve também

- `pedidos`: lista de `{ id, etapa, origem, quem, local, previsao, responsavel, criadoEm, baixadoEm, versao, finalizado, itens: [{ itemId, dealId, os, nome, un, qtd, fornecedor }] }`. `finalizado` é verdadeiro quando o pedido está na última etapa e tem `baixadoEm`.
- `etapasPedido`: lista de `{ id, nome, ordem }`, ordenada.
- No item: `pedidoId` (pedido aberto que contém o item, ou `''`).
- Na caixa: `tratativa` e `tratativaEm`.

## Ações novas (POST pcp-acao)

Cada ação gera, para cada OS envolvida, uma linha no HISTORICO_APP no formato da F2. O envio ao Ploomes fica com o mesmo workflow.

| tipo | Corpo | Efeito | Texto do histórico (por OS) |
|---|---|---|---|
| `gerar_pedido` | `{ itens: [{ itemId, dealId, qtd, fornecedor }], origem, quem, local, previsao, responsavel }` | Cria o PEDIDOS na primeira etapa e as linhas de PEDIDOS_ITENS. O id é o maior PED existente + 1. | `Lucca gerou PED-0044 · 2 itens desta OS · Fornecedor <quem>` |
| `editar_pedido` | `{ pedidoId, versao, campos: { etapa?, origem?, quem?, local?, previsao?, responsavel? }, itens?: [{ itemId, qtd, fornecedor }] }` | Atualiza o pedido e seus itens. | `Lucca alterou PED-0044: <resumo das mudanças>` |
| `mover_pedido` | `{ pedidoId, versao, etapa }` | Muda a etapa. | `Lucca moveu PED-0044 para <etapa>` |
| `baixar_pedido` | `{ pedidoId, versao }` | Só na última etapa. Dá baixa da `qtd` de cada item na FALTANTES (soma em `qtd_baixada`, limitada ao que resta) e grava `baixado_em`. | `Lucca deu baixa do PED-0044: 20 MT de VIÉS… (resta 80 MT)` |
| `salvar_etapas` | `{ etapas: [{ id?, nome }] }` | Regrava a ETAPAS_PEDIDO. Valida: no mínimo 2 etapas, nomes não vazios e únicos, e não remove etapa que tenha pedido aberto. | Não gera histórico de OS. |
| `enviar_oficina` | `{ dealId, versao }` | Grava `tratativa = ENVIADO`. | `Lucca enviou o material faltante à oficina` |
| `oficina_recebeu` | `{ dealId, versao }` | Baixa total dos itens abertos da caixa e `tratativa = RECEBIDO`. | `Lucca registrou que a oficina recebeu o material` |

**Validações:**
- Todos os `dealId` envolvidos têm que ser editáveis; se não forem, a resposta é 403.
- Item inexistente ou já em pedido aberto: 409 `Item já está no PED-00xx.`
- Quantidade maior que 0 e no máximo igual ao que resta.
- Versão diferente: 409 com o texto da F2.

**n8n:** o "Processar Acao" passa a devolver uma **lista de operações** `{ aba, operacao: 'update'|'append'|'appendOrUpdate', chave, linha }` e uma lista de linhas de histórico. O workflow aplica as operações agrupadas por aba e operação. A F2 vira o caso de uma operação só.

## Telas

### Saídas com falta

- **Colunas:** Sem tratativa · Aguardando material · Material no almoxarifado · Enviado à oficina · Resolvido.
- **Etapa da caixa** (só caixas que saíram com falta), na ordem:
  1. sem itens abertos → Resolvido;
  2. `tratativa = ENVIADO` → Enviado à oficina;
  3. algum item aberto sem pedido → Sem tratativa, com o selo "parcial · N de M com pedido" quando houver pedidos parciais;
  4. todos os pedidos dos itens abertos na última etapa → Material no almoxarifado;
  5. senão → Aguardando material.
- "Resolvido" fica visível por 30 dias depois da última ação, como no "Saiu sem faltas".
- **Card:** OS, peça, cliente, até 3 itens com o que resta e o pedido (`PED-0044 · Solicitado`) ou "sem pedido", e o selo "saiu dd/mm · há N dias".
- **Painel:** os mesmos dados mais os botões:
  - **Selecionar para pedido:** abre Solicitações com os itens da caixa já marcados;
  - **Enviar à oficina** (principal, em ouro, quando a coluna é Material no almoxarifado);
  - **Oficina recebeu:** pede confirmação dentro do painel, sem `confirm()`.
  - Também mostra o histórico.

### Solicitações de faltas

- **Esquerda, 360 px, "Faltas sem pedido":**
  - itens abertos e editáveis sem `pedidoId`, agrupados por caixa;
  - caixa de seleção por item e por caixa;
  - contagem selecionada no topo.
- **Subnav:** busca, filtro `Em aberto | Finalizados | Todos` (padrão Em aberto), "Etapas do quadro" e **Gerar pedido** (ouro, desabilitado sem seleção).
- **Direita:** quadro com as etapas configuradas, arrastar e soltar (a coluna de destino fica com fundo `--signal-tint` e anel em ouro).
  - **Card:** id, selo Fornecedor/Cliente, quem (ou "Vários fornecedores"), até 3 linhas "item · qtd · OS", previsão, local e "Ploomes · N OS".
  - Na última etapa e ainda não baixado: botão **Dar baixa nas caixas**.
- **Janela "Gerar pedido"** (larga):
  - uma linha por item com a quantidade editável (padrão = o que resta) e o fornecedor opcional;
  - Solicitar a (Fornecedor/Cliente), Fornecedor/Cliente (quem), Local (Bragança/São Paulo), Previsão e Responsável;
  - **Confirmar e gerar**.
  - Aviso de sucesso: `PED-0044 gerado · 3 itens · registrado em 2 OS no Ploomes`.
- **Painel do pedido (460 px):**
  - edita etapa, previsão, local, responsável, origem, quem, e qtd/fornecedor por item;
  - mostra o **resumo exato** do que vai ser gravado antes de **Salvar alterações** ("Nada alterado" desabilitado);
  - mostra o histórico do pedido (as linhas do HISTORICO_APP que citam o PED).
- **Janela "Etapas do quadro":** renomear, adicionar, remover, com as regras acima.

## Testes

- **n8n (`node:test`):** cada ação nova (validações, 403, 409, operações geradas, textos), montagem de pedidos/etapas/tratativa no board e a derivação de "finalizado".
- **Web (Vitest):** derivação da coluna de Saídas, filtros de pedidos, resumo de alterações, validação das etapas.
- **e2e (Playwright, n8n simulado):**
  - gerar pedido com 2 itens;
  - mover por arraste;
  - dar baixa;
  - Saídas: enviar à oficina e "Oficina recebeu";
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
