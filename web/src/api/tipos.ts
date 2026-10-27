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
  posSaida?: boolean; // falta registrada depois que a caixa saiu (Nova demanda): selo em Faltas sem pedido, fora do No Ploomes
  pedidoId: string; // primeiro pedido aberto que contém o item, ou ''
  pedidoIds: string[]; // todos os pedidos abertos com o item (o original e as partes dele)
}

export type StatusPloomes = 'PENDENTE' | 'ENVIADO' | 'ERRO';

export interface EntradaHistorico {
  id?: string; // linha do HISTORICO_APP (API nova): evita evento repetido na Visão da peça
  acao?: string; // coluna acao do HISTORICO_APP (baixa, gerar_pedido, ANOTACAO...): fonte na linha do tempo
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
  historico: EntradaHistorico[];
  itens: Item[];
}

export type OrigemPedido = 'FORNECEDOR' | 'CLIENTE';
export type LocalPedido = 'BRAGANCA' | 'SAO_PAULO' | 'OFICINA' | 'CLIENTE';

export interface ItemPedido {
  itemId: string;
  dealId: string;
  os: string;
  nome: string;
  un: string;
  qtd: number | null;
  fornecedor: string;
  previsao?: string; // previsão efetiva do item ('aaaa-mm-dd' ou ''): a dele ou, vazia, a do pedido
  // O pedido segue o corte: itemId já é o do item atual (CORTE). true = o item saiu no corte e
  // não tem correspondente; o servidor não dá baixa dele (n8n/src/pedidos.js).
  itemMudou?: boolean;
}

export interface Pedido {
  id: string; // PED-0001, ou PED-0001.2 (parte de uma divisão)
  pai: string; // pedido original de uma parte; '' no original
  etapa: string; // id da etapa
  origem: OrigemPedido;
  quem: string;
  local: LocalPedido;
  previsao: string; // 'aaaa-mm-dd' ou ''
  previsaoMaisProxima?: string; // a menor previsão dos itens (ou a do pedido)
  previsoesDiferentes?: boolean; // itens com previsões diferentes
  responsavel: string;
  criadoEm: string;
  baixadoEm: string; // baixa dada nas caixas (entrou em "Enviado ao destino final"); o pedido segue aberto
  concluidoEm?: string; // o destino confirmou o recebimento (etapa final)
  versao: string;
  finalizado: boolean; // concluído
  itens: ItemPedido[];
  provisorio?: boolean; // só no site: pedido previsto na tela enquanto o servidor grava (regras/otimista.ts)
}

export interface EtapaPedido {
  id: string;
  nome: string;
  ordem: number;
}

export interface MensagemProducao {
  id: string;
  quando: string;
  participanteNome: string;
  direcao: 'ENVIADA' | 'RECEBIDA';
  texto: string;
  associacao: 'CITACAO' | 'OS_NO_TEXTO' | 'ULTIMA_COBRANCA' | 'MANUAL' | 'SEM_ASSOCIACAO' | 'IA' | 'IA_DUVIDA' | 'NAO_OS';
  associacaoMotivo?: string; // associacao IA: por que a IA ligou a mensagem a esta OS
  pergunta?: boolean; // pergunta do associador à oficina ("Essa mensagem é sobre ...?")
  statusEnvio: '' | 'PENDENTE' | 'ENVIANDO' | 'ENVIADA' | 'ERRO';
  tipoConteudo: 'TEXTO' | 'NAO_TEXTUAL';
  reenviada?: boolean; // tentativa com erro que já ganhou um reenvio (só um por mensagem)
  envioTentativas?: number; // PENDENTE depois de falha certa: tentativas automáticas já feitas (até 5)
  interpretacao?: 'ERRO'; // o intérprete falhou nas 5 tentativas
}

export interface MensagemWhatsappSemAssociacao extends MensagemProducao {
  perguntado?: boolean; // IA_DUVIDA: a IA perguntou à oficina qual é a peça
  oficinaId: string;
  oficina: string;
  grupoNome: string;
}

export interface SugestaoProducao {
  id: string;
  mensagemId: string;
  tipo: 'NOVA_DATA_COMBINADA' | 'PRAZO_CONFIRMADO' | 'MOTIVO_ATRASO' | 'OBSERVACAO';
  valor: string;
  resumo: string;
  evidencia: string;
  confianca: number | null;
  status: 'PENDENTE' | 'ACEITA' | 'IGNORADA';
  criadoEm: string;
  versao: string;
}

