import type { Acao, Board, Caixa, Item, ItemPedido, Pedido } from '../api/tipos';
import { arredondar3, chaveDaAcao } from './acoes';
import { itemAberto } from './colunas';
import { PREFIXO_NOVO, etapaDaBaixa, etapaFinal } from './pedidos';
import { etapasOrdenadas, motivoMoverPedido, partesPorPrevisao, podeDividir, proximoIdParte, raizDoPedido } from './pedidosQuadro';

// Quadro otimista: a tela mostra na hora o que cada ação vai causar, enquanto a fila envia
// em segundo plano. As previsões seguem as regras do servidor (n8n/src/pedidos.js e
// acoes.js). O que não dá para prever (o número do pedido novo) fica como pedido provisório,
// marcado "salvando…" até a recarga trazer o de verdade. As versões nunca mudam aqui: quem
// troca versão é o servidor.

export interface ContextoOtimista {
  hoje: string; // 'aaaa-mm-dd'
  n: number; // número da ação na fila: dá ids provisórios únicos
}

// ---------- utilidades ----------

const normalizarTexto = (v: string): string => v.trim().replace(/(\r\n|\n|\r)+/g, ' ');

function comCaixa(board: Board, dealId: string, f: (c: Caixa) => Caixa): Board {
  if (!board.caixas.some((c) => c.dealId === dealId)) return board;
  return { ...board, caixas: board.caixas.map((c) => (c.dealId === dealId ? f(c) : c)) };
}

function comItem(board: Board, dealId: string, itemId: string, f: (i: Item) => Item): Board {
  return comCaixa(board, dealId, (c) => ({ ...c, itens: c.itens.map((i) => (i.id === itemId ? f(i) : i)) }));
}

const pedidosDe = (board: Board): Pedido[] => board.pedidos ?? [];
const pedidoDe = (board: Board, id: string): Pedido | undefined => pedidosDe(board).find((p) => p.id === id);

function comPedido(board: Board, id: string, f: (p: Pedido) => Pedido): Board {
  return { ...board, pedidos: pedidosDe(board).map((p) => (p.id === id ? f(p) : p)) };
}

// Mesma ordem do servidor: número do pedido e depois a parte; os provisórios por último.
function ordemDoPedido(id: string): [number, number] {
  if (id.startsWith(PREFIXO_NOVO)) return [Number.MAX_SAFE_INTEGER, Number(id.slice(PREFIXO_NOVO.length)) || 0];
  const m = /^PED-(\d+)(?:\.(\d+))?$/.exec(id);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : [Number.MAX_SAFE_INTEGER - 1, 0];
}

function compararPedidos(a: string, b: string): number {
  const [na, pa] = ordemDoPedido(a);
  const [nb, pb] = ordemDoPedido(b);
  return na - nb || pa - pb;
}

function comPedidosNovos(board: Board, novos: Pedido[]): Board {
  return { ...board, pedidos: [...pedidosDe(board), ...novos].sort((a, b) => compararPedidos(a.id, b.id)) };
}

// resta e restaG como o board calcula (n8n/src/montarCaixas.js).
function comBaixada(i: Item, baixada: number): Item {
  const b = arredondar3(baixada);
  const resta = i.falta === null ? null : arredondar3(Math.max(0, i.falta - b));
  const restaG = i.faltaG === null || resta === null || i.falta === null ? null : i.falta <= 0 ? 0 : arredondar3((resta * i.faltaG) / i.falta);
  return { ...i, baixada: b, resta, restaG };
}

// Baixa de um pedido nas caixas: min(qtd, resta) em cada item ainda aberto.
function baixaDosItens(board: Board, itens: Pick<ItemPedido, 'itemId' | 'dealId' | 'qtd'>[]): Board {
  let b = board;
  for (const pi of itens) {
    b = comItem(b, pi.dealId, pi.itemId, (i) => {
      if (!itemAberto(i) || i.resta === null) return i;
      const dar = arredondar3(Math.min(pi.qtd ?? 0, i.resta));
      return dar > 0 ? comBaixada(i, i.baixada + dar) : i;
    });
  }
  return b;
}

