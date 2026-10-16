# F4 — Controle de produção e WhatsApp em grupos

Data: 13/10/2026 · Status: desenho aprovado pelo dono

## 1. Objetivo

A F4 acrescenta a tela **Controle de produção** para acompanhar as OS que estão na etapa **17. Costura** do funil Produção do Ploomes. A tela mostra um Gantt agrupado por oficina, destaca prazos e faltas da caixa de costura e permite:

- alterar a oficina e a data combinada da costura;
- cobrar a oficina em seu grupo de WhatsApp;
- ~~avisar no grupo quando o material faltante for enviado~~: **fora do escopo da F4 por decisão do dono (16/10)**;
- ler as respostas do grupo com um intérprete silencioso;
- transformar respostas em sugestões que uma pessoa precisa aceitar antes de qualquer gravação no Ploomes.

O intérprete **não conversa no grupo e não responde automaticamente**. Ele observa, associa mensagens à OS e prepara sugestões no app.

## 2. Decisões do dono

- O WhatsApp da F4 trabalha primeiro com **grupos**, normalmente um grupo por oficina.
- As mensagens enviadas pelo app partem de modelos padrão, podem ser editadas antes do envio e sempre identificam a OS.
- As respostas entram na F4 e passam pelo intérprete silencioso.
- Nenhuma interpretação altera o Ploomes sem a ação explícita **Aceitar**.
- O motivo é obrigatório sempre que a data combinada mudar.
- As oficinas vêm do Ploomes, mas o vínculo com o grupo fica numa aba própria da planilha.
- O go-live geral continua reservado para depois da F4 e da F5. Até lá, escritas reais ficam em allowlist de teste.

## 3. Escopo

### Incluído

- sincronização das OS em Costura a partir do Ploomes;
- Gantt diário agrupado por oficina;
- quatro indicadores, filtros e busca;
- painel da OS com produção, faltas e histórico;
- edição de oficina e data combinada com motivo obrigatório ao mudar a data;
- registro da alteração no histórico e no card do Ploomes;
- cadastro de oficina ↔ grupo do WhatsApp;
- envio manual de cobrança e confirmação de prazo;
- ~~aviso automático de material enviado, iniciado pela ação já existente em Saídas com falta~~: **fora do escopo da F4 por decisão do dono (16/10)**;
- recepção idempotente dos webhooks da Evolution;
- associação de mensagens do grupo a uma OS;
- interpretação estruturada de respostas;
- aceite ou descarte de sugestões;
- ambiente simulado completo, sem usar grupos nem cards reais.

### Fora do escopo

- assistente de chat e cobrança em massa por linguagem natural, que ficam para a F5;
- resposta automática do intérprete dentro dos grupos;
- criação, alteração de participantes ou administração dos grupos pelo PCP;
- leitura de e-mail;
- Visão das peças/dossiê completo;
- publicação ou liberação de todas as OS sem novo aceite do dono.

## 4. Fonte de verdade e sincronização

### Ploomes

Fonte de verdade da produção:

- funil Produção: `60015827`;
- etapa Costura: `60073488`;
- OS: `deal_C06992BA-FF1E-47A8-9330-5242026E691E`;
- oficina — "Será produzido por": `deal_89DE05E0-467F-4012-9B82-F1E077F968E4`;
- início da costura: `deal_92FBE0E7-E136-41BF-AE47-1E427B178727`;
- data combinada: `deal_E53BDEC3-F829-413D-9421-91D5D7411349`;
- lead time: `deal_1B168E7F-E71D-4895-8A37-D7DB6FD3418D`;
- peças do corte real: `deal_9990FF2B-430A-4A4A-9C82-02E953AE9BAD`, com fallback para peças do pedido.

Antes de implementar a integração, o formato atual desses campos e o payload de atualização serão conferidos em leitura. Não se presume o formato de campo de usuário do Ploomes.

### Snapshot na planilha

Um workflow agendado, **PCP MRBL — Sincronizar Produção**, lê as OS da etapa Costura e atualiza a aba `PRODUCAO` a cada cinco minutos. O `pcp-board` continua lendo a planilha em lote; não faz uma consulta ao Ploomes a cada navegador aberto.

