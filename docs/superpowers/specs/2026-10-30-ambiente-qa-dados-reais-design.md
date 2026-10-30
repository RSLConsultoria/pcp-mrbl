# Ambiente de QA com dados reais — desenho

Data: 30/10/2026. Pedido do dono: testar a homologação com exemplos reais, sem alterar a planilha original, e com tudo que subir ao Ploomes marcado como TESTE.

## Decisões do dono (30/10)
- **Cópia:** uma planilha separada "PCP MRBL - QA" com todas as abas da original. A homologação passa a ler e gravar só nela. A original não é tocada pela homologação.
- **Ploomes:** só sobe o **registro de interação**, com o título começando por **"TESTE"**. Campos dos cards (previsão, data combinada, oficina, etapa) **não mudam** no Ploomes.
- **WhatsApp:** toda mensagem do QA vai para o **grupo de teste**, qualquer que seja a oficina. Nenhuma oficina real recebe mensagem.

## Como funciona
1. **Planilha QA.** O dono faz uma cópia da planilha original no Google ("Fazer uma cópia", compartilhando com as mesmas pessoas, para a conta de serviço do n8n continuar com acesso). O id da cópia vai numa constante do repositório (`PLANILHA_QA_ID`; o id não é segredo).
2. **Recarga sob demanda.** Workflow novo "Utilitário - Recarregar QA (manual)": lê todas as abas do app na original (batchGet) e reescreve os valores nas mesmas abas da QA (limpa e grava). Roda quando o dono pedir "carga atualizada". Nunca escreve na original.
3. **Modo QA na homologação.** Os workflows `-h` (API homolog, Ler E-mails, WhatsApp entrada/saída/retentar/interpretar e o envio ao Ploomes de homologação) passam a usar a `PLANILHA_QA_ID`. A produção continua na original.
   - **Allowlists vazias só na homologação** (`DEALS_EDITAVEIS`, `DEALS_PERMITIDOS`, `DEALS_PRODUCAO_EDITAVEIS`): toda OS fica editável no QA. A produção continua restrita até o go-live.
   - **Campos do Ploomes:** no modo QA, as alterações de campo (`Montar Alteracao Ploomes` e afins) não são enviadas; a ação grava só na planilha QA e no histórico.
   - **Registro de interação:** um envio ao Ploomes de homologação (cópia do "Enviar ao Ploomes" lendo a planilha QA) com o título prefixado "TESTE · ". Mesmo agrupamento de 10 minutos.
   - **WhatsApp:** a saída de homologação troca o destino de qualquer grupo pelo grupo de teste e coloca "[TESTE]" no começo do texto.
   - **Gmail:** o Ler E-mails de homologação lê o Gmail real (só leitura) e grava as sugestões na QA.
4. **Sinal visual.** O site de homologação mostra uma faixa fixa "AMBIENTE DE QA · dados copiados em dd/mm hh:mm · nada altera a planilha original" (a data vem de uma célula de controle gravada pela recarga).

## Segurança
- A original só é lida pela recarga. Nenhum workflow de homologação grava nela.
- Os syncs (Faltantes, Produção, Médias) continuam gravando só na original; a QA só muda pela recarga ou pelos testes.
- Repositório público: o id da planilha QA não é segredo; nada de dado real no código.

## Testes
- Unitários: o gerador põe a `PLANILHA_QA_ID` em todos os workflows `-h` e nunca a original; produção nunca recebe a QA; no modo QA, nenhum nó grava campo no Ploomes; título com "TESTE · "; WhatsApp sempre no grupo de teste.
- Recarga: só lê da original (nenhum PUT/POST/clear com o id da original).
- Manual: carga, testes do dono com OS reais, conferir que a original não mudou e que o Ploomes só tem registros "TESTE".
