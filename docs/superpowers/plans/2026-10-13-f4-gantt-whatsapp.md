# Plano F4 — Controle de produção e WhatsApp em grupos

Data: 13/10/2026 · Spec: `../specs/2026-10-13-f4-gantt-whatsapp-design.md`

## Objetivo

Entregar o Gantt das oficinas e o ciclo de cobrança em grupos do WhatsApp, incluindo o intérprete silencioso, sem liberar escrita fora dos alvos de teste e sem publicar antes da conferência local do dono.

## Regras de execução

- Trabalhar em branch própria a partir da `main` atualizada.
- Preservar alterações locais que não pertençam à F4.
- Usar dados fictícios em todo teste, mock e documentação.
- Implementar cada comportamento com teste falhando primeiro.
- Ao fim de cada tarefa: rodar os testes afetados, revisar o diff da tarefa e corrigir achados antes da próxima.
- Fazer revisão final da branch inteira contra a spec.
- Gerar e commitar `n8n/build/`, SDKs e JSONs junto com as fontes.
- Não escrever em cards ou grupos reais durante a construção.
- Não fazer deploy nem liberar allowlists sem aceite explícito do dono.

## Tarefa 0 — Preparação e inventário seguro

1. Conferir branch, status e alterações preexistentes.
2. Criar a branch `f4-gantt-whatsapp` sem incluir artefatos locais alheios.
3. Rodar a suíte atual como baseline:
   - `n8n`: testes e build;
   - `web`: testes e build;
   - Playwright com mock.
4. Resolver o contexto n8n-as-code e registrar o `workflowsPath`, sem push.
5. Inventariar em leitura:
   - workflow atual da API;
   - envio compilado ao Ploomes;
   - credenciais disponíveis apenas por nome/tipo;
   - versão e contrato da Evolution instalada;
   - formato atual dos campos do Ploomes usados na F4.
6. Confirmar que nenhum identificador de grupo, telefone ou segredo entrou no Git.

**Revisão da tarefa:** baseline reproduzível, nenhuma escrita externa e nenhuma alteração inesperada no repositório.

## Tarefa 1 — Regras puras de produção

### Testes primeiro

Criar testes em `n8n/test/` para:

- mapear os campos do Ploomes para uma linha `PRODUCAO`;
- marcar `ALOCAR` quando não há oficina;
- escolher combinada antes do lead time;
- calcular vencido, vence hoje, próximo e sem prazo;
- cruzar apenas a caixa de COSTURA pela OS;
- ordenar oficinas e OS;
- validar mudança de oficina/data;
- exigir motivo quando a data muda;
- recusar versão velha e deal fora da allowlist;
- montar os três modelos de WhatsApp;
- normalizar datas em `America/Sao_Paulo`.

### Implementação

Criar lógica ES5 pura em `n8n/src/producao.js`, mantendo adaptadores e I/O fora das funções de negócio.

**Revisão da tarefa:** conferir datas, timezone, campos vazios e ausência de dados reais nas fixtures.

## Tarefa 2 — Associação e interpretação de mensagens

### Testes primeiro

Cobrir:

- deduplicação por ID da Evolution;
- resposta citada prevalece;
- uma OS no texto associa;
- várias OS deixam a mensagem sem associação;
- única cobrança pendente recente associa com origem explícita;
- duas cobranças pendentes não associam;
- mensagem de grupo não cadastrado é ignorada;
- evento `fromMe` não vira resposta recebida;
- payload textual, legenda e conteúdo não textual;
- validação do JSON estruturado do intérprete;
- data relativa e ano correto;
- confiança baixa não cria sugestão de mudança de campo;
- aceite/ignorar idempotentes.

### Implementação

Criar `n8n/src/whatsapp.js` com normalização de eventos, associação, schema do intérprete, sugestões e regras da fila de saída.

O adaptador do modelo recebe uma interface pequena e testável. Testes não chamam rede nem modelo real.

**Revisão da tarefa:** mensagens ambíguas permanecem humanas; nenhuma função envia ou grava por conta própria.

## Tarefa 3 — Planilha e contrato do board

### Testes primeiro

Ampliar os testes de lote e board para:

- ler `PRODUCAO`, `OFICINAS`, `WHATSAPP_MENSAGENS` e `WHATSAPP_SUGESTOES`;
- preservar campos humanos de `OFICINAS` no sync;
- montar `board.producao` sem expor JIDs;
- limitar mensagens antigas e manter sugestões pendentes;
- reutilizar `HISTORICO_APP` por deal de produção;
- gerar upserts sem ordenar/apagar linhas;
- validar cabeçalhos obrigatórios antes de qualquer escrita.

