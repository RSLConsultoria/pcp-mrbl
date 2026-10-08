// Servidor local de conferência: imita pcp-login, pcp-board e pcp-acao com dados fictícios.
// Uso: node scripts/mock-api.mjs   (porta 8787, ou MOCK_PORT)
// Para ver a recusa do Gerar pedido (409 "Item já está no PED-…"): marque o mesmo item em duas abas e gere nas duas.
import http from 'node:http';

const PORTA = Number(process.env.MOCK_PORT) || 8787;
const USUARIOS = ['Lucca', 'Maria', 'Renata'];
const ENVIO_PLOOMES_MS = 20_000;
const agoraIso = () => new Date().toISOString();
const diaIso = (deslocDias = 0) => new Date(Date.now() + deslocDias * 86_400_000).toISOString().slice(0, 10);

// ---------- estado em memória ----------
const item = (id, nome, un, falta, extra = {}) => ({
  id, nome, cor: '', un, necessaria: falta + (extra.separada ?? 0), separada: 0, falta, faltaG: null, baixada: 0,
  restaG: null, obsAlmox: '', obsPcp: '', previsao: '', resolvidoEm: '', versao: '', status: 'ABERTO', ...extra
});
const caixa = (os, ciclo, tipo, peca, cliente, responsavel, itens, extra = {}) => ({
  dealId: String(700000 + (os - 90000)), os: String(os), ciclo, tipo, referencia: `REF-0${os - 90000}`, peca, cliente,
  responsavel, registradoEm: diaIso(-20), saiu: false, saiuComFalta: false, saiuEm: '', previsao: '', observacao: '',
  versao: '', tratativa: '', tratativaEm: '', historico: [], itens, ...extra
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
    caixa(90003, 'CORTE', 'COSTURA', 'PECA TESTE C', 'CLIENTE GAMA', '', [
      item('c1', 'VIES LINEAR 6 CM', 'MT', 450)
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-19) }),
    caixa(90004, 'PEDIDO', 'ACABAMENTO', 'PECA TESTE D', 'CLIENTE ALFA', 'Renata', [
      item('d1', 'TECIDO FORRO BEGE', 'MT', 30),
      item('d2', 'BOTAO MADREPEROLA 15MM', 'UN', 120)
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-9) }),
    caixa(90005, 'PEDIDO', 'COSTURA', 'PECA TESTE E', 'CLIENTE BETA', 'Maria', [
      item('e1', 'FITA GROSGRAIN 25MM', 'MT', 300)
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-6),
      historico: [hist(1, 'Renata', 'Renata dividiu PED-0003: 120 MT de FITA GROSGRAIN 25MM foram para PED-0003.1 (Material no almoxarifado)')] }),
    caixa(90006, 'PEDIDO', 'ACABAMENTO', 'PECA TESTE F', 'CLIENTE GAMA', 'Lucca', [
      item('f1', 'ELASTICO CHATO 30MM', 'MT', 80, { separada: 20, status: 'PARCIAL' })
    ], { saiu: true, saiuComFalta: true, saiuEm: diaIso(-4), tratativa: 'ENVIADO', tratativaEm: diaIso(-2) })
  ],
  etapas: [
    { id: 'a_pedir', nome: 'A pedir' }, { id: 'solicitado', nome: 'Solicitado' },
    { id: 'aguardando', nome: 'Aguardando entrega' }, { id: 'entregue', nome: 'Material no almoxarifado' }
  ],
  pedidos: [
    { id: 'PED-0001', etapa: 'solicitado', origem: 'FORNECEDOR', quem: 'TECIDOS BETA', local: 'SAO_PAULO', previsao: diaIso(6), responsavel: 'Renata', criadoEm: diaIso(-5), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'd1', dealId: '700004', qtd: 20, fornecedor: 'TECIDOS BETA' }] },
    { id: 'PED-0002', etapa: 'aguardando', origem: 'CLIENTE', quem: 'CLIENTE BETA', local: 'BRAGANCA', previsao: diaIso(10), responsavel: 'Lucca', criadoEm: diaIso(-4), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'b1', dealId: '700002', qtd: 52, fornecedor: '' }] },
    // já dividido: 120 MT chegaram e viraram o PED-0003.1; o PED-0003 espera os outros 180 MT
    { id: 'PED-0003', etapa: 'aguardando', origem: 'FORNECEDOR', quem: 'AVIAMENTOS DELTA', local: 'BRAGANCA', previsao: diaIso(-1), responsavel: 'Maria', criadoEm: diaIso(-8), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'e1', dealId: '700005', qtd: 180, fornecedor: 'AVIAMENTOS DELTA' }] },
    { id: 'PED-0003.1', pai: 'PED-0003', etapa: 'entregue', origem: 'FORNECEDOR', quem: 'AVIAMENTOS DELTA', local: 'BRAGANCA', previsao: diaIso(-1), responsavel: 'Maria', criadoEm: diaIso(-1), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'e1', dealId: '700005', qtd: 120, fornecedor: 'AVIAMENTOS DELTA' }] },
    { id: 'PED-0004', etapa: 'entregue', origem: 'CLIENTE', quem: 'CLIENTE ALFA', local: 'BRAGANCA', previsao: diaIso(-6), responsavel: 'Maria', criadoEm: diaIso(-12), baixadoEm: diaIso(-3), versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'a3', dealId: '700001', qtd: 26, fornecedor: '' }] },
    // etapa que saiu do quadro: aparece na coluna Outra etapa até ser movido
    { id: 'PED-0005', etapa: 'conferencia', origem: 'FORNECEDOR', quem: 'AVIAMENTOS DELTA', local: 'BRAGANCA', previsao: diaIso(4), responsavel: 'Renata', criadoEm: diaIso(-15), baixadoEm: '', versao: '2026-01-01T00:00:00.000Z', itens: [{ itemId: 'd2', dealId: '700004', qtd: 120, fornecedor: '' }] }
  ],
  // caixa 90002 fica de fora para mostrar a visão somente leitura
  dealsEditaveis: ['700001', '700003', '700004', '700005', '700006']
};

