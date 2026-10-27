import type { Board, Caixa, CardPeca, EntradaHistorico, Producao, RespostaPeca } from '../api/tipos';
import { itemAberto } from './colunas';

// Visão da peça (F5a): o dossiê de uma OS junta o Ploomes (pcp-peca) com o board.
export const URL_HUB_PECAS = 'https://rslconsultoria.github.io/hub-pecas-catalogo/#';
export const URL_CARD_PLOOMES = 'https://app10.ploomes.com/deal/';
export const FUNIL_PRODUCAO = 60015827;
export const FUNIL_PCP = 60011710;
export const MAX_ANOTACAO = 500;

export type FontePeca = 'PLOOMES' | 'ETAPA' | 'ALMOXARIFADO' | 'COMPRAS' | 'PRODUCAO' | 'WHATSAPP' | 'ANOTACAO';
export const ROTULO_FONTE: Record<FontePeca, string> = {
  PLOOMES: 'Ploomes', ETAPA: 'Etapa', ALMOXARIFADO: 'Almoxarifado', COMPRAS: 'Compras', PRODUCAO: 'Produção', WHATSAPP: 'WhatsApp', ANOTACAO: 'Anotação'
};

export interface EventoPeca {
  chave: string;
  quando: string;
  fonte: FontePeca;
  texto: string;
  autor: string;
  enviadoPloomes: boolean;
  desfeita?: boolean;
}

const ACOES_ALMOXARIFADO = new Set(['baixa', 'previsao_item', 'obs_item', 'responsavel', 'previsao_caixa', 'obs_caixa', 'mover']);
const ACOES_COMPRAS = new Set(['gerar_pedido', 'editar_pedido', 'mover_pedido', 'baixar_pedido', 'dividir_pedido', 'dividir_por_previsao', 'nova_demanda']);
// O histórico de enfileirar repete a mensagem, que já entra como evento do WhatsApp.
const ACOES_DA_MENSAGEM = new Set(['WHATSAPP_ENFILEIRAR', 'WHATSAPP_REENFILEIRAR']);

// Fonte do evento do app pela coluna acao do HISTORICO_APP. null = fica fora. Sem acao (API
// antiga): a fonte de onde o histórico veio.
export function fonteDaAcao(acao: string | undefined, padrao: FontePeca): FontePeca | null {
  const a = (acao ?? '').trim();
  if (!a) return padrao;
  const maiuscula = a.toUpperCase();
  if (maiuscula === 'ANOTACAO') return 'ANOTACAO';
  if (ACOES_ALMOXARIFADO.has(a)) return 'ALMOXARIFADO';
  if (ACOES_COMPRAS.has(a)) return 'COMPRAS';
  if (ACOES_DA_MENSAGEM.has(maiuscula)) return null;
  if (maiuscula.startsWith('WHATSAPP_SUGESTAO')) return 'PRODUCAO';
  if (maiuscula.startsWith('WHATSAPP_')) return 'WHATSAPP';
  return 'PRODUCAO';
}

export const caixasDaOs = (board: Board, os: string): Caixa[] => board.caixas.filter((c) => c.os === os);
export const producaoDaOs = (board: Board, os: string): Producao | undefined => board.producao?.find((p) => p.os === os);

const ms = (v: string): number => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};
const ORDEM_FONTE: Partial<Record<FontePeca, number>> = { ETAPA: 0, PLOOMES: 1 };
const ordemFonte = (f: FontePeca) => ORDEM_FONTE[f] ?? 2;
const textoMensagem = (m: { tipoConteudo: string; texto: string }) => (m.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : m.texto);

