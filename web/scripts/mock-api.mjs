// Servidor local de conferência: imita pcp-login, pcp-board, pcp-peca e pcp-acao com dados fictícios.
// Uso: node scripts/mock-api.mjs   (porta 8787, ou MOCK_PORT)
// MOCK_ATRASO_MS=4000 segura cada resposta da pcp-acao (imita o servidor lento: a tela tem de
// mostrar a mudança na hora e o "Salvando…" até a resposta). O mesmo vale por pedido com
// ?atraso=4000 na URL da ação. MOCK_FALHA_GRAVACAO=1 (ou ?falha=gravacao) responde toda ação como a
// API quando uma gravação na planilha falha no meio: 500 com o aviso (a falha vai para a aba ERROS_APP).
// Visão da peça (pcp-peca): OS 90002 com dois cards, registros e troca desfeita; REF-COMUM lista 90002 e 90003; OS 90005 simula o Ploomes fora (502).
// Para ver a recusa do Gerar pedido (409 "Item já está no PED-…"): marque o mesmo item em duas abas e gere nas duas.
// Saídas com falta: 90003 sem pedido; 90004 em A pedir (PED-0005 em etapa que saiu do quadro conta como a primeira);
// 90005 em Aguardando entrega (partes em etapas diferentes); 90007 com tudo na última etapa (pode ir à oficina);
// 90006 já enviada (material todo na última etapa). Enviar à oficina fora da última etapa: 409, como no servidor.
// Etapas: A pedir · Solicitado · Aguardando entrega · Enviado ao destino final (mover para ela dá a baixa
// nas caixas) · Concluído (o destino confirmou; finaliza). Pedido com baixa só vai para Concluído.
// PED-0001 tem itens com previsões diferentes (Dividir por previsão). PED-0004 está concluído.
// Nova demanda: OS 90006 (Acabamento) ou 90003 (Costura) já saíram; 90001 (Acabamento) ainda não saiu (409).
// Saídas com falta: 90003 sem pedido; 90004 dividida (A pedir pelo PED-0005 em etapa que saiu do quadro, e Solicitado pelo PED-0001); 90005 dividida (Aguardando entrega e Enviado ao destino final, PED-0003.1 com a baixa); 90006 e 90007 em Enviado ao destino final; 90008 em Concluído (tudo resolvido sem pedido).
import http from 'node:http';
import { readFileSync } from 'node:fs';

