# PCP MRBL: contexto para agentes (Claude Code, Codex e outros)

Leia este arquivo inteiro antes de qualquer tarefa. Ele resume o projeto, as decisões do dono e o estado atual. Os detalhes estão nos documentos citados.

## Regras de trabalho

- **Fale sempre em português do Brasil** com o dono, inclusive em mensagens curtas de andamento. Commits, comentários e textos da interface também em pt-BR.
- **O repositório é público.** Use só dados fictícios em testes, fixtures e documentação: nada de nomes de clientes reais, senhas, chaves ou tokens.
- **Não mexa em cards reais do Ploomes.** Testes de escrita só nos cards de teste (lista abaixo). Até o go-live, a edição e o envio ao Ploomes ficam restritos a esses cards.
- **Antes de construir algo novo:** alinhe o desenho com o dono, escreva o spec em `docs/superpowers/specs/` e o plano em `docs/superpowers/plans/`, e só então implemente, com testes primeiro (TDD), revisão por tarefa e revisão final da branch.
- **Mostre antes de publicar.** O dono quer ver no ambiente simulado local antes de ir para produção. Mudanças em produção pedem o ok dele.
- **Quando o dono testa e pede ajuste**, junte os ajustes numa rodada só: cada rodada de "corrige isso" custa uma volta inteira de testes.

## O que é

Software de PCP (planejamento e controle de produção) da MRBL, uma confecção, para acompanhar as **faltas de material** nas caixas do almoxarifado: das faltas aos pedidos de compra, até a entrega e a baixa. Ele lê e grava numa planilha Google (o banco), conversa com o Ploomes (CRM, onde cada OS é um card) e roda no navegador.

- **Site:** https://rslconsultoria.github.io/pcp-mrbl/ (GitHub Pages; publica sozinho a cada push na `main`, pelo GitHub Actions, depois dos testes).
- **Backend:** workflows no n8n (`https://mrbl-automacoes.duckdns.org`), webhooks `/webhook/pcp-login`, `/webhook/pcp-board`, `/webhook/pcp-acao`. Há uma cópia de homologação com `-h` no fim (`pcp-login-h` etc.), que usa a **mesma planilha**.
- **Banco:** planilha Google com as abas FALTANTES, CAIXAS GANHAS, CAIXAS_PCP, USUARIOS, HISTORICO_APP, PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO, FORNECEDORES, RESPONSAVEIS e ERROS_APP. A aba "FALTANTES (Painel)" espelha a FALTANTES linha a linha e guarda anotações manuais da equipe presas ao número da linha.
- **Ploomes:** o workflow "PCP MRBL - Enviar ao Ploomes" junta as ações de cada OS e manda um registro de interação compilado quando a OS fica 10 minutos sem nova ação.

## Estrutura do código

- `web/`: Vite + React + TypeScript.
  - Telas: No Ploomes, Saídas com falta, Solicitações de faltas.
  - A tela é otimista: aplica a mudança na hora e grava em segundo plano. As regras ficam em `web/src/regras/otimista.ts` e precisam espelhar as do servidor.
  - Simulador local: `web/scripts/mock-api.mjs`.
- `n8n/src/`: lógica do backend em JavaScript ES5 puro (sem import/export), carregada nos Code nodes do n8n.
  - `n8n/adaptadores/`: a cola com o n8n.
  - `n8n/scripts/`: geram `n8n/build/`, `n8n/workflows/*.sdk.js` e `n8n/workflows/json/*.json`. Commite os gerados junto.
- `docs/superpowers/specs` e `plans`: desenho e plano de cada fase. Specs mais novos valem por cima dos antigos onde houver conflito.
- `n8n/workflows/README.md`: **roteiro de publicação**, com checklist, rollback e regras permanentes da planilha. Siga-o para qualquer deploy.
- `.superpowers/sdd/progress.md`: registro de progresso local (fora do Git), com commits, decisões e pontos pendentes.

## Como testar

```bash
cd n8n && npm test && npm run build
```

```bash
cd web && npm test && npm run build
```

```bash
cd web && CI=1 npx playwright test
```

