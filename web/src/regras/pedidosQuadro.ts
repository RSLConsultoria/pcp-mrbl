import type { Acao, Board, Caixa, DadosPedido, EntradaHistorico, EtapaPedido, Item, Pedido } from '../api/tipos';
import { arredondar3 } from './acoes';
import { normalizar } from './busca';
import { caixaEditavelNoApp } from './edicao';
import type { EstadoEditavel, FiltroPedidos } from './pedidos';
import { faltasSemPedido, ultimaEtapa } from './pedidos';

export const chaveItem = (dealId: string, itemId: string): string => `${dealId}|${itemId}`;

export interface ItemSelecionado { caixa: Caixa; item: Item }

// Itens marcados que ainda podem entrar num pedido, na ordem das caixas. Chave sumida
// (o item ganhou pedido ou fechou) fica de fora sozinha.
export function itensSelecionados(board: Board, selecao: Set<string>): ItemSelecionado[] {
  return faltasSemPedido(board).flatMap((g) =>
    g.itens.filter((i) => selecao.has(chaveItem(g.caixa.dealId, i.id))).map((item) => ({ caixa: g.caixa, item })));
}

export function etapasOrdenadas(etapas: EtapaPedido[]): EtapaPedido[] {
  return [...etapas].sort((a, b) => a.ordem - b.ordem);
}

export function pedidoAtendeBusca(p: Pedido, q: string): boolean {
  const termo = normalizar(q);
  if (!termo) return true;
  const campos = [p.id, p.quem, p.responsavel, ...p.itens.flatMap((i) => [i.nome, i.os, i.fornecedor])];
  return campos.some((x) => normalizar(x).includes(termo));
}

export function qtdOsDoPedido(p: Pick<Pedido, 'itens'>): number {
  return new Set(p.itens.map((i) => i.dealId)).size;
}

// Só na última etapa e enquanto a baixa não foi dada.
export function podeDarBaixa(p: Pedido, etapas: EtapaPedido[]): boolean {
  return !p.baixadoEm && ultimaEtapa(etapas)?.id === p.etapa;
}

// Pedido editável no app: não finalizado e todas as OS liberadas para edição.
export function pedidoEditavel(board: Pick<Board, 'dealsEditaveis'>, p: Pedido): boolean {
  return !p.finalizado && p.itens.every((i) => caixaEditavelNoApp(board, { dealId: i.dealId }));
}

export function vazioDaEtapa(filtro: FiltroPedidos, indice: number, total: number, temBusca: boolean): string {
  if (temBusca) return 'Nenhum pedido desta etapa atende à busca.';
  const ultima = indice === total - 1;
  if (filtro === 'finalizado') return ultima ? 'Nenhum pedido finalizado ainda.' : 'Pedidos finalizados ficam só na última etapa.';
  if (indice === 0) return 'Pedidos gerados a partir das faltas entram aqui.';
  if (ultima) return 'Quando o material chega, dê baixa nas caixas por aqui.';
  return 'Arraste um pedido para esta etapa.';
}

export function estadoDoPedido(p: Pedido): EstadoEditavel {
  return {
    etapa: p.etapa, origem: p.origem, quem: p.quem, local: p.local, previsao: p.previsao, responsavel: p.responsavel,
    itens: p.itens.map((i) => ({ itemId: i.itemId, nome: i.nome, un: i.un, qtd: i.qtd ?? 0, fornecedor: i.fornecedor }))
  };
}

const CAMPOS = ['etapa', 'origem', 'quem', 'local', 'previsao', 'responsavel'] as const;

// Corpo do editar_pedido só com o que mudou; null quando nada mudou.
export function acaoEditarPedido(p: Pick<Pedido, 'id' | 'versao'>, antes: EstadoEditavel, depois: EstadoEditavel): Acao | null {
  const campos: Record<string, string> = {};
  for (const k of CAMPOS) if (antes[k] !== depois[k]) campos[k] = depois[k];
  const itens = depois.itens
    .filter((d) => {
      const a = antes.itens.find((i) => i.itemId === d.itemId);
      return a && (arredondar3(a.qtd) !== arredondar3(d.qtd) || a.fornecedor !== d.fornecedor);
    })
    .map((d) => ({ itemId: d.itemId, qtd: arredondar3(d.qtd), fornecedor: d.fornecedor }));
  if (Object.keys(campos).length === 0 && itens.length === 0) return null;
  return {
    tipo: 'editar_pedido', pedidoId: p.id, versao: p.versao,
    campos: campos as Partial<DadosPedido & { etapa: string }>,
    ...(itens.length ? { itens } : {})
  };
}

// Linhas do HISTORICO_APP que citam o pedido, sem repetir a mesma linha vinda de OS diferentes.
export function historicoDoPedido(caixas: Caixa[], pedidoId: string): EntradaHistorico[] {
  const vistos = new Set<string>();
  const out: EntradaHistorico[] = [];
  const cita = (texto: string) => {
    let i = texto.indexOf(pedidoId);
    while (i >= 0) {
      if (!/\d/.test(texto.charAt(i + pedidoId.length))) return true;
      i = texto.indexOf(pedidoId, i + 1);
    }
    return false;
  };
  for (const c of caixas) {
    for (const h of c.historico ?? []) {
      if (!cita(h.texto)) continue;
      const k = `${h.quando}|${h.usuario}|${h.texto}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      out.push(h);
    }
  }
  return out;
}

// Por que a etapa não pode sair do rascunho; null quando pode.
export function motivoTravaEtapa(id: string | undefined, totalNoRascunho: number, pedidos: Pedido[]): string | null {
  const n = id ? pedidos.filter((p) => !p.finalizado && p.etapa === id).length : 0;
  if (n > 0) return `Tem ${n} ${n > 1 ? 'pedidos abertos' : 'pedido aberto'} nesta etapa`;
  if (totalNoRascunho <= 2) return 'O quadro precisa de pelo menos 2 etapas';
  return null;
}
