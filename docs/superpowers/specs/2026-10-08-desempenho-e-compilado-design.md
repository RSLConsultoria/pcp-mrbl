# Desempenho das ações e registro compilado no Ploomes

Data: 08/10/2026. Pedido do usuário depois da F3 em produção: "tô achando tudo muito lento" e "dá pra mandar um compilado em um único registro?".

## Diagnóstico

- Cada ação lê 6 abas, uma por vez (Google Sheets node, ~1 s cada), e grava cada destino em sequência (~2 s cada). Um "dividir" chega a 15–25 s.
- O site espera a resposta **e** a releitura do quadro (8 abas, ~8 s) antes de liberar a próxima ação da fila.
- O envio ao Ploomes cria um InteractionRecord por linha do HISTORICO_APP.

## Decisões

1. **Leitura em lote.** Uma chamada `values:batchGet` (HTTP Request com a credencial googleApi, valueRenderOption UNFORMATTED_VALUE) traz todas as abas de que o ramo precisa. Um Code node converte `values` em objetos por cabeçalho com `row_number` (igual ao que o node Google Sheets entrega hoje), para `montarCaixas`/`processarAcao` não mudarem.
2. **Gravação em lote, na ordem segura.** Um Code node transforma `operacoes[]`/`historicos[]` em poucas requisições, executadas em sequência por um único HTTP Request (um item por requisição, retry 3× / 3 s):
   1. `values:append` em PEDIDOS (se houver);
   2. `values:append` em PEDIDOS_ITENS (se houver);
   3. um `values:batchUpdate` com todas as atualizações (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, FALTANTES, CAIXAS_PCP), com a linha achada pela coluna de casamento nos dados lidos; `appendOrUpdate` sem linha vira append (ETAPAS_PEDIDO/CAIXAS_PCP, antes do batchUpdate);
   4. `values:append` no HISTORICO_APP por último.
   Valores RAW. Campo sem coluna na aba: o cabeçalho novo entra na próxima coluna livre (mesmo efeito do `insertInNewColumn`). Escrita só toca as colunas presentes na operação (nunca apaga as outras).
   Pedidos antes da baixa e histórico por último continuam valendo: se falhar no meio, sobra baixa a menos, nunca em dobro.
3. **Tela que responde na hora.** O site aplica a mudança no quadro local na hora (mover, editar, dividir, baixa, previsão etc.), envia em segundo plano e só relê o quadro quando a fila esvazia. Erro desfaz a mudança local e mostra o aviso, como já acontece nos campos da F2.
4. **Registro compilado.** O envio agrupa as linhas PENDENTE por deal e só envia o grupo quando a linha mais nova tem **10 minutos ou mais** (`quando`). Um InteractionRecord por grupo:

   ```
   [PCP · OS 999999] Atualizações do app PCP
   • 14:44 Lucca moveu PED-0001 para Solicitado
   • 14:46 Lucca dividiu PED-0001: ...
   ```

   Até 30 linhas por registro (o resto vai no próximo). Todas as linhas do grupo recebem o mesmo resultado (ENVIADO com o id do registro, ou tentativa falha). DEALS_PERMITIDOS continua valendo.

## Implantação

- Gravar o workflow ativo pela API pública do n8n **publica na hora**. Por isso o teste vai numa cópia, "PCP MRBL - API (homolog)", com webhooks `pcp-login-h`, `pcp-board-h`, `pcp-acao-h`, mesma planilha (edição continua só na OS de teste). O site local aponta para ela. Depois do teste, o mesmo conteúdo vai para o workflow de produção.
- Pré-requisito: a credencial "Google Sheets - MRBL" com "Set up for use in HTTP Request node" e o escopo `https://www.googleapis.com/auth/spreadsheets`.
