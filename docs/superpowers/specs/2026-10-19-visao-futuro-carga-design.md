# Visão de futuro e carga das oficinas — desenho

Data: 19/10/2026. Complementa a F4 (`2026-10-13-f4-gantt-whatsapp-design.md`). Aprovado pelo dono em 19/10.

## 1. Objetivo

Ver, antes de alocar, se uma oficina vai receber coisa demais no mesmo período. A tela junta o que a oficina já costura com o que vem aí (OS do Encaixe até antes da Costura) e compara com a capacidade dela, semana a semana.

Não é sugestão de alocação: o sistema mostra a carga; quem decide é o PCP.

## 2. Escopo

Entra:

- previsão de chegada e de saída da Costura para as OS da etapa 12 (Encaixe) até a 16 (Primeira Peça), usando o motor de previsão do Power BI do dono, reimplementado sem mudança de regra;
- capacidade por oficina em peças por semana, editável por ADM;
- visão **Carga** (terceira visão: Gantt | Tabela | Carga);
- filtro **Incluir previstas** no Gantt e na Tabela.

Fica fora:

- sugestão automática de oficina;
- previsão das etapas de desenvolvimento e PCP antes do Encaixe (o motor calcula, mas a tela não mostra);
- pós-lacre, fila de faturamento e confiabilidade do BI (só servem às etapas fora do escopo ou à exibição do BI);
- gravação de previsão no Ploomes.

## 3. Regras de previsão (fiéis ao BI)

Fonte: modelo Power BI `reuniaoDiretoria_Novo` (tabelas `PREVISOES_FUTURAS`, `FILA_ESTAGIO_FAIXA`, `GANTT_UNIFICADO`), lido em 19/10. O modelo fica fora do repositório.

### 3.1 Etapas

A ordem vem do número antes do "." no nome da etapa: 12. Encaixe · 13. Estratégico 2 · 14. Corte · 15. Preparação 1 · 16. Primeira Peça · 17. Costura · 18. Acabamento · 19. Faturados. A etapa 16 fica fora da cadeia de previsão e das filas (o tempo dela entra como fila entre 15 e 17).

### 3.2 Faixa de volume

`pecas` = total de peças do corte real; se em branco, total de peças do pedido; senão 0. Faixas: até 50 "01. Pequeno"; até 150 "02. Médio"; até 300 "03. Grande"; até 450 "04. Industrial"; acima "05. Industrial+". OS com 0 peças não recebe previsão a partir da etapa 14.

### 3.3 Histórico

Fonte: registros de interação do Ploomes com o marcador `60151285`, um por passagem de etapa, com "Data de início", "Data de término" e o número da etapa no texto do registro. Duração = dias corridos entre início e término (mínimo 0). Entram passagens concluídas com início nos últimos 180 dias, duração entre 1 e 180 (ou etapa marco 14/19), e na etapa 19 só deals que passaram pela produção.

### 3.4 Duração por etapa

Para cada (etapa, faixa): remove valores fora de `Q1 − 1,5·IQR … Q3 + 1,5·IQR` (quartis por interpolação linear, como `PERCENTILE.INC`) e tira a média. Também a média geral da etapa e a média geral só de deals com "PCP completo pelo Ploomes?". Etapas 14 e 19 valem 1 dia. Duração usada: etapa ≤ 12 → média PCP geral, senão média geral, senão 1; etapa ≥ 13 → média da faixa, senão média geral, senão 1.

### 3.5 Fila

Para etapas destino 14, 15, 17, 18 e 19: gap em dias entre o maior término de etapa anterior do deal (sem a 16) e o início do destino, entre 0 e 180, com início nos últimos 180 dias (inclui OS ativas). Mediana por (destino, faixa) se houver pelo menos 5 cards; senão mediana do destino; senão 0. Etapas < 14 têm fila 0.

### 3.6 Projeção de uma OS

Entram OS em aberto com etapa atual de 12 a 16; nas etapas 12 e 13 só com "PCP completo pelo Ploomes?" = sim (como no BI). `S` = etapa atual; `dtInicio` = data de entrada da etapa atual (campos "Entrada …"/"Início …" do card); chegada = maior data de registro concluído do deal (senão maior término); hoje = data local de São Paulo.

```
InicioEfetivo = dtInicio preenchido ? dtInicio : max(chegada, hoje) + fila(S)
FimBase       = max(InicioEfetivo + dur(S), hoje)
DiasMeio(A)   = Σ_{S<O<A, O≠16} (dur(O) + fila(O))
Inicio(A)     = FimBase + DiasMeio(A) + fila(A)      // A ≥ 14
Fim(A)        = Inicio(A) + dur(A)
```