const PORTA = Number(process.env.MOCK_PORT) || 8787;
const USUARIOS = ['Lucca', 'Maria', 'Renata'];
// Abas FORNECEDORES (id, nome, ativo) e RESPONSAVEIS (nome, ativo): ativo vazio ou SIM aparece.
const FORNECEDORES = [
  { id: 'F001', nome: 'TECIDOS BETA', ativo: 'SIM' }, { id: 'F002', nome: 'AVIAMENTOS DELTA', ativo: '' },
  { id: 'F003', nome: 'METAIS GAMA', ativo: 'SIM' }, { id: 'F004', nome: 'ZIPERES GAMA', ativo: 'SIM' },
  { id: 'F005', nome: 'FITAS EPSILON', ativo: 'SIM' }, { id: 'F006', nome: 'FORNECEDOR ANTIGO', ativo: 'NAO' }
];
const RESPONSAVEIS = ['Gi', 'Fátima', 'Cesar', 'Luana', 'Lucca', 'Renata'].map((nome) => ({ nome, ativo: 'SIM' }));
const ativos = (linhas) => [...new Set(linhas.filter((l) => !l.ativo || l.ativo === 'SIM').map((l) => l.nome.trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));
const ENVIO_PLOOMES_MS = 20_000;
let seqDemanda = 0;
let seqAnotacao = 0;
// Histórico com id e acao (coluna do HISTORICO_APP), como o board novo: a Visão da peça usa
// o id para não repetir evento e a acao para a fonte. acaoAtual = tipo da ação em processamento.
let seqHistorico = 0;
let acaoAtual = '';
const ACAO_HISTORICO_PRODUCAO = {
  alterar_producao: 'PRODUCAO_ALTERAR_COMBINADO', aceitar_sugestao_whatsapp: 'WHATSAPP_SUGESTAO_ACEITA',
  ignorar_sugestao_whatsapp: 'WHATSAPP_SUGESTAO_IGNORADA', associar_whatsapp: 'WHATSAPP_ASSOCIAR',
  enviar_whatsapp: 'WHATSAPP_ENFILEIRAR', reenviar_whatsapp: 'WHATSAPP_REENFILEIRAR'
};
const ATRASO_MS = Number(process.env.MOCK_ATRASO_MS) || 0;
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const agoraIso = () => new Date().toISOString();
const diaIso = (deslocDias = 0) => new Date(Date.now() + deslocDias * 86_400_000).toISOString().slice(0, 10);

// ---------- estado em memória ----------
const item = (id, nome, un, falta, extra = {}) => ({
  id, nome, cor: '', un, necessaria: falta + (extra.separada ?? 0), separada: 0, falta, faltaG: null, baixada: 0,
  restaG: null, obsAlmox: '', obsPcp: '', previsao: '', resolvidoEm: '', versao: '', status: 'ABERTO', posSaida: false, ...extra
});
const caixa = (os, ciclo, tipo, peca, cliente, responsavel, itens, extra = {}) => ({
  dealId: String(700000 + (os - 90000)), os: String(os), ciclo, tipo, referencia: `REF-0${os - 90000}`, peca, cliente,
  responsavel, registradoEm: diaIso(-20), saiu: false, saiuComFalta: false, saiuEm: '', previsao: '', observacao: '',
  versao: '', historico: [], itens, ...extra
});
const hist = (dias, usuario, texto) => ({ quando: new Date(Date.now() - dias * 86_400_000).toISOString(), usuario, texto, criadoMs: 0 });

const estado = {
  caixas: [
    caixa(90001, 'PEDIDO', 'ACABAMENTO', 'PECA TESTE A', 'CLIENTE ALFA', 'Maria', [
      item('a1', 'LINHA 120 RESISTENTE 335', 'cones', 4, { cor: 'amora', faltaG: 200, separada: 2, status: 'PARCIAL', previsao: diaIso(3) }),
      item('a2', 'TAG CUIDADOS PADRAO', 'UN', 30, { obsAlmox: 'fornecedor confirmou envio' }),
      item('a3', 'ETIQUETA COMPOSICAO', 'UN', 26, { baixada: 26, status: 'RESOLVIDO', resolvidoEm: diaIso(-3) })
    ], { historico: [hist(5, 'Maria', 'Maria deu baixa de 26 UN de ETIQUETA COMPOSICAO (resta 0 UN)')] }),
    caixa(90002, 'CORTE', 'COSTURA', 'PECA TESTE B', 'CLIENTE BETA', 'Lucca', [
      item('b1', 'ZIPER METAL MEDIO FIXO CA 18CM', 'UN', 52)
    ]),
    caixa(90002, 'PEDIDO', 'ACABAMENTO', 'PECA TESTE B', 'CLIENTE BETA', 'Lucca', [
      item('b2', 'BOTAO TESTE ACABAMENTO', 'UN', 80)
    ]),
    caixa(90003, 'CORTE', 'COSTURA', 'PECA TESTE C', 'CLIENTE GAMA', '', [
      item('c1', 'VIES LINEAR 6 CM', 'MT', 450)
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-19) }),
    caixa(90004, 'PEDIDO', 'ACABAMENTO', 'PECA TESTE D', 'CLIENTE ALFA', 'Renata', [
      item('d1', 'TECIDO FORRO BEGE', 'MT', 30),
      item('d2', 'BOTAO MADREPEROLA 15MM', 'UN', 120)
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-9) }),
    caixa(90005, 'PEDIDO', 'COSTURA', 'PECA TESTE E', 'CLIENTE BETA', 'Maria', [
      item('e1', 'FITA GROSGRAIN 25MM', 'MT', 300, { baixada: 120, status: 'PARCIAL' })
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-6),
      historico: [hist(1, 'Renata', 'Renata dividiu PED-0003: 120 MT de FITA GROSGRAIN 25MM foram para PED-0003.1 (Enviado ao destino final) e deu baixa: 120 MT de FITA GROSGRAIN 25MM (resta 180 MT)')] }),
    caixa(90006, 'PEDIDO', 'ACABAMENTO', 'PECA TESTE F', 'CLIENTE GAMA', 'Lucca', [
      item('f1', 'ELASTICO CHATO 30MM', 'MT', 80, { separada: 20, baixada: 80, status: 'RESOLVIDO', resolvidoEm: diaIso(-3) })
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-4) }),
    caixa(90007, 'CORTE', 'COSTURA', 'PECA TESTE G', 'CLIENTE ALFA', 'Renata', [
      item('g1', 'BOTAO PRESSAO 12MM', 'UN', 200, { baixada: 200, status: 'RESOLVIDO', resolvidoEm: diaIso(-1) }),
      item('g2', 'ENTRETELA FINA', 'MT', 15, { baixada: 15, status: 'RESOLVIDO', resolvidoEm: diaIso(-1) })
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-2),
      historico: [hist(1, 'Renata', 'Renata moveu PED-0007 para Enviado ao destino final e deu baixa: 200 UN de BOTAO PRESSAO 12MM (resta 0 UN); 15 MT de ENTRETELA FINA (resta 0 MT)')] }),
    caixa(90008, 'PEDIDO', 'COSTURA', 'PECA TESTE H', 'CLIENTE BETA', 'Maria', [
      item('h1', 'LINHA 80 POLIESTER', 'cones', 6, { baixada: 6, status: 'RESOLVIDO', resolvidoEm: diaIso(-5) })
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-12) })
  ],
  etapas: [
    { id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Solicitado' }, { id: 'aguardando', nome: 'Aguardando entrega' },
    { id: 'entregue', nome: 'Enviado ao destino final' }, { id: 'concluido', nome: 'Concluído' }
  ].filter((e) => !(process.env.MOCK_ETAPAS_ANTIGAS && e.id === 'concluido')),
  pedidos: [
    { id: 'PED-0001', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'SAO_PAULO', previsao: diaIso(6), responsavel: 'Renata', criadoEm: diaIso(-5), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'd1', dealId: '700004', qtd: 20, fornecedor: 'TECIDOS BETA', previsao: '' }, { itemId: 'a2', dealId: '700001', qtd: 30, fornecedor: '', previsao: diaIso(12) }] },
    { id: 'PED-0002', etapa: 'aguardando', origem: 'CLIENTE', quem: 'CLIENTE BETA', local: 'BRAGANCA', previsao: diaIso(10), responsavel: 'Lucca', criadoEm: diaIso(-4), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'b1', dealId: '700002', qtd: 52, fornecedor: '' }] },
    // já dividido: 120 MT chegaram e viraram o PED-0003.1; o PED-0003 espera os outros 180 MT
    { id: 'PED-0003', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'AVIAMENTOS DELTA', local: 'BRAGANCA', previsao: diaIso(-1), responsavel: 'Gi', criadoEm: diaIso(-8), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'e1', dealId: '700005', qtd: 180, fornecedor: 'AVIAMENTOS DELTA' }] },
    { id: 'PED-0003.1', pai: 'PED-0003', etapa: 'entregue', origem: 'FORNECEDOR', quem: 'AVIAMENTOS DELTA', local: 'BRAGANCA', previsao: diaIso(-1), responsavel: 'Gi', criadoEm: diaIso(-1), baixadoEm: diaIso(-1), versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'e1', dealId: '700005', qtd: 120, fornecedor: 'AVIAMENTOS DELTA' }] },
    { id: 'PED-0004', etapa: 'concluido', origem: 'CLIENTE', quem: 'CLIENTE ALFA', local: 'BRAGANCA', previsao: diaIso(-6), responsavel: 'Gi', criadoEm: diaIso(-12), baixadoEm: diaIso(-3), concluidoEm: diaIso(-2), versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'a3', dealId: '700001', qtd: 26, fornecedor: '' }] },
    // material da 90006 e da 90007: já em Enviado ao destino final, com a baixa dada
    { id: 'PED-0006', etapa: 'entregue', origem: 'FORNECEDOR', quem: 'AVIAMENTOS DELTA', local: 'BRAGANCA', previsao: diaIso(-3), responsavel: 'Lucca', criadoEm: diaIso(-6), baixadoEm: diaIso(-3), versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'f1', dealId: '700006', qtd: 80, fornecedor: '' }] },
    { id: 'PED-0007', etapa: 'entregue', origem: 'CLIENTE', quem: 'CLIENTE ALFA', local: 'SAO_PAULO', previsao: diaIso(-1), responsavel: 'Renata', criadoEm: diaIso(-3), baixadoEm: diaIso(-1), versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'g1', dealId: '700007', qtd: 200, fornecedor: '' }, { itemId: 'g2', dealId: '700007', qtd: 15, fornecedor: '' }] },
    // etapa que saiu do quadro: aparece na coluna Outra etapa até ser movido
    { id: 'PED-0005', etapa: 'conferencia', origem: 'FORNECEDOR', quem: 'AVIAMENTOS DELTA', local: 'BRAGANCA', previsao: diaIso(4), responsavel: 'Renata', criadoEm: diaIso(-15), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'd2', dealId: '700004', qtd: 120, fornecedor: '' }] }
  ],
  // caixa 90002 fica de fora para mostrar a visão somente leitura
  dealsEditaveis: ['700001', '700003', '700004', '700005', '700006', '700007', '700008'],
  dealsProducaoEditaveis: ['700002', '700003', '700005', '700011'],
  anotacoes: [{ id: 'ANOT-0', quando: new Date(Date.now() - 2 * 86_400_000).toISOString(), usuario: 'Renata', texto: 'Renata anotou: "Cliente confirmou a cor do viés."', dealId: '700002', os: '90002', criadoMs: 0 }],
  oficinas: [
    { ploomesId: 'OF-01', nome: 'OFICINA SOL', grupoConfigurado: true, grupoNome: 'PRODUCAO · OFICINA SOL', capacidadeSemana: 300 },
    { ploomesId: 'OF-02', nome: 'OFICINA LUA', grupoConfigurado: false, grupoNome: '', capacidadeSemana: null }
  ],
  mensagensWhatsappSemAssociacao: [{
    id: 'MSG-SEM-1', quando: new Date(Date.now() - 900_000).toISOString(), participanteNome: 'Pessoa da oficina',
    direcao: 'RECEBIDA', texto: 'As duas ordens ficam prontas na sexta.', associacao: 'SEM_ASSOCIACAO',
    statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: 'OF-01', oficina: 'OFICINA SOL', grupoNome: 'PRODUCAO · OFICINA SOL'
  }, {
    id: 'MSG-SEM-2', quando: new Date(Date.now() - 600_000).toISOString(), participanteNome: 'Pessoa da oficina',
    direcao: 'RECEBIDA', texto: `A PECA TESTE B fica pronta dia ${diaIso(6).slice(8, 10)}/${diaIso(6).slice(5, 7)}.`, associacao: 'SEM_ASSOCIACAO',
    statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: 'OF-01', oficina: 'OFICINA SOL', grupoNome: 'PRODUCAO · OFICINA SOL'
  }, {
    // Associador por IA (22/10): a IA ficou em dúvida e perguntou à oficina.
    id: 'MSG-DUVIDA-1', quando: new Date(Date.now() - 300_000).toISOString(), participanteNome: 'Pessoa da oficina',
    direcao: 'RECEBIDA', texto: 'Essa vai atrasar uns dias.', associacao: 'IA_DUVIDA', perguntado: true,
    statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: 'OF-01', oficina: 'OFICINA SOL', grupoNome: 'PRODUCAO · OFICINA SOL'
  }],
  producao: [
    { dealId: '700003', os: '90003', oficinaId: '', oficina: 'ALOCAR', inicioCostura: diaIso(-8), dataCombinada: diaIso(-2), leadTime: diaIso(1), pecas: 80, valorCorte: 7200, cliente: 'CLIENTE GAMA', peca: 'PECA TESTE C', referencia: 'REF-03', versao: 'v1', mensagens: [], sugestoes: [], historico: [] },
    {
      dealId: '700002', os: '90002', oficinaId: 'OF-01', oficina: 'OFICINA SOL', inicioCostura: diaIso(-3), dataCombinada: diaIso(4), leadTime: diaIso(7), pecas: 160, valorCorte: 15840.5, cliente: 'CLIENTE BETA', peca: 'PECA TESTE B', referencia: 'REF-02', versao: 'v2',
      mensagens: [
        { id: 'MSG-ERRO-1', quando: new Date(Date.now() - 4_200_000).toISOString(), participanteNome: 'PCP Teste', direcao: 'ENVIADA', texto: 'Olá. Pode confirmar a data de entrega de *PECA TESTE B*?', associacao: 'MANUAL', statusEnvio: 'ERRO', tipoConteudo: 'TEXTO' },
        { id: 'MSG-2', quando: new Date(Date.now() - 3_600_000).toISOString(), participanteNome: 'PCP Teste', direcao: 'ENVIADA', texto: 'Olá. A entrega de *PECA TESTE B* segue para esta semana?', associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO' },
        { id: 'MSG-1', quando: new Date(Date.now() - 1_800_000).toISOString(), participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: `Conseguimos entregar dia ${diaIso(3).slice(8, 10)}/${diaIso(3).slice(5, 7)}.`, associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'TEXTO' },
        { id: 'MSG-IA-1', quando: new Date(Date.now() - 1_000_000).toISOString(), participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'A camisa sai amanhã cedo.', associacao: 'IA', associacaoMotivo: 'A oficina fala da PECA TESTE B.', statusEnvio: '', tipoConteudo: 'TEXTO' }
      ],
      sugestoes: [{ id: 'SUG-1', mensagemId: 'MSG-1', tipo: 'NOVA_DATA_COMBINADA', valor: diaIso(3), resumo: 'A oficina informou nova data de entrega.', evidencia: `entregar dia ${diaIso(3).slice(8, 10)}/${diaIso(3).slice(5, 7)}`, confianca: .94, status: 'PENDENTE', criadoEm: new Date(Date.now() - 1_700_000).toISOString(), versao: 'v2' }],
      historico: [{ quando: new Date(Date.now() - 2 * 86_400_000).toISOString(), usuario: 'PCP Teste', texto: 'Data combinada ajustada após contato com a oficina.', ploomes: 'ENVIADO' }]
    },
    { dealId: '700005', os: '90005', oficinaId: 'OF-02', oficina: 'OFICINA LUA', inicioCostura: diaIso(2), dataCombinada: '', leadTime: diaIso(12), pecas: 95, valorCorte: 8550, cliente: 'CLIENTE BETA', peca: 'PECA TESTE E', referencia: 'REF-05', versao: 'v1', mensagens: [], sugestoes: [], historico: [] },
    { dealId: '700008', os: '90008', oficinaId: 'OF-01', oficina: 'OFICINA SOL', inicioCostura: '', dataCombinada: diaIso(18), leadTime: diaIso(20), pecas: 45, valorCorte: 4050, cliente: 'CLIENTE BETA', peca: 'PECA TESTE H', referencia: 'REF-08', versao: 'v1',
      // Novas tentativas (16/10): envio que ainda não saiu e resposta que o intérprete não conseguiu ler.
      mensagens: [
        { id: 'MSG-H-SEM-LEITURA', quando: new Date(Date.now() - 2_400_000).toISOString(), participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA', texto: 'Vou ver com a costureira e já aviso.', associacao: 'CITACAO', statusEnvio: '', tipoConteudo: 'TEXTO', interpretacao: 'ERRO' },
        { id: 'MSG-H-FILA', quando: new Date(Date.now() - 1_200_000).toISOString(), participanteNome: 'PCP Teste', direcao: 'ENVIADA', texto: 'Olá. A entrega de *PECA TESTE H*, 45 peças, está prevista para a data combinada. Segue dentro do prazo?', associacao: 'MANUAL', statusEnvio: 'PENDENTE', tipoConteudo: 'TEXTO', envioTentativas: 2 }
      ], sugestoes: [], historico: [] },
    // Segunda OS editável da OFICINA SOL (22/10): destino do "Trocar OS".
    { dealId: '700011', os: '90011', oficinaId: 'OF-01', oficina: 'OFICINA SOL', inicioCostura: diaIso(-1), dataCombinada: diaIso(9), leadTime: diaIso(10), pecas: 30, valorCorte: 2700, cliente: 'CLIENTE GAMA', peca: 'PECA TESTE K', referencia: 'REF-11', versao: 'v1', mensagens: [], sugestoes: [], historico: [] },
    // OS previstas (19/10): ainda nas etapas 12 a 16; a Costura projetada vem do servidor.
    { dealId: '700009', os: '90009', oficinaId: 'OF-01', oficina: 'OFICINA SOL', inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 200, valorCorte: null, cliente: 'CLIENTE GAMA', peca: 'PECA TESTE I', referencia: 'REF-09', versao: 'v1',
      prevista: true, etapaOrdem: 15, etapaNome: '15. Preparação 1', etapaInicio: diaIso(-1), inicioCosturaPrevisto: diaIso(5), fimCosturaPrevisto: diaIso(12), mensagens: [], sugestoes: [], historico: [] },
    { dealId: '700010', os: '90010', oficinaId: '', oficina: 'ALOCAR', inicioCostura: '', dataCombinada: '', leadTime: '', pecas: 120, valorCorte: null, cliente: 'CLIENTE ALFA', peca: 'PECA TESTE J', referencia: 'REF-10', versao: 'v1',
      prevista: true, etapaOrdem: 13, etapaNome: '13. Estratégico 2', etapaInicio: '', inicioCosturaPrevisto: diaIso(9), fimCosturaPrevisto: diaIso(15), mensagens: [], sugestoes: [], historico: [] }
  ],
  // MOCK_SEM_HISTORICO=1 simula a PREVISAO_MEDIAS ainda vazia.
  previsaoSemHistorico: !!process.env.MOCK_SEM_HISTORICO
};

// ---------- utilidades ----------
class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new Erro(400, m);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const fmtNum = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
// Como o servidor (lerEtapas): sem a etapa `concluido` (aba antiga de 4 linhas), entra uma
// Concluído virtual no fim. MOCK_ETAPAS_ANTIGAS=1 começa com a aba antiga.
const etapas = () => (estado.etapas.some((e) => e.id === 'concluido') ? estado.etapas : [...estado.etapas, { id: 'concluido', nome: 'Concluído' }]);
const etapaFinal = () => etapas()[etapas().length - 1];
const etapaDaBaixa = () => etapas()[etapas().length - 2];
const nomeEtapa = (id) => etapas().find((e) => e.id === id)?.nome ?? id;
// Concluído também o pedido que a API antiga levou para a última etapa (a baixa era lá, sem concluido_em).
const concluidoEm = (p) => p.concluidoEm || (p.etapa === etapaFinal().id && p.baixadoEm ? p.baixadoEm : '');
const resta = (it) => Math.max(0, it.falta - it.baixada);
const aberto = (it) => it.status !== 'RESOLVIDO' && resta(it) > 0;
// Modo foto: MOCK_FOTO aponta para um JSON (fora do repositório, que é público) com
// { producao, oficinas, caixas } montado pelas funções do servidor a partir de uma
// leitura real. As gravações continuam só na memória; o WhatsApp segue fictício.
if (process.env.MOCK_FOTO) {
  const foto = JSON.parse(readFileSync(process.env.MOCK_FOTO, 'utf8'));
  estado.caixas = foto.caixas;
  estado.pedidos = [];
  estado.dealsEditaveis = foto.caixas.map((c) => c.dealId);
  estado.producao = foto.producao.map(({ faltasCostura, faltasAcabamento, ...p }) => ({ ...p, mensagens: [], sugestoes: [], historico: [] }));
  // As previstas (etapas 12 a 16) vêm na foto com a projeção do servidor; só as da Costura ficam editáveis.
  estado.dealsProducaoEditaveis = estado.producao.filter((p) => !p.prevista).map((p) => p.dealId);
  estado.oficinas = foto.oficinas;
  estado.previsaoSemHistorico = !!foto.previsaoSemHistorico;
  const comOficina = estado.producao.find((p) => !p.prevista && p.oficinaId && p.oficina.toUpperCase() !== 'ALOCAR');
  estado.mensagensWhatsappSemAssociacao = comOficina ? [{
    id: 'MSG-SEM-FOTO', quando: new Date(Date.now() - 600_000).toISOString(), participanteNome: 'Pessoa da oficina (simulada)',
    direcao: 'RECEBIDA', texto: `A ${comOficina.peca} fica pronta dia ${diaIso(5).slice(8, 10)}/${diaIso(5).slice(5, 7)}.`,
    associacao: 'SEM_ASSOCIACAO', statusEnvio: '', tipoConteudo: 'TEXTO', oficinaId: comOficina.oficinaId,
    oficina: comOficina.oficina, grupoNome: `GRUPO SIMULADO · ${comOficina.oficina}`
  }] : [];
  const previstas = estado.producao.filter((p) => p.prevista).length;
  console.log(`[mock] foto carregada: ${estado.producao.length} OS (${previstas} previstas), ${estado.caixas.length} caixas (geradoEm ${foto.geradoEm})`);
}

const caixaDe = (dealId) => estado.caixas.find((c) => c.dealId === dealId);
const editavel = (dealId) => estado.dealsEditaveis.includes(dealId);
const itemDe = (dealId, itemId) => caixaDe(dealId)?.itens.find((i) => i.id === itemId);
// "Pedido acompanha o corte" (n8n/src/pedidos.js): no servidor o item do pedido já vem como o do
// CORTE. Item do pedido que não está mais na caixa = saiu no corte sem correspondente (itemMudou):
// usa o nome/unidade guardados no pedido, não recebe baixa e a quantidade dele não muda.
const itemDoPedido = (pi) => itemDe(pi.dealId, pi.itemId) ?? { nome: pi.nome ?? '', un: pi.un ?? '', mudou: true };
const textoItemMudou = (nome) => `${nome} mudou no corte e não tem correspondente`;
// Pedido PED-nnnn ou parte PED-nnnn.k (dividir pedido); itens com qtd 0 foram todos para uma parte.
const numPedido = (id) => parseInt(id.slice(4), 10);
const raizDoPedido = (id) => id.split('.')[0];
const parteDoPedido = (id) => Number(id.split('.')[1] ?? 0);
// Previsão que vale para o item do pedido: a dele ou, vazia, a do pedido.
const previsaoDoItem = (p, i) => i.previsao || p.previsao || '';
const previsoesDistintas = (p) => [...new Set(itensValidos(p).map((i) => previsaoDoItem(p, i)))]
  .sort((a, b) => (a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a < b ? -1 : 1));
const compararPedidos = (a, b) => numPedido(a.id) - numPedido(b.id) || parteDoPedido(a.id) - parteDoPedido(b.id);
const itensValidos = (p) => p.itens.filter((i) => i.qtd !== 0);
const pedidosAbertosDoItem = (dealId, itemId) => [...estado.pedidos].sort(compararPedidos)
  .filter((p) => !p.baixadoEm && itensValidos(p).some((i) => i.dealId === dealId && i.itemId === itemId));
const pedidoAbertoDoItem = (dealId, itemId) => pedidosAbertosDoItem(dealId, itemId)[0];
const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slug = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'etapa';
const chaveNome = (s) => semAcento(s).trim().toLowerCase();
const LOCAIS = { BRAGANCA: 'Bragança', SAO_PAULO: 'São Paulo', OFICINA: 'Oficina', CLIENTE: 'Cliente' };
const nomeLocal = (l) => LOCAIS[l] ?? l;
// Fornecedor (ou cliente) e responsável obrigatórios, como no servidor (n8n/src/pedidos.js).
const erroQuemVazio = (origem) => (origem === 'CLIENTE' ? 'Informe o cliente.' : 'Informe o fornecedor.');

function exigirEditavel(dealIds) {
  for (const d of dealIds) if (!editavel(d)) throw new Erro(403, 'Edição liberada em breve para esta caixa.');
}
// alvo: 'esta caixa' (caixa e item) ou 'este pedido', como no servidor (n8n/src/pedidos.js).
function conferirVersao(atual, enviada, alvo = 'esta caixa') {
  if ((atual ?? '') !== (enviada ?? '')) throw new Erro(409, `Alguém alterou ${alvo} agora há pouco.`);
}
function validarData(v) {
  if (v === '' || v === undefined) return;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad('Data inválida.');
}
function validarDadosPedido(c) {
  if (c.origem !== 'FORNECEDOR' && c.origem !== 'CLIENTE') throw bad('Origem inválida.');
  if (!LOCAIS[c.local]) throw bad('Local inválido.');
  validarData(c.previsao);
  if (!String(c.quem ?? '').trim()) throw bad(erroQuemVazio(c.origem));
  if (!String(c.responsavel ?? '').trim()) throw bad('Informe o responsável.');
}

function registrar(dealId, usuario, texto, historicos) {
  const h = { id: `HIST-${++seqHistorico}`, acao: acaoAtual, quando: agoraIso(), usuario, texto, criadoMs: Date.now() };
  caixaDe(dealId).historico.push(h);
  historicos.push({ quando: h.quando, usuario, texto, ploomes: 'PENDENTE', dealId });
}
function statusItem(it) {
  it.status = resta(it) <= 0 ? 'RESOLVIDO' : it.baixada > 0 || it.separada > 0 ? 'PARCIAL' : 'ABERTO';
  it.resolvidoEm = it.status === 'RESOLVIDO' ? diaIso() : '';
}
function darBaixa(it, qtd) { it.baixada += qtd; it.versao = agoraIso(); statusItem(it); }

// ---------- board ----------
function montarBoard() {
  const agora = Date.now();
  return {
    geradoEm: agoraIso(),
    avisos: [],
    usuarios: USUARIOS,
    dealsEditaveis: estado.dealsEditaveis,
    dealsProducaoEditaveis: estado.dealsProducaoEditaveis,
    oficinas: estado.oficinas,
    previsaoSemHistorico: estado.previsaoSemHistorico,
    anotacoes: estado.anotacoes.map(({ criadoMs, ...a }) => ({ ...a, ploomes: criadoMs && agora - criadoMs < ENVIO_PLOOMES_MS ? 'PENDENTE' : 'ENVIADO' })),
    mensagensWhatsappSemAssociacao: estado.mensagensWhatsappSemAssociacao,
    producao: estado.producao.map((p) => ({
      ...p,
      historico: p.historico.map(({ criadoMs, ...h }) => (criadoMs ? { ...h, ploomes: agora - criadoMs < ENVIO_PLOOMES_MS ? 'PENDENTE' : 'ENVIADO' } : h)),
      // Como o servidor (n8n/src/producao.js, mensagensDaProducao): mais nova primeiro.
      mensagens: [...p.mensagens].sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0)),
      // Como no servidor: o card da Produção é outro negócio; as caixas se ligam pela OS.
      faltasCostura: estado.caixas.filter((c) => c.os === p.os && c.tipo === 'COSTURA')
        .flatMap((c) => c.itens.filter((i) => aberto(i)).map((i) => ({
          ...i, resta: resta(i), restaG: i.faltaG === null ? null : Math.round((resta(i) / i.falta) * i.faltaG),
          editavel: true, pedidoIds: pedidosAbertosDoItem(c.dealId, i.id).map((x) => x.id), pedidoId: pedidoAbertoDoItem(c.dealId, i.id)?.id ?? ''
        }))),
      faltasAcabamento: estado.caixas.filter((c) => c.os === p.os && c.tipo === 'ACABAMENTO')
        .flatMap((c) => c.itens.filter((i) => aberto(i)).map((i) => ({
          ...i, resta: resta(i), restaG: i.faltaG === null ? null : Math.round((resta(i) / i.falta) * i.faltaG),
          editavel: true, pedidoIds: pedidosAbertosDoItem(c.dealId, i.id).map((x) => x.id), pedidoId: pedidoAbertoDoItem(c.dealId, i.id)?.id ?? ''
        })))
    })),
    etapasPedido: etapas().map((e, i) => ({ ...e, ordem: i + 1 })),
    fornecedores: ativos(FORNECEDORES),
    responsaveis: ativos(RESPONSAVEIS),
    pedidos: [...estado.pedidos].sort(compararPedidos).map((p) => ({
      ...p,
      pai: p.pai ?? '',
      concluidoEm: concluidoEm(p),
      finalizado: !!concluidoEm(p),
      previsaoMaisProxima: previsoesDistintas(p)[0] || p.previsao,
      previsoesDiferentes: previsoesDistintas(p).length > 1,
      itens: itensValidos(p).map((i) => {
        const it = itemDoPedido(i);
        return { ...i, previsao: previsaoDoItem(p, i), os: caixaDe(i.dealId).os, nome: it.nome, un: it.un, ...(it.mudou ? { itemMudou: true } : {}) };
      })
    })),
    caixas: estado.caixas.map((c) => ({
      ...c,
      id: c.dealId,
      historico: c.historico.map((h) => ({
        ...(h.id ? { id: h.id } : {}), ...(h.acao ? { acao: h.acao } : {}),
        quando: h.quando, usuario: h.usuario, texto: h.texto,
        ploomes: h.criadoMs && agora - h.criadoMs < ENVIO_PLOOMES_MS ? 'PENDENTE' : 'ENVIADO'
      })),
      itens: c.itens.map((i) => ({
        ...i, resta: resta(i), restaG: i.faltaG === null ? null : Math.round((resta(i) / i.falta) * i.faltaG),
        // como o servidor (n8n/src/montarCaixas.js): todo item da FALTANTES é editável; quem
        // decide se a caixa aceita edição é dealsEditaveis, e o site trata o item resolvido
        editavel: true,
        pedidoIds: pedidosAbertosDoItem(c.dealId, i.id).map((p) => p.id),
        pedidoId: pedidoAbertoDoItem(c.dealId, i.id)?.id ?? ''
      }))
    }))
  };
}

