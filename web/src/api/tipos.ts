// Contrato com o webhook pcp-board (n8n/src/montarCaixas.js).
export interface Item {
  id: string;
  nome: string;
  cor: string;
  un: string;
  necessaria: number | null;
  separada: number | null;
  falta: number | null;
  faltaG: number | null;
  status: string; // ABERTO | PARCIAL | RESOLVIDO | ...
  obs: string;
  previsao: string; // 'aaaa-mm-dd' ou ''
  resolvidoEm: string; // 'aaaa-mm-dd' ou ''
}

export interface Caixa {
  id: string;
  dealId: string;
  os: string;
  ciclo: 'PEDIDO' | 'CORTE';
  tipo: string; // COSTURA | ACABAMENTO | ...
  referencia: string;
  peca: string;
  cliente: string;
  responsavel: string;
  registradoEm: string;
  saiu: boolean;
  saiuComFalta: boolean;
  saiuEm: string;
  itens: Item[];
}

export interface Board {
  geradoEm: string; // ISO
  caixas: Caixa[];
  avisos: string[];
}

export interface Sessao {
  token: string;
  nome: string;
  perfil: string;
  expiraEm: string; // ISO
}