Para a Costura (A = 17): se a OS tem oficina (diferente de ALOCAR) e há média histórica de Costura para (faixa, oficina), `Fim(17) = Inicio(17) + MediaCosturaOficina`; essa média é a média simples das passagens de Costura concluídas com duração entre 1 e 180, sem janela e sem IQR, como no BI.

Frações de dia: o cálculo carrega frações; a data exibida corta a fração para baixo (como o Gantt do BI).

## 4. Dados e fluxo

### 4.1 Médias diárias (workflow novo "PCP MRBL - Médias de Previsão")

Agenda diária (madrugada). Lê os registros marcados dos últimos 180 dias (paginação, 429/5xx como no sync atual) e os deals necessários, calcula durações, filas e médias de Costura por oficina e grava a aba nova `PREVISAO_MEDIAS` (`tipo`, `etapa`, `faixa`, `oficina_id`, `valor`, `amostra`, `calculado_em`), reescrevendo só valores, nunca ordenando nem apagando linhas (linha existente atualizada por chave `tipo|etapa|faixa|oficina_id`; chave nova anexada).

### 4.2 Sync da produção (existente, ampliado)

Passa a ler também as etapas 12 a 16 do funil Produção/PCP. Grava na PRODUCAO, nas colunas novas no fim: `etapa_ordem`, `etapa_nome`, `etapa_inicio`, `prevista` (`SIM` para OS antes da Costura), `inicio_costura_previsto`, `fim_costura_previsto`. A previsão é calculada no sync com as médias da `PREVISAO_MEDIAS`. OS já na Costura continuam com a regra atual (data combinada ou lead time).

### 4.3 Capacidade

Coluna `capacidade_semana` no fim da OFICINAS. Ação nova `alterar_capacidade_oficina` (só ADM; número inteiro ≥ 0 ou vazio). Vazio = sem capacidade: a carga aparece em números, sem cor de alerta.

### 4.4 Carga

Função pura no front: cada OS ocupa a oficina do início ao fim da costura (real ou previsto); as peças se espalham igualmente pelos dias úteis (seg a sex) desse intervalo; a carga da semana (segunda a domingo) é a soma. Cor: até 80% verde, até 100% amarelo, acima vermelho. OS sem oficina ou ALOCAR vão para a faixa "A alocar" pela semana de chegada prevista.

## 5. Telas

- **Carga**: linhas = oficinas (ordem alfabética), colunas = semanas (da atual até 8 à frente), célula "peças / capacidade" com cor; clique lista as OS da célula (OS, peça, peças no período, real ou prevista) e abre o painel da OS. Faixa "A alocar" no fim com quantidade de OS e peças por semana. ADM edita a capacidade clicando no nome da oficina.
- **Incluir previstas** (Gantt e Tabela, desligado por padrão, lembrado no navegador): OS previstas aparecem com barra tracejada da chegada prevista ao fim previsto e etiqueta "prevista"; na Tabela, colunas "Etapa atual" e "Chegada prevista".
- Os filtros existentes valem nas três visões.

## 6. Erros e limites

- Sem `PREVISAO_MEDIAS` (primeira execução ainda não rodou) → OS previstas usam fallback do BI (duração 1, fila 0) e a tela avisa "Previsão sem histórico".
- Falha na leitura do histórico → mantém as médias anteriores e registra em ERROS_APP.
- Colunas novas precisam existir antes de publicar (PRODUCAO, OFICINAS, aba PREVISAO_MEDIAS); o roteiro de publicação recebe o passo.

## 7. Testes

- Funções puras: faixa, IQR/percentil, médias, mediana de fila, projeção, carga semanal — com casos montados à mão.
- Conferência com o BI: um conjunto fictício de registros e deals com o resultado calculado pela mesma regra do DAX; antes da homologação, comparar 5 OS reais com o BI do dono (fora do repositório).
- E2E: visão Carga, cores, clique na célula, edição de capacidade por ADM, filtro Incluir previstas.

## 8. Pendências para a homologação

- Confirmar o formato do texto dos registros marcados (posição do número da etapa) numa leitura real.
- Fixar as FieldKeys dos campos usados (peças do corte e do pedido, "PCP completo pelo Ploomes?", "Entrada …"/"Início …").
- O BI do dono tem a chave do Ploomes em texto puro; recomendado gerar chave nova (fora do escopo deste software).