export interface Producao {
  dealId: string;
  os: string;
  oficinaId: string;
  oficina: string;
  inicioCostura: string;
  dataCombinada: string;
  leadTime: string;
  pecas: number | null;
  valorCorte?: number | null; // "Valor Total - Corte Real" do Ploomes, em R$ (API antiga não manda)
  cliente: string;
  peca: string;
  referencia: string;
  versao: string;
  faltasCostura: Item[];
  faltasAcabamento: Item[];
  mensagens: MensagemProducao[];
  sugestoes: SugestaoProducao[];
  historico: EntradaHistorico[];
  // OS prevista (19/10): ainda nas etapas 12 a 16, com a Costura projetada pelo servidor.
  // Ausentes nas OS que já estão na Costura (e na API antiga).
  prevista?: boolean;
  etapaOrdem?: number | null;
  etapaNome?: string;
  etapaInicio?: string; // 'aaaa-mm-dd' ou ''
  inicioCosturaPrevisto?: string; // chegada prevista à Costura, 'aaaa-mm-dd' ou '' (OS sem peças)
  fimCosturaPrevisto?: string;
}

export interface OficinaProducao {
  ploomesId: string;
  nome: string;
  grupoConfigurado: boolean;
  grupoNome: string;
  capacidadeSemana?: number | null; // peças por semana (aba OFICINAS); null/ausente = sem capacidade
}

export interface Board {
  geradoEm: string; // ISO
  caixas: Caixa[];
  avisos: string[];
  usuarios: string[];
  dealsEditaveis?: string[]; // vazio ou ausente = todas as caixas editáveis
  pedidos?: Pedido[];
  etapasPedido?: EtapaPedido[];
  fornecedores?: string[]; // aba FORNECEDORES: ativos, em ordem (opções do pedido)
  responsaveis?: string[]; // aba RESPONSAVEIS: ativos, em ordem (responsável do pedido)
  producao?: Producao[];
  oficinas?: OficinaProducao[];
  mensagensWhatsappSemAssociacao?: MensagemWhatsappSemAssociacao[];
  dealsProducaoEditaveis?: string[];
  previsaoSemHistorico?: boolean; // PREVISAO_MEDIAS ainda vazia: a previsão usa o fallback (duração 1, fila 0)
  anotacoes?: AnotacaoPeca[]; // anotações da Visão da peça (qualquer card), cruzadas pela OS
  emailsPcp?: EmailPcp[]; // F5c: sugestões dos e-mails do PCP (pendentes e decididas nos últimos 7 dias)
}

// Corpo do POST /pcp-acao.
export type Acao =
  | { tipo: 'baixa'; dealId: string; itemId: string; valor: number; versao: string }
  | { tipo: 'previsao_item'; dealId: string; itemId: string; valor: string; versao: string }
  | { tipo: 'obs_item'; dealId: string; itemId: string; valor: string; versao: string }
  | { tipo: 'responsavel'; dealId: string; valor: string; versao: string }
  | { tipo: 'previsao_caixa'; dealId: string; valor: string; versao: string }
  | { tipo: 'obs_caixa'; dealId: string; valor: string; versao: string }
  | ({ tipo: 'gerar_pedido'; itens: { itemId: string; dealId: string; qtd: number; fornecedor: string; previsao: string }[] } & DadosPedido)
  | {
      tipo: 'editar_pedido';
      pedidoId: string;
      versao: string;
      campos: Partial<DadosPedido>; // a etapa muda só arrastando (mover_pedido)
      itens?: { itemId: string; qtd: number; fornecedor: string; previsao?: string }[];
    }
  // confirmouBaixa: true só depois da confirmação da baixa (entrar na etapa da baixa). Sem ele
  // a API recusa com 409 "Atualize a página": é o site antigo, que não confirmava.
  | { tipo: 'mover_pedido'; pedidoId: string; versao: string; etapa: string; confirmouBaixa?: true }
  | { tipo: 'baixar_pedido'; pedidoId: string; versao: string; confirmouBaixa?: true }
  // a parte vai para a etapa da baixa; sem "etapa" no corpo (a API recusa etapa diferente da baixa)
  | { tipo: 'dividir_pedido'; pedidoId: string; versao: string; itens: { itemId: string; qtd: number }[] }
  | { tipo: 'dividir_por_previsao'; pedidoId: string; versao: string }
  | { tipo: 'nova_demanda'; os: string; caixa: 'COSTURA' | 'ACABAMENTO'; itens: { nome: string; cor: string; qtd: number; un: string }[] }
  | { tipo: 'alterar_producao'; dealId: string; versao: string; oficinaId: string; dataCombinada: string; motivo: string }
  | { tipo: 'aceitar_sugestao_whatsapp'; dealId: string; sugestaoId: string; versao: string; motivo: string }
  | { tipo: 'ignorar_sugestao_whatsapp'; dealId: string; sugestaoId: string; versao: string }
  | { tipo: 'associar_whatsapp'; dealId: string; mensagemId: string; versao: string }
  // chave: gerada no clique e guardada na fila; o servidor tira dela o id da mensagem, e a
  // mesma ação enviada de novo não cria segunda linha.
  | { tipo: 'enviar_whatsapp'; dealId: string; versao: string; modelo: 'COBRANCA_PRAZO' | 'CONFIRMAR_DATA'; texto: string; chave: string }
  | { tipo: 'reenviar_whatsapp'; dealId: string; mensagemId: string; versao: string; confirmou: true }
  | { tipo: 'salvar_etapas'; etapas: { id?: string; nome: string }[] }
  // Só ADM. capacidade null = sem capacidade (a carga aparece sem cor de alerta).
  | { tipo: 'alterar_capacidade_oficina'; oficinaId: string; capacidade: number | null }
  // Visão da peça (F5a): única escrita; texto até 500 caracteres, sem linha em branco.
  | { tipo: 'anotar_peca'; os: string; dealId: string; texto: string }
  // E-mails do PCP (F5c): aceitar grava (previsão ou anotação no histórico); ignorar só marca.
  | { tipo: 'decidir_email_pcp'; id: string; decisao: 'ACEITAR' | 'IGNORAR' };

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
  partes?: string[]; // dividir_por_previsao: ids das partes criadas
  itemIds?: string[]; // nova_demanda: ids dos itens gravados na FALTANTES
  mensagemId?: string; // enviar_whatsapp/reenviar_whatsapp: id da linha enfileirada
  anotacaoId?: string; // anotar_peca: id da linha no HISTORICO_APP
  emailId?: string; // decidir_email_pcp: id do e-mail decidido
}

