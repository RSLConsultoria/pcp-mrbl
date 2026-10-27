import { describe, expect, it } from 'vitest';
import type { Board, EmailPcp } from '../api/tipos';
import { chaveDaAcao, mensagemSucesso } from './acoes';
import {
  dealsAlvoEmailPcp, destinoDoEmail, emailsDaOs, emailsPendentes, emailsPendentesDaCaixa, resumoFaixaEmails, textoSugestaoEmail
} from './emailsPcp';
import { acaoNoBoard, aplicarOtimista, versaoNoBoard, type Pendente } from './otimista';
import { caixa, item } from './teste-util';

// F5c · e-mails do PCP no site. Dados fictícios.
const email = (o: Partial<EmailPcp> = {}): EmailPcp => ({
  id: 'G1', quando: '2026-10-27T12:00:00.000Z', de: 'Pessoa Um', assunto: 'RE: Caixa separada - OS:90001', os: '90001',
  modelo: 'CAIXA_SEPARADA', texto: 'O zíper chega dia 30/10.', tipo: 'PREVISAO', valor: '2026-10-30', itens: ['z1'],
  resumo: 'Zíper chega 30/10', evidencia: 'chega dia 30/10', confianca: 0.9, status: 'PENDENTE', ...o
});
function quadro(emails: EmailPcp[]): Board {
  return {
    geradoEm: '', avisos: [], usuarios: [], emailsPcp: emails,
    caixas: [
      caixa({ id: '700001', dealId: '700001', os: '90001', itens: [item({ id: 'z1', nome: 'ZIPER METAL' })] }),
      caixa({ id: '700011', dealId: '700011', os: '90001', tipo: 'ACABAMENTO', itens: [item({ id: 'l1', nome: 'LINHA 120' })] }),
      caixa({ id: '700002', dealId: '700002', os: '90002', itens: [item({ id: 'x1', status: 'RESOLVIDO', resta: 0 })] })
    ]
  };
}

describe('caixas da sugestão (espelho do servidor)', () => {
  const b = quadro([]);
  it('itens citados: os deals deles', () => expect(dealsAlvoEmailPcp(email({ itens: ['l1'] }), b.caixas)).toEqual(['700011']));
  it('sem itens: as caixas da OS com falta', () => expect(dealsAlvoEmailPcp(email({ itens: [] }), b.caixas)).toEqual(['700001', '700011']));
  it('sem falta: todas da OS', () => expect(dealsAlvoEmailPcp(email({ os: '90002', itens: [] }), b.caixas)).toEqual(['700002']));
  it('OS sem caixa: nenhuma', () => expect(dealsAlvoEmailPcp(email({ os: '90009', itens: [] }), b.caixas)).toEqual([]));
});

describe('listas e textos', () => {
  const b = quadro([
    email(), email({ id: 'G2', quando: '2026-10-27T13:00:00.000Z', tipo: 'CHAMADO', valor: '1234567', itens: [] }),
    email({ id: 'G3', status: 'ACEITA' }), email({ id: 'G4', os: '90002', itens: [] })
  ]);
  it('pendentes, mais novas primeiro', () => expect(emailsPendentes(b).map((e) => e.id)).toEqual(['G2', 'G1', 'G4']));
  it('da caixa: só as que valem para ela', () => {
    expect(emailsPendentesDaCaixa(b, '700001').map((e) => e.id)).toEqual(['G2', 'G1']);
    expect(emailsPendentesDaCaixa(b, '700011').map((e) => e.id)).toEqual(['G2']);
  });
  it('da OS: todas, inclusive decididas', () => expect(emailsDaOs(b, '90001').map((e) => e.id)).toEqual(['G2', 'G1', 'G3']));
  it('o que a IA entendeu', () => {
    expect(textoSugestaoEmail(email(), b)).toBe('Previsão 30/10 para ZIPER METAL');
    expect(textoSugestaoEmail(email({ itens: [] }), b)).toBe('Previsão 30/10 para a caixa');
    expect(textoSugestaoEmail(email({ tipo: 'QUANTIDADE', valor: '38' }), b)).toBe('Quantidade conferida de ZIPER METAL: 38');
    expect(textoSugestaoEmail(email({ tipo: 'CHAMADO', valor: '1234567' }), b)).toBe('Chamado #1234567');
    expect(textoSugestaoEmail(email({ tipo: 'OBSERVACAO', resumo: 'Pediram conferência' }), b)).toBe('Observação: Pediram conferência');
  });
  it('destino do clique: a caixa, ou a Visão da peça sem caixa', () => {
    expect(destinoDoEmail(b, email())).toEqual({ caixaId: '700001' });
    expect(destinoDoEmail(b, email({ os: '90009', itens: [] }))).toEqual({ os: '90009' });
  });
  it('faixa no singular e no plural', () => {
    expect(resumoFaixaEmails(1)).toBe('1 sugestão nova dos e-mails do PCP');
    expect(resumoFaixaEmails(3)).toBe('3 sugestões novas dos e-mails do PCP');
  });
});

