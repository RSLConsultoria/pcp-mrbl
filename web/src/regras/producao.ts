import type { Producao } from '../api/tipos';

export type OrigemPrazo = 'COMBINADA' | 'LEAD_TIME' | 'SEM_PRAZO';
export type StatusPrazoProducao = 'ATRASADO' | 'HOJE' | 'PROXIMO' | 'NO_PRAZO' | 'SEM_PRAZO';
// Filtro geral "Situação do prazo": agrupa o status do Gantt (HOJE e PROXIMO viram "vence em breve").
export type SituacaoPrazo = 'ATRASADA' | 'EM_BREVE' | 'NO_PRAZO' | 'SEM_PRAZO';
export const SITUACOES_PRAZO: { valor: SituacaoPrazo; rotulo: string }[] = [
  { valor: 'ATRASADA', rotulo: 'Atrasada' }, { valor: 'EM_BREVE', rotulo: 'Vence em breve' },
  { valor: 'NO_PRAZO', rotulo: 'No prazo' }, { valor: 'SEM_PRAZO', rotulo: 'Sem prazo' }
];
// incluirPrevistas (19/10): sem ele, as OS previstas (etapas 12 a 16) ficam fora.
export interface FiltrosProducao { busca: string; oficinaId: string; soComFalta: boolean; situacao?: SituacaoPrazo | ''; hoje?: string; incluirPrevistas?: boolean }
// Material enviado saiu da F4 por decisão do dono (16/10).
export type ModeloMensagemProducao = 'COBRANCA_PRAZO' | 'CONFIRMAR_DATA';

