import type { Acao, Board, Caixa, Item, ItemPedido, Pedido, RespostaAcao } from '../api/tipos';
import { arredondar3, chaveDaAcao } from './acoes';
import { caixaDaDemanda } from './demanda';
import { dealsAlvoEmailPcp } from './emailsPcp';
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
  agora?: string; // ISO de quando a ação entrou na fila: hora provisória das mensagens
}

// Hora provisória de uma mensagem enfileirada até o board trazer a do servidor.
const quandoProvisorio = (ctx: ContextoOtimista): string => ctx.agora ?? `${ctx.hoje}T12:00:00.000Z`;

// ---------- utilidades ----------

const normalizarTexto = (v: string): string => v.trim().replace(/(\r\n|\n|\r)+/g, ' ');
// Anotação da Visão da peça: como o servidor (n8n/src/peca.js, validarAnotacaoPeca).
const normalizarAnotacao = (v: string): string => v.replace(/\r\n?/g, '\n').trim().replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ');

function comCaixa(board: Board, dealId: string, f: (c: Caixa) => Caixa): Board {
  if (!board.caixas.some((c) => c.dealId === dealId)) return board;
  return { ...board, caixas: board.caixas.map((c) => (c.dealId === dealId ? f(c) : c)) };
}

function comProducao(board: Board, dealId: string, f: (p: NonNullable<Board['producao']>[number]) => NonNullable<Board['producao']>[number]): Board {
  const lista = board.producao ?? [];
  if (!lista.some((p) => p.dealId === dealId)) return board;
  return { ...board, producao: lista.map((p) => (p.dealId === dealId ? f(p) : p)) };
}

function comItem(board: Board, dealId: string, itemId: string, f: (i: Item) => Item): Board {
  return comCaixa(board, dealId, (c) => ({ ...c, itens: c.itens.map((i) => (i.id === itemId ? f(i) : i)) }));
}