O sync faz upsert por `deal_id`. Linhas não são apagadas nem ordenadas. Uma OS que saiu da etapa recebe `em_costura = NAO`, e só quando todas as páginas do Ploomes foram lidas sem erro; o quadro mostra apenas `SIM`. Um card sem OS não cancela o sync: é pulado, fica como está na planilha (não vira `NAO`) e gera um aviso em `ERROS_APP` só com o `deal_id`. Campos humanos e históricos nunca são sobrescritos pelo sync.

## 5. Abas da planilha

### `PRODUCAO`

Chave: `deal_id`.

| Coluna | Conteúdo |
|---|---|
| `deal_id` | Negócio do funil Produção |
| `os` | Número da OS |
| `oficina_id` | ID do usuário/oficina no Ploomes ou vazio |
| `oficina_nome` | Nome exibido; vazio vira `ALOCAR` |
| `inicio_costura` | `aaaa-mm-dd` |
| `data_combinada` | `aaaa-mm-dd` |
| `lead_time` | `aaaa-mm-dd` |
| `pecas` | Quantidade |
| `cliente` | Texto vindo do Ploomes |
| `peca` | Descrição da peça |
| `referencia` | Referência |
| `em_costura` | `SIM` ou `NAO` |
| `atualizado_em_ploomes` | Versão/conflito: o sync grava o LastUpdateDate do Ploomes; ações que gravam a linha (alterar combinado, aceitar nova data) gravam o instante da ação, que é a versão devolvida ao site |
| `sincronizado_em` | ISO da última leitura |

### `OFICINAS`

Chave: `ploomes_id`. O sync atualiza somente os campos vindos do Ploomes e preserva o vínculo humano com o WhatsApp.

| Coluna | Dono | Conteúdo |
|---|---|---|
| `ploomes_id` | sistema | ID da oficina no Ploomes |
| `nome` | sistema | Nome atual no Ploomes |
| `grupo_jid` | humano | Identificador do grupo na Evolution |
| `grupo_nome` | humano | Nome para conferência visual |
| `ativo` | humano | `SIM`/`NAO` |
| `atualizado_em` | sistema | ISO |

O número do grupo, seus participantes e qualquer credencial ficam fora do repositório público.

### `WHATSAPP_MENSAGENS`

Chave: `id` gerado pelo app antes do envio. `evolution_id` guarda o ID devolvido/recebido da Evolution e é único quando preenchido. Assim, a fila pode existir antes da chamada externa e o webhook continua idempotente.

Campos: `id`, `evolution_id`, `quando`, `grupo_jid`, `grupo_nome`, `participante_jid`, `participante_nome`, `direcao`, `tipo`, `tipo_conteudo`, `texto`, `resposta_a_evolution_id`, `deal_id`, `os`, `oficina_id`, `associacao`, `status_envio`, `erro`, `criado_em`.

- `direcao`: `ENVIADA` ou `RECEBIDA`;
- `tipo`: `COBRANCA_PRAZO`, `CONFIRMAR_DATA` ou `RESPOSTA` (`AVISO_MATERIAL` saiu da F4 por decisão do dono em 16/10);
- `tipo_conteudo`: `TEXTO` ou `NAO_TEXTUAL`;
- `associacao`: `CITACAO`, `OS_NO_TEXTO`, `ULTIMA_COBRANCA`, `MANUAL` ou `SEM_ASSOCIACAO`;
- `status_envio`: `PENDENTE`, `ENVIANDO`, `ENVIADA`, `ERRO` ou vazio para recebidas.

### `WHATSAPP_SUGESTOES`

Chave: `id` gerado pelo servidor.

Campos: `id`, `mensagem_id`, `deal_id`, `os`, `tipo`, `valor`, `resumo`, `evidencia`, `confianca`, `status`, `criado_em`, `decidido_em`, `decidido_por`, `versao`.

Tipos iniciais:

- `NOVA_DATA_COMBINADA`;
- `PRAZO_CONFIRMADO`;
- `MOTIVO_ATRASO`;
- `OBSERVACAO`.

Status: `PENDENTE`, `ACEITA` ou `IGNORADA`.