// pedidoIds/pedidoId dos itens tocados: só pedidos ainda sem baixa (o pedido com a baixa dada não segura mais o item).
function atualizarPedidosDosItens(board: Board, itens: Pick<ItemPedido, 'itemId' | 'dealId'>[]): Board {
  const pedidos = pedidosDe(board);
  let b = board;
  for (const alvo of itens) {
    const ids = pedidos
      .filter((p) => !p.baixadoEm && p.itens.some((x) => x.itemId === alvo.itemId && x.dealId === alvo.dealId))
      .map((p) => p.id)
      .sort(compararPedidos);
    b = comItem(b, alvo.dealId, alvo.itemId, (i) => ({ ...i, pedidoIds: ids, pedidoId: ids[0] ?? '' }));
  }
  return b;
}

// Datas dos itens em ordem ('' por último), como o servidor resume no board.
function comPrevisoesResumidas(p: Pedido): Pedido {
  const datas = [...new Set(p.itens.map((i) => i.previsao || p.previsao))]
    .sort((a, b) => (a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a < b ? -1 : 1));
  return { ...p, previsaoMaisProxima: datas.length && datas[0] !== '' ? datas[0] : p.previsao, previsoesDiferentes: datas.length > 1 };
}

// Entrar na etapa da baixa (Enviado ao destino final) dá a baixa nas caixas e solta os itens;
// o pedido continua aberto até a etapa final.
function darBaixa(board: Board, id: string, hoje: string): Board {
  const p = pedidoDe(board, id);
  if (!p) return board;
  let b = comPedido(board, id, (x) => ({ ...x, baixadoEm: hoje }));
  b = baixaDosItens(b, p.itens);
  return atualizarPedidosDosItens(b, p.itens);
}

function novaParte(p: Pedido, id: string, etapa: string, previsao: string, itens: ItemPedido[], hoje: string): Pedido {
  return comPrevisoesResumidas({
    id, pai: raizDoPedido(p.id), etapa, origem: p.origem, quem: p.quem, local: p.local, previsao,
    responsavel: p.responsavel, criadoEm: hoje, baixadoEm: '', versao: '', finalizado: false, provisorio: true, itens
  });
}

// ---------- uma ação ----------