// Todos os eventos da OS, do mais novo para o mais antigo; empate: Etapa, Ploomes, app.
export function linhaDoTempo(board: Board, ploomes: Pick<RespostaPeca, 'eventos'> | null, os: string): EventoPeca[] {
  const eventos: EventoPeca[] = [];
  const vistos = new Set<string>();
  const doApp = (h: EntradaHistorico, padrao: FontePeca) => {
    const fonte = fonteDaAcao(h.acao, padrao);
    if (!fonte) return;
    const chave = h.id ? `app:${h.id}` : `app:${h.quando}:${h.texto}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    eventos.push({ chave, quando: h.quando, fonte, texto: h.texto, autor: h.usuario, enviadoPloomes: h.ploomes === 'ENVIADO' });
  };
  (ploomes?.eventos ?? []).forEach((e, k) => eventos.push({
    chave: `ploomes:${k}`, quando: e.quando, fonte: e.fonte, texto: e.texto, autor: e.autor, enviadoPloomes: false,
    ...(e.desfeita ? { desfeita: true } : {})
  }));
  caixasDaOs(board, os).forEach((c) => c.historico.forEach((h) => doApp(h, 'ALMOXARIFADO')));
  const p = producaoDaOs(board, os);
  p?.historico.forEach((h) => doApp(h, 'PRODUCAO'));
  (board.anotacoes ?? []).filter((a) => a.os === os).forEach((a) => doApp({ ...a, acao: 'ANOTACAO' }, 'ANOTACAO'));
  p?.mensagens.forEach((m) => eventos.push({
    chave: `whatsapp:${m.id}`, quando: m.quando, fonte: 'WHATSAPP', texto: textoMensagem(m),
    autor: m.direcao === 'ENVIADA' ? 'PCP' : m.participanteNome || 'Oficina', enviadoPloomes: false
  }));
  return eventos.sort((a, b) => ms(b.quando) - ms(a.quando) || ordemFonte(a.fonte) - ordemFonte(b.fonte));
}

export interface ResumoSituacao {
  caixas: number;
  caixasComFalta: number;
  itensAbertos: number;
  pedidosAbertos: { id: string; etapa: string }[];
  ultimaMensagem: { quando: string; texto: string; direcao: 'ENVIADA' | 'RECEBIDA' } | null;
  temDados: boolean;
}

export function resumoSituacao(board: Board, os: string): ResumoSituacao {
  const caixas = caixasDaOs(board, os);
  const abertosPorCaixa = caixas.map((c) => c.itens.filter(itemAberto).length);
  const etapas = new Map((board.etapasPedido ?? []).map((e) => [e.id, e.nome]));
  const pedidosAbertos = (board.pedidos ?? [])
    .filter((p) => !p.finalizado && p.itens.some((i) => i.os === os))
    .map((p) => ({ id: p.id, etapa: etapas.get(p.etapa) ?? p.etapa }));
  const p = producaoDaOs(board, os);
  const ultima = [...(p?.mensagens ?? [])].sort((a, b) => ms(b.quando) - ms(a.quando))[0];
  return {
    caixas: caixas.length,
    caixasComFalta: abertosPorCaixa.filter((n) => n > 0).length,
    itensAbertos: abertosPorCaixa.reduce((s, n) => s + n, 0),
    pedidosAbertos,
    ultimaMensagem: ultima ? { quando: ultima.quando, texto: textoMensagem(ultima), direcao: ultima.direcao } : null,
    temDados: caixas.length > 0 || pedidosAbertos.length > 0 || !!p || (board.anotacoes ?? []).some((a) => a.os === os)
  };
}

// Produção > PCP > o mais recente (mesma regra do servidor, n8n/src/peca.js).
export function cardPrincipal(cards: CardPeca[]): CardPeca | null {
  const lista = [...cards].sort((a, b) => ms(b.atualizadoEm) - ms(a.atualizadoEm));
  return lista.find((c) => c.funilId === FUNIL_PRODUCAO) ?? lista.find((c) => c.funilId === FUNIL_PCP) ?? lista[0] ?? null;
}

// Card da anotação: o de Produção, senão o primeiro; sem Ploomes, o da produção ou da caixa.
export function dealDaAnotacao(cards: CardPeca[], board: Board, os: string): string {
  return cards.find((c) => c.funilId === FUNIL_PRODUCAO)?.dealId ?? cards[0]?.dealId ??
    producaoDaOs(board, os)?.dealId ?? caixasDaOs(board, os)[0]?.dealId ?? '';
}

// Até o go-live: deals das duas allowlists (lista vazia = todos), como o servidor.
export function podeAnotar(board: Board, dealId: string): boolean {
  if (!dealId) return false;
  const caixas = board.dealsEditaveis ?? [];
  const producao = board.dealsProducaoEditaveis ?? [];
  return !caixas.length || !producao.length || caixas.includes(dealId) || producao.includes(dealId);
}

export function erroAnotacao(texto: string): string {
  const t = texto.replace(/\r\n?/g, '\n').trim();
  if (!t) return 'Escreva a anotação.';
  if (/\n[ \t]*\n/.test(t)) return 'A anotação não pode ter linha em branco.';
  if (t.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').length > MAX_ANOTACAO) return 'Anotação com no máximo 500 caracteres.';
  return '';
}

export const urlHub = (referencia: string): string => URL_HUB_PECAS + encodeURIComponent(referencia.trim());
export const urlCard = (dealId: string): string => URL_CARD_PLOOMES + dealId;
