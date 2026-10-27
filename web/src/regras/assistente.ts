import type { Acao, Board, ChamadaAssistente, MensagemAssistente, Producao, RespostaAssistente } from '../api/tipos';
import { normalizar } from './busca';
import { itensAbertos } from './colunas';
import { ddmm } from './datas';
import { caixasParadas, cobrancasSemResposta, DIAS_CAIXA_PARADA, DIAS_PRAZO_ESTOURANDO, prazosEstourando, rotuloTipoCaixa } from './insights';
import { etapaFinal, pedidosDoItem, quemDoPedido } from './pedidos';
import { chaveEnvioWhatsapp, modeloMensagemProducao, ordenarPorEntrega, prazoProducao, situacaoPrazo } from './producao';
import type { Tela } from './telas';

// Assistente (F5d): as ferramentas rodam aqui, sobre o board já carregado (o servidor só
// guarda a chave do Groq e repassa a conversa). Nenhuma grava: a cobrança só monta um cartão,
// e o envio nasce do clique em "Confirmar e enviar" (ação enviar_whatsapp de hoje).
// Os nomes espelham n8n/src/assistente.js (o teste confere).

export const NOMES_FERRAMENTAS = [
  'buscar_os', 'listar_atrasadas', 'faltas_da_os', 'caixas_paradas', 'pedidos_abertos', 'sem_resposta', 'abrir_tela', 'preparar_cobranca'
] as const;
export type NomeFerramenta = (typeof NOMES_FERRAMENTAS)[number];

export const MAX_LINHAS = 30;
export const MAX_CHAMADAS_POR_PERGUNTA = 5;
export const MAX_TEXTO_COBRANCA = 1500;
export const TEXTO_LIMITE_CHAMADAS = 'Parei aqui: essa pergunta pediu consultas demais. Tente algo mais específico.';
export const EXEMPLOS_ASSISTENTE = ['Quais OS estão atrasadas?', 'Cobrar as atrasadas', 'Faltas da OS 12345'];

export type Resultado = Record<string, unknown>;
export type AlvoCobranca = 'atrasadas' | 'todas' | 'oficinas';

export interface LinhaCartao {
  dealId: string; os: string; peca: string; oficina: string; prazo: string; situacao: string;
  texto: string; marcada: boolean; travada: boolean; motivo: string;
}
export interface CartaoCobranca {
  id: string; alvo: AlvoCobranca; linhas: LinhaCartao[]; total: number;
  estado: 'aberto' | 'confirmado' | 'cancelado'; enfileiradas: number;
}
export type Efeito = { tipo: 'abrir'; tela: Tela; os: string } | { tipo: 'cobranca'; cartao: CartaoCobranca };
export interface Execucao { resultado: Resultado; efeito?: Efeito }

// ---------- argumentos ----------
const txt = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '').trim();
function inteiro(v: unknown, padrao: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : padrao;
}
function lista(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(txt).filter(Boolean);
  return txt(v).split(',').map((s) => s.trim()).filter(Boolean);
}
const contem = (campo: string, termo: string) => !!termo && normalizar(campo).includes(termo);
const porOs = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

// No máximo 30 linhas; total só quando cortou.
function cortar<T>(linhas: T[]): { linhas: T[]; total?: number } {
  return linhas.length > MAX_LINHAS ? { linhas: linhas.slice(0, MAX_LINHAS), total: linhas.length } : { linhas };
}

const naCostura = (board: Pick<Board, 'producao'>): Producao[] => (board.producao ?? []).filter((p) => !p.prevista);

// ---------- ferramentas de consulta ----------
export function buscarOs(board: Board, args: Resultado, hoje: string): Resultado {
  const termo = normalizar(txt(args.texto));
  if (!termo) return { erro: 'Informe a OS, a peça, o cliente ou a oficina.' };
  const achadas = new Map<string, { os: string; peca: string; cliente: string; oficina: string; situacao: string; caixasComFalta: number }>();
  for (const p of board.producao ?? []) {
    if (![p.os, p.peca, p.referencia, p.cliente, p.oficina].some((c) => contem(c, termo))) continue;
    achadas.set(p.os, { os: p.os, peca: p.peca || p.referencia, cliente: p.cliente, oficina: p.oficina, situacao: situacaoPrazo(p, hoje).texto, caixasComFalta: 0 });
  }
  for (const c of board.caixas) {
    const atual = achadas.get(c.os);
    if (!atual && ![c.os, c.peca, c.referencia, c.cliente].some((x) => contem(x, termo))) continue;
    const linha = atual ?? { os: c.os, peca: c.peca || c.referencia, cliente: c.cliente, oficina: '', situacao: '', caixasComFalta: 0 };
    if (itensAbertos(c).length > 0) linha.caixasComFalta += 1;
    achadas.set(c.os, linha);
  }
  const linhas = [...achadas.values()].sort((a, b) => Number(normalizar(b.os) === termo) - Number(normalizar(a.os) === termo) || porOs(a.os, b.os));
  return linhas.length ? cortar(linhas) : { linhas: [], aviso: 'Nenhuma OS encontrada.' };
}

