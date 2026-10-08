> 08/10/2026: 'Mover para' removido a pedido do dono; a coluna vem só dos dados (Ploomes dita as etapas).

# F2 — Escritas no quadro "No Ploomes"

Data: 07/10/2026 · Autor: Lucca (RSL Consultoria) · Status: aguardando revisão

Segunda de cinco fases. A F1 (`2026-10-07-f1-base-e-quadro-faltas-design.md`) entregou o quadro só de leitura. A F2 permite alterar dados pelo painel da caixa. Toda alteração fica no histórico e vira um registro de interação no card do Ploomes.

## Decisões

- **Todas** as alterações viram registro de interação no Ploomes: baixa, previsão, responsável, observação e movimento.
- A baixa grava só na planilha (`qtd_baixada`) e no registro de interação. O registro de separação do almoxarifado no Ploomes (o JSON lido pelos widgets) **não é alterado**.
- A lista de responsáveis vem da aba USUARIOS (coluna `nome`, só usuários ativos).
- O envio ao Ploomes é **assíncrono**:
  - o clique grava na planilha e no histórico e responde na hora;
  - um workflow separado envia as linhas pendentes a cada 2 minutos.
- Visual: segue a direção publicada em 07/10 (`web/src/styles/app.css`): uma barra escura, fundo claro, card com a faixa da cor da caixa e até 3 itens.

## Onde cada dado fica

As colunas que o sync atual do n8n escreve continuam intocadas. O app só escreve nas colunas e abas abaixo.

**FALTANTES (uma linha por item; chave `id`):**

| Coluna | Uso |
|---|---|
| `qtd_baixada` (**nova**) | Soma das baixas feitas pelo app. A falta exibida é `qtd_falta − qtd_baixada`, nunca abaixo de 0. |
| `previsao` | Previsão do item, `aaaa-mm-dd`. |
| `observacao_pcp` | Observação do item. |
| `atualizado_em_app` (**nova**) | ISO da última escrita do app na linha; é a versão do item. |

Se alguma dessas colunas não existir, a tarefa de preparação do plano cria no fim da aba, sem mexer na ordem das existentes.

**CAIXAS_PCP (nova; uma linha por caixa; chave `deal_id`):** `deal_id`, `os`, `responsavel`, `previsao`, `observacao`, `coluna_manual`, `coluna_manual_em`, `atualizado_em` (versão da caixa).

**HISTORICO_APP (nova; só acrescenta linhas):** `id` (uuid), `quando` (ISO), `usuario`, `email`, `deal_id`, `os`, `item_id`, `acao`, `texto`, `ploomes_status` (`PENDENTE` | `ENVIADO` | `ERRO`), `ploomes_id`, `tentativas`, `erro`.

## Regras

**Baixa.**
- A quantidade precisa ser maior que 0 e no máximo igual ao que resta.
- `qtd_baixada` passa a ser o valor anterior mais a quantidade informada.
- Linha e fio: a baixa é na unidade do item (cones). Os gramas restantes são `resta × faltaG ÷ falta`.

**Item aberto (atualiza a regra da F1).** `status` ABERTO/PARCIAL **e** `resta > 0`, onde `resta = falta − baixada` (falta `null` continua contando como aberto).

**Itens sem linha na FALTANTES** (lidos do texto da CAIXAS GANHAS): só leitura. Não aceitam baixa, previsão nem observação, e o painel diz isso.

**Movimento manual.**
- Grava `coluna_manual` e `coluna_manual_em`.
- Vale até o próximo registro na caixa: deixa de valer quando qualquer item da caixa tem `atualizado_em_app` ou `data_atualizacao` posterior a `coluna_manual_em`.
- Enquanto vale, o quadro usa essa coluna em vez da calculada. O card não ganha selo; o movimento aparece só no histórico.
- **Perfil ADM** move direto. **Outros perfis** precisam de justificativa com pelo menos 15 caracteres, depois de remover os espaços das pontas. O n8n confere isso também, não só a tela.

**Conflito.**
- Toda ação envia a versão que o app viu: `atualizado_em_app` do item ou `atualizado_em` da caixa (vazio quando a linha ainda não existe).
- Se a versão gravada for diferente, o n8n responde `409` e não grava nada.

**Textos do histórico** (são também o `Content` do registro de interação):

| Ação | Texto |
|---|---|
| Baixa | `Lucca deu baixa: 20 UN de ZÍPER METAL (resta 32 UN)` |
| Previsão do item | `Lucca definiu previsão de ZÍPER METAL: 09/10` (vazia: `removeu a previsão de …`) |
| Observação do item | `Lucca anotou em ZÍPER METAL: "…"` |
| Responsável | `Lucca definiu responsável: Renata` |
| Previsão da caixa | `Lucca definiu previsão geral da caixa: 09/10` |
| Observação da caixa | `Lucca anotou na caixa: "…"` |
| Mover | `Lucca moveu para Caixa completa · Pedido` (com ` — Justificativa: …` quando houver) |

Todo texto enviado ao Ploomes começa com `[PCP · OS 90001] `.

## Backend (n8n)

**Webhook `POST /webhook/pcp-acao`** (no mesmo workflow "PCP MRBL - API", para reaproveitar sessões e cache).
- Corpo: `{ tipo, dealId, itemId?, valor, versao, justificativa? }`
- `tipo` ∈ `baixa`, `previsao_item`, `obs_item`, `responsavel`, `previsao_caixa`, `obs_caixa`, `mover`.

