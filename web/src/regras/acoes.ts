import { ApiError } from '../api/client';
import type { Acao, EntradaHistorico, Item, StatusPloomes } from '../api/tipos';
import { ddmm } from './datas';
import { qtdComUn } from './quantidade';


// Arredonda em 3 casas para comparar sem o ruído do ponto flutuante (0,1 + 0,2).
export function arredondar3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Aceita vírgula ou ponto como separador decimal.
export function lerQuantidade(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function validarBaixa(qtdTexto: string, item: Item): string | null {
  const qtd = lerQuantidade(qtdTexto);
  if (qtd === null || arredondar3(qtd) <= 0) return 'Informe uma quantidade maior que zero';
  if (item.resta === null) return 'Item sem quantidade faltante registrada.';
  const resta = arredondar3(item.resta);
  if (arredondar3(qtd) > resta) return `Falta só ${qtdComUn(resta, item.un)}`;
  return null;
}

// Data de <input type="date"> pronta para salvar: vazia ou com ano plausível.
// Evita salvar a cada dígito do ano digitado (0002, 0020, 0202, 2026).
export function dataPronta(v: string): boolean {
  if (v === '') return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return !!m && Number(m[1]) >= 2000 && Number(m[1]) <= 2099;
}

export type PassoData = 'salvar' | 'esperar' | 'reverter';

// O que fazer com a data do campo. Data digitada pela metade (o navegador marca badInput e
// devolve '') ou com o ano ainda incompleto fica pendente enquanto se digita; ao sair do
// campo, volta ao valor do board sem gravar. Só o campo limpo de propósito grava ''.
export function passoDaData(valor: string, incompleta: boolean, aoSair: boolean): PassoData {
  if (incompleta || !dataPronta(valor)) return aoSair ? 'reverter' : 'esperar';
  return 'salvar';
}

// Aviso de uma linha mostrado quando o servidor aceita a ação.
export function mensagemSucesso(
  acao: Acao,
  item?: Pick<Item, 'nome' | 'un'>,
  extra: { pedidoId?: string; etapa?: string; baixa?: boolean; partes?: number } = {}
): string {
  const nome = item?.nome ?? 'item';
  switch (acao.tipo) {
    case 'baixa':
      return `Baixa registrada · ${qtdComUn(acao.valor, item?.un ?? '')} de ${nome}`;
    case 'previsao_item':
      return acao.valor ? `Previsão de ${nome}: ${ddmm(acao.valor)}` : `Previsão de ${nome} removida`;
    case 'obs_item':
      return acao.valor ? `Observação de ${nome} salva` : `Observação de ${nome} removida`;
    case 'responsavel':
      return acao.valor ? `Responsável: ${acao.valor}` : 'Responsável removido';
    case 'previsao_caixa':
      return acao.valor ? `Previsão da caixa: ${ddmm(acao.valor)}` : 'Previsão da caixa removida';
    case 'obs_caixa':
      return acao.valor ? 'Observação da caixa salva' : 'Observação da caixa removida';
    case 'gerar_pedido': {
      const n = acao.itens.length;
      const os = new Set(acao.itens.map((i) => i.dealId)).size;
      return `${extra.pedidoId ?? 'Pedido'} gerado · ${n} ${n === 1 ? 'item' : 'itens'} · registrado em ${os} OS no Ploomes`;
    }
    case 'editar_pedido':
      return `${acao.pedidoId} alterado`;
    case 'mover_pedido':
      return `${acao.pedidoId} movido para ${extra.etapa ?? acao.etapa}${extra.baixa ? ' · baixa registrada nas caixas' : ''}`;
    case 'baixar_pedido':
      return `Baixa do ${acao.pedidoId} registrada`;
    case 'dividir_pedido':
      return `${acao.pedidoId} dividido · ${extra.pedidoId ?? 'nova parte'} em ${extra.etapa ?? acao.etapa}`;
    case 'dividir_por_previsao': {
      const n = extra.partes ?? 0;
      return `${acao.pedidoId} dividido por previsão${n > 0 ? ` · ${n} ${n === 1 ? 'parte' : 'partes'}` : ''}`;
    }
    case 'salvar_etapas':
      return 'Etapas do quadro salvas';
    case 'enviar_oficina':
      return 'Caixa enviada à oficina';
    case 'oficina_recebeu':
      return 'Recebimento da oficina registrado';
  }
}

export const MSG_CONFLITO = 'Alguém alterou esta caixa agora há pouco. Recarreguei os dados.';
export const MSG_CONFLITO_PEDIDO = 'Alguém alterou este pedido agora há pouco. Recarreguei os dados.';
// Começo do texto que o servidor manda no 409 de versão vencida (n8n/src/pedidos.js
// ERRO_VERSAO e ERRO_VERSAO_PEDIDO): "Alguém alterou esta caixa/este pedido agora há pouco."
export const MSG_VERSAO_SERVIDOR = 'Alguém alterou ';
export const MSG_FALHA = 'Não foi possível salvar. Tente de novo.';

export type DesfechoErro =
  | { tipo: 'expirou' }
  | { tipo: 'conflito'; texto: string }
  | { tipo: 'aviso'; texto: string };

// O que a tela faz quando o servidor recusa uma ação. Todo 409 recarrega o board; só o de
// versão vencida vira o texto padrão (que fala do pedido ou da caixa, conforme o alvo da
// ação), os outros (item já em pedido, pedido finalizado, etapa com pedido aberto) mostram a
// mensagem do servidor.
export function desfechoDoErro(e: unknown, acao?: Acao): DesfechoErro {
  if (e instanceof ApiError) {
    if (e.status === 401) return { tipo: 'expirou' };
    if (e.status === 409) {
      const msg = e.message.trim();
      const versao = msg === '' || msg === 'Erro 409' || msg.startsWith(MSG_VERSAO_SERVIDOR);
      const padrao = acao && 'pedidoId' in acao ? MSG_CONFLITO_PEDIDO : MSG_CONFLITO;
      return { tipo: 'conflito', texto: versao ? padrao : msg };
    }
    if ((e.status === 400 || e.status === 403 || e.status === 404) && e.message) return { tipo: 'aviso', texto: e.message };
  }
  return { tipo: 'aviso', texto: MSG_FALHA };
}

export const SELO_PLOOMES: Record<StatusPloomes, string> = {
  ENVIADO: 'enviado ao Ploomes',
  PENDENTE: 'aguardando Ploomes',
  ERRO: 'falhou no Ploomes'
};

// Do mais novo para o mais antigo (o board já manda assim; aqui é só garantia).
export function ordenarHistorico(h: EntradaHistorico[]): EntradaHistorico[] {
  return [...h].sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));
}

