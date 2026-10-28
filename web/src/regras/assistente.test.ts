import { describe, expect, it, vi } from 'vitest';
import fonteServidor from '../../../n8n/src/assistente.js?raw';
import type { Board, MensagemAssistente, Pedido, Producao, RespostaAssistente } from '../api/tipos';
import { caixa, item } from './teste-util';
import {
  abrirTela, acoesDoCartao, alternarLinha, buscarOs, cancelarCartao, caixasParadasFerramenta, confirmarCartao, conversar,
  editarTextoLinha, erroCartao, executarFerramenta, faltasDaOs, listarAtrasadas, MAX_LINHAS, montarCartaoCobranca, NOMES_FERRAMENTAS,
  osConhecidas, partesComOs, pedidosAbertos, resumoCobranca, semRepeticao, semResposta, TEXTO_LIMITE_CHAMADAS, textoEnfileiradas, type CartaoCobranca
} from './assistente';

const HOJE = '2026-10-27';
const AGORA = new Date('2026-10-27T15:00:00.000Z');

const prod = (o: Partial<Producao> = {}): Producao => ({
  dealId: '700001', os: '90001', oficinaId: 'OF-1', oficina: 'OFICINA SOL', inicioCostura: '2026-10-01', dataCombinada: '2026-10-20',
  leadTime: '', pecas: 100, cliente: 'CLIENTE ALFA', peca: 'CAMISA TESTE', referencia: 'REF-1', versao: 'v1',
  faltasCostura: [], faltasAcabamento: [], mensagens: [], sugestoes: [], historico: [], ...o
});
const pedido = (o: Partial<Pedido> = {}): Pedido => ({
  id: 'PED-0001', pai: '', etapa: 'a_pedir', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'BRAGANCA', previsao: '2026-10-30',
  responsavel: 'Maria', criadoEm: '2026-10-20', baixadoEm: '', versao: 'v', finalizado: false,
  itens: [{ itemId: 'i1', dealId: '600001', os: '90001', nome: 'ZIPER', un: 'UN', qtd: 5, fornecedor: '' }], ...o
});

function board(o: Partial<Board> = {}): Board {
  return {
    geradoEm: '2026-10-27T12:00:00.000Z', avisos: [], usuarios: [],
    caixas: [
      caixa({ id: '600001', dealId: '600001', os: '90001', peca: 'CAMISA TESTE', cliente: 'CLIENTE ALFA', registradoEm: '2026-10-10',
        itens: [item({ id: 'i1', nome: 'ZÍPER METAL', resta: 5, previsao: '2026-10-29', pedidoIds: ['PED-0001'] }), item({ id: 'i2', nome: 'LINHA', resta: 0, status: 'RESOLVIDO' })] }),
      caixa({ id: '600002', dealId: '600002', os: '90002', tipo: 'ACABAMENTO', peca: 'CALÇA TESTE', cliente: 'CLIENTE BETA', registradoEm: '2026-10-25' })
    ],
    producao: [
      prod({ dealId: '700001', os: '90001', dataCombinada: '2026-10-25' }),
      prod({ dealId: '700002', os: '90002', peca: 'CALÇA TESTE', oficinaId: 'OF-2', oficina: 'OFICINA LUA', dataCombinada: '2026-10-29' }),
      prod({ dealId: '700003', os: '90003', peca: 'BLUSA', oficinaId: '', oficina: 'ALOCAR', dataCombinada: '2026-10-26' }),
      prod({ dealId: '700004', os: '90004', peca: 'SAIA', dataCombinada: '2026-11-20' }),
      prod({ dealId: '700005', os: '90005', peca: 'COLETE PREVISTO', prevista: true, dataCombinada: '2026-10-20' }),
      prod({ dealId: '700006', os: '90006', peca: 'BERMUDA', oficinaId: 'OF-3', oficina: 'OFICINA MAR', dataCombinada: '2026-10-24',
        mensagens: [{ id: 'M1', quando: '2026-10-25T12:00:00.000Z', participanteNome: 'PCP', direcao: 'ENVIADA', texto: 'Olá.', associacao: 'MANUAL', statusEnvio: 'ENVIADA', tipoConteudo: 'TEXTO' }] })
    ],
    oficinas: [
      { ploomesId: 'OF-1', nome: 'OFICINA SOL', grupoConfigurado: true, grupoNome: 'GRUPO SOL' },
      { ploomesId: 'OF-2', nome: 'OFICINA LUA', grupoConfigurado: false, grupoNome: '' },
      { ploomesId: 'OF-3', nome: 'OFICINA MAR', grupoConfigurado: true, grupoNome: 'GRUPO MAR' }
    ],
    dealsProducaoEditaveis: ['700001', '700002', '700003', '700004'],
    etapasPedido: [{ id: 'a_pedir', nome: 'A pedir', ordem: 1 }, { id: 'entregue', nome: 'Enviado ao destino final', ordem: 2 }, { id: 'concluido', nome: 'Concluído', ordem: 3 }],
    pedidos: [
      pedido(),
      pedido({ id: 'PED-0002', etapa: 'entregue', quem: '', itens: [{ itemId: 'x', dealId: '600002', os: '90002', nome: 'BOTAO', un: 'UN', qtd: 1, fornecedor: 'BOTÕES GAMA' }] }),
      pedido({ id: 'PED-0003', etapa: 'concluido', finalizado: true }),
      pedido({ id: 'PED-0004', etapa: 'concluido' })
    ],
    ...o
  };
}

