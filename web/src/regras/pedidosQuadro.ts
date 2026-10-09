import type { Acao, Board, Caixa, DadosPedido, EntradaHistorico, EtapaPedido, Item, ItemPedido, Pedido, StatusPloomes } from '../api/tipos';
import { arredondar3, lerQuantidade } from './acoes';
import { normalizar } from './busca';
import { caixaEditavelNoApp } from './edicao';
import type { EstadoEditavel, FiltroPedidos } from './pedidos';
import { ddmm } from './datas';
import { faltasSemPedido, previsaoDoItemMudou, ultimaEtapa } from './pedidos';
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

// A última etapa (maior ordem) é sempre a "Resolvido": entrar nela dá a baixa nas caixas.
// O pedido finalizado (com baixa) fica nela no quadro, qualquer que seja a etapa gravada.
export function etapaNoQuadro(p: Pick<Pedido, 'etapa' | 'finalizado'>, etapas: EtapaPedido[]): string {
  return p.finalizado ? ultimaEtapa(etapas)?.id ?? p.etapa : p.etapa;
}

// Mudar de `de` para `para` entra na última etapa (pede confirmação: a baixa não volta).
export function entraNaUltimaEtapa(de: string, para: string, etapas: EtapaPedido[]): boolean {
  const u = ultimaEtapa(etapas);
  return !!u && para === u.id && de !== u.id;
}

// "Mover para Resolvido dá baixa de 2 itens em 2 OS. A baixa não pode ser desfeita."
export function textoConfirmarResolvido(itens: Pick<ItemPedido, 'dealId'>[], nomeUltima: string): string {
  const n = itens.length;
  const os = new Set(itens.map((i) => i.dealId)).size;
  return `Mover para ${nomeUltima} dá baixa de ${n} ${n === 1 ? 'item' : 'itens'} em ${os} OS. A baixa não pode ser desfeita.`;
}

// Pedido editável no app: não finalizado, já gravado (não provisório) e todas as OS liberadas para edição.
export function pedidoEditavel(board: Pick<Board, 'dealsEditaveis'>, p: Pedido): boolean {
  return !p.finalizado && !p.provisorio && p.itens.every((i) => caixaEditavelNoApp(board, { dealId: i.dealId }));
}

export function vazioDaEtapa(filtro: FiltroPedidos, indice: number, total: number, temBusca: boolean): string {
  if (temBusca) return 'Nenhum pedido desta etapa atende à busca.';
  const ultima = indice === total - 1;
  if (filtro === 'finalizado') return ultima ? 'Nenhum pedido finalizado ainda.' : 'Pedidos finalizados ficam na última etapa.';
  if (indice === 0) return 'Pedidos gerados a partir das faltas entram aqui.';
  if (ultima) return 'Mover um pedido para cá dá baixa nas caixas.';
  return 'Arraste um pedido para esta etapa.';
}

export function estadoDoPedido(p: Pedido): EstadoEditavel {
  return {
    etapa: p.etapa, origem: p.origem, quem: p.quem, local: p.local, previsao: p.previsao, responsavel: p.responsavel,
    itens: p.itens.map((i) => ({
      itemId: i.itemId, nome: i.nome, un: i.un, qtd: i.qtd ?? 0, fornecedor: i.fornecedor,
      // só a previsão própria: igual à do pedido fica vazia ("Igual à do pedido")
      previsao: i.previsao && i.previsao !== p.previsao ? i.previsao : ''
    }))
  };
}

// Formulário do painel = o pedido como está agora + só o que o usuário mudou. Assim, se o
// pedido muda por fora com o painel aberto (arrastado, outra ação ainda na fila, recarga),
// o formulário acompanha nos campos que ninguém mexeu, e salvar não devolve o pedido ao
// estado de quando o painel abriu. Compara campo a campo, por igualdade simples.
export function camposAlterados<T extends object>(base: T, valor: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(valor) as (keyof T)[]) if (valor[k] !== base[k]) out[k] = valor[k];
  return out;
}

export function comAlterados<T extends object>(atual: T, alterados: Partial<T>): T {
  return { ...atual, ...alterados };
}

const CAMPOS = ['etapa', 'origem', 'quem', 'local', 'previsao', 'responsavel'] as const;

// Corpo do editar_pedido só com o que mudou; null quando nada mudou.
export function acaoEditarPedido(p: Pick<Pedido, 'id' | 'versao'>, antes: EstadoEditavel, depois: EstadoEditavel): Acao | null {
  const campos: Record<string, string> = {};
  for (const k of CAMPOS) if (antes[k] !== depois[k]) campos[k] = depois[k];
  const itens = depois.itens
    .filter((d) => {
      const a = antes.itens.find((i) => i.itemId === d.itemId);
      return a && (arredondar3(a.qtd) !== arredondar3(d.qtd) || a.fornecedor !== d.fornecedor || previsaoDoItemMudou(antes, depois, d));
    })
    .map((d) => ({
      itemId: d.itemId, qtd: arredondar3(d.qtd), fornecedor: d.fornecedor,
      ...(previsaoDoItemMudou(antes, depois, d) ? { previsao: d.previsao } : {})
    }));
  if (Object.keys(campos).length === 0 && itens.length === 0) return null;
  return {
    tipo: 'editar_pedido', pedidoId: p.id, versao: p.versao,
    campos: campos as Partial<DadosPedido & { etapa: string }>,
    ...(itens.length ? { itens } : {})
  };
}

export interface EntradaDoPedido extends EntradaHistorico {
  os: string[]; // OS em que a ação foi registrada (o servidor grava uma linha por OS)
}

const PIOR_PLOOMES: StatusPloomes[] = ['ERRO', 'PENDENTE', 'ENVIADO'];

