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
  pedidoId: string; // primeiro pedido aberto que contém o item, ou ''
  pedidoIds: string[]; // todos os pedidos abertos com o item (o original e as partes dele)
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
  versao: string;
  tratativa: '' | 'ENVIADO' | 'RECEBIDO';
  tratativaEm: string;
  historico: EntradaHistorico[];
  itens: Item[];
}

export type OrigemPedido = 'FORNECEDOR' | 'CLIENTE';
export type LocalPedido = 'BRAGANCA' | 'SAO_PAULO';

export interface ItemPedido {
  itemId: string;
  dealId: string;
  os: string;
  nome: string;
  un: string;
  qtd: number | null;
  fornecedor: string;
}

export interface Pedido {
  id: string; // PED-0001, ou PED-0001.2 (parte de uma divisão)
  pai: string; // pedido original de uma parte; '' no original
  etapa: string; // id da etapa
  origem: OrigemPedido;
  quem: string;
  local: LocalPedido;
  previsao: string; // 'aaaa-mm-dd' ou ''
  responsavel: string;
  criadoEm: string;
  baixadoEm: string;
  versao: string;
  finalizado: boolean;
  itens: ItemPedido[];
}

export interface EtapaPedido {
  id: string;
  nome: string;
  ordem: number;
}

export interface Board {
  geradoEm: string; // ISO
  caixas: Caixa[];
  avisos: string[];
  usuarios: string[];
  dealsEditaveis?: string[]; // vazio ou ausente = todas as caixas editáveis
  pedidos?: Pedido[];
  etapasPedido?: EtapaPedido[];
}

// Corpo do POST /pcp-acao.
export type Acao =
  | { tipo: 'baixa'; dealId: string; itemId: string; valor: number; versao: string }
  | { tipo: 'previsao_item'; dealId: string; itemId: string; valor: string; versao: string }
  | { tipo: 'obs_item'; dealId: string; itemId: string; valor: string; versao: string }
  | { tipo: 'responsavel'; dealId: string; valor: string; versao: string }
  | { tipo: 'previsao_caixa'; dealId: string; valor: string; versao: string }
  | { tipo: 'obs_caixa'; dealId: string; valor: string; versao: string }
  | ({ tipo: 'gerar_pedido'; itens: { itemId: string; dealId: string; qtd: number; fornecedor: string }[] } & DadosPedido)
  | {
      tipo: 'editar_pedido';
      pedidoId: string;
      versao: string;
      campos: Partial<DadosPedido & { etapa: string }>;
      itens?: { itemId: string; qtd: number; fornecedor: string }[];
    }
  | { tipo: 'mover_pedido'; pedidoId: string; versao: string; etapa: string }
  | { tipo: 'baixar_pedido'; pedidoId: string; versao: string }
  | { tipo: 'dividir_pedido'; pedidoId: string; versao: string; etapa: string; itens: { itemId: string; qtd: number }[] }
  | { tipo: 'salvar_etapas'; etapas: { id?: string; nome: string }[] }
  | { tipo: 'enviar_oficina'; dealId: string; versao: string }
  | { tipo: 'oficina_recebeu'; dealId: string; versao: string };

export interface DadosPedido {
  origem: OrigemPedido;
  quem: string;
  local: LocalPedido;
  previsao: string;
  responsavel: string;
}

export interface RespostaAcao {
  versao: string;
  historico: EntradaHistorico | null;
  historicos?: { quando: string; usuario: string; texto: string; ploomes: StatusPloomes; dealId: string }[];
  pedidoId?: string;
}

export interface Sessao {
  token: string;
  nome: string;
  perfil: string;
  expiraEm: string; // ISO
}
