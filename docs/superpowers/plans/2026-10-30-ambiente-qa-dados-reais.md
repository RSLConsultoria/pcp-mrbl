# Ambiente de QA com dados reais — plano

Spec: `docs/superpowers/specs/2026-10-30-ambiente-qa-dados-reais-design.md` (fonte da verdade). Tarefas pequenas, testes primeiro, um commit por tarefa.

## Restrições globais
- pt-BR em commits, comentários e interface. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Repositório público: só dados fictícios nos testes. O id da planilha QA não é segredo.
- `n8n/src` e `n8n/adaptadores`: ES5 puro. Depois de mexer: `cd n8n && npm test && npm run build` e commitar `n8n/build`, `n8n/workflows/*.sdk.js`, `n8n/workflows/json/*.json`.
- Nada é publicado no n8n, na planilha, no Ploomes, no Gmail, no WhatsApp ou no Groq nesta entrega.
- A produção não muda: `pcp-api.json`, `pcp-envio.json`, `pcp-producao-sync.json`, `pcp-medias-previsao.json` e os demais arquivos de hoje saem do gerador com o mesmo comportamento (o código ganha `MODO_QA`, falso na produção; estrutura, nodes e URLs iguais).

## Decisões de desenho (além do spec)
- **Um lugar só para o id da QA:** `n8n/scripts/planilha-qa.js` (`PLANILHA_QA_ID`, marcador `CONFIGURAR_PLANILHA_QA` aceito, como `credenciais.js`). O gerador recusa id inválido e recusa QA igual à original.
- **`MODO_QA` no código:** `var MODO_QA = false;` em `src/planilhaLote.js`. O gerador monta os workflows de homologação com o texto dos Code nodes trocado: `MODO_QA = true` e `PLANILHA_ID` = id da QA. Assim nenhum Code node de homologação conhece o id da original (as gravações montam a URL com `PLANILHA_ID`). Os nodes de leitura recebem a URL com o id da QA. Depois de gerar, o gerador confere que o id da original não aparece em nenhum workflow de homologação (senão o build falha).
- **Variantes de homologação (arquivos novos, workflows novos no n8n):** os workflows do WhatsApp, dos e-mails e o envio ao Ploomes de hoje continuam gerados como estão (versão do go-live, na original). Para o QA, o gerador cria cópias `-homolog`, todas na QA:
  - `pcp-api-homolog.json` (o homolog de hoje, `dI2NUYzxfApYM8iA`, passa para a QA);
  - `pcp-envio-homolog.json` "PCP MRBL - Enviar ao Ploomes (homolog)";
  - `pcp-whatsapp-saida-homolog.json` "PCP MRBL - Enviar WhatsApp (homolog)";
  - `pcp-whatsapp-entrada-homolog.json` "PCP MRBL - Receber WhatsApp (homolog)" (caminho `pcp-whatsapp-entrada-h-CONFIGURAR_SEGREDO`);
  - `pcp-interpretar-whatsapp-homolog.json` "PCP MRBL - Interpretar WhatsApp (homolog)";
  - `pcp-retentar-interpretacao-homolog.json` "PCP MRBL - Retentar Interpretação (homolog)";
  - `pcp-emails-homolog.json` "PCP MRBL - Ler E-mails do PCP (homolog)";
  - `pcp-recarregar-qa.json` "Utilitário - Recarregar QA (manual)".
  A API homolog, a entrada e o retentar de homologação chamam o Interpretar WhatsApp de homologação (`IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP_HOMOLOG`, marcador até ele existir). Os subworkflows de modelo (intérprete, associador, intérprete de e-mail) não tocam a planilha e são os mesmos.