// Insere a mensagem na conversa pela data, mais nova primeiro, como o servidor ordena
// (n8n/src/producao.js, mensagensDaProducao). Empate: a inserida fica antes.
function comMensagemNaOrdem<M extends { quando: string }>(mensagens: M[], nova: M): M[] {
  const k = mensagens.findIndex((m) => m.quando <= nova.quando);
  return k < 0 ? [...mensagens, nova] : [...mensagens.slice(0, k), nova, ...mensagens.slice(k)];
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
    case 'alterar_producao': {
      const nome = acao.oficinaId ? board.oficinas?.find((o) => o.ploomesId === acao.oficinaId)?.nome : 'ALOCAR';
      return comProducao(board, acao.dealId, (p) => ({
        ...p, oficinaId: acao.oficinaId, oficina: nome ?? p.oficina, dataCombinada: acao.dataCombinada
      }));
    }
    case 'aceitar_sugestao_whatsapp':
      return comProducao(board, acao.dealId, (p) => {
        const sugestao = p.sugestoes.find((s) => s.id === acao.sugestaoId);
        if (!sugestao || sugestao.status !== 'PENDENTE') return p;
        return {
          ...p,
          dataCombinada: sugestao.tipo === 'NOVA_DATA_COMBINADA' ? sugestao.valor : p.dataCombinada,
          sugestoes: p.sugestoes.map((s) => (s.id === acao.sugestaoId ? { ...s, status: 'ACEITA' as const } : s))
        };
      });
    case 'ignorar_sugestao_whatsapp':
      return comProducao(board, acao.dealId, (p) => ({
        ...p, sugestoes: p.sugestoes.map((s) => (s.id === acao.sugestaoId && s.status === 'PENDENTE' ? { ...s, status: 'IGNORADA' as const } : s))
      }));
    case 'associar_whatsapp': {
      const mensagem = board.mensagensWhatsappSemAssociacao?.find((m) => m.id === acao.mensagemId);
      if (mensagem) {
        const associado = { ...mensagem, associacao: 'MANUAL' as const };
        const semAssociacao = board.mensagensWhatsappSemAssociacao?.filter((m) => m.id !== acao.mensagemId);
        const atualizado = comProducao(board, acao.dealId, (p) => ({ ...p, mensagens: comMensagemNaOrdem(p.mensagens, associado) }));
        return { ...atualizado, mensagensWhatsappSemAssociacao: semAssociacao };
      }
      // Trocar OS (22/10): mensagem ligada pela IA vai para outra OS; a sugestão
      // pendente dela fica IGNORADA (espelha processarAssociacaoWhatsapp).
      const origem = board.producao?.find((p) => p.dealId !== acao.dealId && p.mensagens.some((m) => m.id === acao.mensagemId && m.associacao === 'IA'));
      if (!origem) return board;
      const movida = { ...origem.mensagens.find((m) => m.id === acao.mensagemId)!, associacao: 'MANUAL' as const };
      const semNaOrigem = comProducao(board, origem.dealId, (p) => ({
        ...p,
        mensagens: p.mensagens.filter((m) => m.id !== acao.mensagemId),
        sugestoes: p.sugestoes.map((s) => (s.mensagemId === acao.mensagemId && s.status === 'PENDENTE' ? { ...s, status: 'IGNORADA' as const } : s))
      }));
      return comProducao(semNaOrigem, acao.dealId, (p) => ({ ...p, mensagens: comMensagemNaOrdem(p.mensagens, movida) }));
    }
    case 'enviar_whatsapp':
      return comProducao(board, acao.dealId, (p) => ({
        ...p,
        mensagens: [{
          id: `novo:whatsapp:${ctx.n}`, quando: quandoProvisorio(ctx), participanteNome: 'PCP', direcao: 'ENVIADA' as const,
          texto: acao.texto, associacao: 'MANUAL' as const, statusEnvio: 'PENDENTE' as const, tipoConteudo: 'TEXTO' as const
        }, ...p.mensagens]
      }));
    case 'reenviar_whatsapp':
      return comProducao(board, acao.dealId, (p) => {
        const original = p.mensagens.find((m) => m.id === acao.mensagemId && m.statusEnvio === 'ERRO');
        if (!original || original.reenviada) return p; // o servidor aceita um reenvio por mensagem
        return {
          ...p,
          mensagens: [
            { ...original, id: `novo:whatsapp:${ctx.n}`, quando: quandoProvisorio(ctx), statusEnvio: 'PENDENTE' as const, reenviada: false },
            ...p.mensagens.map((m) => (m.id === original.id ? { ...m, reenviada: true } : m))
          ]
        };
      });
    case 'nova_demanda': {
      // Itens novos na caixa que saiu, com id provisório: ficam fora de Faltas sem pedido
      // (editavel false) até a recarga trazer o id gravado.
      // a caixa como o servidor acha (OS sem espaços, que saiu, editável, uma só); senão ele recusa
      const achada = caixaDaDemanda(board, acao.os, acao.caixa);
      if ('erro' in achada) return board;
      const c = achada.caixa;
      const novos: Item[] = acao.itens.map((x, k) => ({
        id: `${PREFIXO_NOVO}${ctx.n}.${k}`, nome: x.nome, cor: x.cor, un: x.un, necessaria: null, separada: null,
        falta: x.qtd, faltaG: null, status: 'ABERTO', baixada: 0, resta: x.qtd, restaG: null, obsAlmox: '', obsPcp: '',
        previsao: '', resolvidoEm: '', versao: '', editavel: false, pedidoId: '', pedidoIds: [], posSaida: true
      }));
      return comCaixa(board, c.dealId, (y) => ({ ...y, itens: [...y.itens, ...novos] }));
    }
    case 'anotar_peca':
      // Como o servidor (n8n/src/peca.js): texto numa linha só; o nome real chega com a recarga.
      return {
        ...board,
        anotacoes: [{
          id: `novo:anotacao:${ctx.n}`, quando: quandoProvisorio(ctx), usuario: 'Você',
          texto: `Você anotou: "${normalizarAnotacao(acao.texto)}"`, ploomes: 'PENDENTE' as const, dealId: acao.dealId, os: acao.os
        }, ...(board.anotacoes ?? [])]
      };
    case 'decidir_email_pcp': {
      // Como o servidor (n8n/src/emailsPcp.js, decidirEmailPcp): só a pendente muda; PREVISAO
      // aceita grava a data nos itens citados ou, sem itens, nas caixas da sugestão.
      const e = board.emailsPcp?.find((x) => x.id === acao.id);
      if (!e || e.status !== 'PENDENTE') return board;
      const status = acao.decisao === 'ACEITAR' ? 'ACEITA' as const : 'IGNORADA' as const;
      let b: Board = { ...board, emailsPcp: board.emailsPcp!.map((x) => (x.id === acao.id ? { ...x, status } : x)) };
      if (acao.decisao !== 'ACEITAR' || e.tipo !== 'PREVISAO' || !/^\d{4}-\d{2}-\d{2}$/.test(e.valor)) return b;
      if (e.itens.length) {
        for (const c of board.caixas) for (const i of c.itens) if (e.itens.includes(i.id)) b = comItem(b, c.dealId, i.id, (x) => ({ ...x, previsao: e.valor }));
        return b;
      }
      for (const d of dealsAlvoEmailPcp(e, board.caixas)) b = comCaixa(b, d, (c) => ({ ...c, previsao: e.valor }));
      return b;
    }
    case 'salvar_etapas':
      return {
        ...board,
        etapasPedido: acao.etapas.map((e, k) => ({ id: e.id ?? `${PREFIXO_NOVO}${ctx.n}.${k}`, nome: e.nome.trim(), ordem: k + 1 }))
      };
    case 'alterar_capacidade_oficina':
      // Como o servidor: só oficina que está na lista; null limpa a capacidade.
      if (!board.oficinas?.some((o) => o.ploomesId === acao.oficinaId)) return board;
      return { ...board, oficinas: board.oficinas.map((o) => (o.ploomesId === acao.oficinaId ? { ...o, capacidadeSemana: acao.capacidade } : o)) };
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
  versoesAntigas?: string[]; // versões do alvo antes da ação: a que a tela viu e as trocas seguidas até a enviada
  resposta?: Pick<RespostaAcao, 'pedidoId' | 'partes' | 'itemIds' | 'mensagemId' | 'anotacaoId'>; // o que a resposta traz para achar a ação no board
  confirmadaAs?: number; // relógio (ms) da confirmação
  criadaAs?: number; // relógio (ms) da entrada na fila
  recargasDepois?: number; // boards pedidos depois da confirmação que ainda não mostravam a ação
}