// ---------- ações ----------
function resposta(versao, historicos, extra = {}) {
  return { ok: true, versao, historico: historicos[0] ?? null, historicos, ...extra };
}
function acaoF2(corpo, usuario) {
  const historicos = [];
  const c = caixaDe(corpo.dealId);
  if (!c) throw new Erro(404, 'Caixa não encontrada.');
  exigirEditavel([c.dealId]);
  const agora = agoraIso();
  const t = corpo.tipo;
  if (t === 'baixa' || t === 'previsao_item' || t === 'obs_item') {
    const it = c.itens.find((i) => i.id === corpo.itemId);
    if (!it) throw new Erro(409, 'Item não encontrado.');
    conferirVersao(it.versao, corpo.versao);
    if (t === 'baixa') {
      if (!num(corpo.valor) || corpo.valor <= 0) throw bad('Informe uma quantidade maior que zero');
      if (corpo.valor > resta(it)) throw bad(`Falta só ${fmtNum(resta(it))} ${it.un} de ${it.nome}`);
      darBaixa(it, corpo.valor);
      registrar(c.dealId, usuario, `${usuario} deu baixa de ${fmtNum(corpo.valor)} ${it.un} de ${it.nome} (resta ${fmtNum(resta(it))} ${it.un})`, historicos);
    } else if (t === 'previsao_item') {
      validarData(corpo.valor); it.previsao = corpo.valor; it.versao = agora;
      registrar(c.dealId, usuario, `${usuario} alterou a previsão de ${it.nome} para ${ddmm(corpo.valor)}`, historicos);
    } else {
      it.obsPcp = String(corpo.valor ?? ''); it.versao = agora;
      registrar(c.dealId, usuario, `${usuario} anotou em ${it.nome}: ${it.obsPcp}`, historicos);
    }
    return resposta(it.versao, historicos);
  }
  conferirVersao(c.versao, corpo.versao);
  if (t === 'responsavel') {
    if (corpo.valor !== '' && !USUARIOS.includes(corpo.valor)) throw bad('Responsável inválido.');
    c.responsavel = corpo.valor;
    registrar(c.dealId, usuario, `${usuario} definiu o responsável: ${corpo.valor || '—'}`, historicos);
  } else if (t === 'previsao_caixa') {
    validarData(corpo.valor); c.previsao = corpo.valor;
    registrar(c.dealId, usuario, `${usuario} alterou a previsão da caixa para ${ddmm(corpo.valor)}`, historicos);
  } else {
    c.observacao = String(corpo.valor ?? '');
    registrar(c.dealId, usuario, `${usuario} anotou na caixa: ${c.observacao}`, historicos);
  }
  c.versao = agora;
  return resposta(c.versao, historicos);
}