// Alvo da versão de uma ação: o item (linha da FALTANTES) ou a caixa (linha da CAIXAS_PCP).
export function chaveDaAcao(acao: Acao): string {
  if ('itemId' in acao) return `item:${acao.dealId}:${acao.itemId}`;
  if ('pedidoId' in acao) return `pedido:${acao.pedidoId}`;
  if (acao.tipo === 'gerar_pedido') return 'gerar_pedido';
  if (acao.tipo === 'salvar_etapas') return 'etapas';
  return `caixa:${acao.dealId}`;
}

// Ações enfileiradas antes da recarga levam a versão que a tela viu. Se a versão foi
// trocada por uma ação nossa (antiga → nova), segue a troca até a mais recente.
export function versaoAtual(versao: string, trocas: Map<string, string> | undefined): string {
  let v = versao;
  for (let i = 0; trocas && trocas.has(v) && i < 100; i++) v = trocas.get(v)!;
  return v;
}

// Grava no Map como a entrada mais recente e descarta as mais antigas acima de max.
export function gravarRecente<K, V>(m: Map<K, V>, chave: K, valor: V, max = 50): void {
  m.delete(chave);
  m.set(chave, valor);
  for (const k of m.keys()) {
    if (m.size <= max) break;
    m.delete(k);
  }
}
