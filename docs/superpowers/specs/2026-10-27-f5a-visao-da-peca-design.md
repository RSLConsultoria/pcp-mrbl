# F5a · Visão da peça (dossiê da OS) — desenho

Data: 27/10/2026. Primeira parte da F5 (ordem aprovada: Peça → Insights → E-mail → Assistente). Aprovado pelo dono em 27/10. Base visual e de conteúdo: `design_handoff_pcp_mrbl/README.md` §5 (fora do Git).

## 1. Objetivo

Uma tela com tudo de uma OS: dados do Ploomes, caixas e faltas, pedidos, produção, WhatsApp e uma linha do tempo única com todas as fontes. Abre qualquer OS do Ploomes, em qualquer funil ou etapa.

## 2. Escopo

Entra:
- guia **Visão das peças** (hoje desabilitada) com busca por OS ou referência;
- link **"Ver visão da peça"** nos painéis existentes (caixa no No Ploomes, Saídas com falta, pedido, produção) e endereço direto `#peca/<OS>`;
- leitura no Ploomes, na hora, dos cards da OS, dos registros de interação e das trocas de etapa;
- **Anotar no histórico** (única escrita).

Fica fora: e-mails do PCP (a aba existe, vazia, com "Chega na próxima parte da F5"), insights e assistente.

## 3. Tela

- **Busca:** campo "OS ou referência". Uma OS → abre. Referência com várias OS → lista para escolher (OS, peça, etapa, funil). Nada → "Nenhuma OS encontrada no Ploomes".
- **Cabeçalho:** OS (mono 30px), peça, cliente, referência; links "Abrir card no Ploomes" (`https://app10.ploomes.com/deal/<id>`, um por card da OS quando houver mais de um, com o nome do funil) e "Ficha técnica no HUB de Peças" (`https://rslconsultoria.github.io/hub-pecas-catalogo/#<referência>`, só quando houver referência); trilha de etapas do funil do card principal (Produção, senão PCP, senão o mais recente) com a etapa atual destacada.
- **Lateral (384px):** status do prazo (mesma regra do Controle de produção); bloco Produção (etapa, oficina, início, data combinada, lead time, peças, prevista ou real); bloco Situação hoje (nº de caixas e itens em aberto, pedidos abertos e etapa, última mensagem do WhatsApp).
- **Abas:**
  1. **Linha do tempo** — todos os eventos, do mais novo para o mais antigo, com selo da fonte: *Ploomes* (registro de interação), *Etapa* (troca de etapa), *Almoxarifado* (baixa, previsão, observação, responsável, mover), *Compras* (pedidos), *Produção* (combinado, sugestões), *WhatsApp* (mensagens enviadas e recebidas), *Anotação*. Eventos do app mostram "enviado ao Ploomes" quando o registro compilado já saiu. Campo **Anotar algo no histórico** no topo.
  2. **Caixas e faltas** — cada caixa (Costura/Acabamento, ciclo, saiu?) com itens: falta, baixado, resta, previsão, pedido.
  3. **Oficina e prazos** — dados de produção e o histórico de alterações do combinado.
  4. **WhatsApp** — a conversa da OS (mesmo componente do painel de produção, só leitura).
  5. **E-mails do PCP** — vazia nesta parte.
- **Celular (375px):** lateral vai para cima das abas; nada estoura a largura.

## 4. Dados

### 4.1 Endpoint novo `GET pcp-peca` (homologação `pcp-peca-h`)
Parâmetros: `q` (OS ou referência). Autenticação igual ao board (Bearer). Resposta:
```
{ geradoEm, os, candidatos?: [{ os, peca, etapa, funil, dealId }],
  cards: [{ dealId, funil, etapa, etapaOrdem, titulo, cliente, peca, referencia, os, link }],
  trilha: { funil, etapas: [{ id, nome, ordem }], atualId },
  eventos: [{ quando, fonte, texto, autor, enviadoPloomes?, dealId }] }
```
- **Ploomes:** cards por OS (`OtherProperties` com o campo OS, `deal_C06992BA-FF1E-47A8-9330-5242026E691E`) ou por referência; registros de interação (`/InteractionRecords?$filter=DealId eq X`) e trocas de etapa (`/DealsStagesHistory?$filter=DealId eq X`; campos confirmados numa leitura real na implementação). Com `q` numérico tenta OS primeiro; senão referência.
- **Sem duplicar:** registros do Ploomes criados pelo envio do app (conteúdo começando com `[PCP · OS`) não entram como evento *Ploomes*: os eventos do app já aparecem com "enviado ao Ploomes".
- **Planilha (já lida pelo board):** o front cruza com o board que já tem (caixas, pedidos, produção, mensagens, histórico) pela OS; o endpoint só traz o que o board não tem (Ploomes). Assim a tela reaproveita o cache do board.
- **Cache:** resposta por `q` fica 60 s no static data do workflow; erro do Ploomes → 502 com "Não foi possível ler o Ploomes agora." e a tela mostra o que tem do board.
- Limite: no máximo 5 cards e 200 eventos do Ploomes por OS (os mais recentes).

### 4.2 Anotação
Ação nova `anotar_peca` em `pcp-acao`: `{ tipo: 'anotar_peca', os, dealId, texto }` (texto obrigatório, até 500 caracteres, sem quebra de linha dupla). Grava uma linha no HISTORICO_APP (`acao: 'ANOTACAO'`, `deal_id` = card escolhido — padrão: card de Produção, senão o primeiro) e entra no registro compilado do Ploomes como as outras ações. Até o go-live, só nos deals de `DEALS_EDITAVEIS` ∪ `DEALS_PRODUCAO_EDITAVEIS` (fora deles: 403 "Edição liberada em breve para esta OS."). Tela otimista: o evento aparece na hora.

## 5. Regras puras (front, `web/src/regras/peca.ts`)
- `linhaDoTempo(board, ploomes, os)` → eventos unidos, ordenados por data desc, com fonte e selo "enviado ao Ploomes"; empate por fonte (Etapa, Ploomes, app).
- `resumoSituacao(board, os)` → caixas/itens em aberto, pedidos abertos, última mensagem.
- `cardPrincipal(cards)` → Produção > PCP > mais recente.

## 6. Erros e limites
- OS sem nada no app: a tela mostra só o Ploomes, com "Esta OS ainda não tem caixas, pedidos ou mensagens no app."
- Ploomes fora: aviso no topo e o resto do dossiê pelo board.
- O link do HUB usa a URL pública do catálogo; a URL fica numa constante do front.

## 7. Testes
- n8n: busca por OS e referência (montagem das URLs), filtro dos registros do app, limites, cache, ação `anotar_peca` (validação, allowlist, histórico).
- web: regras puras com dados fictícios; e2e no simulador (busca, abas, anotação otimista, link vindo do painel, 375px).
- Simulador (`mock-api.mjs`): `pcp-peca` com uma OS fictícia completa (dois cards, registros, trocas de etapa).
- Homologação: OS 123456 (card 607612577).