// ---------- utilidades ----------
class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new Erro(400, m);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const fmtNum = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const ultimaEtapa = () => estado.etapas[estado.etapas.length - 1].id;
const nomeEtapa = (id) => estado.etapas.find((e) => e.id === id)?.nome ?? id;
const resta = (it) => Math.max(0, it.falta - it.baixada);
const aberto = (it) => it.status !== 'RESOLVIDO' && resta(it) > 0;
const caixaDe = (dealId) => estado.caixas.find((c) => c.dealId === dealId);
const editavel = (dealId) => estado.dealsEditaveis.includes(dealId);
const itemDe = (dealId, itemId) => caixaDe(dealId)?.itens.find((i) => i.id === itemId);
// Pedido PED-nnnn ou parte PED-nnnn.k (dividir pedido); itens com qtd 0 foram todos para uma parte.
const numPedido = (id) => parseInt(id.slice(4), 10);
const raizDoPedido = (id) => id.split('.')[0];
const parteDoPedido = (id) => Number(id.split('.')[1] ?? 0);
const compararPedidos = (a, b) => numPedido(a.id) - numPedido(b.id) || parteDoPedido(a.id) - parteDoPedido(b.id);
const itensValidos = (p) => p.itens.filter((i) => i.qtd !== 0);
const pedidosAbertosDoItem = (dealId, itemId) => [...estado.pedidos].sort(compararPedidos)
  .filter((p) => !p.baixadoEm && itensValidos(p).some((i) => i.dealId === dealId && i.itemId === itemId));
const pedidoAbertoDoItem = (dealId, itemId) => pedidosAbertosDoItem(dealId, itemId)[0];
const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slug = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'etapa';
const chaveNome = (s) => semAcento(s).trim().toLowerCase();
const nomeLocal = (l) => (l === 'SAO_PAULO' ? 'São Paulo' : 'Bragança');

function exigirEditavel(dealIds) {
  for (const d of dealIds) if (!editavel(d)) throw new Erro(403, 'Edição liberada em breve para esta caixa.');
}
function conferirVersao(atual, enviada) {
  if ((atual ?? '') !== (enviada ?? '')) throw new Erro(409, 'Alguém alterou esta caixa agora há pouco.');
}
function validarData(v) {
  if (v === '' || v === undefined) return;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad('Data inválida.');
}
function validarDadosPedido(c) {
  if (c.origem !== 'FORNECEDOR' && c.origem !== 'CLIENTE') throw bad('Origem inválida.');
  if (c.local !== 'BRAGANCA' && c.local !== 'SAO_PAULO') throw bad('Local inválido.');
  validarData(c.previsao);
}