Para ver localmente com dados fictícios: `cd web && node scripts/dev-mock.mjs` (site em http://localhost:5174/pcp-mrbl/, qualquer login entra). No PowerShell do dono, `npm run` pode ser bloqueado: use `node scripts/...` direto.

## Publicação (resumo; o detalhe está no README do n8n)

1. Testes verdes, build regenerado e commitado, push da branch.
2. No n8n, o workflow "Utilitario - Deploy PCP (manual)" baixa `n8n/workflows/json/<arquivo>` de um **commit fixo** do GitHub e grava no workflow pela API do n8n. **Gravar num workflow ativo publica na hora.**
   - API de produção: `WpuXpcSa5oGiEkTm`.
   - Envio ao Ploomes: `z9misKW25YTuDhJ6`.
   - Homologação: `dI2NUYzxfApYM8iA`.
3. Anote a versão anterior antes de publicar, para poder voltar. No rollback, volte a API e o site juntos.
4. Site: merge na `main` e push. Peça para todo mundo recarregar a página.

**Regras da planilha:**
- Nunca ordene nem apague linhas nas abas do app; as gravações usam o número da linha.
- Nunca rode o utilitário "Limpar Planilha Faltantes".
- O Sync Faltantes não mexe nas linhas da demanda pós-saída (`ciclo` = `POS_SAIDA`).

## Regras de negócio essenciais

- **Etapas dos pedidos:** A pedir → Solicitado → Aguardando entrega → **Enviado ao destino final** → **Concluído**.
  - A penúltima etapa dá a **baixa** da falta e pede confirmação; a baixa não se desfaz.
  - A última só conclui, e só aceita pedido que já teve baixa.
  - As duas últimas etapas são fixas, mas podem ser renomeadas por ADM.
- **Dividir pedido:** só em "Aguardando entrega". A parte que chegou vira um pedido novo (PED-x.n) já com baixa.
- **Dividir por previsão:** separa o pedido pelas datas de previsão dos itens.
- **Gerar pedido:**
  - Obrigatórios: Solicitar a (fornecedor ou cliente), fornecedor/cliente vindo de lista, local de entrega e responsável vindo de lista.
  - Os campos começam em "Selecionar" e têm asterisco vermelho.
- **Saídas com falta:** colunas "Sem pedido" mais as etapas. A caixa se divide sozinha por etapa ("12345 · 1 de 3").
- **Nova demanda pós-saída:** para uma caixa que já saiu, informando OS, tipo (Costura/preta ou Acabamento/azul) e os itens em texto livre. Os itens não aparecem no No Ploomes.
- **Troca de ciclo Pedido → Corte:** pedidos abertos passam a apontar para o item do corte, casando pela descrição e pelo código da cor. Sem correspondente, aparece o aviso "Item mudou no corte: confira" e o item fica sem baixa.
- **Edição:** só nos cards de `DEALS_EDITAVEIS` (`n8n/src/api.js`). O envio ao Ploomes só vai para `DEALS_PERMITIDOS` (`n8n/adaptadores/selecionar-envio.js`). No go-live, as duas listas ficam vazias, o que significa todos.

## Cards de teste no Ploomes

| Negócio | OS | Caixa |
|---|---|---|
| 607479158 | 99999 | card de teste original |
| 607493886 | 12345 | Costura |
| 607493902 | 7654321 | Colete |
| 607520448 | 12345 | Acabamento; já saiu com falta |

O card 606583474 também é de teste (OS 12345, Costura).

## Estado atual (13/10/2026)

**Concluídas e no ar, com edição restrita aos cards de teste:**
- **F1:** base, login e quadro No Ploomes.
- **F2:** baixa, previsão, observação, responsável e registros no Ploomes.
- **F3:** Solicitações de faltas, Saídas com falta, leitura e gravação em lote, tela otimista, registro compilado no Ploomes, etapas novas e demanda pós-saída. QA real aprovado nos cards de teste.

**Carga das anotações da equipe:** já gravada a partir do "FALTANTES (Painel)":
- responsáveis das caixas;
- observações dos itens;
- pedidos PED-0004 a PED-0011, criados a partir dos chamados.

**Decisão do dono: o go-live, que libera todas as OSs, só acontece depois de F4 e F5, tudo de uma vez.**

**Próximas fases:**
- **F4:** Gantt e cobrança pelo WhatsApp, via Evolution API na VPS. Começar alinhando o desenho com o dono.
- **F5:** Visão das peças, insights, leitura de e-mail e assistente.

**Pendências conhecidas:**
- Logo depois de uma gravação, o quadro em cache pode ficar até cerca de 1 minuto desatualizado para outro usuário.
- Pontos de segurança herdados da F1, como as senhas iniciais fracas dos usuários de teste.
