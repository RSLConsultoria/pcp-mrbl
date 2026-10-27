# F5b · Insights do dia — desenho

Data: 27/10/2026. Segunda parte da F5. Aprovado pelo dono em 27/10. Base: `design_handoff_pcp_mrbl/README.md` (Shell, "Faixa Insights do dia"; fora do Git).

## 1. Objetivo
Mostrar, em todas as telas, o que pede atenção hoje, com um clique até a OS.

## 2. Onde e como
- Faixa fina logo abaixo da navbar, em **todas as telas** (inclusive Visão das peças).
- **Recolhida por padrão**; o estado (aberta/recolhida) fica lembrado no navegador (`localStorage`, com try/catch).
- Recolhida: uma linha de resumo só com o que tem itens, ex.: "3 prazos estourando · 5 caixas paradas · 2 cobranças sem resposta". Sem nada: "Nada pedindo atenção hoje."
- Aberta: 4 cartões lado a lado (empilham no celular, 375px sem rolagem horizontal). Cada cartão: título, contagem, até 5 linhas e "ver todas (N)" que expande o cartão.

## 3. Cartões e regras (dia = data de São Paulo, como o resto do app)
1. **Prazo estourando** — OS **na Costura** (não previstas) cujo prazo vigente (data combinada; senão lead time) já passou ou vence em até 3 dias. Linha: OS · peça · oficina · "venceu há N dias" / "vence hoje" / "vence em N dias". Ordem: mais atrasada primeiro.
2. **Caixas paradas** — caixa com falta aberta (algum item com resta > 0), que **não saiu**, registrada há 7 dias ou mais. Linha: OS · tipo (Costura/Acabamento) · "parada há N dias" · nº de itens em aberto. Ordem: mais antiga primeiro.
3. **Oficinas com mais atraso** — soma dos dias de atraso (só prazos já vencidos) das OS na Costura por oficina (ALOCAR fica de fora). Linha: oficina · "N OS atrasadas · X dias somados". Top 5. Clique: abre o Controle de produção filtrado por essa oficina.
4. **Cobrança sem resposta** — OS cuja **última mensagem** da conversa é uma cobrança/confirmação enviada (ENVIADA, status ENVIADA) há mais de 24 h, sem mensagem recebida depois. Linha: OS · peça · oficina · "sem resposta há N dias/horas".

Cliques nas linhas 1, 2 e 4 abrem a Visão da peça da OS (`#peca/<OS>`).

## 4. Dados
Tudo calculado no site a partir do board que já existe (produção, caixas, mensagens). Sem endpoint novo, sem n8n, sem gravação. Regras puras em `web/src/regras/insights.ts` com testes.

## 5. Testes
- Vitest das 4 regras (limites: 3 dias, 7 dias, 24 h; previstas fora; ALOCAR fora; caixa que saiu fora; empate de ordem).
- E2E: faixa recolhida/aberta e lembrada; clique leva à OS; cartão de oficina filtra a produção; 375px.
- Simulador com dados que acendam os 4 cartões.
