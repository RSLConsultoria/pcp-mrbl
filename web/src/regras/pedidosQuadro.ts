import type { Acao, Board, Caixa, DadosPedido, EntradaHistorico, EtapaPedido, Item, Pedido } from '../api/tipos';
import { arredondar3, lerQuantidade } from './acoes';
import { normalizar } from './busca';
import { caixaEditavelNoApp } from './edicao';
import type { EstadoEditavel, FiltroPedidos } from './pedidos';
import { faltasSemPedido, ultimaEtapa } from './pedidos';
import { qtdComUn } from './quantidade';

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
      // PED-0002 não casa com PED-00021 nem com a parte PED-0002.1
      const resto = texto.slice(i + pedidoId.length);
      if (!/^\d|^\.\d/.test(resto)) return true;
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

// Pedidos cuja etapa não existe mais no quadro (vão para a coluna "Outra etapa").
export function pedidosForaDasEtapas(pedidos: Pedido[], etapas: EtapaPedido[], etapaDe: (p: Pedido) => string = (p) => p.etapa): Pedido[] {
  const ids = new Set(etapas.map((e) => e.id));
  return pedidos.filter((p) => !ids.has(etapaDe(p)));
}

// Pergunta da confirmação de Dar baixa nas caixas.
export function textoConfirmarBaixa(p: Pick<Pedido, 'itens'>): string {
  const n = p.itens.length;
  return `Dar baixa de ${n} ${n === 1 ? 'item' : 'itens'} em ${qtdOsDoPedido(p)} OS? A baixa não pode ser desfeita.`;
}

// Itens que estavam na janela Gerar pedido ao abrir e saíram dela sem o usuário remover
// (entraram em outro pedido ou foram resolvidos na recarga).
export function itensQueSairam(iniciais: string[], atuais: ItemSelecionado[], removidos: Set<string>): number {
  const ficam = new Set(atuais.map((x) => chaveItem(x.caixa.dealId, x.item.id)));
  return iniciais.filter((k) => !ficam.has(k) && !removidos.has(k)).length;
}

export function textoItensQueSairam(n: number): string {
  if (n <= 0) return '';
  return n === 1
    ? '1 item saiu da lista porque já está em pedido ou foi resolvido.'
    : `${n} itens saíram da lista porque já estão em pedido ou foram resolvidos.`;
}

// Contagem no topo de Faltas sem pedido: os marcados contam todos, mesmo fora da busca.
export function textoContagemFaltas(totalVisivel: number, marcados: number, marcadosVisiveis: number): string {
  if (marcados === 0) return `${totalVisivel} ${totalVisivel === 1 ? 'item' : 'itens'}`;
  const fora = marcados - marcadosVisiveis;
  return `${marcados} ${marcados > 1 ? 'selecionados' : 'selecionado'}${fora > 0 ? ` (${fora} fora da busca)` : ''}`;
}

// ---------- dividir pedido ----------

// Família: PED-0002.3 -> PED-0002.
export const raizDoPedido = (id: string): string => id.split('.')[0];

// Partes (pedidos filhos) de um pedido original.
export function partesDoPedido(pedidos: Pedido[], id: string): Pedido[] {
  return pedidos.filter((p) => p.pai === id);
}

// Id que a próxima parte vai receber: maior parte da família + 1 (o servidor confirma).
export function proximoIdParte(pedidos: Pedido[], id: string): string {
  const raiz = raizDoPedido(id);
  let max = 0;
  for (const p of pedidos) {
    const m = /^(PED-\d+)\.(\d+)$/.exec(p.id);
    if (m && m[1] === raiz) max = Math.max(max, Number(m[2]));
  }
  return `${raiz}.${max + 1}`;
}

// Etapas para onde a parte pode ir (todas menos a atual); a padrão é a seguinte à atual.
export function etapasParaDividir(etapas: EtapaPedido[], atual: string): { opcoes: EtapaPedido[]; padrao: string } {
  const ordenadas = etapasOrdenadas(etapas);
  const opcoes = ordenadas.filter((e) => e.id !== atual);
  const idx = ordenadas.findIndex((e) => e.id === atual);
  const seguinte = idx >= 0 ? ordenadas[idx + 1] : undefined;
  return { opcoes, padrao: seguinte?.id ?? opcoes[0]?.id ?? '' };
}

export interface LinhaDivisao { itemId: string; chegou: boolean; qtd: string }

export interface ValidacaoDivisao {
  erros: Record<string, string>; // por itemId
  geral: string | null;
  itens: { itemId: string; qtd: number }[]; // o que vai para a parte nova (quando não há erro)
}

// Mesmas regras do servidor: ao menos um item, 0 < qtd <= qtd do item no pedido e não mover tudo.
export function validarDivisao(p: Pick<Pedido, 'itens'>, linhas: LinhaDivisao[]): ValidacaoDivisao {
  const erros: Record<string, string> = {};
  const itens: { itemId: string; qtd: number }[] = [];
  let sobra = false;
  for (const i of p.itens) {
    const l = linhas.find((x) => x.itemId === i.itemId);
    const total = i.qtd ?? 0;
    if (!l || !l.chegou) { if (total > 0) sobra = true; continue; }
    const q = lerQuantidade(l.qtd);
    if (q === null || arredondar3(q) <= 0) { erros[i.itemId] = 'Informe uma quantidade maior que zero'; continue; }
    if (i.qtd === null) { erros[i.itemId] = 'Item sem quantidade no pedido.'; continue; }
    if (arredondar3(q) > arredondar3(total)) { erros[i.itemId] = `O pedido tem só ${qtdComUn(arredondar3(total), i.un)} de ${i.nome}.`; continue; }
    if (arredondar3(total - q) > 0) sobra = true;
    itens.push({ itemId: i.itemId, qtd: arredondar3(q) });
  }
  let geral: string | null = null;
  if (Object.keys(erros).length === 0) {
    if (itens.length === 0) geral = 'Marque ao menos um item que chegou.';
    else if (!sobra) geral = 'Para mover o pedido inteiro, arraste o card.';
  }
  return { erros, geral, itens };
}

// "PED-0002.1 vai para Recebidos com: 20 UN de ZÍPER; o PED-0002 fica com: 32 UN de ZÍPER".
export function resumoDivisao(p: Pick<Pedido, 'id' | 'itens'>, itens: { itemId: string; qtd: number }[], parteId: string, nomeEtapa: string): string {
  const vai: string[] = [];
  const fica: string[] = [];
  for (const i of p.itens) {
    const m = itens.find((x) => x.itemId === i.itemId);
    const total = i.qtd ?? 0;
    if (m) vai.push(`${qtdComUn(m.qtd, i.un)} de ${i.nome}`);
    const resto = arredondar3(total - (m?.qtd ?? 0));
    if (resto > 0) fica.push(`${qtdComUn(resto, i.un)} de ${i.nome}`);
  }
  return `${parteId} vai para ${nomeEtapa} com: ${vai.join('; ')}; o ${p.id} fica com: ${fica.join('; ')}`;
}

// Linha do card e do painel: "parte de PED-0002" na parte; "dividido em N partes" no original.
export function textoFamilia(p: Pick<Pedido, 'pai'>, partes: number): string {
  if (p.pai) return `parte de ${p.pai}`;
  if (partes > 0) return `dividido em ${partes} ${partes === 1 ? 'parte' : 'partes'}`;
  return '';
}