// Junta os textos da mesma ação gravados em OS diferentes; null quando não dá para juntar
// sem perder sentido. Iguais: um só. Um é começo dos outros (edição com mudança de item só
// numa OS): o maior acréscimo de cada. Começo comum até ", " ou ": " (listas de baixa ou de
// itens): o começo e as partes que variam, com o mesmo separador (", " ou "; ").
function juntarTextos(textos: string[], pedidoId: string): string | null {
  const unicos = [...new Set(textos)];
  if (unicos.length === 1) return unicos[0];
  const menor = [...unicos].sort((a, b) => a.length - b.length)[0];
  if (unicos.every((t) => t.startsWith(menor))) {
    return menor + unicos.filter((t) => t !== menor).map((t) => t.slice(menor.length)).join('');
  }
  let comum = unicos[0];
  for (const t of unicos) {
    let i = 0;
    while (i < comum.length && i < t.length && comum[i] === t[i]) i++;
    comum = comum.slice(0, i);
  }
  const corteVirgula = comum.lastIndexOf(', ');
  const corteDoisPontos = comum.lastIndexOf(': ');
  const corte = Math.max(corteVirgula, corteDoisPontos);
  if (corte < 0) return null;
  const prefixo = comum.slice(0, corte + 2);
  if (!prefixo.includes(pedidoId)) return null;
  return prefixo + unicos.map((t) => t.slice(prefixo.length)).join(corte === corteVirgula ? ', ' : '; ');
}

// Linhas do HISTORICO_APP (histórico das caixas) que citam o pedido. A mesma ação (mesmo instante e usuário)
// gravada em várias OS vira uma entrada só, com a lista de OS.
export function historicoDoPedido(caixas: Caixa[], pedidoId: string): EntradaDoPedido[] {
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
  const grupos = new Map<string, { h: EntradaHistorico; os: string }[]>();
  for (const c of caixas) {
    for (const h of c.historico ?? []) {
      if (!cita(h.texto)) continue;
      const k = `${h.quando}|${h.usuario}`;
      grupos.set(k, [...(grupos.get(k) ?? []), { h, os: c.os }]);
    }
  }
  const out: EntradaDoPedido[] = [];
  for (const g of grupos.values()) {
    const texto = juntarTextos(g.map((x) => x.h.texto), pedidoId);
    const partes = texto === null
      ? [...new Set(g.map((x) => x.h.texto))].map((t) => ({ texto: t, de: g.filter((x) => x.h.texto === t) }))
      : [{ texto, de: g }];
    for (const p of partes) {
      const ploomes = PIOR_PLOOMES.find((st) => p.de.some((x) => x.h.ploomes === st)) ?? p.de[0].h.ploomes;
      out.push({ quando: p.de[0].h.quando, usuario: p.de[0].h.usuario, texto: p.texto, ploomes, os: [...new Set(p.de.map((x) => x.os))] });
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

// ---------- previsão por item ----------

// Previsão que vale para o item do pedido (a dele ou a do pedido).
const previsaoDoItem = (p: Pick<Pedido, 'previsao'>, i: Pick<ItemPedido, 'previsao'>): string => i.previsao || p.previsao;

// Datas distintas dos itens, em ordem; '' (sem previsão) por último.
function previsoesDoPedido(p: Pick<Pedido, 'previsao' | 'itens'>): string[] {
  const datas = [...new Set(p.itens.map((i) => previsaoDoItem(p, i)))];
  return datas.sort((a, b) => (a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a < b ? -1 : 1));
}

export function previsaoMaisProxima(p: Pick<Pedido, 'previsao' | 'itens' | 'previsaoMaisProxima'>): string {
  if (p.previsaoMaisProxima !== undefined) return p.previsaoMaisProxima;
  const d = previsoesDoPedido(p)[0];
  return d || p.previsao;
}

export function previsoesDiferentes(p: Pick<Pedido, 'previsao' | 'itens' | 'previsoesDiferentes'>): boolean {
  if (p.previsoesDiferentes !== undefined) return p.previsoesDiferentes;
  return previsoesDoPedido(p).length > 1;
}

export interface ParteDaPrevisao { id: string; previsao: string; itens: ItemPedido[] }

// Prévia do dividir_por_previsao: a data mais próxima fica no pedido; cada outra vira uma parte.
export function partesPorPrevisao(p: Pedido, pedidos: Pedido[]): ParteDaPrevisao[] {
  const datas = previsoesDoPedido(p).slice(1);
  const raiz = raizDoPedido(p.id);
  const base = Number(proximoIdParte(pedidos, p.id).split('.')[1]);
  return datas.map((d, k) => ({
    id: `${raiz}.${base + k}`,
    previsao: d,
    itens: p.itens.filter((i) => previsaoDoItem(p, i) === d)
  }));
}

const textoData = (d: string) => (d ? `previsão ${ddmm(d)}` : 'sem previsão');
const textoItens = (itens: ItemPedido[]) => itens.map((i) => `${i.qtd !== null ? qtdComUn(i.qtd, i.un) : '—'} de ${i.nome}`).join('; ');

// Linhas da prévia: uma por parte e o que fica no pedido.
export function resumoDivisaoPorPrevisao(p: Pedido, partes: ParteDaPrevisao[]): string[] {
  const vao = new Set(partes.flatMap((x) => x.itens.map((i) => i.itemId)));
  const ficam = p.itens.filter((i) => !vao.has(i.itemId));
  const fica = ficam.length ? previsaoDoItem(p, ficam[0]) : '';
  return [
    ...partes.map((x) => `${x.id} (${textoData(x.previsao)}): ${textoItens(x.itens)}`),
    `${p.id} fica com: ${textoItens(ficam)} (${textoData(fica)})`
  ];
}
