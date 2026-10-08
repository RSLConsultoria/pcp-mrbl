import type { Board, Caixa, DadosPedido, EtapaPedido, Item, Pedido } from '../api/tipos';
import { arredondar3, lerQuantidade } from './acoes';
import { itensAbertos } from './colunas';
import { ddmm } from './datas';
import { caixaEditavelNoApp } from './edicao';
import { formatarNumero, qtdComUn } from './quantidade';

export type FiltroPedidos = 'aberto' | 'finalizado' | 'todos';

export function filtrarPedidos(pedidos: Pedido[], filtro: FiltroPedidos): Pedido[] {
  if (filtro === 'todos') return pedidos;
  return pedidos.filter((p) => (filtro === 'finalizado' ? p.finalizado : !p.finalizado));
}

export interface FaltaSemPedido {
  caixa: Caixa;
  itens: Item[];
}

// Pedidos abertos com o item (o original e as partes dele). Board antigo sem pedidoIds
// cai no pedidoId.
export function pedidosDoItem(i: Pick<Item, 'pedidoId'> & { pedidoIds?: string[] }): string[] {
  if (i.pedidoIds && i.pedidoIds.length > 0) return i.pedidoIds;
  return i.pedidoId ? [i.pedidoId] : [];
}

// Item aberto que pode entrar num pedido: editável, sem pedido e com o quanto falta conhecido
// (sem resta não há quantidade para validar, e a janela Gerar pedido travaria nele).
export function podeEntrarEmPedido(i: Item): boolean {
  return i.editavel && pedidosDoItem(i).length === 0 && i.resta !== null;
}

// Itens abertos, editáveis no app e sem pedido, agrupados por caixa.
export function faltasSemPedido(board: Board): FaltaSemPedido[] {
  const grupos: FaltaSemPedido[] = [];
  for (const caixa of board.caixas) {
    if (!caixaEditavelNoApp(board, caixa)) continue;
    const itens = itensAbertos(caixa).filter(podeEntrarEmPedido);
    if (itens.length > 0) grupos.push({ caixa, itens });
  }
  return grupos;
}

export function ultimaEtapa(etapas: EtapaPedido[]): EtapaPedido | undefined {
  let u: EtapaPedido | undefined;
  for (const e of etapas) if (!u || e.ordem > u.ordem) u = e;
  return u;
}

export const VARIOS_FORNECEDORES = 'Vários fornecedores';

export function quemDoPedido(p: Pick<Pedido, 'quem' | 'itens'>): string {
  if (p.quem.trim() !== '') return p.quem;
  const forn = [...new Set(p.itens.map((i) => i.fornecedor.trim()).filter((f) => f !== ''))];
  if (forn.length > 1) return VARIOS_FORNECEDORES;
  return forn.length === 1 ? forn[0] : '';
}

const NOME_ORIGEM = { FORNECEDOR: 'Fornecedor', CLIENTE: 'Cliente' } as const;
const NOME_LOCAL = { BRAGANCA: 'Bragança', SAO_PAULO: 'São Paulo' } as const;
export const nomeOrigem = (o: DadosPedido['origem']): string => NOME_ORIGEM[o];
export const nomeLocal = (l: DadosPedido['local']): string => NOME_LOCAL[l];

export interface EstadoEditavel {
  etapa: string;
  origem: DadosPedido['origem'];
  quem: string;
  local: DadosPedido['local'];
  previsao: string;
  responsavel: string;
  itens: { itemId: string; nome: string; un: string; qtd: number; fornecedor: string }[];
}

const ou = (s: string): string => (s.trim() === '' ? '—' : s);

// Mesmas linhas que o servidor grava no histórico do editar_pedido. Vazio = "Nada alterado".
export function resumoAlteracoes(antes: EstadoEditavel, depois: EstadoEditavel, etapas: EtapaPedido[] = []): string[] {
  const nomeEtapa = (id: string) => etapas.find((e) => e.id === id)?.nome ?? id;
  const dia = (s: string) => (s === '' ? '—' : ddmm(s) || s);
  const out: string[] = [];
  if (antes.etapa !== depois.etapa) out.push(`Etapa: ${nomeEtapa(antes.etapa)} → ${nomeEtapa(depois.etapa)}`);
  if (antes.origem !== depois.origem) out.push(`Origem: ${nomeOrigem(antes.origem)} → ${nomeOrigem(depois.origem)}`);
  if (antes.quem !== depois.quem) out.push(`Quem: ${ou(antes.quem)} → ${ou(depois.quem)}`);
  if (antes.local !== depois.local) out.push(`Local: ${nomeLocal(antes.local)} → ${nomeLocal(depois.local)}`);
  if (antes.previsao !== depois.previsao) out.push(`Previsão: ${dia(antes.previsao)} → ${dia(depois.previsao)}`);
  if (antes.responsavel !== depois.responsavel) out.push(`Responsável: ${ou(antes.responsavel)} → ${ou(depois.responsavel)}`);
  for (const d of depois.itens) {
    const a = antes.itens.find((i) => i.itemId === d.itemId);
    if (!a) continue;
    if (arredondar3(a.qtd) !== arredondar3(d.qtd)) out.push(`qtd de ${d.nome}: ${formatarNumero(a.qtd)} → ${formatarNumero(d.qtd)}`);
    if (a.fornecedor !== d.fornecedor) out.push(`fornecedor de ${d.nome}: ${ou(a.fornecedor)} → ${ou(d.fornecedor)}`);
  }
  return out;
}

// Etapas como ficariam: ao menos 2, nomes não vazios e únicos, e nenhuma etapa com
// pedido aberto sai do quadro (as atuais são comparadas pelo id).
export function validarEtapas(
  etapas: { id?: string; nome: string }[],
  pedidos: Pedido[],
  atuais: EtapaPedido[] = []
): string | null {
  if (etapas.length < 2) return 'O quadro precisa de pelo menos 2 etapas.';
  const vistos = new Set<string>();
  for (const e of etapas) {
    const n = e.nome.trim();
    if (n === '') return 'Dê um nome a todas as etapas.';
    const chave = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (vistos.has(chave)) return `Já existe uma etapa chamada ${n}.`;
    vistos.add(chave);
  }
  const mantidas = new Set(etapas.map((e) => e.id).filter(Boolean));
  for (const a of atuais) {
    if (!mantidas.has(a.id) && pedidos.some((p) => !p.finalizado && p.etapa === a.id)) {
      return `A etapa ${a.nome} tem pedidos abertos.`;
    }
  }
  return null;
}

export interface SelecaoPedido {
  itemId: string;
  un: string;
  resta: number | null;
}

// Mesmas mensagens do validarBaixa. Devolve a mensagem por itemId (só de quem tem erro).
export function validarGerarPedido(selecao: SelecaoPedido[], quantidades: Record<string, string>): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const s of selecao) {
    const qtd = lerQuantidade(quantidades[s.itemId] ?? '');
    if (qtd === null || arredondar3(qtd) <= 0) erros[s.itemId] = 'Informe uma quantidade maior que zero';
    else if (s.resta === null) erros[s.itemId] = 'Item sem quantidade faltante registrada.';
    else if (arredondar3(qtd) > arredondar3(s.resta)) erros[s.itemId] = `Falta só ${qtdComUn(arredondar3(s.resta), s.un)}`;
  }
  return erros;
}