O histórico de alterações de produção reutiliza a aba `HISTORICO_APP`, com tipos iniciados por `PRODUCAO_` ou `WHATSAPP_`. Assim, o envio compilado ao Ploomes e o controle de `PENDENTE/ENVIADO/ERRO` continuam num único mecanismo.

## 6. Contrato do board

O `GET pcp-board` passa a devolver:

```text
producao: [{
  dealId, os, oficinaId, oficina, inicioCostura, dataCombinada,
  leadTime, pecas, cliente, peca, referencia, versao,
  mensagens: [...], sugestoes: [...], historico: [...]
}]

oficinas: [{ ploomesId, nome, grupoConfigurado, grupoNome }]
```

Mensagens são limitadas às mais recentes necessárias ao painel; sugestões pendentes nunca são cortadas. O backend não devolve `grupo_jid`, telefone, credenciais ou payload bruto da Evolution ao navegador.

## 7. Regras do Gantt

### Prazo efetivo

- usa `dataCombinada` quando preenchida;
- caso contrário, usa `leadTime`;
- sem nenhuma das duas, a OS aparece na lista da oficina com o aviso **Sem prazo** e não ganha uma barra temporal falsa.

### Barra

- início: `inicioCostura`;
- fim: prazo efetivo;
- data combinada: azul sólida;
- somente lead time: azul listrada;
- prazo vencido: vermelha;
- sem início, mas com prazo: losango no prazo;
- aviamento aberto na caixa de costura: `🚫` na OS e na barra, pois impede finalizar a costura;
- aviamento aberto na caixa de acabamento: `⚠️` na OS e na barra, pois precisa estar pronto para a etapa seguinte;
- falta de costura indica material necessário durante a produção na oficina;
- falta de acabamento indica material que precisa estar pronto quando a oficina concluir a costura;
- datas combinadas anteriores: risco marrom e selo **alterada**.

Não haverá alerta de primeira peça nesta fase. O contrato atual não possui previsão e conclusão específicas desse marco.

### Período

A escala inclui, no mínimo, 30 dias antes e 30 dias depois de hoje e se expande para conter os inícios e prazos das OS filtradas, limitada a 180 dias por vez. A tela abre posicionada em hoje e permite rolagem horizontal.

### Agrupamento e ordem

- `ALOCAR` aparece primeiro em laranja;
- as demais oficinas são ordenadas pelo prazo mais urgente;
- dentro da oficina, prazo vencido/mais próximo primeiro e sem prazo por último.

### Indicadores

1. **OS na etapa Costura** — OS, peças e oficinas.
2. **Caixas de costura com falta** — caixas e itens abertos.
3. **Passaram do prazo** — pela combinada ou, sem ela, pelo lead time.
4. **Sem data combinada** — usando lead time ou ainda sem prazo.

### Busca e filtros

- busca por OS, peça, referência, cliente e oficina, ignorando acentos;
- select de oficina;
- opção **Só com falta na costura**.

## 8. Painel da OS

Painel lateral de 480 px com:

1. oficina, cliente, OS, peça, referência e link do card no Ploomes;
2. status do prazo;
3. início, combinada, lead time e peças;
4. formulário **Alterar combinado**;
5. faltas das caixas de costura e acabamento, em blocos separados;
6. conversa do grupo relacionada à OS;
7. sugestões pendentes;
8. histórico de produção.

### Alterar combinado

Campos: oficina, data combinada e motivo.

- mudar a data exige motivo preenchido;
- alterar somente a oficina deixa o motivo opcional;
- o app mostra o resumo exato antes de salvar;
- salvar atualiza o Ploomes, atualiza o snapshot local, grava o histórico e invalida o cache;
- versão divergente retorna 409 e força recarga;
- somente deals permitidos em `DEALS_PRODUCAO_EDITAVEIS` aceitam escrita até o go-live.
- toda alteração de data, manual ou aceita do intérprete, grava primeiro o campo Ploomes `deal_E53BDEC3-F829-413D-9421-91D5D7411349`; a planilha só recebe a nova data depois do sucesso no Ploomes.

## 9. WhatsApp em grupos

### Destino

A oficina precisa estar ativa e ter `grupo_jid`. Sem grupo configurado, os controles de envio ficam desabilitados com a explicação **Configure o grupo desta oficina na aba OFICINAS.** `ALOCAR` nunca recebe mensagem.

