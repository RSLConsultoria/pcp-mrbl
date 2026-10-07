import type { Caixa, Item } from '../api/tipos';

export function item(o: Partial<Item> = {}): Item {
  return {
    id: 'i1', nome: 'ZIPER METAL', cor: 'preto', un: 'UN', necessaria: 52, separada: 0,
    falta: 52, faltaG: null, status: 'ABERTO', baixada: 0, resta: 52, restaG: null, obsAlmox: '', obsPcp: '',
    previsao: '', resolvidoEm: '', versao: '', editavel: true, ...o
  };
}

export function caixa(o: Partial<Caixa> = {}): Caixa {
  return {
    id: '600001', dealId: '600001', os: '90001', ciclo: 'PEDIDO', tipo: 'COSTURA', referencia: 'REF1',
    peca: 'PECA TESTE A', cliente: 'CLIENTE ALFA', responsavel: 'Maria', registradoEm: '2026-10-01',
    saiu: false, saiuComFalta: false, saiuEm: '',
    previsao: '', observacao: '', colunaManual: null, versao: '', historico: [], itens: [item()], ...o
  };
}