export function listarAtrasadas(board: Board, args: Resultado, hoje: string): Resultado {
  const dias = inteiro(args.dias_ate_vencer, DIAS_PRAZO_ESTOURANDO, 0, 60);
  const oficina = normalizar(txt(args.oficina));
  const porDeal = new Map((board.producao ?? []).map((p) => [p.dealId, p]));
  const linhas = prazosEstourando(board.producao, hoje, dias)
    .filter((l) => !oficina || contem(l.oficina, oficina))
    .map((l) => ({ os: l.os, peca: l.peca, oficina: l.oficina, prazo: ddmm(prazoProducao(porDeal.get(l.dealId)!).data), situacao: l.texto }));
  return linhas.length ? cortar(linhas) : { linhas: [], aviso: 'Nenhuma OS com prazo estourando.' };
}

export function faltasDaOs(board: Board, args: Resultado): Resultado {
  const os = txt(args.os).replace(/^os\s*/i, '');
  if (!os) return { erro: 'Informe a OS.' };
  const caixas = board.caixas.filter((c) => c.os === os);
  if (!caixas.length) return { os, linhas: [], aviso: `Nenhuma caixa encontrada para a OS ${os}.` };
  const linhas = caixas.flatMap((c) => itensAbertos(c).map((i) => ({
    caixa: rotuloTipoCaixa(c.tipo), saiu: c.saiu, nome: i.nome, cor: i.cor, falta: i.resta, un: i.un,
    previsao: ddmm(i.previsao || c.previsao), pedido: pedidosDoItem(i).join(', ')
  })));
  return linhas.length ? { os, ...cortar(linhas) } : { os, linhas: [], aviso: `A OS ${os} não tem falta em aberto.` };
}

export function caixasParadasFerramenta(board: Board, args: Resultado, hoje: string): Resultado {
  const minimo = inteiro(args.dias, DIAS_CAIXA_PARADA, 1, 365);
  const linhas = caixasParadas(board.caixas, hoje, minimo).map((l) => ({ os: l.os, caixa: l.tipo, dias: l.dias, itensAbertos: l.itensAbertos }));
  return linhas.length ? cortar(linhas) : { linhas: [], aviso: 'Nenhuma caixa parada.' };
}

export function pedidosAbertos(board: Board, args: Resultado): Resultado {
  const os = txt(args.os).replace(/^os\s*/i, '');
  const fornecedor = normalizar(txt(args.fornecedor));
  const etapas = board.etapasPedido ?? [];
  const final = etapaFinal(etapas)?.id;
  const nomeEtapa = (id: string) => etapas.find((e) => e.id === id)?.nome ?? id;
  const linhas = (board.pedidos ?? [])
    .filter((p) => !p.finalizado && p.etapa !== final)
    .filter((p) => !os || p.itens.some((i) => i.os === os))
    .filter((p) => !fornecedor || contem(quemDoPedido(p), fornecedor) || p.itens.some((i) => contem(i.fornecedor, fornecedor)))
    .map((p) => ({
      pedido: p.id, etapa: nomeEtapa(p.etapa), quem: quemDoPedido(p), previsao: ddmm(p.previsaoMaisProxima || p.previsao),
      os: [...new Set(p.itens.map((i) => i.os))].sort(porOs).join(', '), itens: p.itens.length
    }));
  return linhas.length ? cortar(linhas) : { linhas: [], aviso: 'Nenhum pedido aberto.' };
}

export function semResposta(board: Board, agora: Date): Resultado {
  const linhas = cobrancasSemResposta(board.producao, agora).map((l) => ({ os: l.os, peca: l.peca, oficina: l.oficina, situacao: l.texto }));
  return linhas.length ? cortar(linhas) : { linhas: [], aviso: 'Nenhuma cobrança sem resposta.' };
}

const TELAS: Record<string, Tela> = { 'no-ploomes': 'ploomes', saidas: 'saidas', solicitacoes: 'pedidos', producao: 'producao', peca: 'peca' };
const NOME_TELA: Record<Tela, string> = {
  ploomes: 'No Ploomes', saidas: 'Saídas com falta', pedidos: 'Solicitações de faltas', producao: 'Controle de produção', peca: 'Visão das peças'
};