// Limite para uma confirmada que nenhum board mostra (o alvo sumiu, outra pessoa mexeu de um
// jeito que não dá para reconhecer): sai depois de tantas recargas ou de tanto tempo.
export const LIMITE_RECARGAS = 3;
export const LIMITE_CONFIRMADA_MS = 120_000;

// Versão do alvo da ação no board; undefined quando a ação não tem alvo com versão.
export function versaoNoBoard(board: Board, acao: Acao): string | undefined {
  if ('itemId' in acao) return board.caixas.find((c) => c.dealId === acao.dealId)?.itens.find((i) => i.id === acao.itemId)?.versao;
  if ('pedidoId' in acao) return pedidoDe(board, acao.pedidoId)?.versao;
  if (acao.tipo === 'anotar_peca' || acao.tipo === 'decidir_email_pcp') return undefined; // sem versão: só acrescenta ou marca
  if ('dealId' in acao) {
    if (acao.tipo === 'alterar_producao' || acao.tipo === 'aceitar_sugestao_whatsapp' || acao.tipo === 'ignorar_sugestao_whatsapp' || acao.tipo === 'associar_whatsapp' || acao.tipo === 'enviar_whatsapp' || acao.tipo === 'reenviar_whatsapp') {
      return board.producao?.find((p) => p.dealId === acao.dealId)?.versao;
    }
    return board.caixas.find((c) => c.dealId === acao.dealId)?.versao;
  }
  return undefined;
}

const temPedido = (board: Board, id: string | undefined): boolean => !!id && pedidosDe(board).some((p) => p.id === id);

