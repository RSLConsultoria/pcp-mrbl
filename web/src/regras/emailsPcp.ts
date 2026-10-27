import type { Board, Caixa, EmailPcp } from '../api/tipos';
import { itemAberto } from './colunas';
import { ddmm } from './datas';

// F5c · E-mails do PCP: regras puras do site. As caixas da sugestão espelham o servidor
// (n8n/src/emailsPcp.js, dealsAlvoEmailPcp): os deals dos itens citados; sem itens, as caixas
// da OS com item em aberto; sem nenhuma em aberto, todas as caixas da OS.
export function dealsAlvoEmailPcp(email: Pick<EmailPcp, 'os' | 'itens'>, caixas: readonly Caixa[]): string[] {
  const daOs = caixas.filter((c) => email.os && c.os === email.os);
  const deals: string[] = [];
  const juntar = (c: Caixa) => { if (!deals.includes(c.dealId)) deals.push(c.dealId); };
  if (email.itens.length) {
    daOs.filter((c) => c.itens.some((i) => email.itens.includes(i.id))).forEach(juntar);
    return deals;
  }
  daOs.filter((c) => c.itens.some(itemAberto)).forEach(juntar);
  if (!deals.length) daOs.forEach(juntar);
  return deals;
}

const maisNovoPrimeiro = (a: EmailPcp, b: EmailPcp) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0);

export function emailsPendentes(board: Board): EmailPcp[] {
  return (board.emailsPcp ?? []).filter((e) => e.status === 'PENDENTE').sort(maisNovoPrimeiro);
}

// Sugestões pendentes que valem para esta caixa (bloco azul no painel e selo no card).
export function emailsPendentesDaCaixa(board: Board, dealId: string): EmailPcp[] {
  return emailsPendentes(board).filter((e) => dealsAlvoEmailPcp(e, board.caixas).includes(dealId));
}

// Todos os e-mails da OS que o board traz (aba da Visão da peça), mais novos primeiro.
export function emailsDaOs(board: Board, os: string): EmailPcp[] {
  return (board.emailsPcp ?? []).filter((e) => e.os === os).sort(maisNovoPrimeiro);
}

function nomesDosItens(board: Board, ids: string[]): string {
  const nomes = ids.map((id) => board.caixas.flatMap((c) => c.itens).find((i) => i.id === id)?.nome ?? '').filter(Boolean);
  return nomes.length ? nomes.join(', ') : 'os itens citados';
}

// O que a IA entendeu, numa linha.
export function textoSugestaoEmail(email: EmailPcp, board: Board): string {
  switch (email.tipo) {
    case 'PREVISAO':
      return `Previsão ${ddmm(email.valor)} para ${email.itens.length ? nomesDosItens(board, email.itens) : 'a caixa'}`;
    case 'QUANTIDADE':
      return `Quantidade conferida de ${nomesDosItens(board, email.itens)}: ${email.valor}`;
    case 'CHAMADO':
      return `Chamado #${email.valor}`;
    default:
      return `Observação: ${email.resumo || email.texto}`;
  }
}

export const ROTULO_STATUS_EMAIL: Record<EmailPcp['status'], string> = {
  PENDENTE: 'aguardando decisão',
  ACEITA: 'aceita',
  IGNORADA: 'ignorada'
};

export const NOME_MODELO_EMAIL: Record<string, string> = {
  CAIXA_SEPARADA: 'Caixa separada',
  POS_CORTE: 'Itens faltando pós corte',
  RECEBIDOS_SP: 'Itens recebidos SP',
  OUTRO: 'Outro assunto'
};

// Para onde o clique na lista da faixa leva: a primeira caixa da sugestão no No Ploomes, ou a
// Visão da peça quando a OS não tem caixa no app.
export function destinoDoEmail(board: Board, email: EmailPcp): { caixaId: string } | { os: string } {
  const deal = dealsAlvoEmailPcp(email, board.caixas)[0];
  const caixa = deal ? board.caixas.find((c) => c.dealId === deal) : undefined;
  return caixa ? { caixaId: caixa.id } : { os: email.os };
}

export function resumoFaixaEmails(n: number): string {
  return n === 1 ? '1 sugestão nova dos e-mails do PCP' : `${n} sugestões novas dos e-mails do PCP`;
}