describe('decidir_email_pcp otimista', () => {
  const ctx = { hoje: '2026-10-27', n: 3 };
  it('aceitar PREVISAO com item põe a data no item e marca ACEITA', () => {
    const b = aplicarOtimista(quadro([email()]), { tipo: 'decidir_email_pcp', id: 'G1', decisao: 'ACEITAR' }, ctx);
    expect(b.emailsPcp?.[0].status).toBe('ACEITA');
    expect(b.caixas[0].itens[0].previsao).toBe('2026-10-30');
    expect(b.caixas[1].previsao).toBe('');
  });
  it('aceitar PREVISAO sem item põe a previsão geral nas caixas da sugestão', () => {
    const b = aplicarOtimista(quadro([email({ itens: [] })]), { tipo: 'decidir_email_pcp', id: 'G1', decisao: 'ACEITAR' }, ctx);
    expect(b.caixas.map((c) => c.previsao)).toEqual(['2026-10-30', '2026-10-30', '']);
  });
  it('aceitar CHAMADO só marca; ignorar só marca; decidida não muda', () => {
    const chamado = aplicarOtimista(quadro([email({ tipo: 'CHAMADO', valor: '123', itens: [] })]), { tipo: 'decidir_email_pcp', id: 'G1', decisao: 'ACEITAR' }, ctx);
    expect(chamado.emailsPcp?.[0].status).toBe('ACEITA');
    expect(chamado.caixas.map((c) => c.previsao)).toEqual(['', '', '']);
    const ignorada = aplicarOtimista(quadro([email()]), { tipo: 'decidir_email_pcp', id: 'G1', decisao: 'IGNORAR' }, ctx);
    expect(ignorada.emailsPcp?.[0].status).toBe('IGNORADA');
    expect(ignorada.caixas[0].itens[0].previsao).toBe('');
    const ja = quadro([email({ status: 'IGNORADA' })]);
    expect(aplicarOtimista(ja, { tipo: 'decidir_email_pcp', id: 'G1', decisao: 'ACEITAR' }, ctx)).toBe(ja);
  });
  it('a fila reconhece a decisão no board pelo status; chave e mensagem', () => {
    const acao = { tipo: 'decidir_email_pcp' as const, id: 'G1', decisao: 'ACEITAR' as const };
    const p: Pendente = { id: 1, acao, estado: 'confirmada', confirmadaEm: 1 };
    expect(acaoNoBoard(quadro([email()]), p)).toBe(false);
    expect(acaoNoBoard(quadro([email({ status: 'ACEITA' })]), p)).toBe(true);
    expect(versaoNoBoard(quadro([email()]), acao)).toBeUndefined();
    expect(chaveDaAcao(acao)).toBe('email:G1');
    expect(mensagemSucesso(acao)).toBe('Sugestão do e-mail aceita');
    expect(mensagemSucesso({ ...acao, decisao: 'IGNORAR' })).toBe('Sugestão do e-mail ignorada');
  });
});