Etapas:
1. Valida a sessão; sem sessão válida, responde `401`.
2. Valida o corpo; se inválido, responde `400` com `{ erro }` em português.
3. Lê a linha alvo (FALTANTES por `id` ou CAIXAS_PCP por `deal_id`) e confere a versão; diferente, responde `409`.
4. Grava a linha com a nova versão (`agora` em ISO).
5. Acrescenta a linha no HISTORICO_APP com `PENDENTE`.
6. Limpa o cache do board.
7. Responde `200 { ok: true, versao, historico: <linha> }`.

**Board (`GET /webhook/pcp-board`) passa a devolver:**
- Por item: `baixada`, `resta`, `restaG`, `obsAlmox` (`obs_almoxarifado`), `obsPcp` (`observacao_pcp`), `versao` e `editavel`. O campo `obs` da F1 sai, e o front passa a mostrar os dois separados.
- Por caixa: `previsao`, `observacao`, `colunaManual` (já resolvida: `null` quando expirou), `versao` e `historico` (até 30 linhas, da mais recente para a mais antiga: `{ quando, usuario, texto, ploomes }`).
- Na raiz: `usuarios: string[]` (nomes dos usuários ativos).
- Passa a ler também as abas CAIXAS_PCP, HISTORICO_APP e USUARIOS.

**Workflow novo "PCP MRBL - Enviar ao Ploomes"** (a cada 2 minutos):
1. Lê as linhas do HISTORICO_APP com `PENDENTE`, até 20 por rodada, da mais antiga para a mais nova.
2. Para cada uma, faz `POST https://api2.ploomes.com/InteractionRecords` com `{ DealId, ContactId (do negócio), Content, Date }`, usando a credencial do Ploomes já existente no n8n.
3. Sucesso: grava `ENVIADO` e o `ploomes_id`. Falha: soma 1 em `tentativas` e, a partir de 5 tentativas, grava `ERRO` com a mensagem.
4. Respeita `429`: para a rodada e continua na próxima.

## Front

**Painel da caixa:**
- No topo: Responsável (lista), Previsão geral (data) e Observação geral (texto).
- Em cada item editável:
  - linha "faltava X · baixado Y · resta Z";
  - campo **Chegou** com o botão **Registrar baixa**;
  - Previsão do item (data) e Observação do item (texto).
- **Mover para:** botões com as 6 colunas. Para quem não é ADM, abre a justificativa com o contador `n/15` e o botão **Confirmar e mover**.
- **Histórico** no fim do painel, com o selo `enviado ao Ploomes`, `aguardando Ploomes` ou `falhou no Ploomes`.

**Como salva:**
- Listas e datas salvam ao mudar; textos salvam ao sair do campo; a baixa salva pelo botão.
- A tela mostra o valor novo na hora. Se o servidor recusar, o campo volta ao valor anterior.
- **Aviso de uma linha** no rodapé da tela para todo retorno, por exemplo `Baixa registrada · 20 UN de ZÍPER METAL`. Nunca `alert`.

**Erros:**

| Situação | O que aparece |
|---|---|
| Quantidade inválida | Mensagem sob o campo (`Informe uma quantidade maior que zero` / `Falta só 26 UN`), sem chamar o servidor |
| `409` | Aviso `Alguém alterou esta caixa agora há pouco. Recarreguei os dados.` e o board é recarregado |
| `401` | Volta ao login, como na F1 |
| Rede ou outro erro | Aviso `Não foi possível salvar. Tente de novo.` e o campo volta ao valor anterior |

**Card:** a previsão geral aparece no rodapé (`previsão 09/10`). A observação geral fica só no painel.

## CI

- Cada job do `publicar.yml` ganha `timeout-minutes: 20`.
- Os navegadores do Playwright passam a usar cache (`actions/cache` em `~/.cache/ms-playwright`, chave pela versão do `@playwright/test`).

Motivo: em 07/10 a instalação travou e o deploy ficou preso por mais de 10 minutos.

## Testes e aceite

1. **n8n (`node:test`):**
   - validação de cada `tipo`;
   - conflito de versão;
   - cálculo de `resta` e `restaG`;
   - expiração da coluna manual;
   - textos do histórico;
   - montagem do board com as abas novas;
   - envio ao Ploomes com o Ploomes simulado, cobrindo sucesso, falha, 5 tentativas e `429`.
2. **Web (Vitest):** regras puras novas (validação da baixa e coluna com movimento manual) e o cliente `enviarAcao`.
3. **e2e (Playwright, n8n simulado):**
   - dar baixa e ver o "resta" mudar;
   - baixa acima do que falta é recusada na tela;
   - trocar o responsável;
   - mover como ADM;
   - mover como não-ADM exige 15 caracteres;
   - `409` recarrega;
   - histórico mostra o selo.
4. **Conferência real com o dono:** uma baixa de teste numa OS escolhida por ele, conferindo a planilha (FALTANTES, HISTORICO_APP) e o registro de interação no card do Ploomes.

## Fora do escopo da F2

- Sugestões lidas de e-mail (F5).
- Pedidos de itens faltantes (F3).
- Desfazer uma baixa: corrige-se com observação. Uma "baixa negativa" fica para depois, se fizer falta.
- Perfis além de ADM no cadastro (a regra da justificativa já fica pronta).
- Limite de 5 itens no card: já resolvido com 3 itens na direção visual nova.
