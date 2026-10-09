import type { Acao, Board, Caixa } from '../api/tipos';
import { arredondar3, lerQuantidade } from './acoes';
import { caixaEditavelNoApp, MSG_SOMENTE_LEITURA } from './edicao';

// Nova demanda pós-saída: falta descoberta depois que a caixa saiu do almoxarifado. Os itens
// entram na FALTANTES da caixa e seguem o fluxo normal (gerar pedido, etapas, baixa).
export type TipoCaixaDemanda = 'COSTURA' | 'ACABAMENTO';

export const TIPOS_CAIXA_DEMANDA: { id: TipoCaixaDemanda; nome: string }[] = [
  { id: 'COSTURA', nome: 'Costura (preta)' },
  { id: 'ACABAMENTO', nome: 'Acabamento (azul)' }
];

const NOME_CURTO: Record<TipoCaixaDemanda, string> = { COSTURA: 'Costura', ACABAMENTO: 'Acabamento' };

export interface LinhaDemanda { nome: string; cor: string; qtd: string; un: string }
export interface ItemDemanda { nome: string; cor: string; qtd: number; un: string }

export const linhaVazia = (): LinhaDemanda => ({ nome: '', cor: '', qtd: '', un: '' });

// A caixa da demanda pela OS e pelo tipo, com as mesmas mensagens do servidor (n8n/src/pedidos.js).
export function caixaDaDemanda(board: Board, os: string, tipo: TipoCaixaDemanda): { caixa: Caixa } | { erro: string } {
  const alvo = os.trim();
  const rotulo = `OS ${alvo} (${NOME_CURTO[tipo]})`;
  const doTipo = board.caixas.filter((c) => c.os.trim() === alvo && c.tipo === tipo);
  if (doTipo.length === 0) return { erro: `Caixa da ${rotulo} não encontrada.` };
  const sairam = doTipo.filter((c) => c.saiu);
  if (sairam.length === 0) return { erro: `A caixa da ${rotulo} ainda não saiu.` };
  if (new Set(sairam.map((c) => c.dealId)).size > 1) return { erro: `Mais de uma caixa da ${rotulo} saiu. Fale com o PCP.` };
  if (!caixaEditavelNoApp(board, sairam[0])) return { erro: MSG_SOMENTE_LEITURA };
  return { caixa: sairam[0] };
}

export interface ValidacaoDemanda { erros: Record<number, string>; itens: ItemDemanda[] }

// Cada linha: nome, quantidade maior que zero e unidade obrigatórios; cor opcional. Linha toda
// vazia é ignorada. Mesmas mensagens do servidor.
export function validarDemanda(linhas: LinhaDemanda[]): ValidacaoDemanda {
  const erros: Record<number, string> = {};
  const itens: ItemDemanda[] = [];
  linhas.forEach((l, k) => {
    const nome = l.nome.trim();
    const cor = l.cor.trim();
    const un = l.un.trim();
    if (!nome && !cor && !un && !l.qtd.trim()) return;
    const q = lerQuantidade(l.qtd);
    if (!nome) erros[k] = 'Informe o nome do item.';
    else if (q === null || arredondar3(q) <= 0) erros[k] = 'Informe uma quantidade maior que zero';
    else if (!un) erros[k] = 'Informe a unidade do item.';
    else itens.push({ nome, cor, qtd: arredondar3(q), un });
  });
  return { erros, itens };
}

export function acaoNovaDemanda(os: string, tipo: TipoCaixaDemanda, itens: ItemDemanda[]): Acao {
  return { tipo: 'nova_demanda', os: os.trim(), caixa: tipo, itens };
}
