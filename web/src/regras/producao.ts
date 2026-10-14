import type { Producao } from '../api/tipos';

export type OrigemPrazo = 'COMBINADA' | 'LEAD_TIME' | 'SEM_PRAZO';
export type StatusPrazoProducao = 'ATRASADO' | 'HOJE' | 'PROXIMO' | 'NO_PRAZO' | 'SEM_PRAZO';
export interface FiltrosProducao { busca: string; oficinaId: string; soComFalta: boolean }
export type ModeloMensagemProducao = 'COBRANCA_PRAZO' | 'CONFIRMAR_DATA' | 'MATERIAL_ENVIADO';

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

function chaveBusca(v: string): string { return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }

export function filtrarProducoes(lista: Producao[], filtros: FiltrosProducao): Producao[] {
  const busca = chaveBusca(filtros.busca.trim());
  return lista.filter((p) => {
    if (filtros.oficinaId && p.oficinaId !== filtros.oficinaId) return false;
    if (filtros.soComFalta && p.faltasCostura.length === 0) return false;
    if (!busca) return true;
    return chaveBusca([p.os, p.peca, p.referencia, p.cliente, p.oficina].join(' ')).includes(busca);
  });
}

export function indicadoresProducao(lista: Producao[], hoje: string) {
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
  const datas = lista.flatMap((p) => [p.inicioCostura, prazoProducao(p).data]).filter(Boolean);
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

export function modeloMensagemProducao(tipo: ModeloMensagemProducao, p: Producao, hoje: string): string {
  const cabecalho = `*OS ${p.os}*`;
  const detalhe = `${p.peca || 'peça'}${p.pecas ? `, ${p.pecas} peças` : ''}`;
  const prazo = prazoProducao(p);
  if (tipo === 'CONFIRMAR_DATA') {
    return `${cabecalho}\nBom dia. Confirmando a entrega de ${detalhe} para ${dataCurta(p.dataCombinada || prazo.data)}. Segue combinado?`;
  }
  if (tipo === 'MATERIAL_ENVIADO') return `${cabecalho}\nBom dia. O material que faltava na caixa de costura foi enviado hoje.`;
  const status = statusProducao(p, hoje);
  if (status.status === 'ATRASADO') return `${cabecalho}\nBom dia. A entrega de ${detalhe} estava prevista para ${dataCurta(prazo.data)}. Qual a nova data de entrega?`;
  if (!prazo.data) return `${cabecalho}\nBom dia. Qual a previsão de entrega de ${detalhe}?`;
  return `${cabecalho}\nBom dia. A entrega de ${detalhe} está prevista para ${dataCurta(prazo.data)}. Segue dentro do prazo?`;
}