function pedidoPorId(id) {
  const p = estado.pedidos.find((x) => x.id === id);
  if (!p) throw new Erro(404, 'Pedido não encontrado.');
  return p;
}
const dealsDe = (p) => [...new Set(itensValidos(p).map((i) => i.dealId))];
// Como o servidor: site antigo aberto numa aba (baixa sem confirmouBaixa, divisão com etapa
// diferente da etapa da baixa) recebe 409 pedindo para recarregar.
const SITE_ANTIGO = 'Atualize a página: o site mudou.';
function exigirSiteNovo(c) {
  const naBaixa = (c.tipo === 'mover_pedido' && c.etapa === etapaDaBaixa().id) || c.tipo === 'baixar_pedido';
  if (naBaixa && c.confirmouBaixa !== true) throw new Erro(409, SITE_ANTIGO);
  if (c.tipo === 'dividir_pedido' && c.etapa !== undefined && c.etapa !== null && c.etapa !== etapaDaBaixa().id) throw new Erro(409, SITE_ANTIGO);
}
// Como o servidor: concluído não muda; com a baixa, só mover para a etapa final.
function pedidoAlteravel(p, corpo) {
  exigirEditavel(dealsDe(p));
  if (concluidoEm(p)) throw new Erro(409, 'Pedido finalizado não pode ser alterado.');
  const final = etapaFinal();
  if (p.baixadoEm && !(corpo.tipo === 'mover_pedido' && corpo.etapa === final.id)) throw new Erro(409, `Pedido com baixa só pode ir para ${final.nome}.`);
}

function gerarPedido(c, usuario) {
  if (!Array.isArray(c.itens) || c.itens.length === 0) throw bad('Selecione ao menos um item.');
  exigirEditavel(c.itens.map((i) => i.dealId));
  validarDadosPedido(c);
  const vistos = new Set();
  for (const i of c.itens) {
    const chave = `${i.dealId}|${i.itemId}`;
    if (vistos.has(chave)) throw bad('Item repetido no pedido.');
    vistos.add(chave);
    const it = itemDe(i.dealId, i.itemId);
    if (!it || it.status === 'RESOLVIDO') throw new Erro(409, 'Item não encontrado.');
    const p = pedidoAbertoDoItem(i.dealId, i.itemId);
    if (p) throw new Erro(409, `Item já está no ${p.id}.`);
    if (!num(i.qtd) || i.qtd <= 0) throw bad('Informe uma quantidade maior que zero');
    if (resta(it) <= 0) throw bad('Item sem quantidade faltante registrada.');
    if (i.qtd > resta(it)) throw bad(`Falta só ${fmtNum(resta(it))} ${it.un} de ${it.nome}`);
    validarData(i.previsao);
  }
  const n = Math.max(0, ...estado.pedidos.map((p) => numPedido(p.id))) + 1;
  const id = `PED-${String(n).padStart(4, '0')}`;
  const versao = agoraIso();
  estado.pedidos.push({
    id, etapa: estado.etapas[0].id, origem: c.origem, quem: c.quem ?? '', local: c.local, previsao: c.previsao ?? '',
    responsavel: c.responsavel ?? '', criadoEm: diaIso(), baixadoEm: '', versao,
    itens: c.itens.map((i) => ({ itemId: i.itemId, dealId: i.dealId, qtd: i.qtd, fornecedor: i.fornecedor ?? '', previsao: i.previsao ?? '' }))
  });
  const historicos = [];
  const porDeal = new Map();
  for (const i of c.itens) porDeal.set(i.dealId, (porDeal.get(i.dealId) ?? 0) + 1);
  const quem = `${c.origem === 'CLIENTE' ? 'Cliente' : 'Fornecedor'} ${c.quem ?? ''}`.trim();
  for (const [deal, qt] of porDeal) registrar(deal, usuario, `${usuario} gerou ${id} · ${qt} ${qt === 1 ? 'item' : 'itens'} desta OS · ${quem}`, historicos);
  return resposta(versao, historicos, { pedidoId: id });
}