### Implementação

- estender `n8n/src/planilhaLote.js` e `n8n/src/api.js`;
- acrescentar adaptadores dos novos lotes;
- documentar os cabeçalhos no runbook;
- ainda não criar abas na planilha real.

**Revisão da tarefa:** verificar ordem das escritas, concorrência e que falha de cabeçalho acontece antes de escrita parcial.

## Tarefa 4 — Sincronização Ploomes → PRODUCAO

1. Consultar os schemas exatos dos nodes n8n antes de editar o workflow.
2. Criar o workflow versionado **PCP MRBL — Sincronizar Produção**:
   - agenda a cada cinco minutos;
   - paginação do funil/etapa;
   - normalização pelos campos conferidos;
   - upsert na planilha;
   - marcação `em_costura = NAO` sem apagar linha;
   - atualização dos nomes/IDs em `OFICINAS`, preservando grupo e ativo;
   - erros em `ERROS_APP` sem segredos.
3. Testar paginação, página vazia, rate limit e execução repetida.
4. Gerar SDK/JSON e validar localmente.

**Revisão da tarefa:** sync idempotente, sem escrita em campos humanos e sem chamada de produção durante testes automatizados.

## Tarefa 5 — Ações de produção e histórico

### Testes primeiro

Cobrir `alterar_producao`, `associar_whatsapp`, `aceitar_sugestao_whatsapp` e `ignorar_sugestao_whatsapp`:

- sessão e perfil;
- allowlist `DEALS_PRODUCAO_EDITAVEIS`;
- versão/conflito;
- motivo obrigatório;
- payload mínimo para o Ploomes;
- uma linha de histórico por ação;
- aceite e ignore idempotentes;
- sugestão não pode apontar para outra oficina/grupo;
- cache invalidado somente depois da operação aceita.

### Implementação

- estender o ramo `pcp-acao`;
- atualizar Ploomes e planilha na ordem mais recuperável;
- usar o mecanismo atual de `HISTORICO_APP` e envio compilado;
- deixar a allowlist de produção preenchida somente com o futuro card de teste.

**Revisão da tarefa:** comparar regras do servidor e do estado otimista; verificar que não existe caminho de escrita fora da allowlist.

## Tarefa 6 — Saída pela Evolution

1. Confirmar na instância instalada os endpoints e payloads de grupos, texto, resposta citada e webhooks.
2. Criar workflow **PCP MRBL — Enviar WhatsApp**:
   - lê pendentes da fila;
   - busca o `grupo_jid` somente no backend;
   - envia texto;
   - grava ID/status;
   - limita repetição e trata timeout incerto sem duplicar automaticamente.
3. Implementar `enviar_whatsapp` e `reenviar_whatsapp` na API.
4. Integrar `enviar_oficina` ao modelo **Aviso de material enviado** depois da gravação principal.
5. Testar sucesso, 4xx, 429, 5xx, timeout e execução repetida com servidor falso.

**Revisão da tarefa:** ação de estoque não é revertida por falha do WhatsApp; reenvio exige confirmação humana.

## Tarefa 7 — Entrada pela Evolution e intérprete

1. Criar workflow **PCP MRBL — Receber WhatsApp** com webhook de caminho secreto.
2. Validar instância, evento e grupo cadastrado.
3. Gravar a mensagem idempotentemente.
4. Associar por citação, OS ou cobrança recente.
5. Para mensagem associada, chamar o modelo configurado no n8n com saída estruturada.
6. Validar a saída antes de criar sugestão.
7. Registrar falhas técnicas em `ERROS_APP` sem payload integral.
8. Não responder ao grupo em nenhum ramo.

**Revisão da tarefa:** inspecionar todos os ramos e provar por teste que não existe node de envio no workflow de entrada.

## Tarefa 8 — Regras e tipos do front

### Testes primeiro

Criar testes Vitest para:

- prazo efetivo e status;
- janela do Gantt;
- agrupamento/ordem;
- busca e filtros;
- KPIs;
- modelos e resumo de alteração;
- motivo obrigatório;
- mensagens sem associação;
- alerta `🚫` para falta de costura que bloqueia a finalização e `⚠️` para falta de acabamento necessária na etapa seguinte, sem alerta de primeira peça;
- estados de sugestão;
- estado otimista e rollback das novas ações.

### Implementação

- ampliar `web/src/api/tipos.ts`;
- criar regras puras em `web/src/regras/producao.ts`;
- ampliar cliente, ações, mensagens de sucesso e fila otimista.