// A ação confirmada já aparece no board? Não basta o board ter sido pedido depois da
// confirmação: o servidor pode devolver o cache montado antes da gravação terminar, e tirar a
// pendência aí desfaria a mudança na tela. Com versão: o alvo tem a versão que o servidor
// devolveu ou outra que não é nenhuma das de antes da ação (alguém mexeu depois). Sem versão:
// o resultado aparece (o pedido novo, as partes, os itens da demanda, as etapas salvas).
export function acaoNoBoard(board: Board, p: Pendente): boolean {
  const a = p.acao;
  const r = p.resposta ?? {};
  switch (a.tipo) {
    case 'aceitar_sugestao_whatsapp':
      return board.producao?.find((x) => x.dealId === a.dealId)?.sugestoes.find((s) => s.id === a.sugestaoId)?.status === 'ACEITA';
    case 'ignorar_sugestao_whatsapp':
      return board.producao?.find((x) => x.dealId === a.dealId)?.sugestoes.find((s) => s.id === a.sugestaoId)?.status === 'IGNORADA';
    case 'associar_whatsapp':
      return !!board.producao?.find((x) => x.dealId === a.dealId)?.mensagens.some((m) => m.id === a.mensagemId && m.associacao === 'MANUAL');
    case 'enviar_whatsapp':
      return !!r.mensagemId && !!board.producao?.find((x) => x.dealId === a.dealId)?.mensagens.some((m) => m.id === r.mensagemId);
    case 'reenviar_whatsapp':
      return !!r.mensagemId && !!board.producao?.find((x) => x.dealId === a.dealId)?.mensagens.some((m) => m.id === r.mensagemId);
    case 'anotar_peca':
      return !!r.anotacaoId && !!board.anotacoes?.some((x) => x.id === r.anotacaoId);
    case 'decidir_email_pcp':
      return board.emailsPcp?.find((x) => x.id === a.id)?.status === (a.decisao === 'ACEITAR' ? 'ACEITA' : 'IGNORADA');
    case 'gerar_pedido':
      return temPedido(board, r.pedidoId);
    case 'dividir_pedido':
      return temPedido(board, r.pedidoId);
    case 'dividir_por_previsao': {
      const ids = r.partes?.length ? r.partes : r.pedidoId ? [r.pedidoId] : [];
      return ids.length > 0 && ids.every((id) => temPedido(board, id));
    }
    case 'nova_demanda': {
      const ids = new Set(board.caixas.flatMap((c) => c.itens.map((i) => i.id)));
      return !!r.itemIds?.length && r.itemIds.every((id) => ids.has(id));
    }
    case 'alterar_capacidade_oficina':
      return (board.oficinas?.find((o) => o.ploomesId === a.oficinaId)?.capacidadeSemana ?? null) === a.capacidade;
    case 'salvar_etapas': {
      const atuais = etapasOrdenadas(board.etapasPedido ?? []).map((e) => e.nome.trim());
      const salvas = a.etapas.map((e) => e.nome.trim());
      return atuais.length === salvas.length && atuais.every((n, k) => n === salvas[k]);
    }
  }
  const v = versaoNoBoard(board, a);
  if (v === undefined) return false;
  if (p.versaoNova !== undefined && v === p.versaoNova) return true;
  const antes = p.versoesAntigas ?? ('versao' in a ? [a.versao] : []);
  return !antes.includes(v);
}

// Pendências que o board ainda não mostra. Uma ação confirmada sai quando o board mostra
// ela (acaoNoBoard); aí as confirmadas anteriores do mesmo alvo também já estão. Para nada
// ficar pendente para sempre, a confirmada sai também depois de LIMITE_RECARGAS boards
// pedidos depois da confirmação (a fila conta) ou de LIMITE_CONFIRMADA_MS. As que ainda não
// foram confirmadas continuam todas.
export function pendentesVivos(pendentes: readonly Pendente[], board: Board, _marco: number, agora: number = Date.now()): Pendente[] {
  const refletidos = new Set<string>();
  const vivos: Pendente[] = [];
  for (let k = pendentes.length - 1; k >= 0; k--) {
    const p = pendentes[k];
    if (p.estado === 'confirmada') {
      const chave = chaveDaAcao(p.acao);
      const venceu = (p.recargasDepois ?? 0) >= LIMITE_RECARGAS ||
        (p.confirmadaAs !== undefined && agora - p.confirmadaAs >= LIMITE_CONFIRMADA_MS);
      if (refletidos.has(chave) || venceu || acaoNoBoard(board, p)) {
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
  return pendentes.reduce((b, p) => aplicarOtimista(b, p.acao, {
    hoje, n: p.id, ...(p.criadaAs !== undefined ? { agora: new Date(p.criadaAs).toISOString() } : {})
  }), board);
}