function editarPedido(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoAlteravel(p, c);
  conferirVersao(p.versao, c.versao, 'este pedido');
  const campos = c.campos ?? {};
  if ('etapa' in campos) throw bad('Para mudar a etapa, arraste o card.');
  const porDeal = new Map();
  const add = (d, t) => porDeal.set(d, [...(porDeal.get(d) ?? []), t]);
  const comuns = [];
  if ('origem' in campos && campos.origem !== 'FORNECEDOR' && campos.origem !== 'CLIENTE') throw bad('Origem inválida.');
  if ('local' in campos && !LOCAIS[campos.local]) throw bad('Local inválido.');
  if ('previsao' in campos) validarData(campos.previsao);
  const rot = { origem: 'Origem', quem: 'Quem', local: 'Local', previsao: 'Previsão', responsavel: 'Responsável' };
  const fmt = (k, v) => {
    if (v === '' || v == null) return '—';
    if (k === 'local') return nomeLocal(v);
    if (k === 'origem') return v === 'CLIENTE' ? 'Cliente' : 'Fornecedor';
    return k === 'previsao' ? ddmm(v) : v;
  };
  const antes = { ...p };
  const novos = {};
  for (const k of Object.keys(rot)) {
    if (!(k in campos) || (campos[k] ?? '') === (p[k] ?? '')) continue;
    // não deixa limpar o fornecedor/cliente nem o responsável
    if (k === 'quem' && !String(campos.quem ?? '').trim()) throw bad(erroQuemVazio(campos.origem ?? p.origem));
    if (k === 'responsavel' && !String(campos.responsavel ?? '').trim()) throw bad('Informe o responsável.');
    comuns.push(`${rot[k]}: ${fmt(k, antes[k])} → ${fmt(k, campos[k])}`);
    novos[k] = campos[k] ?? '';
  }
  const novosItens = [];
  for (const m of c.itens ?? []) {
    const pi = p.itens.find((i) => i.itemId === m.itemId);
    if (!pi) throw bad('Item não está no pedido.');
    const it = itemDoPedido(pi);
    if (m.qtd !== undefined) {
      if (!num(m.qtd) || m.qtd <= 0) throw bad('Informe uma quantidade maior que zero');
      if (it.mudou && m.qtd !== pi.qtd) throw new Erro(409, `${textoItemMudou(it.nome)}: a quantidade não pode mudar.`);
      if (m.qtd > resta(it)) throw bad(`Falta só ${fmtNum(resta(it))} ${it.un} de ${it.nome}`);
      if (m.qtd !== pi.qtd) { add(pi.dealId, `qtd de ${it.nome}: ${pi.qtd == null ? '—' : fmtNum(pi.qtd)} → ${fmtNum(m.qtd)}`); novosItens.push([pi, 'qtd', m.qtd]); }
    }
    if (m.fornecedor !== undefined && m.fornecedor !== pi.fornecedor) {
      add(pi.dealId, `fornecedor de ${it.nome}: ${pi.fornecedor || '—'} → ${m.fornecedor || '—'}`); novosItens.push([pi, 'fornecedor', m.fornecedor]);
    }
    if (m.previsao !== undefined) {
      validarData(m.previsao);
      const a = previsaoDoItem(p, pi);
      const d = m.previsao || ('previsao' in novos ? novos.previsao : p.previsao) || '';
      if (a !== d) { add(pi.dealId, `previsão de ${it.nome}: ${ddmm(a)} → ${ddmm(d)}`); novosItens.push([pi, 'previsao', m.previsao]); }
    }
  }
  if (!comuns.length && !porDeal.size) throw bad('Nada alterado.');
  Object.assign(p, novos);
  for (const [pi, k, v] of novosItens) pi[k] = v;
  p.versao = agoraIso();
  const historicos = [];
  for (const d of dealsDe(p)) {
    const partes = [...comuns, ...(porDeal.get(d) ?? [])];
    if (partes.length) registrar(d, usuario, `${usuario} alterou ${p.id}: ${partes.join(', ')}`, historicos);
  }
  return resposta(p.versao, historicos, { pedidoId: p.id });
}

function moverPedido(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoAlteravel(p, c);
  exigirSiteNovo(c);
  conferirVersao(p.versao, c.versao, 'este pedido');
  if (!etapas().some((e) => e.id === c.etapa)) throw bad('Etapa inválida.');
  if (p.etapa === c.etapa) throw bad('O pedido já está nessa etapa.');
  const historicos = [];
  if (c.etapa === etapaFinal().id) {
    // o destino confirmou: só com a baixa dada
    if (!p.baixadoEm) throw bad(`Mova o pedido primeiro para ${etapaDaBaixa().nome}.`);
    p.etapa = c.etapa; p.concluidoEm = diaIso(); p.versao = agoraIso();
    for (const d of dealsDe(p)) registrar(d, usuario, `${usuario} moveu ${p.id} para ${nomeEtapa(c.etapa)}`, historicos);
    return resposta(p.versao, historicos, { pedidoId: p.id });
  }
  p.etapa = c.etapa; p.versao = agoraIso();
  // Entrar na etapa da baixa (Enviado ao destino final) dá a baixa nas caixas; o pedido segue aberto.
  const naBaixa = c.etapa === etapaDaBaixa().id;
  const baixas = naBaixa ? baixarItens(itensValidos(p)) : new Map();
  if (naBaixa) p.baixadoEm = diaIso();
  for (const d of dealsDe(p)) registrar(d, usuario, `${usuario} moveu ${p.id} para ${nomeEtapa(c.etapa)}${textoBaixa(baixas.get(d))}`, historicos);
  return resposta(p.versao, historicos, { pedidoId: p.id });
}

// Baixa de cada item (min(qtd, resta)); devolve dealId -> { feitas: ['20 MT de VIÉS (resta 80 MT)'], mudados: ['LINHA'] }.
function baixarItens(itens) {
  const partes = new Map();
  const de = (d) => partes.get(d) ?? partes.set(d, { feitas: [], mudados: [] }).get(d);
  for (const pi of itens) {
    const it = itemDoPedido(pi);
    if (it.mudou) { de(pi.dealId).mudados.push(it.nome); continue; }
    const q = Math.min(pi.qtd ?? 0, resta(it));
    if (q <= 0) continue;
    darBaixa(it, q);
    de(pi.dealId).feitas.push(`${fmtNum(q)} ${it.un} de ${it.nome} (resta ${fmtNum(resta(it))} ${it.un})`);
  }
  return partes;
}
const textoSemBaixa = (b) => (b?.mudados.length ? ` · sem baixa: ${b.mudados.map(textoItemMudou).join('; ')}` : '');
const textoBaixa = (b) => (b?.feitas.length ? ` e deu baixa: ${b.feitas.join('; ')}` : '') + textoSemBaixa(b);

// Mantido por compatibilidade (o app dá a baixa movendo para a última etapa).
function baixarPedido(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoAlteravel(p, c);
  exigirSiteNovo(c);
  conferirVersao(p.versao, c.versao, 'este pedido');
  if (p.etapa !== etapaDaBaixa().id) throw bad(`Dar baixa só na etapa ${etapaDaBaixa().nome}.`);
  const partes = baixarItens(itensValidos(p));
  p.baixadoEm = diaIso(); p.versao = agoraIso();
  const historicos = [];
  for (const d of dealsDe(p)) {
    const b = partes.get(d);
    registrar(d, usuario, `${usuario} deu baixa do ${p.id}: ${b?.feitas.length ? b.feitas.join('; ') : 'sem itens abertos'}${textoSemBaixa(b)}`, historicos);
  }
  return resposta(p.versao, historicos, { pedidoId: p.id });
}

function dividirPedido(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoAlteravel(p, c);
  exigirSiteNovo(c);
  conferirVersao(p.versao, c.versao, 'este pedido');
  // só de Aguardando entrega (a etapa antes da baixa); a parte já vai para a etapa da baixa
  const de = etapas()[etapas().length - 3];
  if (!de || p.etapa !== de.id) throw bad(`Dividir só com o pedido em ${de ? de.nome : 'Aguardando entrega'}.`);
  const etapa = etapaDaBaixa();
  if (!Array.isArray(c.itens) || c.itens.length === 0) throw bad('Marque ao menos um item que chegou.');
  const vistos = new Set();
  const movidos = [];
  for (const m of c.itens) {
    if (vistos.has(m.itemId)) throw bad('Item repetido no pedido.');
    vistos.add(m.itemId);
    if (!num(m.qtd) || m.qtd <= 0) throw bad('Informe uma quantidade maior que zero');
    const pi = itensValidos(p).find((i) => i.itemId === m.itemId);
    if (!pi) throw bad('Item não está no pedido.');
    const it = itemDoPedido(pi);
    if (m.qtd > pi.qtd) throw bad(`O pedido tem só ${fmtNum(pi.qtd)} ${it.un} de ${it.nome}.`);
    movidos.push({ pi, it, qtd: m.qtd });
  }
  const sobra = itensValidos(p).some((pi) => {
    const m = movidos.find((x) => x.pi === pi);
    return !m || pi.qtd - m.qtd > 0;
  });
  if (!sobra) throw bad('Para mover o pedido inteiro, arraste o card.');
  const raiz = raizDoPedido(p.id);
  const k = Math.max(0, ...estado.pedidos.filter((x) => raizDoPedido(x.id) === raiz).map((x) => parteDoPedido(x.id))) + 1;
  const id = `${raiz}.${k}`;
  const versao = agoraIso();
  const parte = {
    id, pai: raiz, etapa: etapa.id, origem: p.origem, quem: p.quem, local: p.local, previsao: p.previsao, responsavel: p.responsavel,
    criadoEm: diaIso(), baixadoEm: '', versao,
    itens: movidos.map((m) => ({ itemId: m.pi.itemId, dealId: m.pi.dealId, qtd: m.qtd, fornecedor: m.pi.fornecedor, previsao: m.pi.previsao ?? '', nome: m.pi.nome, un: m.pi.un }))
  };
  estado.pedidos.push(parte);
  for (const m of movidos) m.pi.qtd = Math.round((m.pi.qtd - m.qtd) * 1000) / 1000;
  p.versao = versao;
  // parte que vai direto para a etapa da baixa já nasce com a baixa
  const baixas = baixarItens(parte.itens);
  parte.baixadoEm = diaIso();
  const historicos = [];
  const porDeal = new Map();
  for (const m of movidos) porDeal.set(m.pi.dealId, [...(porDeal.get(m.pi.dealId) ?? []), `${fmtNum(m.qtd)} ${m.it.un} de ${m.it.nome}`]);
  for (const [d, partes] of porDeal) registrar(d, usuario, `${usuario} dividiu ${p.id}: ${partes.join('; ')} foram para ${id} (${etapa.nome})${textoBaixa(baixas.get(d))}`, historicos);
  return resposta(versao, historicos, { pedidoId: id });
}