- **Allowlists no QA:** `DEALS_EDITAVEIS`, `DEALS_PRODUCAO_EDITAVEIS` (api.js) e `DEALS_PERMITIDOS` (selecionar-envio) ficam `MODO_QA ? [] : [listas de hoje]`.
- **Campos do Ploomes no QA:** o Montar Alteracao Ploomes devolve `gravar: false` quando `MODO_QA`; a ação segue direto para a planilha e o histórico.
- **Registro de interação no QA:** `montarRegistroCompilado` prefixa `"TESTE · "` quando `MODO_QA`; `PREFIXO_PCP` aceita o prefixo (a Visão da peça continua escondendo o registro do app).
- **WhatsApp no QA:** `corpoEnvioWhatsapp` troca o número pelo grupo de teste `120363412994688161@g.us` e põe `"[TESTE] "` no começo do texto; a citação (`quoted`) só fica se a mensagem citada é do próprio grupo de teste.
- **Recarga:** Manual Trigger → **Ler Original** (GET `values:batchGet` na original, só leitura, abas do app) → **Montar Limpeza** → **Limpar QA** (POST `values:batchClear` na QA) → **Montar Recarga** → **Gravar QA** (POST `values:batchUpdate` na QA, RAW, inclui `QA_CONTROLE!A1:B2` = `copiado_em`, `abas` / data ISO, nº de abas). Abas: FALTANTES, CAIXAS GANHAS, CAIXAS_PCP, USUARIOS, HISTORICO_APP, PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, FORNECEDORES, RESPONSAVEIS, ERROS_APP, PRODUCAO, OFICINAS, WHATSAPP_MENSAGENS, WHATSAPP_SUGESTOES, PREVISAO_MEDIAS, EMAILS_PCP ("FALTANTES (Painel)" fica de fora: o app não a usa). Linhas do HISTORICO_APP com `ploomes_status` PENDENTE viram `COPIADO_QA` na cópia (não sobem de novo ao Ploomes pelo envio de homologação). A lógica fica em `src/recargaQa.js` e só grava em `PLANILHA_ID` (a QA, no modo QA); fora do modo QA ela recusa.
- **Board no QA:** `LEITURAS_BOARD` ganha `QA_CONTROLE` quando `MODO_QA`; o corpo ganha `qa: { copiadoEm }` (ISO ou vazio). Só a API homolog manda.
- **Site:** `FaixaQa` fixa no topo quando `board.qa` existe: "AMBIENTE DE QA · dados copiados em dd/mm hh:mm · nada altera a planilha original".

## Tarefa 1 — `PLANILHA_QA_ID`, `MODO_QA` e as variantes de homologação
Teste `n8n/test/ambiente-qa.test.js` primeiro: id válido (marcador ou id), diferente da original; os arquivos de produção não têm o id da QA nem `MODO_QA = true`; todo workflow `-homolog` tem o id da QA, não tem o da original e todos os Code nodes com `MODO_QA = true`; nenhum Execute Workflow de homologação chama o Interpretar WhatsApp de produção; nomes e caminhos de webhook distintos.

## Tarefa 2 — Modo QA: allowlists, campos do Ploomes, "TESTE · " e WhatsApp
Testes primeiro (`ambiente-qa.test.js`), rodando os Code nodes do JSON gerado: listas vazias no QA e as de hoje na produção; Montar Alteracao Ploomes não grava no QA; título com "TESTE · " e a Visão da peça reconhece; WhatsApp sempre no grupo de teste com "[TESTE] ", sem citação de outro grupo.

## Tarefa 3 — Utilitário - Recarregar QA (manual)
Teste primeiro: `requisicoesRecargaQa` (limpeza das abas, gravação com `QA_CONTROLE`, `COPIADO_QA` no HISTORICO_APP, recusa fora do modo QA e com destino igual à origem); no JSON gerado, o único lugar com o id da original é a URL GET do Ler Original; nenhum POST/PUT/PATCH/clear com o id da original.

## Tarefa 4 — Faixa de QA no site
Vitest primeiro (`regras/qa.test.ts`: texto da faixa com data/hora de São Paulo e sem data); componente `FaixaQa` no `App.tsx`; tipo `Board.qa`; simulador local com `MOCK_QA=1` opcional.

## Tarefa 5 — README e revisão
Roteiro de publicação do QA no `n8n/workflows/README.md` (criar a planilha e a aba `QA_CONTROLE`, criar os workflows na ordem, ids, recarga, desativar os de hoje durante o QA, rollback). Revisão final independente contra o spec.