**Revisão da tarefa:** regras equivalentes às do servidor e datas sem dependência acidental do fuso do navegador.

## Tarefa 9 — Tela Controle de produção

1. Habilitar a guia e o hash `#producao`.
2. Criar indicadores, filtros, legenda e Gantt acessível.
3. Implementar escala diária, fins de semana, hoje, rolagem e estados sem prazo/início.
4. Criar painel lateral com:
   - dados de produção;
   - formulário de alteração e resumo;
   - faltas das caixas;
   - conversa relacionada;
   - envio de modelo editável;
   - sugestões para aceitar/ignorar;
   - histórico.
   - faltas de costura e acabamento separadas, explicando que o acabamento deve estar pronto ao fim da costura.
5. Mostrar configuração ausente do grupo e mensagens sem associação.
6. Manter layout responsivo sem largura fixa no conteúdo empurrado pelo painel.

Depois de editar múltiplos componentes TSX, executar a revisão de boas práticas React disponível no ambiente.

**Revisão da tarefa:** teclado, foco, rótulos, contraste, rolagem, telas estreitas e ausência de informação sensível no DOM.

**Regra de persistência da data:** tanto `alterar_producao` quanto o aceite de `NOVA_DATA_COMBINADA` devem escrever o campo `deal_E53BDEC3-F829-413D-9421-91D5D7411349` no Ploomes antes de atualizar `PRODUCAO`; falha externa não pode deixar apenas a planilha com a nova data.

## Tarefa 10 — Mock e testes ponta a ponta

Ampliar o simulador com dados fictícios e criar cenários Playwright:

1. Gantt agrupado com ALOCAR primeiro.
2. Filtro de oficina, busca e só com falta.
3. Barra combinada, lead time, vencida e sem início.
4. Abrir painel e alterar data com motivo.
5. Bloquear mudança de data sem motivo.
6. Preparar e enfileirar cobrança padrão.
7. Receber resposta citada e mostrar sugestão.
8. Aceitar sugestão e refletir data/histórico.
9. Ignorar sugestão.
10. Mensagem ambígua aguardando associação manual.
11. Falha de WhatsApp após `enviar_oficina` sem desfazer a ação.
12. Deal não editável sem controles de escrita.

**Revisão da tarefa:** capturas visuais nas larguras usadas pelo dono e nenhuma dependência de serviço externo.

## Tarefa 11 — Build e revisão final

1. Rodar suites completas:
   - `cd n8n && npm test && npm run build`;
   - `cd web && npm test && npm run build`;
   - `cd web && CI=1 npx playwright test`.
2. Conferir todos os arquivos gerados e o diff contra a spec.
3. Revisar segurança, idempotência, paginação, timezone, conflito e allowlists.
4. Verificar que arquivos públicos não contêm dados reais ou credenciais.
5. Corrigir todos os achados importantes e repetir somente os testes afetados mais a suíte final.
6. Atualizar `AGENTS.md`, runbook e progresso com o estado verdadeiro.

## Tarefa 12 — Apresentação local ao dono

1. Iniciar o simulador local.
2. Entregar a URL e um roteiro curto de conferência.
3. O dono verifica Gantt, painel, textos e sugestões.
4. Reunir os ajustes numa única rodada.
5. Aplicar os ajustes, repetir os testes e apresentar novamente.

Nenhuma publicação ocorre nesta tarefa.

## Tarefa 13 — Homologação e produção, somente após aceite

1. Pedir ao dono:
   - card de teste no funil Produção;
   - grupo de WhatsApp exclusivo para teste;
   - confirmação da instância Evolution e credencial do modelo no n8n.
2. Criar as abas/cabeçalhos conforme o runbook, sem apagar nem ordenar linhas.
3. Publicar primeiro em homologação e manter allowlists restritas.
4. Testar leitura do Ploomes, um envio, uma resposta e uma sugestão aceita.
5. Conferir planilha, Ploomes, Evolution e ausência de duplicatas.
6. Mostrar o resultado ao dono.
7. Com novo aceite, publicar workflows de produção e site na ordem do runbook.
8. Manter todas as OS bloqueadas até a decisão conjunta de go-live após F5.
9. Registrar versões anteriores e procedimento de rollback.

## Definição de pronto

- critérios de aceite da spec cumpridos;
- testes e builds verdes;
- revisão por tarefa e revisão final concluídas;
- simulação local aprovada pelo dono;
- documentação e gerados atualizados;
- homologação comprovada apenas nos alvos de teste;
- produção só publicada após autorização explícita.