// Uma parte por data de previsão dos itens; a mais próxima fica no pedido.
function dividirPorPrevisao(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoAlteravel(p, c);
  conferirVersao(p.versao, c.versao, 'este pedido');
  const datas = previsoesDistintas(p);
  if (datas.length < 2) throw bad('Os itens têm a mesma previsão.');
  const raiz = raizDoPedido(p.id);
  const versao = agoraIso();
  const ids = [];
  const porDeal = new Map();
  for (const data of datas.slice(1)) {
    const k = Math.max(0, ...estado.pedidos.filter((x) => raizDoPedido(x.id) === raiz).map((x) => parteDoPedido(x.id))) + 1;
    const id = `${raiz}.${k}`;
    ids.push(id);
    const vao = itensValidos(p).filter((i) => previsaoDoItem(p, i) === data);
    estado.pedidos.push({
      id, pai: raiz, etapa: p.etapa, origem: p.origem, quem: p.quem, local: p.local, previsao: data, responsavel: p.responsavel,
      criadoEm: diaIso(), baixadoEm: '', versao, itens: vao.map((i) => ({ ...i }))
    });
    for (const i of vao) {
      const it = itemDoPedido(i);
      porDeal.set(i.dealId, [...(porDeal.get(i.dealId) ?? []), `${fmtNum(i.qtd)} ${it.un} de ${it.nome} foram para ${id} (${data ? `previsão ${ddmm(data)}` : 'sem previsão'})`]);
      i.qtd = 0;
    }
  }
  p.versao = versao;
  const historicos = [];
  for (const [d, partes] of porDeal) registrar(d, usuario, `${usuario} dividiu ${p.id} por previsão: ${partes.join('; ')}`, historicos);
  return resposta(versao, historicos, { pedidoId: ids[0], partes: ids });
}

function salvarEtapas(c) {
  const lista = c.etapas;
  if (!Array.isArray(lista) || lista.length < 3) throw bad('O quadro precisa de pelo menos 3 etapas.');
  const nomes = new Set();
  for (const e of lista) {
    const nome = String(e?.nome ?? '').trim();
    if (!nome) throw bad('Dê um nome a todas as etapas.');
    if (nomes.has(chaveNome(nome))) throw bad(`Já existe uma etapa chamada ${nome}.`);
    nomes.add(chaveNome(nome));
    if (e.id && !etapas().some((x) => x.id === e.id)) throw bad('Etapa desconhecida.');
  }
  const baixa = etapaDaBaixa();
  const final = etapaFinal();
  const n = lista.length;
  if (lista[n - 2].id !== baixa.id || lista[n - 1].id !== final.id) throw bad(`As etapas ${baixa.nome} e ${final.nome} precisam continuar no fim, nessa ordem.`);
  const mantidos = new Set(lista.filter((e) => e.id).map((e) => e.id));
  for (const antiga of etapas()) {
    if (mantidos.has(antiga.id)) continue;
    if (estado.pedidos.some((p) => !concluidoEm(p) && p.etapa === antiga.id)) throw new Erro(409, `A etapa ${antiga.nome} tem pedidos abertos.`);
  }
  const ids = new Set();
  estado.etapas = lista.map((e) => {
    let id = e.id;
    if (!id) {
      const base = slug(e.nome);
      id = base;
      for (let n = 2; estado.etapas.some((x) => x.id === id) || ids.has(id); n++) id = `${base}_${n}`;
    }
    ids.add(id);
    return { id, nome: String(e.nome).trim() };
  });
  return { ok: true, versao: agoraIso(), historico: null, historicos: [] };
}

// Nova demanda pós-saída, como o servidor: caixa que saiu, achada pela OS e pelo tipo.
function novaDemanda(c, usuario) {
  const os = String(c.os ?? '').trim();
  if (!os) throw bad('Informe a OS.');
  if (c.caixa !== 'COSTURA' && c.caixa !== 'ACABAMENTO') throw bad('Escolha o tipo de caixa.');
  if (!Array.isArray(c.itens) || c.itens.length === 0) throw bad('Informe ao menos um item.');
  if (c.itens.length > 30) throw bad('No máximo 30 itens por demanda.');
  const rotulo = `OS ${os} (${c.caixa === 'COSTURA' ? 'Costura' : 'Acabamento'})`;
  const doTipo = estado.caixas.filter((x) => x.os === os && x.tipo === c.caixa);
  if (!doTipo.length) throw new Erro(404, `Caixa da ${rotulo} não encontrada.`);
  const cx = doTipo.find((x) => x.saiu);
  if (!cx) throw new Erro(409, `A caixa da ${rotulo} ainda não saiu.`);
  exigirEditavel([cx.dealId]);
  const novos = c.itens.map((i) => {
    const nome = String(i?.nome ?? '').trim();
    const un = String(i?.un ?? '').trim();
    const cor = String(i?.cor ?? '').trim();
    if (!nome) throw bad('Informe o nome do item.');
    if (!num(i.qtd) || i.qtd <= 0) throw bad('Informe uma quantidade maior que zero');
    if (!un) throw bad('Informe a unidade do item.');
    return { nome, un, cor, qtd: i.qtd };
  });
  const itemIds = novos.map((n) => {
    const id = `${cx.dealId}|POS_SAIDA|${++seqDemanda}`;
    cx.itens.push(item(id, n.nome, n.un, n.qtd, { cor: n.cor, posSaida: true }));
    return id;
  });
  const historicos = [];
  registrar(cx.dealId, usuario, `${usuario} criou demanda pós-saída: ${novos.map((n) => `${fmtNum(n.qtd)} ${n.un} de ${n.nome}${n.cor ? ` ${n.cor}` : ''}`).join('; ')}`, historicos);
  return resposta(agoraIso(), historicos, { itemIds });
}

function historicoProducao(p, usuario, texto) {
  const h = { id: `HIST-${++seqHistorico}`, acao: ACAO_HISTORICO_PRODUCAO[acaoAtual] ?? acaoAtual, quando: agoraIso(), usuario, texto, ploomes: 'PENDENTE' };
  p.historico.unshift(h);
  return h;
}

function alterarProducao(c, usuario) {
  const p = estado.producao.find((x) => x.dealId === c.dealId);
  if (!p) throw new Erro(404, 'OS não encontrada na produção.');
  if (p.prevista) throw new Erro(409, 'Esta OS ainda não chegou na Costura.');
  if (!estado.dealsProducaoEditaveis.includes(p.dealId)) throw new Erro(403, 'Edição liberada em breve para esta OS.');
  conferirVersao(p.versao, c.versao, 'esta OS');
  validarData(c.dataCombinada);
  const mudouData = c.dataCombinada !== p.dataCombinada;
  const mudouOficina = c.oficinaId !== p.oficinaId;
  if (mudouData && !String(c.motivo ?? '').trim()) throw bad('Informe o motivo da alteração da data combinada.');
  if (!mudouData && !mudouOficina) throw bad('Nada alterado.');
  const oficina = c.oficinaId ? estado.oficinas.find((o) => o.ploomesId === c.oficinaId) : null;
  if (c.oficinaId && !oficina) throw bad('Oficina inválida.');
  p.oficinaId = c.oficinaId; p.oficina = oficina?.nome ?? 'ALOCAR'; p.dataCombinada = c.dataCombinada; p.versao = agoraIso();
  const h = historicoProducao(p, usuario, `${usuario} alterou o combinado${c.motivo ? ` · ${c.motivo}` : ''}`);
  return { ok: true, versao: p.versao, historico: h, historicos: [h] };
}

// Capacidade da oficina (19/10): as mesmas regras de validarCapacidadeOficina (n8n/src/producao.js).
function alterarCapacidade(c) {
  if (PERFIL !== 'ADM') throw new Erro(403, 'Só administradores podem alterar a capacidade das oficinas.');
  if (!String(c.oficinaId ?? '').trim()) throw bad('Informe a oficina.');
  const v = c.capacidade;
  const vazio = v === null || v === undefined || String(v).trim() === '';
  const n = vazio ? null : typeof v === 'number' ? v : /^\d+$/.test(String(v).trim()) ? Number(v) : NaN;
  if (!vazio && (!Number.isInteger(n) || n < 0 || n > 1_000_000)) throw bad('Informe a capacidade em peças por semana: número inteiro, 0 ou mais.');
  const oficina = estado.oficinas.find((o) => o.ploomesId === c.oficinaId);
  if (!oficina) throw new Erro(404, 'Oficina não encontrada.');
  oficina.capacidadeSemana = n;
  return { ok: true, versao: agoraIso(), historico: null, historicos: [] };
}