export interface Sessao {
  token: string;
  nome: string;
  perfil: string;
  expiraEm: string; // ISO
}

// Contrato do webhook pcp-peca (n8n/src/peca.js): o que o board não tem (Ploomes na hora).
export interface CardPeca {
  dealId: string;
  funilId: number | null;
  funil: string; // 'Produção' | 'PCP' | 'Funil <id>'
  etapaId: number | null;
  etapa: string;
  etapaOrdem: number | null;
  titulo: string;
  cliente: string;
  peca: string;
  referencia: string;
  os: string;
  atualizadoEm: string;
  link: string;
}

export interface CandidatoPeca { os: string; peca: string; etapa: string; funil: string; dealId: string }

export interface EventoPloomes {
  quando: string;
  fonte: 'PLOOMES' | 'ETAPA';
  texto: string;
  autor: string;
  dealId: string;
  desfeita?: boolean; // troca de etapa desfeita no Ploomes
}

export interface TrilhaPeca { funil: string; dealId: string; etapas: { id: string; nome: string; ordem: number | null }[]; atualId: string }

export interface RespostaPeca {
  geradoEm: string;
  os: string; // '' quando a busca devolve a lista de candidatos
  candidatos?: CandidatoPeca[];
  cards: CardPeca[];
  trilha: TrilhaPeca | null;
  eventos: EventoPloomes[];
}

export interface AnotacaoPeca {
  id: string;
  quando: string;
  usuario: string;
  texto: string;
  ploomes: StatusPloomes;
  dealId: string;
  os: string;
}

// F5c · sugestão de um e-mail do PCP (aba EMAILS_PCP, n8n/src/emailsPcp.js).
export type TipoEmailPcp = 'PREVISAO' | 'QUANTIDADE' | 'CHAMADO' | 'OBSERVACAO';

export interface EmailPcp {
  id: string;
  quando: string; // ISO
  de: string; // nome do remetente (nunca o endereço)
  assunto: string;
  os: string;
  modelo: string; // CAIXA_SEPARADA | POS_CORTE | RECEBIDOS_SP | OUTRO
  texto: string; // resposta sem histórico citado e sem assinatura
  tipo: TipoEmailPcp;
  valor: string; // PREVISAO: 'aaaa-mm-dd'; QUANTIDADE: número; CHAMADO: número
  itens: string[]; // ids dos itens das caixas da OS
  resumo: string;
  evidencia: string;
  confianca: number | null;
  status: 'PENDENTE' | 'ACEITA' | 'IGNORADA';
}

// Contrato do webhook pcp-assistente (n8n/src/assistente.js). A conversa vive só no navegador.
export interface ChamadaAssistente { id: string; nome: string; argumentos: Record<string, unknown> }
export type MensagemAssistente =
  | { papel: 'usuario'; texto: string }
  | { papel: 'assistente'; texto: string }
  | { papel: 'assistente'; chamadas: ChamadaAssistente[] }
  | { papel: 'ferramenta'; id: string; nome: string; resultado: string };
export type RespostaAssistente = { texto: string } | { chamadas: ChamadaAssistente[] };
