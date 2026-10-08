import type { ColunaId } from '../regras/colunas';

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
  baixada: number;
  resta: number | null; // null quando falta é null
  restaG: number | null;
  obsAlmox: string;
  obsPcp: string;
  previsao: string; // 'aaaa-mm-dd' ou ''
  resolvidoEm: string; // 'aaaa-mm-dd' ou ''
  versao: string;
  editavel: boolean;
}

export type StatusPloomes = 'PENDENTE' | 'ENVIADO' | 'ERRO';

export interface EntradaHistorico {
  quando: string; // ISO
  usuario: string;
  texto: string;
  ploomes: StatusPloomes;
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
  previsao: string; // 'aaaa-mm-dd' ou ''
  observacao: string;
  colunaManual: ColunaId | null;
  versao: string;
  historico: EntradaHistorico[];
  itens: Item[];
}

export interface Board {
  geradoEm: string; // ISO
  caixas: Caixa[];
  avisos: string[];
  usuarios: string[];
  dealsEditaveis?: string[]; // vazio ou ausente = todas as caixas editáveis
}

// Corpo do POST /pcp-acao.
export type Acao =
  | { tipo: 'baixa'; dealId: string; itemId: string; valor: number; versao: string }
  | { tipo: 'previsao_item'; dealId: string; itemId: string; valor: string; versao: string }
  | { tipo: 'obs_item'; dealId: string; itemId: string; valor: string; versao: string }
  | { tipo: 'responsavel'; dealId: string; valor: string; versao: string }
  | { tipo: 'previsao_caixa'; dealId: string; valor: string; versao: string }
  | { tipo: 'obs_caixa'; dealId: string; valor: string; versao: string }
  | { tipo: 'mover'; dealId: string; valor: ColunaId; versao: string; justificativa?: string };

export interface RespostaAcao {
  versao: string;
  historico: EntradaHistorico;
}

export interface Sessao {
  token: string;
  nome: string;
  perfil: string;
  expiraEm: string; // ISO
}