function decidirSugestao(c, usuario, aceitar) {
  const p = estado.producao.find((x) => x.dealId === c.dealId);
  if (!p) throw new Erro(404, 'OS não encontrada na produção.');
  if (p.prevista) throw new Erro(409, 'Esta OS ainda não chegou na Costura.');
  if (!estado.dealsProducaoEditaveis.includes(p.dealId)) throw new Erro(403, 'Edição liberada em breve para esta OS.');
  conferirVersao(p.versao, c.versao, 'esta OS');
  const s = p.sugestoes.find((x) => x.id === c.sugestaoId);
  if (!s) throw new Erro(404, 'Sugestão não encontrada.');
  const destino = aceitar ? 'ACEITA' : 'IGNORADA';
  if (s.status === destino) return { ok: true, versao: p.versao, historico: null, historicos: [] };
  if (s.status !== 'PENDENTE') throw new Erro(409, 'Esta sugestão já foi decidida.');
  if (aceitar && s.tipo === 'NOVA_DATA_COMBINADA') {
    if (!String(c.motivo ?? '').trim()) throw bad('Informe o motivo da alteração da data combinada.');
    p.dataCombinada = s.valor;
    p.versao = agoraIso(); // como o servidor: a versão só muda quando a linha da PRODUCAO é gravada
  }
  s.status = destino;
  const h = historicoProducao(p, usuario, `${usuario} ${aceitar ? 'aceitou' : 'ignorou'} a sugestão do WhatsApp.`);
  return { ok: true, versao: p.versao, historico: h, historicos: [h] };
}

// Simula o workflow Interpretar WhatsApp: mensagem associada com data (dd/mm ou "amanhã")
// ganha uma sugestão PENDENTE; sem data, nada. Uma sugestão por mensagem.
function dataNoTexto(texto) {
  if (/amanh[ãa]/i.test(texto)) return diaIso(1);
  const m = /(\d{1,2})\/(\d{1,2})/.exec(texto);
  if (!m) return '';
  const hoje = diaIso(0);
  const doAno = (ano) => `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = doAno(Number(hoje.slice(0, 4)));
  return iso < hoje ? doAno(Number(hoje.slice(0, 4)) + 1) : iso;
}

function simularInterpretacao(p, mensagem) {
  if (mensagem.tipoConteudo !== 'TEXTO' || p.sugestoes.some((s) => s.mensagemId === mensagem.id)) return;
  const data = dataNoTexto(String(mensagem.texto ?? ''));
  if (!data) return;
  p.sugestoes.unshift({ id: `WA-S-${mensagem.id}`, mensagemId: mensagem.id, tipo: 'NOVA_DATA_COMBINADA', valor: data,
    resumo: 'A oficina informou uma nova data de entrega.', evidencia: String(mensagem.texto).slice(0, 80), confianca: 0.9,
    status: 'PENDENTE', criadoEm: agoraIso(), versao: p.versao });
}

function associarWhatsapp(c, usuario) {
  const p = estado.producao.find((x) => x.dealId === c.dealId);
  if (!p) throw new Erro(404, 'OS não encontrada na produção.');
  if (p.prevista) throw new Erro(409, 'Esta OS ainda não chegou na Costura.');
  if (!estado.dealsProducaoEditaveis.includes(p.dealId)) throw new Erro(403, 'Edição liberada em breve para esta OS.');
  conferirVersao(p.versao, c.versao, 'esta OS');
  const indice = estado.mensagensWhatsappSemAssociacao.findIndex((x) => x.id === c.mensagemId);
  if (indice < 0) {
    // Trocar OS (22/10): mensagem ligada pela IA vai para outra OS da mesma oficina.
    const origem = estado.producao.find((x) => x.mensagens.some((m) => m.id === c.mensagemId && m.associacao === 'IA'));
    if (!origem) throw new Erro(404, 'Mensagem do WhatsApp não encontrada.');
    if (origem.dealId === p.dealId) throw new Erro(409, 'A mensagem já está nesta OS.');
    if (origem.oficinaId !== p.oficinaId) throw new Erro(409, 'A mensagem e a OS precisam pertencer ao mesmo grupo.');
    const movida = origem.mensagens.find((m) => m.id === c.mensagemId);
    origem.mensagens = origem.mensagens.filter((m) => m.id !== c.mensagemId);
    origem.sugestoes = origem.sugestoes.map((s) => (s.mensagemId === c.mensagemId && s.status === 'PENDENTE' ? { ...s, status: 'IGNORADA' } : s));
    p.mensagens.unshift({ ...movida, associacao: 'MANUAL' });
    // Como o servidor (mensagemTemSugestaoWhatsapp): a mensagem que ainda não tem sugestão
    // nenhuma é interpretada na OS nova.
    if (!estado.producao.some((x) => x.sugestoes.some((sg) => sg.mensagemId === movida.id))) simularInterpretacao(p, movida);
    const ht = historicoProducao(p, usuario, `${usuario} trocou a OS de uma mensagem do WhatsApp: ${origem.os} → ${p.os}.`);
    return { ok: true, versao: p.versao, historico: ht, historicos: [ht] };
  }
  const mensagem = estado.mensagensWhatsappSemAssociacao[indice];
  if (mensagem.oficinaId !== p.oficinaId) throw new Erro(409, 'A mensagem e a OS precisam pertencer ao mesmo grupo.');
  estado.mensagensWhatsappSemAssociacao.splice(indice, 1);
  p.mensagens.unshift({ ...mensagem, associacao: 'MANUAL' });
  simularInterpretacao(p, mensagem);
  const h = historicoProducao(p, usuario, `${usuario} associou manualmente uma mensagem do WhatsApp à OS ${p.os}.`);
  return { ok: true, versao: p.versao, historico: h, historicos: [h] };
}

function enviarWhatsapp(c, usuario) {
  const p = estado.producao.find((x) => x.dealId === c.dealId);
  if (!p) throw new Erro(404, 'OS não encontrada na produção.');
  if (p.prevista) throw new Erro(409, 'Esta OS ainda não chegou na Costura.');
  if (!estado.dealsProducaoEditaveis.includes(p.dealId)) throw new Erro(403, 'Edição liberada em breve para esta OS.');
  // como o servidor: o id sai da chave do clique e a mesma ação de novo não cria segunda linha
  if (c.chave !== undefined && !/^[A-Za-z0-9-]{8,64}$/.test(String(c.chave))) throw bad('Chave de envio inválida.');
  const mensagemId = c.chave ? `WA-E-${c.chave}` : `MSG-FILA-${Date.now()}`;
  if (c.chave && p.mensagens.some((m) => m.id === mensagemId)) return { ok: true, versao: p.versao, historico: null, historicos: [], mensagemId };
  conferirVersao(p.versao, c.versao, 'esta OS');
  const oficina = estado.oficinas.find((o) => o.ploomesId === p.oficinaId);
  if (!oficina?.grupoConfigurado) throw new Erro(409, 'Configure o grupo desta oficina na aba OFICINAS.');
  if (!['COBRANCA_PRAZO', 'CONFIRMAR_DATA'].includes(c.modelo)) throw bad('Modelo de mensagem inválido.');
  const texto = String(c.texto ?? '').trim();
  if (!texto || texto.length > 1500) throw bad('Mensagem com até 1500 caracteres.');
  p.mensagens.unshift({ id: mensagemId, quando: agoraIso(), participanteNome: usuario, direcao: 'ENVIADA', texto, associacao: 'MANUAL', statusEnvio: 'PENDENTE', tipoConteudo: 'TEXTO' });
  const h = historicoProducao(p, usuario, `${usuario} enfileirou uma mensagem no WhatsApp para ${oficina.grupoNome || oficina.nome}.`);
  return { ok: true, versao: p.versao, historico: h, historicos: [h], mensagemId };
}

function reenviarWhatsapp(c, usuario) {
  if (c.confirmou !== true) throw bad('Confirme o reenvio da mensagem.');
  const p = estado.producao.find((x) => x.dealId === c.dealId);
  if (!p) throw new Erro(404, 'OS não encontrada na produção.');
  if (p.prevista) throw new Erro(409, 'Esta OS ainda não chegou na Costura.');
  if (!estado.dealsProducaoEditaveis.includes(p.dealId)) throw new Erro(403, 'Edição liberada em breve para esta OS.');
  conferirVersao(p.versao, c.versao, 'esta OS');
  const original = p.mensagens.find((x) => x.id === c.mensagemId);
  if (!original) throw new Erro(404, 'Mensagem do WhatsApp não encontrada para esta OS.');
  if (original.direcao !== 'ENVIADA' || original.statusEnvio !== 'ERRO') throw new Erro(409, 'Somente uma tentativa com erro pode ser reenviada.');
  const oficina = estado.oficinas.find((o) => o.ploomesId === p.oficinaId);
  if (!oficina?.grupoConfigurado) throw new Erro(409, 'Configure o grupo desta oficina na aba OFICINAS.');
  // um reenvio por mensagem: o id sai da original
  const mensagemId = `WA-RE-${original.id}`;
  if (original.reenviada || p.mensagens.some((m) => m.id === mensagemId)) throw new Erro(409, 'Esta mensagem já foi reenviada. Confira a nova tentativa na conversa.');
  original.reenviada = true;
  p.mensagens.unshift({ ...original, id: mensagemId, quando: agoraIso(), participanteNome: usuario, statusEnvio: 'PENDENTE', reenviada: false });
  const h = historicoProducao(p, usuario, `${usuario} confirmou o reenvio de uma mensagem do WhatsApp.`);
  return { ok: true, versao: p.versao, historico: h, historicos: [h], mensagemId };
}

// ---------- Visão da peça ----------
// Como o servidor (n8n/src/peca.js): Ploomes lido na hora; registros do app ("[PCP · OS") ficam de fora.
const ETAPAS_PRODUCAO_MOCK = ['12. Encaixe', '13. Estratégico 2', '14. Corte', '15. Preparação 1', '16. 1ª Peça', '17. Costura', '18. Acabamento', '19. Expedição']
  .map((nome, k) => ({ id: String(60100 + k), nome, ordem: k + 1 }));
const horas = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const ossDoMock = () => [...new Set([...estado.producao.map((p) => p.os), ...estado.caixas.map((c) => c.os)])];
function dadosDaOs(os) {
  const p = estado.producao.find((x) => x.os === os);
  const c = estado.caixas.find((x) => x.os === os);
  return { p, c, peca: p?.peca ?? c?.peca ?? '', cliente: p?.cliente ?? c?.cliente ?? '', referencia: p?.referencia ?? c?.referencia ?? '', dealId: p?.dealId ?? `8${os}` };
}
function dossieMock(os) {
  const d = dadosDaOs(os);
  // A OS prevista fica na etapa dela (12 a 16); as outras, na Costura.
  const etapa = ETAPAS_PRODUCAO_MOCK.find((e) => e.nome === d.p?.etapaNome) ?? ETAPAS_PRODUCAO_MOCK[d.p?.prevista ? 2 : 5];
  const base = { titulo: `OS ${os}`, cliente: d.cliente, peca: d.peca, referencia: d.referencia, os };
  const cards = [{ ...base, dealId: d.dealId, funilId: 60015827, funil: 'Produção', etapaId: Number(etapa.id), etapa: etapa.nome, etapaOrdem: etapa.ordem,
    atualizadoEm: horas(-1), link: `https://app10.ploomes.com/deal/${d.dealId}` }];
  if (os === '90002') cards.push({ ...base, dealId: '790002', funilId: 60011710, funil: 'PCP', etapaId: 60200, etapa: 'Concluído', etapaOrdem: 9,
    atualizadoEm: horas(-48), link: 'https://app10.ploomes.com/deal/790002' });
  const registros = os === '90002' ? [
    { quando: horas(-30), fonte: 'PLOOMES', texto: 'Cliente pediu para conferir a cor do viés antes do corte.', autor: 'Renata', dealId: d.dealId },
    { quando: horas(-2), fonte: 'PLOOMES', texto: '[PCP · OS 90002] Atualizações do app PCP\n• 10:00 Lucca deu baixa', autor: 'Integração', dealId: d.dealId }
  ] : [];
  const trocas = [{ quando: horas(-72), fonte: 'ETAPA', texto: `Produção: ${ETAPAS_PRODUCAO_MOCK[4].nome} → ${ETAPAS_PRODUCAO_MOCK[5].nome}`, autor: '', dealId: d.dealId }];
  if (os === '90002') trocas.push({ quando: horas(-96), fonte: 'ETAPA', texto: `Produção: ${ETAPAS_PRODUCAO_MOCK[3].nome} → ${ETAPAS_PRODUCAO_MOCK[4].nome}`, autor: '', dealId: d.dealId, desfeita: true });
  const eventos = [...registros.filter((r) => !r.texto.startsWith('[PCP · OS')), ...trocas].sort((a, b) => b.quando.localeCompare(a.quando));
  return { geradoEm: agoraIso(), os, cards, trilha: { funil: 'Produção', dealId: d.dealId, etapas: ETAPAS_PRODUCAO_MOCK, atualId: etapa.id }, eventos };
}
function pecaMock(q) {
  const v = String(q ?? '').trim().replace(/\s+/g, ' ');
  if (!v || v.length > 60) throw bad('Informe a OS ou a referência.');
  const oss = ossDoMock();
  if (/^\d+$/.test(v) && oss.includes(v)) {
    if (v === '90005') throw new Erro(502, 'Não foi possível ler o Ploomes agora.');
    return dossieMock(v);
  }
  const ref = semAcento(v).toUpperCase();
  const achadas = ref === 'REF-COMUM' ? ['90002', '90003'] : oss.filter((os) => semAcento(dadosDaOs(os).referencia).toUpperCase() === ref);
  if (!achadas.length) throw new Erro(404, 'Nenhuma OS encontrada no Ploomes.');
  return {
    geradoEm: agoraIso(), os: '', cards: [], trilha: null, eventos: [],
    candidatos: achadas.map((os) => ({ os, peca: dadosDaOs(os).peca, etapa: '17. Costura', funil: 'Produção', dealId: dadosDaOs(os).dealId }))
  };
}
function anotarPeca(c, usuario) {
  const bruto = typeof c.texto === 'string' ? c.texto.replace(/\r\n?/g, '\n').trim() : '';
  // OS com os mesmos caracteres da busca (n8n/src/peca.js), inclusive espaço.
  const os = String(c.os ?? '').trim().replace(/\s+/g, ' ');
  if (!os || os.length > 60 || !/^[0-9A-Za-zÀ-ÿ ._/-]+$/.test(os)) throw bad('Informe a OS.');
  if (!/^\d{1,20}$/.test(String(c.dealId ?? ''))) throw bad('Informe o card do Ploomes.');
  if (/\n[ \t]*\n/.test(bruto)) throw bad('A anotação não pode ter linha em branco.');
  const t = bruto.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ');
  if (!t) throw bad('Escreva a anotação.');
  if (t.length > 500) throw bad('Anotação com no máximo 500 caracteres.');
  const listas = [estado.dealsEditaveis, estado.dealsProducaoEditaveis];
  if (listas.every((l) => l.length) && !listas.some((l) => l.includes(String(c.dealId)))) throw new Erro(403, 'Edição liberada em breve para esta OS.');
  const a = { id: `ANOT-${++seqAnotacao}`, quando: agoraIso(), usuario, texto: `${usuario} anotou: "${t}"`, dealId: String(c.dealId), os, criadoMs: Date.now() };
  estado.anotacoes.unshift(a);
  // Como o servidor (historicoDoDeal): a linha ANOTACAO também aparece no histórico do card.
  const h = { id: a.id, acao: 'ANOTACAO', quando: a.quando, usuario, texto: a.texto, criadoMs: a.criadoMs };
  estado.caixas.filter((x) => x.dealId === a.dealId).forEach((x) => x.historico.push({ ...h }));
  estado.producao.filter((x) => x.dealId === a.dealId).forEach((x) => x.historico.unshift({ ...h, ploomes: 'PENDENTE' }));
  return resposta(a.quando, [{ quando: a.quando, usuario, texto: a.texto, ploomes: 'PENDENTE', dealId: a.dealId }], { anotacaoId: a.id });
}

