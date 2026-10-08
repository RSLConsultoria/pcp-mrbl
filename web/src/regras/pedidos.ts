import type { Board, Caixa, DadosPedido, EtapaPedido, Item, Pedido } from '../api/tipos';
import { arredondar3, lerQuantidade } from './acoes';
import { itensAbertos } from './colunas';
import { ddmm } from './datas';
import { caixaEditavelNoApp } from './edicao';
import { formatarNumero, qtdComUn } from './quantidade';

export type FiltroPedidos = 'aberto' | 'finalizado' | 'todos';

// Pedido gerado na tela e ainda não gravado: id provisório até a recarga trazer o número.
export const PREFIXO_NOVO = 'novo:';
export const rotuloDoPedido = (id: string): string => (id.startsWith(PREFIXO_NOVO) ? 'Novo pedido' : id);

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
export const NOME_LOCAL: Record<DadosPedido['local'], string> = { BRAGANCA: 'Bragança', SAO_PAULO: 'São Paulo', OFICINA: 'Oficina', CLIENTE: 'Cliente' };
export const nomeOrigem = (o: DadosPedido['origem']): string => NOME_ORIGEM[o];
export const nomeLocal = (l: DadosPedido['local']): string => NOME_LOCAL[l] ?? l;

// Campos obrigatórios do pedido: "Solicitar a", fornecedor (ou cliente, quando "Solicitar
// a" = Cliente), local de entrega e responsável. No Gerar pedido as listas começam vazias
// ("Selecionar"); local só é conferido quando vem no objeto. Mesma regra do servidor
// (n8n/src/pedidos.js) para fornecedor e responsável; null = tudo certo.
export interface CamposObrigatorios {
  origem: DadosPedido['origem'] | '';
  quem: string;
  responsavel: string;
  local?: DadosPedido['local'] | '';
}

export function erroDadosPedido(d: CamposObrigatorios): string | null {
  const faltam: string[] = [];
  if (d.origem === '') faltam.push('a quem solicitar');
  else if (d.quem.trim() === '') faltam.push(d.origem === 'CLIENTE' ? 'o cliente' : 'o fornecedor');
  if (d.local === '') faltam.push('o local de entrega');
  if (d.responsavel.trim() === '') faltam.push('o responsável');
  if (!faltam.length) return null;
  const lista = faltam.length === 1 ? faltam[0] : `${faltam.slice(0, -1).join(', ')} e ${faltam[faltam.length - 1]}`;
  return `Escolha ${lista}.`;
}

// Editar: só recusa limpar o que estava preenchido (pedido antigo sem fornecedor ou sem
// responsável continua editável).
type Obrigatorios = Pick<DadosPedido, 'origem' | 'quem' | 'responsavel'>;
export function erroEdicaoPedido(antes: Obrigatorios, depois: Obrigatorios): string | null {
  const limpou = (k: 'quem' | 'responsavel') => depois[k].trim() === '' && antes[k].trim() !== '';
  return erroDadosPedido({ origem: depois.origem, quem: limpou('quem') ? '' : '-', responsavel: limpou('responsavel') ? '' : '-' });
}

// Opções de uma lista com o valor atual na frente, quando ele não está mais nela
// (fornecedor desativado, nome antigo digitado à mão).
export function opcoesComAtual(lista: string[], atual: string): string[] {
  return atual === '' || lista.includes(atual) ? lista : [atual, ...lista];
}

// Clientes das OSs (caixa.cliente): as opções de "Cliente" quando o pedido é para o cliente.
export function clientesDasCaixas(caixas: Pick<Caixa, 'dealId' | 'cliente'>[], dealIds: string[]): string[] {
  const deals = new Set(dealIds);
  const nomes = caixas.filter((c) => deals.has(c.dealId)).map((c) => c.cliente.trim()).filter((n) => n !== '');
  return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Opções de "Fornecedor"/"Cliente" (e do fornecedor do item) conforme "Solicitar a".
export const opcoesDeQuem = (origem: DadosPedido['origem'] | '', fornecedores: string[], clientes: string[]): string[] =>
  origem === 'CLIENTE' ? clientes : fornecedores;

// Ao trocar "Solicitar a", o nome escolhido só fica se existir na lista nova; com uma
// opção só (um cliente), ela já vem escolhida.
export function quemAoTrocarOrigem(quem: string, opcoes: string[]): string {
  if (opcoes.includes(quem)) return quem;
  return opcoes.length === 1 ? opcoes[0] : '';
}

export interface EstadoEditavel {
  etapa: string;
  origem: DadosPedido['origem'];
  quem: string;
  local: DadosPedido['local'];
  previsao: string;
  responsavel: string;
  // previsao do item: a própria ('' = igual à do pedido)
  itens: { itemId: string; nome: string; un: string; qtd: number; fornecedor: string; previsao: string }[];
}

// Previsão que vale para o item: a dele ou, vazia, a do pedido.
export const previsaoEfetiva = (estado: Pick<EstadoEditavel, 'previsao'>, i: { previsao: string }): string => i.previsao || estado.previsao;

// A previsão do item mudou de fato: o campo dele mudou e a previsão que vale é outra.
export function previsaoDoItemMudou(antes: EstadoEditavel, depois: EstadoEditavel, d: EstadoEditavel['itens'][number]): boolean {
  const a = antes.itens.find((i) => i.itemId === d.itemId);
  return !!a && a.previsao !== d.previsao && previsaoEfetiva(antes, a) !== previsaoEfetiva(depois, d);
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
    if (previsaoDoItemMudou(antes, depois, d)) out.push(`previsão de ${d.nome}: ${dia(previsaoEfetiva(antes, a))} → ${dia(previsaoEfetiva(depois, d))}`);
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
  // A última etapa (Resolvido: mover para ela dá baixa) fica sempre por último.
  const ultima = atuais.length ? atuais[atuais.length - 1] : null;
  if (ultima && etapas[etapas.length - 1].id !== ultima.id) return `A última etapa (${ultima.nome}) precisa continuar por último.`;
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