describe('nomes das ferramentas', () => {
  it('espelham n8n/src/assistente.js', () => {
    const doServidor = [...fonteServidor.matchAll(/ferramentaAssistente\('([a-z_]+)'/g)].map((m) => m[1]);
    expect(doServidor).toEqual([...NOMES_FERRAMENTAS]);
  });
});

describe('buscar_os', () => {
  it('acha pelo número, peça, cliente e oficina, sem acento e sem repetir a OS', () => {
    const b = board();
    expect((buscarOs(b, { texto: '90001' }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90001']);
    expect((buscarOs(b, { texto: 'calca' }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90002']);
    expect((buscarOs(b, { texto: 'oficina sol' }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90001', '90004', '90005']);
    expect((buscarOs(b, { texto: 'cliente beta' }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90002']);
    const l = (buscarOs(b, { texto: '90001' }, HOJE).linhas as Record<string, unknown>[])[0];
    expect(l).toMatchObject({ os: '90001', peca: 'CAMISA TESTE', oficina: 'OFICINA SOL', situacao: 'Atrasada · 2 dias', caixasComFalta: 1 });
  });

  it('a OS exata vem primeiro; sem nada, aviso; sem texto, erro', () => {
    const b = board({ caixas: [], producao: [prod({ os: '190001', dealId: '1' }), prod({ os: '90001', dealId: '2', peca: 'X' })] });
    expect((buscarOs(b, { texto: '90001' }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90001', '190001']);
    expect(buscarOs(board(), { texto: 'nada disso' }, HOJE)).toEqual({ linhas: [], aviso: 'Nenhuma OS encontrada.' });
    expect(buscarOs(board(), {}, HOJE)).toEqual({ erro: 'Informe a OS, a peça, o cliente ou a oficina.' });
  });

  it('corta em 30 com o total', () => {
    const muitas = Array.from({ length: 35 }, (_, i) => prod({ dealId: `7${i}`, os: `95${String(i).padStart(3, '0')}` }));
    const r = buscarOs(board({ caixas: [], producao: muitas }), { texto: 'camisa' }, HOJE);
    expect((r.linhas as unknown[]).length).toBe(MAX_LINHAS);
    expect(r.total).toBe(35);
  });
});

describe('listar_atrasadas', () => {
  it('mesma regra do Prazo estourando (vencidas e até 3 dias), sem as previstas', () => {
    const r = listarAtrasadas(board(), {}, HOJE);
    expect((r.linhas as Record<string, unknown>[]).map((l) => [l.os, l.prazo, l.situacao])).toEqual([
      ['90006', '24/10', 'venceu há 3 dias'], ['90001', '25/10', 'venceu há 2 dias'], ['90003', '26/10', 'venceu há 1 dia'], ['90002', '29/10', 'vence em 2 dias']
    ]);
    expect(r.total).toBeUndefined();
  });

  it('filtra por oficina e por dias até vencer; argumentos estranhos usam o padrão', () => {
    expect((listarAtrasadas(board(), { oficina: 'lua' }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90002']);
    expect((listarAtrasadas(board(), { dias_ate_vencer: 0 }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90006', '90001', '90003']);
    expect((listarAtrasadas(board(), { dias_ate_vencer: '30' }, HOJE).linhas as unknown[]).length).toBe(5);
    expect((listarAtrasadas(board(), { dias_ate_vencer: 'muitos' }, HOJE).linhas as unknown[]).length).toBe(4);
    expect(listarAtrasadas(board({ producao: [] }), {}, HOJE)).toEqual({ linhas: [], aviso: 'Nenhuma OS com prazo estourando.' });
  });
});

describe('faltas_da_os', () => {
  it('itens em aberto das caixas da OS, com previsão e pedido', () => {
    expect(faltasDaOs(board(), { os: '90001' })).toEqual({
      os: '90001', linhas: [{ caixa: 'Costura', saiu: false, nome: 'ZÍPER METAL', cor: 'preto', falta: 5, un: 'UN', previsao: '29/10', pedido: 'PED-0001' }]
    });
    expect(faltasDaOs(board(), { os: 'OS 90001' }).os).toBe('90001');
  });

  it('OS sem caixa, sem falta e sem número', () => {
    expect(faltasDaOs(board(), { os: '99999' })).toEqual({ os: '99999', linhas: [], aviso: 'Nenhuma caixa encontrada para a OS 99999.' });
    const semFalta = board({ caixas: [caixa({ os: '90001', itens: [item({ resta: 0, status: 'RESOLVIDO' })] })] });
    expect(faltasDaOs(semFalta, { os: '90001' })).toEqual({ os: '90001', linhas: [], aviso: 'A OS 90001 não tem falta em aberto.' });
    expect(faltasDaOs(board(), {})).toEqual({ erro: 'Informe a OS.' });
  });
});

describe('caixas_paradas', () => {
  it('mesma regra dos Insights (padrão 7 dias) e aceita outro limite', () => {
    expect(caixasParadasFerramenta(board(), {}, HOJE)).toEqual({ linhas: [{ os: '90001', caixa: 'Costura', dias: 17, itensAbertos: 1 }] });
    expect((caixasParadasFerramenta(board(), { dias: 2 }, HOJE).linhas as { os: string }[]).map((l) => l.os)).toEqual(['90001', '90002']);
    expect(caixasParadasFerramenta(board(), { dias: 30 }, HOJE)).toEqual({ linhas: [], aviso: 'Nenhuma caixa parada.' });
  });
});

describe('pedidos_abertos', () => {
  it('fora da última etapa e não concluídos; filtra por OS e fornecedor', () => {
    const r = pedidosAbertos(board(), {});
    expect((r.linhas as Record<string, unknown>[]).map((l) => [l.pedido, l.etapa, l.quem])).toEqual([
      ['PED-0001', 'A pedir', 'TECIDOS BETA'], ['PED-0002', 'Enviado ao destino final', 'BOTÕES GAMA']
    ]);
    expect((pedidosAbertos(board(), { os: '90002' }).linhas as { pedido: string }[]).map((l) => l.pedido)).toEqual(['PED-0002']);
    expect((pedidosAbertos(board(), { fornecedor: 'botoes' }).linhas as { pedido: string }[]).map((l) => l.pedido)).toEqual(['PED-0002']);
    expect(pedidosAbertos(board(), { os: '1' })).toEqual({ linhas: [], aviso: 'Nenhum pedido aberto.' });
  });
});

describe('sem_resposta', () => {
  it('mesma regra do cartão Cobrança sem resposta', () => {
    expect(semResposta(board(), AGORA)).toEqual({ linhas: [{ os: '90006', peca: 'BERMUDA', oficina: 'OFICINA MAR', situacao: 'sem resposta há 2 dias' }] });
  });
});

describe('abrir_tela', () => {
  it('as cinco telas do spec e a Visão da peça com a OS', () => {
    expect(abrirTela({ tela: 'no-ploomes' })).toEqual({ resultado: { ok: true, texto: 'Abri No Ploomes.' }, efeito: { tipo: 'abrir', tela: 'ploomes', os: '' } });
    expect(abrirTela({ tela: 'solicitacoes' }).efeito).toEqual({ tipo: 'abrir', tela: 'pedidos', os: '' });
    expect(abrirTela({ tela: 'saidas' }).efeito).toMatchObject({ tela: 'saidas' });
    expect(abrirTela({ tela: 'producao' }).resultado).toEqual({ ok: true, texto: 'Abri Controle de produção.' });
    expect(abrirTela({ tela: 'peca', os: '90001' })).toEqual({ resultado: { ok: true, texto: 'Abri a Visão da peça da OS 90001.' }, efeito: { tipo: 'abrir', tela: 'peca', os: '90001' } });
    expect(abrirTela({ tela: 'config' })).toEqual({ resultado: { erro: 'Tela desconhecida. Use no-ploomes, saidas, solicitacoes, producao ou peca.' } });
  });
});

const cartao = (b: Board, args: Record<string, unknown>): CartaoCobranca => {
  const r = montarCartaoCobranca(b, args, HOJE, 'C1');
  if ('erro' in r) throw new Error(r.erro);
  return r.cartao;
};

describe('cartão de cobrança', () => {
  it('atrasadas: uma linha por OS na Costura, travadas com motivo, texto do modelo Cobrança de prazo', () => {
    const c = cartao(board(), { alvo: 'atrasadas' });
    expect(c.linhas.map((l) => [l.os, l.marcada, l.travada, l.motivo])).toEqual([
      ['90006', false, true, 'Edição liberada em breve para esta OS'],
      ['90001', true, false, ''],
      ['90003', false, true, 'Sem oficina alocada'],
      ['90002', false, true, 'Oficina sem grupo de WhatsApp']
    ]);
    const l = c.linhas[1];
    expect(l).toMatchObject({ peca: 'CAMISA TESTE', oficina: 'OFICINA SOL', prazo: '25/10', situacao: 'Atrasada · 2 dias' });
    expect(l.texto).toBe('Olá. A entrega de *CAMISA TESTE*, 100 peças, estava prevista para 25/10. Qual a nova data de entrega?');
    expect(c.estado).toBe('aberto');
  });

  it('todas, oficinas e filtro de oficina; previstas nunca entram', () => {
    expect(cartao(board(), { alvo: 'todas' }).linhas.map((l) => l.os)).toEqual(['90006', '90001', '90003', '90002', '90004']);
    expect(cartao(board(), { alvo: 'oficinas', oficinas: ['Oficina Sol'] }).linhas.map((l) => l.os)).toEqual(['90001', '90004']);
    expect(cartao(board(), { alvo: 'atrasadas', oficinas: 'sol, mar' }).linhas.map((l) => l.os)).toEqual(['90006', '90001']);
    expect(montarCartaoCobranca(board(), { alvo: 'oficinas' }, HOJE, 'C')).toEqual({ erro: 'Informe as oficinas.' });
    expect(montarCartaoCobranca(board(), { alvo: 'enviar' }, HOJE, 'C')).toEqual({ erro: 'Alvo inválido. Use atrasadas, todas ou oficinas.' });
  });

  it('lista vazia de editáveis libera todas', () => {
    const c = cartao(board({ dealsProducaoEditaveis: [] }), { alvo: 'atrasadas' });
    expect(c.linhas.find((l) => l.os === '90006')).toMatchObject({ travada: false, marcada: true });
  });

  it('no máximo 30 linhas, com o total', () => {
    const muitas = Array.from({ length: 40 }, (_, i) => prod({ dealId: `7${i}`, os: `95${String(i).padStart(3, '0')}` }));
    const c = cartao(board({ producao: muitas, dealsProducaoEditaveis: [] }), { alvo: 'todas' });
    expect(c.linhas.length).toBe(30);
    expect(c.total).toBe(40);
    expect(resumoCobranca(c)).toMatchObject({ mensagens: 30, total: 40, mostradas: 30 });
  });

  it('o resumo para o modelo tem só contagens', () => {
    const r = resumoCobranca(cartao(board(), { alvo: 'atrasadas' }));
    expect(r).toEqual({ alvo: 'atrasadas', mensagens: 1, travadas: 3, total: 4, aviso: 'Nada foi enviado. A pessoa confere o cartão e clica em Confirmar e enviar.' });
    expect(JSON.stringify(r)).not.toMatch(/Olá/);
  });

  it('confirmar gera uma enviar_whatsapp por linha marcada, com a versão de agora e chave nova', () => {
    const b = board({ dealsProducaoEditaveis: [] });
    let c = cartao(b, { alvo: 'atrasadas', oficinas: ['sol', 'mar'] });
    c = editarTextoLinha(c, '700001', '  Olá. Segue no prazo?  ');
    let n = 0;
    const agora = board({ dealsProducaoEditaveis: [], producao: b.producao!.map((p) => (p.dealId === '700006' ? { ...p, versao: 'v9' } : p)) });
    const acoes = acoesDoCartao(c, agora, () => `chave-ficticia-${++n}`);
    expect(acoes).toEqual([
      { tipo: 'enviar_whatsapp', dealId: '700006', versao: 'v9', modelo: 'COBRANCA_PRAZO', texto: c.linhas[0].texto, chave: 'chave-ficticia-1' },
      { tipo: 'enviar_whatsapp', dealId: '700001', versao: 'v1', modelo: 'COBRANCA_PRAZO', texto: 'Olá. Segue no prazo?', chave: 'chave-ficticia-2' }
    ]);
  });

  it('desmarcada, travada, OS que saiu da Costura ou ficou travada não geram ação', () => {
    const b = board({ dealsProducaoEditaveis: [] });
    let c = cartao(b, { alvo: 'atrasadas' });
    c = alternarLinha(c, '700001');
    c = alternarLinha(c, '700003'); // travada: não muda
    expect(c.linhas.find((l) => l.dealId === '700003')!.marcada).toBe(false);
    const depois = board({ dealsProducaoEditaveis: [], producao: b.producao!.filter((p) => p.dealId !== '700006') });
    expect(acoesDoCartao(c, depois, () => 'chave-ficticia')).toEqual([]);
    expect(erroCartao(c)).toBe('');
    c = alternarLinha(c, '700006');
    expect(erroCartao(c)).toBe('Marque ao menos uma OS.');
  });

  it('texto vazio ou longo bloqueia o confirmar', () => {
    let c = cartao(board(), { alvo: 'atrasadas' });
    c = editarTextoLinha(c, '700001', '   ');
    expect(erroCartao(c)).toBe('Escreva uma mensagem com até 1500 caracteres (OS 90001).');
    expect(acoesDoCartao(c, board())).toEqual([]);
    c = editarTextoLinha(c, '700001', 'a'.repeat(1501));
    expect(erroCartao(c)).toMatch(/OS 90001/);
  });

  it('cancelado ou confirmado: só leitura e nenhuma ação', () => {
    const c = cartao(board(), { alvo: 'atrasadas' });
    const cancelado = cancelarCartao(c);
    expect(acoesDoCartao(cancelado, board())).toEqual([]);
    expect(alternarLinha(cancelado, '700001')).toBe(cancelado);
    expect(editarTextoLinha(cancelado, '700001', 'x')).toBe(cancelado);
    const confirmado = confirmarCartao(c, 1);
    expect(confirmado).toMatchObject({ estado: 'confirmado', enfileiradas: 1 });
    expect(acoesDoCartao(confirmado, board())).toEqual([]);
    expect(textoEnfileiradas(1)).toBe('1 cobrança na fila');
    expect(textoEnfileiradas(3)).toBe('3 cobranças na fila');
  });
});

describe('executarFerramenta', () => {
  it('preparar_cobranca devolve o resumo e o cartão como efeito', () => {
    const r = executarFerramenta(board(), { id: 'c1', nome: 'preparar_cobranca', argumentos: { alvo: 'atrasadas' } }, HOJE, AGORA, 'CART-1');
    expect(r.resultado).toMatchObject({ mensagens: 1, travadas: 3 });
    expect(r.efeito).toMatchObject({ tipo: 'cobranca', cartao: { id: 'CART-1', alvo: 'atrasadas' } });
    const vazio = executarFerramenta(board({ producao: [] }), { id: 'c1', nome: 'preparar_cobranca', argumentos: { alvo: 'todas' } }, HOJE, AGORA, 'C');
    expect(vazio).toEqual({ resultado: { mensagens: 0, aviso: 'Nenhuma OS na Costura para cobrar nesse alvo.' } });
  });

  it('nome desconhecido e falha interna viram erro para o modelo', () => {
    expect(executarFerramenta(board(), { id: 'c', nome: 'enviar_whatsapp', argumentos: {} }, HOJE, AGORA, 'C')).toEqual({ resultado: { erro: 'Ferramenta desconhecida.' } });
    const quebrado = { ...board(), caixas: null } as unknown as Board;
    expect(executarFerramenta(quebrado, { id: 'c', nome: 'faltas_da_os', argumentos: { os: '1' } }, HOJE, AGORA, 'C')).toEqual({ resultado: { erro: 'Não consegui consultar agora.' } });
  });
});

describe('conversar', () => {
  const pergunta: MensagemAssistente[] = [{ papel: 'usuario', texto: 'Quais OS estão atrasadas?' }];

  it('roda as ferramentas pedidas e devolve o texto final', async () => {
    const respostas: RespostaAssistente[] = [
      { chamadas: [{ id: 'c1', nome: 'listar_atrasadas', argumentos: {} }] },
      { texto: 'A OS 90001 está atrasada.' }
    ];
    const pedidos: MensagemAssistente[][] = [];
    const pedir = vi.fn(async (m: MensagemAssistente[]) => { pedidos.push(m); return respostas.shift()!; });
    const executar = vi.fn(() => ({ linhas: [{ os: '90001' }] }));
    const r = await conversar(pergunta, pedir, executar);
    expect(r.texto).toBe('A OS 90001 está atrasada.');
    expect(r.novas).toEqual([
      { papel: 'assistente', chamadas: [{ id: 'c1', nome: 'listar_atrasadas', argumentos: {} }] },
      { papel: 'ferramenta', id: 'c1', nome: 'listar_atrasadas', resultado: '{"linhas":[{"os":"90001"}]}' },
      { papel: 'assistente', texto: 'A OS 90001 está atrasada.' }
    ]);
    expect(pedidos[1]).toEqual([...pergunta, ...r.novas.slice(0, 2)]);
    expect(executar).toHaveBeenCalledTimes(1);
  });

  it('no máximo 5 chamadas por pergunta', async () => {
    let n = 0;
    const pedir = vi.fn(async (): Promise<RespostaAssistente> => ({ chamadas: [{ id: `c${++n}`, nome: 'buscar_os', argumentos: { texto: 'x' } }, { id: `c${++n}`, nome: 'sem_resposta', argumentos: {} }] }));
    const executar = vi.fn(() => ({}));
    const r = await conversar(pergunta, pedir, executar);
    expect(executar).toHaveBeenCalledTimes(4);
    expect(pedir).toHaveBeenCalledTimes(3);
    expect(r.texto).toBe(TEXTO_LIMITE_CHAMADAS);
    expect(r.novas.at(-1)).toEqual({ papel: 'assistente', texto: TEXTO_LIMITE_CHAMADAS });
  });

  it('chamadas paralelas que passariam de 5 somando as anteriores param sem rodar', async () => {
    const respostas: RespostaAssistente[] = [
      { chamadas: [1, 2, 3].map((i) => ({ id: `a${i}`, nome: 'buscar_os', argumentos: {} })) },
      { chamadas: [1, 2, 3].map((i) => ({ id: `b${i}`, nome: 'buscar_os', argumentos: {} })) }
    ];
    const executar = vi.fn(() => ({}));
    const r = await conversar(pergunta, async () => respostas.shift()!, executar);
    expect(executar).toHaveBeenCalledTimes(3);
    expect(r.texto).toBe(TEXTO_LIMITE_CHAMADAS);
  });

  it('erro do servidor sobe para a tela', async () => {
    const pedir = vi.fn(async (): Promise<RespostaAssistente> => { throw new Error('502'); });
    await expect(conversar(pergunta, pedir, () => ({}))).rejects.toThrow('502');
  });

  const ocupado = (s: number) => Object.assign(new Error('Muita procura agora. Tentando de novo…'), { status: 429, tentarEmSegundos: s });

  it('Groq ocupado (429 com tentarEmSegundos): avisa, espera N s e tenta de novo, até 2 vezes', async () => {
    const respostas: (RespostaAssistente | Error)[] = [ocupado(4), ocupado(2), { texto: 'Pronto.' }];
    const pedir = vi.fn(async (): Promise<RespostaAssistente> => {
      const r = respostas.shift()!;
      if (r instanceof Error) throw r;
      return r;
    });
    const esperas: number[] = [];
    const avisos: number[] = [];
    const r = await conversar(pergunta, pedir, () => ({}), {
      esperar: async (ms) => { esperas.push(ms); }, aoAguardar: (s) => avisos.push(s)
    });
    expect(r.texto).toBe('Pronto.');
    expect(pedir).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([4000, 2000]);
    expect(avisos).toEqual([4, 0, 2, 0]);
  });

  it('Groq ocupado 3 vezes seguidas: o erro sobe; 429 do limite por usuário não repete', async () => {
    const pedir = vi.fn(async (): Promise<RespostaAssistente> => { throw ocupado(1); });
    const esperar = vi.fn(async () => {});
    await expect(conversar(pergunta, pedir, () => ({}), { esperar })).rejects.toMatchObject({ tentarEmSegundos: 1 });
    expect(pedir).toHaveBeenCalledTimes(3);
    expect(esperar).toHaveBeenCalledTimes(2);
    const usuario = vi.fn(async (): Promise<RespostaAssistente> => { throw Object.assign(new Error('Muitas perguntas seguidas.'), { status: 429 }); });
    await expect(conversar(pergunta, usuario, () => ({}), { esperar })).rejects.toThrow('Muitas perguntas seguidas.');
    expect(usuario).toHaveBeenCalledTimes(1);
  });
});

describe('links de OS', () => {
  it('números que são OS do board viram link; os outros ficam como texto', () => {
    const conhecidas = osConhecidas(board());
    expect(partesComOs('A OS 90001 e a 90002 têm 1500 peças; 900010 não.', conhecidas)).toEqual([
      { texto: 'A OS ' }, { os: '90001' }, { texto: ' e a ' }, { os: '90002' }, { texto: ' têm 1500 peças; 900010 não.' }
    ]);
    expect(partesComOs('Nada aqui.', conhecidas)).toEqual([{ texto: 'Nada aqui.' }]);
    expect(partesComOs('90004', conhecidas)).toEqual([{ os: '90004' }]);
    expect(partesComOs('## Resumo\n**OS 90001** atrasada', conhecidas)).toEqual([{ texto: 'Resumo\nOS ' }, { os: '90001' }, { texto: ' atrasada' }]);
  });
});

describe('resposta sem repetição', () => {
  const lista = 'Faltas da OS 90001:\n- ZIPER: falta 4 UN\n- LINHA: falta 2 UN';
  it('tira parágrafos e blocos de linhas repetidos em seguida', () => {
    expect(semRepeticao(`${lista}\n\n${lista}`)).toBe(lista);
    expect(semRepeticao(`${lista}\n${lista}`)).toBe(lista);
    expect(semRepeticao('Resumo.\n\nFaltas:\n\n- A\n- B\n\nFaltas:\n\n- A\n- B\n\nQuer o resto?')).toBe('Resumo.\n\nFaltas:\n\n- A\n- B\n\nQuer o resto?');
    expect(semRepeticao('Oi.\n\n  oi.  \n\nTchau.')).toBe('Oi.\n\nTchau.');
  });
  it('conservador: linha única repetida dentro do parágrafo, repetição não seguida e texto sem repetição ficam como estão', () => {
    expect(semRepeticao('- 4 UN\n- 4 UN')).toBe('- 4 UN\n- 4 UN');
    expect(semRepeticao('A\n\nB\n\nA')).toBe('A\n\nB\n\nA');
    expect(semRepeticao('Uma linha.\n\n\nOutra.')).toBe('Uma linha.\n\n\nOutra.');
  });
  it('conversar devolve e guarda o texto sem a repetição', async () => {
    const r = await conversar([{ papel: 'usuario', texto: 'Faltas' }], async () => ({ texto: `${lista}\n\n${lista}` }), () => ({}));
    expect(r.texto).toBe(lista);
    expect(r.novas).toEqual([{ papel: 'assistente', texto: lista }]);
  });
});