### Modelos

1. **Cobrança de prazo**
   - vencida: informa peça, peças, prazo e pergunta a nova data;
   - dentro do prazo: pergunta se o prazo permanece confirmado.
2. **Confirmar data combinada**
   - informa peça, peças e data combinada e pede confirmação.
3. ~~**Aviso de material enviado**~~: **fora do escopo da F4 por decisão do dono (16/10)**. O modelo saiu do site e do servidor: `enviar_whatsapp` com `MATERIAL_ENVIADO` responde 400 **Modelo de mensagem inválido.**

**Ajuste do dono (16/10):** as oficinas conhecem a peça, não o número da OS. As mensagens não levam mais o cabeçalho `*OS 90001*`; citam o nome da peça em negrito do WhatsApp, por exemplo: "Bom dia. A entrega de *PECA TESTE B*, 160 peças, está prevista para 20/10. Segue dentro do prazo?". Sem quantidade, a frase fica sem as vírgulas ("A entrega de *PECA TESTE B* está prevista para 20/10."); 1 peça fica no singular. O site (`web/src/regras/producao.ts`) e o servidor (`modeloWhatsapp` em `n8n/src/producao.js`) geram exatamente o mesmo texto. O texto pode ser editado antes do envio manual, e o servidor não exige mais o número da OS no texto.

### Fila de saída

O navegador nunca chama a Evolution. Uma ação autenticada cria uma linha `PENDENTE` em `WHATSAPP_MENSAGENS`; um workflow separado envia e atualiza o status.

- sucesso guarda o ID devolvido pela Evolution;
- falha conhecida antes do envio pode ser repetida com limite;
- timeout depois de uma tentativa fica para conferência manual, evitando mensagem duplicada;
- o botão de reenviar mostra a mensagem anterior e exige confirmação;
- enviar duas vezes a mesma ação com a mesma chave não cria duas linhas: o site gera uma `chave` por clique (`crypto.randomUUID`), guardada na fila junto com a ação, e o servidor usa `id` = `WA-E-<chave>`; se a linha já existe na mesma OS, responde sucesso sem gravar de novo (sem `chave`, o id continua aleatório);
- cada tentativa com erro aceita um único reenvio: o reenvio tem `id` = `WA-RE-<id da original>`, e a existência dessa linha é o vínculo com a original (sem coluna nova). Um segundo reenvio da mesma original dá 409, e o board marca a original com `reenviada`, escondendo o botão.

~~O aviso de material enviado entra na mesma fila depois que `enviar_oficina` grava a ação.~~ **fora do escopo da F4 por decisão do dono (16/10)**: por ora não haverá mensagem de material enviado, nem automática nem manual.

## 10. Recepção e intérprete silencioso

Um webhook exclusivo recebe `MESSAGES_UPSERT` da Evolution. Ele valida a instância configurada, aceita somente grupos cadastrados e ignora eventos irrelevantes. `evolution_id` impede duplicidade.

### Associação com OS

Ordem:

1. resposta citada a uma mensagem enviada pelo app;
2. uma única OS válida citada no texto;
3. uma única pergunta (cobrança de prazo ou confirmação de data) enviada nas últimas 72 horas no mesmo grupo e ainda sem resposta (respondida = já existe mensagem recebida associada à mesma OS depois dela);
4. associação manual no app.

Como as mensagens enviadas não citam mais a OS (ajuste de 16/10), a associação principal passa a ser a **citação da nossa mensagem** (1) e a **última pergunta pendente** (3). A OS escrita no texto (2) continua valendo quando a oficina a escreve, mas deixa de ser o caminho esperado.

Se existirem duas possibilidades, a mensagem fica `SEM_ASSOCIACAO`. O intérprete não escolhe uma OS no escuro.

### Interpretação

Depois de associar a OS, o n8n envia somente o trecho necessário e um contexto curto para um modelo configurado por credencial no n8n. A resposta deve obedecer a um JSON estruturado com intenção, data ISO, motivo, resumo, evidência e confiança.