// Board como fica depois da ação, se o servidor aceitar. Ação que o servidor recusaria
// (pedido sumido, finalizado) devolve o board sem mudança.
export function aplicarOtimista(board: Board, acao: Acao, ctx: ContextoOtimista): Board {
  const etapas = board.etapasPedido ?? [];
  const baixa = etapaDaBaixa(etapas)?.id;
  const final = etapaFinal(etapas)?.id;
  switch (acao.tipo) {
    case 'baixa':
      return comItem(board, acao.dealId, acao.itemId, (i) => comBaixada(i, i.baixada + acao.valor));
    case 'previsao_item':
      return comItem(board, acao.dealId, acao.itemId, (i) => ({ ...i, previsao: acao.valor }));
    case 'obs_item':
      return comItem(board, acao.dealId, acao.itemId, (i) => ({ ...i, obsPcp: normalizarTexto(acao.valor) }));
    case 'responsavel':
      return comCaixa(board, acao.dealId, (c) => ({ ...c, responsavel: acao.valor.trim() }));
    case 'previsao_caixa':
      return comCaixa(board, acao.dealId, (c) => ({ ...c, previsao: acao.valor }));
    case 'obs_caixa':
      return comCaixa(board, acao.dealId, (c) => ({ ...c, observacao: normalizarTexto(acao.valor) }));
    case 'nova_demanda': {
      // Itens novos na caixa que saiu, com id provisório: ficam fora de Faltas sem pedido
      // (editavel false) até a recarga trazer o id gravado.
      const c = board.caixas.find((x) => x.saiu && x.os === acao.os && x.tipo === acao.caixa);
      if (!c) return board;
      const novos: Item[] = acao.itens.map((x, k) => ({
        id: `${PREFIXO_NOVO}${ctx.n}.${k}`, nome: x.nome, cor: x.cor, un: x.un, necessaria: null, separada: null,
        falta: x.qtd, faltaG: null, status: 'ABERTO', baixada: 0, resta: x.qtd, restaG: null, obsAlmox: '', obsPcp: '',
        previsao: '', resolvidoEm: '', versao: '', editavel: false, pedidoId: '', pedidoIds: [], posSaida: true
      }));
      return comCaixa(board, c.dealId, (y) => ({ ...y, itens: [...y.itens, ...novos] }));
    }
    case 'salvar_etapas':
      return {
        ...board,
        etapasPedido: acao.etapas.map((e, k) => ({ id: e.id ?? `${PREFIXO_NOVO}${ctx.n}.${k}`, nome: e.nome.trim(), ordem: k + 1 }))
      };
    case 'gerar_pedido': {
      const id = `${PREFIXO_NOVO}${ctx.n}`;
      const itens: ItemPedido[] = acao.itens.map((x) => {
        const c = board.caixas.find((y) => y.dealId === x.dealId);
        const i = c?.itens.find((y) => y.id === x.itemId);
        return {
          itemId: x.itemId, dealId: x.dealId, os: c?.os ?? '', nome: i?.nome ?? '', un: i?.un ?? '',
          qtd: x.qtd, fornecedor: x.fornecedor, previsao: x.previsao || acao.previsao
        };
      });
      const novo = comPrevisoesResumidas({
        id, pai: '', etapa: etapasOrdenadas(etapas)[0]?.id ?? '', origem: acao.origem, quem: acao.quem, local: acao.local,
        previsao: acao.previsao, responsavel: acao.responsavel, criadoEm: ctx.hoje, baixadoEm: '', versao: '',
        finalizado: false, provisorio: true, itens
      });
      return atualizarPedidosDosItens(comPedidosNovos(board, [novo]), itens);
    }
  }

  // Ações sobre um pedido existente e aberto.
  const p = pedidoDe(board, acao.pedidoId);
  if (!p || p.finalizado) return board;
  switch (acao.tipo) {
    case 'mover_pedido': {
      if (motivoMoverPedido(p, acao.etapa, etapas)) return board; // o servidor recusaria
      if (acao.etapa === baixa && !acao.confirmouBaixa) return board; // sem a confirmação o servidor recusa (409)
      const b = comPedido(board, p.id, (x) => ({ ...x, etapa: acao.etapa }));
      if (acao.etapa === final) return comPedido(b, p.id, (x) => ({ ...x, concluidoEm: ctx.hoje, finalizado: true }));
      return acao.etapa === baixa && !p.baixadoEm ? darBaixa(b, p.id, ctx.hoje) : b;
    }
    case 'baixar_pedido':
      return p.etapa === baixa && !p.baixadoEm && acao.confirmouBaixa ? darBaixa(board, p.id, ctx.hoje) : board;
    case 'editar_pedido': {
      if (p.baixadoEm) return board;
      const c = acao.campos;
      const previsao = c.previsao ?? p.previsao;
      const itens = p.itens.map((i) => {
        // previsão herdada (igual à do pedido) acompanha a nova previsão do pedido
        let n: ItemPedido = c.previsao !== undefined && (i.previsao ?? '') === p.previsao ? { ...i, previsao } : i;
        const m = acao.itens?.find((x) => x.itemId === i.itemId);
        if (m) n = { ...n, qtd: m.qtd, fornecedor: m.fornecedor, ...(m.previsao !== undefined ? { previsao: m.previsao || previsao } : {}) };
        return n;
      });
      const definidos = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined));
      return comPedido(board, p.id, (x) => comPrevisoesResumidas({ ...x, ...definidos, itens }));
    }
    case 'dividir_pedido': {
      if (!baixa || !podeDividir(p, etapas)) return board;
      const parteId = proximoIdParte(pedidosDe(board), p.id);
      const vao: ItemPedido[] = [];
      const ficam: ItemPedido[] = [];
      for (const i of p.itens) {
        const m = acao.itens.find((x) => x.itemId === i.itemId);
        if (m) vao.push({ ...i, qtd: m.qtd });
        const resto = m ? arredondar3((i.qtd ?? 0) - m.qtd) : i.qtd;
        if (resto !== 0) ficam.push({ ...i, qtd: resto }); // linha com qtd 0 some na leitura
      }
      let b = comPedido(board, p.id, (x) => comPrevisoesResumidas({ ...x, itens: ficam }));
      b = comPedidosNovos(b, [novaParte(p, parteId, baixa, p.previsao, vao, ctx.hoje)]);
      // a parte já nasce na etapa da baixa, com a baixa
      b = darBaixa(b, parteId, ctx.hoje);
      return atualizarPedidosDosItens(b, p.itens);
    }
    case 'dividir_por_previsao': {
      if (p.baixadoEm) return board;
      const partes = partesPorPrevisao(p, pedidosDe(board));
      if (partes.length === 0) return board;
      const vao = new Set(partes.flatMap((x) => x.itens.map((i) => i.itemId)));
      let b = comPedido(board, p.id, (x) => comPrevisoesResumidas({ ...x, itens: x.itens.filter((i) => !vao.has(i.itemId)) }));
      b = comPedidosNovos(b, partes.map((x) => novaParte(p, x.id, p.etapa, x.previsao, x.itens.map((i) => ({ ...i, previsao: x.previsao })), ctx.hoje)));
      return atualizarPedidosDosItens(b, p.itens);
    }
  }
}