function processar(corpo, usuario) {
  acaoAtual = String(corpo?.tipo ?? '');
  switch (corpo?.tipo) {
    case 'baixa': case 'previsao_item': case 'obs_item':
    case 'responsavel': case 'previsao_caixa': case 'obs_caixa': return acaoF2(corpo, usuario);
    case 'gerar_pedido': return gerarPedido(corpo, usuario);
    case 'editar_pedido': return editarPedido(corpo, usuario);
    case 'mover_pedido': return moverPedido(corpo, usuario);
    case 'baixar_pedido': return baixarPedido(corpo, usuario);
    case 'dividir_pedido': return dividirPedido(corpo, usuario);
    case 'dividir_por_previsao': return dividirPorPrevisao(corpo, usuario);
    case 'nova_demanda': return novaDemanda(corpo, usuario);
    case 'alterar_producao': return alterarProducao(corpo, usuario);
    case 'aceitar_sugestao_whatsapp': return decidirSugestao(corpo, usuario, true);
    case 'ignorar_sugestao_whatsapp': return decidirSugestao(corpo, usuario, false);
    case 'associar_whatsapp': return associarWhatsapp(corpo, usuario);
    case 'enviar_whatsapp': return enviarWhatsapp(corpo, usuario);
    case 'reenviar_whatsapp': return reenviarWhatsapp(corpo, usuario);
    case 'alterar_capacidade_oficina': return alterarCapacidade(corpo);
    case 'anotar_peca': return anotarPeca(corpo, usuario);
    case 'salvar_etapas':
      if (PERFIL !== 'ADM') throw new Erro(403, 'Só administradores podem alterar as etapas do quadro.');
      return salvarEtapas(corpo);
    default: throw bad('Tipo de ação inválido.');
  }
}

// ---------- HTTP ----------
// MOCK_PERFIL=OPERADOR simula um usuário sem acesso às etapas do quadro.
const PERFIL = (process.env.MOCK_PERFIL ?? 'ADM').toUpperCase();
function cors(req, res) {
  const o = req.headers.origin ?? '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
function enviar(res, status, json) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(json));
}
const lerCorpo = (req) => new Promise((ok) => {
  let s = '';
  req.on('data', (d) => (s += d));
  req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok(null); } });
});

const servidor = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const [rota, busca = ''] = (req.url ?? '').split('?');
  try {
    if (rota === '/pcp-login' && req.method === 'POST') {
      return enviar(res, 200, { token: 'm'.repeat(64), nome: 'Lucca', perfil: PERFIL, expiraEm: new Date(Date.now() + 12 * 3_600_000).toISOString() });
    }
    if (rota === '/pcp-board' && req.method === 'GET') return enviar(res, 200, montarBoard());
    if (rota === '/pcp-peca' && req.method === 'GET') return enviar(res, 200, pecaMock(new URLSearchParams(busca).get('q')));
    if (rota === '/pcp-acao' && req.method === 'POST') {
      const corpo = await lerCorpo(req);
      const atraso = Number(new URLSearchParams(busca).get('atraso')) || ATRASO_MS;
      if (atraso > 0) await esperar(atraso);
      if (!corpo) return enviar(res, 400, { erro: 'Corpo inválido.' });
      if (process.env.MOCK_FALHA_GRAVACAO || new URLSearchParams(busca).get('falha') === 'gravacao') {
        return enviar(res, 500, { erro: 'Falha ao gravar na planilha. Avise o PCP antes de tentar de novo.' });
      }
      const r = processar(corpo, 'Lucca');
      console.log(`[acao] ${corpo.tipo} ok`);
      return enviar(res, 200, r);
    }
    enviar(res, 404, { erro: 'Rota não encontrada.' });
  } catch (e) {
    if (e instanceof Erro) { console.log(`[acao] ${e.status} ${e.message}`); return enviar(res, e.status, { erro: e.message }); }
    console.error(e);
    enviar(res, 500, { erro: 'Erro interno do mock.' });
  }
});
servidor.listen(PORTA, () => console.log(`Mock da API em http://localhost:${PORTA} (pcp-login, pcp-board, pcp-peca, pcp-acao)`));