export function abrirTela(args: Resultado): Execucao {
  const tela = TELAS[txt(args.tela)];
  if (!tela) return { resultado: { erro: 'Tela desconhecida. Use no-ploomes, saidas, solicitacoes, producao ou peca.' } };
  const os = tela === 'peca' ? txt(args.os).replace(/^os\s*/i, '') : '';
  const texto = os ? `Abri a Visão da peça da OS ${os}.` : `Abri ${NOME_TELA[tela]}.`;
  return { resultado: { ok: true, texto }, efeito: { tipo: 'abrir', tela, os } };
}

// ---------- cartão de cobrança ----------
// Travas de hoje (Controle de produção): sem oficina, oficina sem grupo, fora da allowlist.
export function motivoTrava(board: Pick<Board, 'oficinas' | 'dealsProducaoEditaveis'>, p: Producao): string {
  if (!p.oficinaId || p.oficina.trim().toUpperCase() === 'ALOCAR') return 'Sem oficina alocada';
  if (!board.oficinas?.find((o) => o.ploomesId === p.oficinaId)?.grupoConfigurado) return 'Oficina sem grupo de WhatsApp';
  const lista = board.dealsProducaoEditaveis;
  if (lista && lista.length > 0 && !lista.includes(p.dealId)) return 'Edição liberada em breve para esta OS';
  return '';
}

export function montarCartaoCobranca(board: Board, args: Resultado, hoje: string, id: string): { cartao: CartaoCobranca } | { erro: string } {
  const alvo = txt(args.alvo) as AlvoCobranca;
  if (!['atrasadas', 'todas', 'oficinas'].includes(alvo)) return { erro: 'Alvo inválido. Use atrasadas, todas ou oficinas.' };
  const oficinas = lista(args.oficinas).map(normalizar).filter(Boolean);
  if (alvo === 'oficinas' && !oficinas.length) return { erro: 'Informe as oficinas.' };
  const porDeal = new Map(naCostura(board).map((p) => [p.dealId, p]));
  const base = alvo === 'atrasadas'
    ? prazosEstourando(board.producao, hoje).map((l) => porDeal.get(l.dealId)).filter((p): p is Producao => !!p)
    : ordenarPorEntrega(naCostura(board));
  const escolhidas = base.filter((p) => !oficinas.length || oficinas.some((o) => contem(p.oficina, o)));
  const linhas = escolhidas.slice(0, MAX_LINHAS).map((p): LinhaCartao => {
    const motivo = motivoTrava(board, p);
    const prazo = prazoProducao(p).data;
    return {
      dealId: p.dealId, os: p.os, peca: p.peca || p.referencia, oficina: p.oficina, prazo: prazo ? ddmm(prazo) : 'sem prazo',
      situacao: situacaoPrazo(p, hoje).texto, texto: modeloMensagemProducao('COBRANCA_PRAZO', p, hoje),
      marcada: !motivo, travada: !!motivo, motivo
    };
  });
  return { cartao: { id, alvo, linhas, total: escolhidas.length, estado: 'aberto', enfileiradas: 0 } };
}

export const linhasEnviaveis = (c: CartaoCobranca): LinhaCartao[] => c.linhas.filter((l) => l.marcada && !l.travada);

// O que volta ao modelo: só contagens (os textos ficam no cartão).
export function resumoCobranca(c: CartaoCobranca): Resultado {
  return {
    alvo: c.alvo, mensagens: linhasEnviaveis(c).length, travadas: c.linhas.filter((l) => l.travada).length, total: c.total,
    ...(c.total > c.linhas.length ? { mostradas: c.linhas.length } : {}),
    aviso: 'Nada foi enviado. A pessoa confere o cartão e clica em Confirmar e enviar.'
  };
}

export function alternarLinha(c: CartaoCobranca, dealId: string): CartaoCobranca {
  if (c.estado !== 'aberto') return c;
  return { ...c, linhas: c.linhas.map((l) => (l.dealId === dealId && !l.travada ? { ...l, marcada: !l.marcada } : l)) };
}

export function editarTextoLinha(c: CartaoCobranca, dealId: string, texto: string): CartaoCobranca {
  if (c.estado !== 'aberto') return c;
  return { ...c, linhas: c.linhas.map((l) => (l.dealId === dealId && !l.travada ? { ...l, texto } : l)) };
}

export function erroCartao(c: CartaoCobranca): string {
  const marcadas = linhasEnviaveis(c);
  if (!marcadas.length) return 'Marque ao menos uma OS.';
  const ruim = marcadas.find((l) => !l.texto.trim() || l.texto.trim().length > MAX_TEXTO_COBRANCA);
  return ruim ? `Escreva uma mensagem com até ${MAX_TEXTO_COBRANCA} caracteres (OS ${ruim.os}).` : '';
}