function registrar(dealId, usuario, texto, historicos) {
  const h = { quando: agoraIso(), usuario, texto, criadoMs: Date.now() };
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
    etapasPedido: estado.etapas.map((e, i) => ({ ...e, ordem: i + 1 })),
    pedidos: [...estado.pedidos].sort(compararPedidos).map((p) => ({
      ...p,
      pai: p.pai ?? '',
      finalizado: p.etapa === ultimaEtapa() && !!p.baixadoEm,
      itens: itensValidos(p).map((i) => {
        const it = itemDe(i.dealId, i.itemId);
        return { ...i, os: caixaDe(i.dealId).os, nome: it.nome, un: it.un };
      })
    })),
    caixas: estado.caixas.map((c) => ({
      ...c,
      id: c.dealId,
      historico: c.historico.map((h) => ({
        quando: h.quando, usuario: h.usuario, texto: h.texto,
        ploomes: h.criadoMs && agora - h.criadoMs < ENVIO_PLOOMES_MS ? 'PENDENTE' : 'ENVIADO'
      })),
      itens: c.itens.map((i) => ({
        ...i, resta: resta(i), restaG: i.faltaG === null ? null : Math.round((resta(i) / i.falta) * i.faltaG),
        editavel: editavel(c.dealId) && aberto(i),
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
function pedidoEditavel(p) {
  exigirEditavel(dealsDe(p));
  if (p.baixadoEm) throw new Erro(409, 'Pedido finalizado não pode ser alterado.');
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
  }
  const n = Math.max(0, ...estado.pedidos.map((p) => numPedido(p.id))) + 1;
  const id = `PED-${String(n).padStart(4, '0')}`;
  const versao = agoraIso();
  estado.pedidos.push({
    id, etapa: estado.etapas[0].id, origem: c.origem, quem: c.quem ?? '', local: c.local, previsao: c.previsao ?? '',
    responsavel: c.responsavel ?? '', criadoEm: diaIso(), baixadoEm: '', versao,
    itens: c.itens.map((i) => ({ itemId: i.itemId, dealId: i.dealId, qtd: i.qtd, fornecedor: i.fornecedor ?? '' }))
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
  pedidoEditavel(p);
  conferirVersao(p.versao, c.versao);
  const campos = c.campos ?? {};
  const porDeal = new Map();
  const add = (d, t) => porDeal.set(d, [...(porDeal.get(d) ?? []), t]);
  const comuns = [];
  if ('origem' in campos && campos.origem !== 'FORNECEDOR' && campos.origem !== 'CLIENTE') throw bad('Origem inválida.');
  if ('local' in campos && campos.local !== 'BRAGANCA' && campos.local !== 'SAO_PAULO') throw bad('Local inválido.');
  if ('previsao' in campos) validarData(campos.previsao);
  if ('etapa' in campos && !estado.etapas.some((e) => e.id === campos.etapa)) throw bad('Etapa inválida.');
  const rot = { etapa: 'Etapa', origem: 'Origem', quem: 'Quem', local: 'Local', previsao: 'Previsão', responsavel: 'Responsável' };
  const fmt = (k, v) => {
    if (v === '' || v == null) return '—';
    if (k === 'etapa') return nomeEtapa(v);
    if (k === 'local') return nomeLocal(v);
    if (k === 'origem') return v === 'CLIENTE' ? 'Cliente' : 'Fornecedor';
    return k === 'previsao' ? ddmm(v) : v;
  };
  const antes = { ...p };
  const novos = {};
  for (const k of Object.keys(rot)) {
    if (!(k in campos) || (campos[k] ?? '') === (p[k] ?? '')) continue;
    comuns.push(`${rot[k]}: ${fmt(k, antes[k])} → ${fmt(k, campos[k])}`);
    novos[k] = campos[k] ?? '';
  }
  const novosItens = [];
  for (const m of c.itens ?? []) {
    const pi = p.itens.find((i) => i.itemId === m.itemId);
    if (!pi) throw bad('Item não está no pedido.');
    const it = itemDe(pi.dealId, pi.itemId);
    if (m.qtd !== undefined) {
      if (!num(m.qtd) || m.qtd <= 0) throw bad('Informe uma quantidade maior que zero');
      if (m.qtd > resta(it)) throw bad(`Falta só ${fmtNum(resta(it))} ${it.un} de ${it.nome}`);
      if (m.qtd !== pi.qtd) { add(pi.dealId, `qtd de ${it.nome}: ${pi.qtd == null ? '—' : fmtNum(pi.qtd)} → ${fmtNum(m.qtd)}`); novosItens.push([pi, 'qtd', m.qtd]); }
    }
    if (m.fornecedor !== undefined && m.fornecedor !== pi.fornecedor) {
      add(pi.dealId, `fornecedor de ${it.nome}: ${pi.fornecedor || '—'} → ${m.fornecedor || '—'}`); novosItens.push([pi, 'fornecedor', m.fornecedor]);
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
  pedidoEditavel(p);
  conferirVersao(p.versao, c.versao);
  if (!estado.etapas.some((e) => e.id === c.etapa)) throw bad('Etapa inválida.');
  if (p.etapa === c.etapa) throw bad('O pedido já está nessa etapa.');
  p.etapa = c.etapa; p.versao = agoraIso();
  const historicos = [];
  for (const d of dealsDe(p)) registrar(d, usuario, `${usuario} moveu ${p.id} para ${nomeEtapa(c.etapa)}`, historicos);
  return resposta(p.versao, historicos, { pedidoId: p.id });
}

function baixarPedido(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoEditavel(p);
  conferirVersao(p.versao, c.versao);
  if (p.etapa !== ultimaEtapa()) throw bad('Dar baixa só na última etapa.');
  const partes = new Map();
  for (const pi of p.itens) {
    const it = itemDe(pi.dealId, pi.itemId);
    const q = Math.min(pi.qtd ?? 0, resta(it));
    if (q <= 0) continue;
    darBaixa(it, q);
    partes.set(pi.dealId, [...(partes.get(pi.dealId) ?? []), `${fmtNum(q)} ${it.un} de ${it.nome} (resta ${fmtNum(resta(it))} ${it.un})`]);
  }
  p.baixadoEm = diaIso(); p.versao = agoraIso();
  const historicos = [];
  for (const d of dealsDe(p)) registrar(d, usuario, `${usuario} deu baixa do ${p.id}: ${(partes.get(d) ?? ['sem itens abertos']).join('; ')}`, historicos);
  return resposta(p.versao, historicos, { pedidoId: p.id });
}

function dividirPedido(c, usuario) {
  const p = pedidoPorId(c.pedidoId);
  pedidoEditavel(p);
  conferirVersao(p.versao, c.versao);
  const etapa = estado.etapas.find((e) => e.id === c.etapa);
  if (!etapa) throw bad('Etapa inválida.');
  if (!Array.isArray(c.itens) || c.itens.length === 0) throw bad('Marque ao menos um item que chegou.');
  const vistos = new Set();
  const movidos = [];
  for (const m of c.itens) {
    if (vistos.has(m.itemId)) throw bad('Item repetido no pedido.');
    vistos.add(m.itemId);
    if (!num(m.qtd) || m.qtd <= 0) throw bad('Informe uma quantidade maior que zero');
    const pi = itensValidos(p).find((i) => i.itemId === m.itemId);
    if (!pi) throw bad('Item não está no pedido.');
    const it = itemDe(pi.dealId, pi.itemId);
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
  estado.pedidos.push({
    id, pai: raiz, etapa: etapa.id, origem: p.origem, quem: p.quem, local: p.local, previsao: p.previsao, responsavel: p.responsavel,
    criadoEm: diaIso(), baixadoEm: '', versao,
    itens: movidos.map((m) => ({ itemId: m.pi.itemId, dealId: m.pi.dealId, qtd: m.qtd, fornecedor: m.pi.fornecedor }))
  });
  for (const m of movidos) m.pi.qtd = Math.round((m.pi.qtd - m.qtd) * 1000) / 1000;
  p.versao = versao;
  const historicos = [];
  const porDeal = new Map();
  for (const m of movidos) porDeal.set(m.pi.dealId, [...(porDeal.get(m.pi.dealId) ?? []), `${fmtNum(m.qtd)} ${m.it.un} de ${m.it.nome}`]);
  for (const [d, partes] of porDeal) registrar(d, usuario, `${usuario} dividiu ${p.id}: ${partes.join('; ')} foram para ${id} (${etapa.nome})`, historicos);
  return resposta(versao, historicos, { pedidoId: id });
}

function salvarEtapas(c) {
  const lista = c.etapas;
  if (!Array.isArray(lista) || lista.length < 2) throw bad('O quadro precisa de pelo menos 2 etapas.');
  const nomes = new Set();
  for (const e of lista) {
    const nome = String(e?.nome ?? '').trim();
    if (!nome) throw bad('Dê um nome a todas as etapas.');
    if (nomes.has(chaveNome(nome))) throw bad(`Já existe uma etapa chamada ${nome}.`);
    nomes.add(chaveNome(nome));
    if (e.id && !estado.etapas.some((x) => x.id === e.id)) throw bad('Etapa desconhecida.');
  }
  const mantidos = new Set(lista.filter((e) => e.id).map((e) => e.id));
  for (const antiga of estado.etapas) {
    if (mantidos.has(antiga.id)) continue;
    if (estado.pedidos.some((p) => !p.baixadoEm && p.etapa === antiga.id)) throw new Erro(409, `A etapa ${antiga.nome} tem pedidos abertos.`);
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

function oficina(c, usuario, recebeu) {
  const cx = caixaDe(c.dealId);
  if (!cx) throw new Erro(404, 'Caixa não encontrada.');
  exigirEditavel([cx.dealId]);
  conferirVersao(cx.versao, c.versao);
  cx.versao = agoraIso(); cx.tratativaEm = diaIso();
  const historicos = [];
  if (recebeu) {
    cx.tratativa = 'RECEBIDO';
    for (const it of cx.itens) if (aberto(it)) darBaixa(it, resta(it));
    registrar(cx.dealId, usuario, `${usuario} registrou que a oficina recebeu o material`, historicos);
  } else {
    cx.tratativa = 'ENVIADO';
    registrar(cx.dealId, usuario, `${usuario} enviou o material faltante à oficina`, historicos);
  }
  return resposta(cx.versao, historicos);
}

function processar(corpo, usuario) {
  switch (corpo?.tipo) {
    case 'baixa': case 'previsao_item': case 'obs_item':
    case 'responsavel': case 'previsao_caixa': case 'obs_caixa': return acaoF2(corpo, usuario);
    case 'gerar_pedido': return gerarPedido(corpo, usuario);
    case 'editar_pedido': return editarPedido(corpo, usuario);
    case 'mover_pedido': return moverPedido(corpo, usuario);
    case 'baixar_pedido': return baixarPedido(corpo, usuario);
    case 'dividir_pedido': return dividirPedido(corpo, usuario);
    case 'salvar_etapas': return salvarEtapas(corpo);
    case 'enviar_oficina': return oficina(corpo, usuario, false);
    case 'oficina_recebeu': return oficina(corpo, usuario, true);
    default: throw bad('Tipo de ação inválido.');
  }
}

// ---------- HTTP ----------
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
  const rota = (req.url ?? '').split('?')[0];
  try {
    if (rota === '/pcp-login' && req.method === 'POST') {
      return enviar(res, 200, { token: 'm'.repeat(64), nome: 'Lucca', perfil: 'ADM', expiraEm: new Date(Date.now() + 12 * 3_600_000).toISOString() });
    }
    if (rota === '/pcp-board' && req.method === 'GET') return enviar(res, 200, montarBoard());
    if (rota === '/pcp-acao' && req.method === 'POST') {
      const corpo = await lerCorpo(req);
      if (!corpo) return enviar(res, 400, { erro: 'Corpo inválido.' });
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
servidor.listen(PORTA, () => console.log(`Mock da API em http://localhost:${PORTA} (pcp-login, pcp-board, pcp-acao)`));