// Chave de um clique em "Colocar na fila" (o servidor aceita [A-Za-z0-9-]{8,64}).
export function chaveEnvioWhatsapp(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function prazoProducao(p: Pick<Producao, 'dataCombinada' | 'leadTime'>): { data: string; origem: OrigemPrazo } {
  if (p.dataCombinada) return { data: p.dataCombinada, origem: 'COMBINADA' };
  if (p.leadTime) return { data: p.leadTime, origem: 'LEAD_TIME' };
  return { data: '', origem: 'SEM_PRAZO' };
}

function msDia(iso: string): number { return Date.parse(`${iso}T12:00:00Z`); }
function somarDias(iso: string, dias: number): string { return new Date(msDia(iso) + dias * 86_400_000).toISOString().slice(0, 10); }
function diasInclusivos(inicio: string, fim: string): number { return Math.round((msDia(fim) - msDia(inicio)) / 86_400_000) + 1; }

export function statusProducao(p: Pick<Producao, 'dataCombinada' | 'leadTime'>, hoje: string) {
  const prazo = prazoProducao(p);
  if (!prazo.data) return { status: 'SEM_PRAZO' as const, dias: null, ...prazo };
  const dias = Math.round((msDia(prazo.data) - msDia(hoje)) / 86_400_000);
  const status: StatusPrazoProducao = dias < 0 ? 'ATRASADO' : dias === 0 ? 'HOJE' : dias <= 3 ? 'PROXIMO' : 'NO_PRAZO';
  return { status, dias, ...prazo };
}

export function situacaoPrazo(p: Pick<Producao, 'dataCombinada' | 'leadTime'>, hoje: string): { situacao: SituacaoPrazo; dias: number | null; texto: string } {
  const { status, dias } = statusProducao(p, hoje);
  if (status === 'SEM_PRAZO' || dias === null) return { situacao: 'SEM_PRAZO', dias: null, texto: 'Sem prazo' };
  const situacao: SituacaoPrazo = status === 'ATRASADO' ? 'ATRASADA' : status === 'NO_PRAZO' ? 'NO_PRAZO' : 'EM_BREVE';
  const rotulo = SITUACOES_PRAZO.find((s) => s.valor === situacao)!.rotulo;
  const n = Math.abs(dias);
  return { situacao, dias, texto: `${rotulo} · ${n === 0 ? 'hoje' : `${n} ${n === 1 ? 'dia' : 'dias'}`}` };
}

export function chaveBusca(v: string): string { return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }

export function filtrarProducoes(lista: Producao[], filtros: FiltrosProducao): Producao[] {
  const busca = chaveBusca(filtros.busca.trim());
  return lista.filter((p) => {
    if (p.prevista && !filtros.incluirPrevistas) return false;
    if (filtros.oficinaId && p.oficinaId !== filtros.oficinaId) return false;
    if (filtros.soComFalta && p.faltasCostura.length === 0) return false;
    if (filtros.situacao && filtros.hoje && situacaoPrazo(p, filtros.hoje).situacao !== filtros.situacao) return false;
    if (!busca) return true;
    return chaveBusca([p.os, p.peca, p.referencia, p.cliente, p.oficina].join(' ')).includes(busca);
  });
}

// Grupos do Gantt: uma oficina por grupo, na ordem em que a lista chega (o servidor já ordena).
export function agruparPorOficina(lista: Producao[]): [string, Producao[]][] {
  const mapa = new Map<string, Producao[]>();
  for (const p of lista) mapa.set(p.oficina, [...(mapa.get(p.oficina) ?? []), p]);
  return [...mapa.entries()];
}

// Gantt "Agrupar: Entrega" (19/10): um bloco só, pela data de entrega vigente
// (combinada, senão lead time); empate pela OS; OS sem prazo no fim.
export function ordenarPorEntrega(lista: Producao[]): Producao[] {
  return lista
    .map((p) => ({ p, prazo: prazoProducao(p).data }))
    .sort((a, b) => {
      if (a.prazo !== b.prazo) {
        if (!a.prazo) return 1;
        if (!b.prazo) return -1;
        return a.prazo < b.prazo ? -1 : 1;
      }
      return a.p.os.localeCompare(b.p.os, 'pt-BR', { numeric: true });
    })
    .map(({ p }) => p);
}

const ehNumero = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

// Reais sem centavos: "R$ 12.345".
export function reais(v: number): string { return `R$ ${Math.round(v).toLocaleString('pt-BR')}`; }

// Texto dentro da barra do Gantt: peças e valor do corte (a OS já aparece à esquerda).
export function textoBarraProducao(p: Pick<Producao, 'pecas' | 'valorCorte'>): string {
  const partes: string[] = [];
  if (ehNumero(p.pecas)) partes.push(`${p.pecas.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} pç`);
  if (ehNumero(p.valorCorte)) partes.push(reais(p.valorCorte));
  return partes.join(' · ');
}

export function tituloBarraProducao(p: Pick<Producao, 'os' | 'pecas' | 'valorCorte' | 'dataCombinada' | 'leadTime'>): string {
  const prazo = prazoProducao(p).data;
  return [`OS ${p.os}`, prazo ? `${prazo.slice(8, 10)}/${prazo.slice(5, 7)}` : 'sem prazo', textoBarraProducao(p)].filter(Boolean).join(' · ');
}

// Barra tracejada da OS prevista: da chegada prevista ao fim previsto.
export function tituloBarraPrevista(p: Pick<Producao, 'os' | 'etapaNome' | 'inicioCosturaPrevisto' | 'fimCosturaPrevisto' | 'pecas' | 'valorCorte'>): string {
  const ini = p.inicioCosturaPrevisto ?? '';
  const fim = p.fimCosturaPrevisto ?? '';
  const periodo = ini && fim ? `${ini.slice(8, 10)}/${ini.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}` : 'sem previsão';
  return [`OS ${p.os}`, 'prevista', p.etapaNome ?? '', periodo, textoBarraProducao(p)].filter(Boolean).join(' · ');
}

// Mensagens do WhatsApp só se associam a OS na Costura: as previstas nunca são oferecidas.
export function opcoesAssociacaoMensagem(producao: Producao[], oficinaId: string, editaveis: string[] | undefined): Producao[] {
  return producao.filter((p) => !p.prevista && p.oficinaId === oficinaId && (!editaveis?.length || editaveis.includes(p.dealId)));
}

export function totaisProducao(lista: Pick<Producao, 'pecas' | 'valorCorte'>[]): { pecas: number; valor: number } {
  const total = { pecas: 0, valor: 0 };
  for (const p of lista) {
    if (ehNumero(p.pecas)) total.pecas += p.pecas;
    if (ehNumero(p.valorCorte)) total.valor += p.valorCorte;
  }
  return total;
}

// Indicadores da Costura: as OS previstas não entram (ainda não chegaram).
export function indicadoresProducao(todas: Producao[], hoje: string) {
  const lista = todas.filter((p) => !p.prevista);
  const oficinas = new Set(lista.filter((p) => p.oficinaId).map((p) => p.oficinaId));
  return {
    os: lista.length,
    pecas: lista.reduce((n, p) => n + (p.pecas ?? 0), 0),
    oficinas: oficinas.size,
    caixasComFalta: lista.filter((p) => p.faltasCostura.length > 0).length,
    itensEmFalta: lista.reduce((n, p) => n + p.faltasCostura.length, 0),
    atrasadas: lista.filter((p) => statusProducao(p, hoje).status === 'ATRASADO').length,
    semCombinada: lista.filter((p) => !p.dataCombinada).length
  };
}

export function resumoFaltasAviamentos(p: Pick<Producao, 'faltasCostura' | 'faltasAcabamento'>) {
  const costura = p.faltasCostura.length;
  const acabamento = p.faltasAcabamento.length;
  const textoCostura = costura ? `${costura} aviamento${costura === 1 ? '' : 's'} faltando na costura; ${costura === 1 ? 'impede' : 'impedem'} finalizar a costura` : '';
  const textoAcabamento = acabamento ? `${acabamento} aviamento${acabamento === 1 ? '' : 's'} faltando no acabamento; ${acabamento === 1 ? 'precisa' : 'precisam'} estar pronto${acabamento === 1 ? '' : 's'} para a etapa seguinte` : '';
  return { total: costura + acabamento, costura, acabamento, textoCostura, textoAcabamento };
}

export function janelaGantt(lista: Producao[], hoje: string): { inicio: string; fim: string; dias: number } {
  const datas = lista.flatMap((p) => p.prevista
    ? [p.inicioCosturaPrevisto ?? '', p.fimCosturaPrevisto ?? '']
    : [p.inicioCostura, prazoProducao(p).data]).filter(Boolean);
  let inicio = [somarDias(hoje, -30), ...datas].sort()[0];
  let fim = [somarDias(hoje, 30), ...datas].sort().at(-1)!;
  if (diasInclusivos(inicio, fim) > 180) {
    inicio = somarDias(hoje, -89);
    fim = somarDias(hoje, 90);
  }
  return { inicio, fim, dias: diasInclusivos(inicio, fim) };
}

export function validarMudancaProducao(
  atual: Pick<Producao, 'oficinaId' | 'dataCombinada'>,
  nova: { oficinaId: string; dataCombinada: string; motivo: string }
): string | null {
  const mudouData = nova.dataCombinada !== atual.dataCombinada;
  const mudouOficina = nova.oficinaId !== atual.oficinaId;
  if (mudouData && !nova.motivo.trim()) return 'Informe o motivo da alteração da data combinada.';
  if (!mudouData && !mudouOficina) return 'Nada alterado.';
  return null;
}

function dataCurta(iso: string): string { return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : 'sem data'; }

// As oficinas conhecem a peça, não o número da OS: a mensagem cita a peça em negrito
// do WhatsApp. O texto é o mesmo de modeloWhatsapp em n8n/src/producao.js.
export function modeloMensagemProducao(tipo: ModeloMensagemProducao, p: Producao, hoje: string): string {
  const nome = `*${p.peca || 'peça'}*`;
  const qtd = p.pecas ?? 0;
  const quantidade = qtd > 0 ? `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${qtd === 1 ? 'peça' : 'peças'}` : '';
  const meio = quantidade ? `${nome}, ${quantidade},` : nome;
  const fim = quantidade ? `${nome}, ${quantidade}` : nome;
  const prazo = prazoProducao(p);
  if (tipo === 'CONFIRMAR_DATA') {
    return `Bom dia. Confirmando a entrega de ${meio} para ${dataCurta(p.dataCombinada || prazo.data)}. Segue combinado?`;
  }
  const status = statusProducao(p, hoje);
  if (status.status === 'ATRASADO') return `Bom dia. A entrega de ${meio} estava prevista para ${dataCurta(prazo.data)}. Qual a nova data de entrega?`;
  if (!prazo.data) return `Bom dia. Qual a previsão de entrega de ${fim}?`;
  return `Bom dia. A entrega de ${meio} está prevista para ${dataCurta(prazo.data)}. Segue dentro do prazo?`;
}