// Uma enviar_whatsapp por linha marcada, conferida de novo no board de agora (versão atual;
// OS que saiu da Costura ou ficou travada é pulada). Cartão já decidido não gera nada.
export function acoesDoCartao(c: CartaoCobranca, board: Board, chave: () => string = chaveEnvioWhatsapp): Acao[] {
  if (c.estado !== 'aberto' || erroCartao(c)) return [];
  const acoes: Acao[] = [];
  for (const l of linhasEnviaveis(c)) {
    const p = naCostura(board).find((x) => x.dealId === l.dealId);
    if (!p || motivoTrava(board, p)) continue;
    acoes.push({ tipo: 'enviar_whatsapp', dealId: p.dealId, versao: p.versao, modelo: 'COBRANCA_PRAZO', texto: l.texto.trim(), chave: chave() });
  }
  return acoes;
}

export const confirmarCartao = (c: CartaoCobranca, enfileiradas: number): CartaoCobranca => ({ ...c, estado: 'confirmado', enfileiradas });
export const cancelarCartao = (c: CartaoCobranca): CartaoCobranca => ({ ...c, estado: 'cancelado' });
export const textoEnfileiradas = (n: number): string => `${n} ${n === 1 ? 'cobrança' : 'cobranças'} na fila`;

// ---------- execução e laço ----------
export function executarFerramenta(board: Board, chamada: ChamadaAssistente, hoje: string, agora: Date, idCartao: string): Execucao {
  const a = chamada.argumentos ?? {};
  try {
    switch (chamada.nome as NomeFerramenta) {
      case 'buscar_os': return { resultado: buscarOs(board, a, hoje) };
      case 'listar_atrasadas': return { resultado: listarAtrasadas(board, a, hoje) };
      case 'faltas_da_os': return { resultado: faltasDaOs(board, a) };
      case 'caixas_paradas': return { resultado: caixasParadasFerramenta(board, a, hoje) };
      case 'pedidos_abertos': return { resultado: pedidosAbertos(board, a) };
      case 'sem_resposta': return { resultado: semResposta(board, agora) };
      case 'abrir_tela': return abrirTela(a);
      case 'preparar_cobranca': {
        const r = montarCartaoCobranca(board, a, hoje, idCartao);
        if ('erro' in r) return { resultado: { erro: r.erro } };
        if (!r.cartao.linhas.length) return { resultado: { mensagens: 0, aviso: 'Nenhuma OS na Costura para cobrar nesse alvo.' } };
        return { resultado: resumoCobranca(r.cartao), efeito: { tipo: 'cobranca', cartao: r.cartao } };
      }
      default: return { resultado: { erro: 'Ferramenta desconhecida.' } };
    }
  } catch {
    return { resultado: { erro: 'Não consegui consultar agora.' } };
  }
}

// Uma pergunta: pede ao servidor, roda as ferramentas pedidas e devolve até ter texto. No
// máximo 5 chamadas por pergunta: se o modelo pedir mais, para com um aviso. Erro do servidor
// sobe para quem chamou (a tela mostra o aviso e descarta o que veio no meio).
export async function conversar(
  historico: MensagemAssistente[],
  pedir: (mensagens: MensagemAssistente[]) => Promise<RespostaAssistente>,
  executar: (c: ChamadaAssistente) => Resultado
): Promise<{ novas: MensagemAssistente[]; texto: string }> {
  const novas: MensagemAssistente[] = [];
  let usadas = 0;
  for (;;) {
    const r = await pedir([...historico, ...novas]);
    if ('texto' in r) {
      novas.push({ papel: 'assistente', texto: r.texto });
      return { novas, texto: r.texto };
    }
    if (usadas + r.chamadas.length > MAX_CHAMADAS_POR_PERGUNTA) {
      novas.push({ papel: 'assistente', texto: TEXTO_LIMITE_CHAMADAS });
      return { novas, texto: TEXTO_LIMITE_CHAMADAS };
    }
    novas.push({ papel: 'assistente', chamadas: r.chamadas });
    for (const c of r.chamadas) {
      usadas += 1;
      novas.push({ papel: 'ferramenta', id: c.id, nome: c.nome, resultado: JSON.stringify(executar(c)) });
    }
  }
}

// ---------- links de OS ----------
export const osConhecidas = (board: Pick<Board, 'caixas' | 'producao'>): Set<string> =>
  new Set([...board.caixas.map((c) => c.os), ...(board.producao ?? []).map((p) => p.os)]);

// Números de 4 a 9 dígitos que são OS do board viram link (#peca/<OS>).
export function partesComOs(texto: string, conhecidas: Set<string>): ({ texto: string } | { os: string })[] {
  const partes: ({ texto: string } | { os: string })[] = [];
  let desde = 0;
  for (const m of texto.matchAll(/(?<!\d)\d{4,9}(?!\d)/g)) {
    if (!conhecidas.has(m[0])) continue;
    if (m.index > desde) partes.push({ texto: texto.slice(desde, m.index) });
    partes.push({ os: m[0] });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) partes.push({ texto: texto.slice(desde) });
  return partes;
}