- datas relativas usam `America/Sao_Paulo` e a data da mensagem;
- o texto original continua visível;
- conteúdo fora do schema é descartado e registrado em `ERROS_APP`;
- confiança baixa gera apenas observação, sem sugerir mudança de campo;
- data `dd/mm` sem ano que cairia a mais de ~6 meses da mensagem também vira observação, em vez de pular para o ano seguinte;
- só mensagens de grupo (`remoteJid` terminado em `@g.us`) são aceitas; JID vazio nunca casa com oficina sem grupo;
- o modelo e a credencial serão escolhidos na implementação sem ficarem no repositório.

### Aceitar e ignorar

- `Aceitar` em `NOVA_DATA_COMBINADA` exige motivo; o resumo interpretado pode preenchê-lo, mas a pessoa pode editar;
- aceitar atualiza o Ploomes, grava histórico e marca a sugestão como `ACEITA`;
- `PRAZO_CONFIRMADO` e `MOTIVO_ATRASO` registram interação/histórico; não mudam data sem uma data nova explícita;
- `Ignorar` apenas marca `IGNORADA`, com usuário e horário;
- nenhuma dessas ações manda resposta ao grupo.

## 11. Ações da API

Novos tipos em `POST pcp-acao`:

| Tipo | Efeito |
|---|---|
| `alterar_producao` | Altera oficina/data combinada no Ploomes com motivo e versão |
| `enviar_whatsapp` | Enfileira um dos modelos ou texto editado para a OS |
| `associar_whatsapp` | Liga uma mensagem sem associação a uma OS do mesmo grupo |
| `aceitar_sugestao_whatsapp` | Aplica a sugestão no Ploomes/histórico |
| `ignorar_sugestao_whatsapp` | Encerra a sugestão sem efeito externo |
| `reenviar_whatsapp` | Cria nova tentativa após confirmação humana (uma por mensagem original) |

Todas exigem sessão. Escritas no Ploomes e envios reais exigem deal permitido. O servidor recalcula modelos, valida grupo/oficina e não confia em IDs ou textos auxiliares enviados pelo navegador.

## 12. Segurança e privacidade

- credenciais Ploomes, Evolution e modelo ficam só no n8n;
- o webhook da Evolution usa caminho secreto e valida instância/grupo;
- payload bruto, telefone e JID de participante não chegam ao front;
- logs de erro não guardam credenciais nem o payload completo;
- fixtures e documentação usam somente OS, oficinas, grupos e pessoas fictícias;
- mídia, áudio e documento ficam fora da primeira entrega; o painel registra apenas que houve conteúdo não textual;
- grupos e cards reais não são usados no QA antes do aceite específico do dono.

## 13. Simulação, QA e publicação

O mock local inclui oficinas, barras do Gantt, grupos fictícios, mensagens recebidas, sugestões e falhas de associação. O dono confere toda a experiência local antes de qualquer deploy.

Depois do aceite local:

1. criar as abas e cabeçalhos seguindo o runbook;
2. validar a leitura do Ploomes sem escrita;
3. configurar uma oficina e um grupo exclusivamente de teste;
4. testar envio e recebimento somente nesse grupo;
5. testar alteração somente num card do funil Produção designado pelo dono;
6. publicar primeiro em homologação;
7. mostrar o resultado;
8. publicar produção somente com novo `ok` do dono.

## 14. Critérios de aceite

- Gantt mostra as OS corretas da Costura, agrupadas e ordenadas;
- prazo combinado vence o lead time na apresentação;
- faltas da caixa de costura aparecem na OS certa;
- alteração sem motivo quando a data muda é recusada no front e no servidor;
- alteração aceita atualiza o Ploomes e o histórico uma única vez;
- mensagens padrão chegam ao grupo de teste citando a peça em negrito, sem o número da OS;
- webhook duplicado não duplica mensagem nem sugestão;
- resposta citada é associada à OS correta;
- resposta ambígua não altera nem sugere para uma OS aleatória;
- intérprete não envia respostas ao grupo;
- sugestão só altera o Ploomes depois de `Aceitar`;
- ~~falha no WhatsApp não desfaz `enviar_oficina`~~: **fora do escopo da F4 por decisão do dono (16/10)**, junto com o aviso de material enviado;
- nenhum dado real entra no repositório;
- testes n8n, web, build e Playwright ficam verdes.
