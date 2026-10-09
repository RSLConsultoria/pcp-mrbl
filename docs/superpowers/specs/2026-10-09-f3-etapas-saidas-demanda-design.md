# F3: etapas novas, saídas divididas e demanda pós-saída

Data: 09/10/2026. Ajustes pedidos pelo usuário depois de testar a F3 no ambiente simulado. Este documento vale por cima do desenho da F3 (2026-10-08-f3-pedidos-e-saidas-design.md) onde houver conflito.
Plano: docs/superpowers/plans/2026-10-09-f3-etapas-saidas-demanda.md.

## 1. Etapas dos pedidos

- Etapas padrão: **A pedir → Solicitado → Aguardando entrega → Enviado ao destino final → Concluído**.
- **Enviado ao destino final** é a etapa que dá a baixa (o material chegou e o almoxarifado mandou para o destino). Mover para ela pede confirmação, como o Resolvido de hoje.
- **Concluído** é a última etapa: o destino confirmou que recebeu. Não dá baixa (já foi dada) e finaliza o pedido.
- Regras de etapa: as duas últimas etapas são fixas (não podem ser apagadas nem reordenadas em "Etapas do quadro"); a penúltima dá a baixa, a última finaliza. ETAPAS_PEDIDO ganha a etapa `concluido` (ordem 5) e a `entregue` passa a se chamar "Enviado ao destino final" (id e ordem 4 mantidos, então pedidos que estavam em Resolvido passam a contar como enviados).
- Somem: "Resolvido" como nome e o rabo próprio das Saídas ("Resolvido (Enviar à oficina)", "Enviado à oficina", ações enviar_oficina/oficina_recebeu). As Saídas usam as mesmas etapas dos pedidos.

## 2. Painel do pedido

- Sem o campo **Etapa**: a etapa muda só arrastando o card.
- **Dividir pedido** só aparece com o pedido em **Aguardando entrega**, sem o "Mover para": o que for marcado como chegou vira um pedido novo (PED-x.n) já em **Enviado ao destino final**, com a baixa e a mesma confirmação; o resto continua em Aguardando entrega.
- "Dividir por previsão" continua como está (não muda etapa).

## 3. Saídas com falta

- Colunas: **Sem pedido** + as etapas dos pedidos.
- A caixa se divide sozinha por etapa: uma parte por coluna onde ela tem item ("90004 · 1 de 2"), cada parte só com os itens daquela etapa. Itens sem pedido ficam em "Sem pedido".
- A caixa (ou parte) chega a Concluído quando todos os seus pedidos estão concluídos. A regra dos 30 dias de inatividade para esconder concluídas continua.

## 4. Nova demanda (pós-saída)

- Botão **Nova demanda** em Solicitações de faltas.
- Campos: OS, tipo de caixa (Costura/preta ou Acabamento/azul) e itens em texto livre (nome, cor opcional, quantidade, unidade). Todos obrigatórios, menos cor.
- O servidor procura a caixa em CAIXAS GANHAS pela OS + tipo. Se não achar, ou se a caixa ainda não saiu, recusa com mensagem clara e não cria nada.
- Os itens são gravados na FALTANTES ligados ao deal da caixa, com origem "pós-saída" (coluna `origem` = `POS_SAIDA`), e ganham o selo **pós-saída** em Faltas sem pedido. A caixa aparece em Saídas com falta (Sem pedido) e **não** aparece no No Ploomes.
- Daí segue o fluxo normal: gerar pedido, etapas, baixa e registro no card do Ploomes (histórico "Lucca criou demanda pós-saída: ...").
- O Sync Faltantes não pode apagar nem sobrescrever essas linhas (conferir no workflow de sync antes do deploy).
- Edição liberada só nos deals de DEALS_EDITAVEIS, como o resto.

## Ordem

1 e 2 → 3 → 4. Tudo verificado no ambiente simulado antes de ir para produção.