// ---------- pendências da fila ----------

export type EstadoPendente = 'fila' | 'enviando' | 'confirmada';

export interface Pendente {
  id: number;
  acao: Acao;
  estado: EstadoPendente;
  confirmadaEm: number; // marco da confirmação (0 enquanto não confirmou)
  versaoNova?: string; // versão que o servidor devolveu
}

// Versão do alvo da ação no board; undefined quando a ação não tem alvo com versão.
export function versaoNoBoard(board: Board, acao: Acao): string | undefined {
  if ('itemId' in acao) return board.caixas.find((c) => c.dealId === acao.dealId)?.itens.find((i) => i.id === acao.itemId)?.versao;
  if ('pedidoId' in acao) return pedidoDe(board, acao.pedidoId)?.versao;
  if ('dealId' in acao) return board.caixas.find((c) => c.dealId === acao.dealId)?.versao;
  return undefined;
}

// Pendências que o board ainda não mostra. Uma ação confirmada já está no board quando ele
// foi pedido depois da confirmação (marco) ou quando o alvo já tem a versão que o servidor
// devolveu; aí as confirmadas anteriores do mesmo alvo também já estão. As que ainda não
// foram confirmadas continuam todas.
export function pendentesVivos(pendentes: readonly Pendente[], board: Board, marco: number): Pendente[] {
  const refletidos = new Set<string>();
  const vivos: Pendente[] = [];
  for (let k = pendentes.length - 1; k >= 0; k--) {
    const p = pendentes[k];
    if (p.estado === 'confirmada') {
      const chave = chaveDaAcao(p.acao);
      if (refletidos.has(chave) || p.confirmadaEm <= marco ||
        (p.versaoNova !== undefined && versaoNoBoard(board, p.acao) === p.versaoNova)) {
        refletidos.add(chave);
        continue;
      }
    }
    vivos.push(p);
  }
  return vivos.reverse();
}

// Board da tela: o do servidor com as pendências aplicadas por cima, na ordem da fila.
export function aplicarPendentes(board: Board, pendentes: readonly Pendente[], hoje: string): Board {
  return pendentes.reduce((b, p) => aplicarOtimista(b, p.acao, { hoje, n: p.id }), board);
}
