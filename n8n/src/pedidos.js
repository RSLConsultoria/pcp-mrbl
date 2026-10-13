// ===== src/pedidos.js =====
// F3: solicitacoes de faltas (PEDIDOS, PEDIDOS_ITENS, ETAPAS_PEDIDO) e a demanda
// pos-saida (itens novos na FALTANTES depois que a caixa saiu). As duas ultimas
// etapas (pela ordem) sao fixas: a penultima ("Enviado ao destino final") da a baixa
// do pedido nas caixas; a ultima ("Concluido": o destino confirmou que recebeu)
// finaliza o pedido. Funcoes puras; sem import/export. Depende de util.js,
// montarCaixas.js e acoes.js.
// Cada acao devolve { operacoes: [{ aba, operacao, chave, linha }], historicos }.

var TIPOS_PEDIDO = ['gerar_pedido', 'editar_pedido', 'mover_pedido', 'baixar_pedido',
  'dividir_pedido', 'dividir_por_previsao', 'salvar_etapas', 'nova_demanda'];
var ETAPAS_PADRAO = [
  { id: 'a_pedir', nome: 'A pedir', ordem: 1 },
  { id: 'solicitado', nome: 'Solicitado', ordem: 2 },
  { id: 'aguardando', nome: 'Aguardando entrega', ordem: 3 },
  // id 'entregue' mantido para os dados existentes: e a etapa que da a baixa.
  { id: 'entregue', nome: 'Enviado ao destino final', ordem: 4 },
  { id: 'concluido', nome: 'Concluído', ordem: 5 }
];
var ORIGENS = { FORNECEDOR: 'Fornecedor', CLIENTE: 'Cliente' };
var LOCAIS = { BRAGANCA: 'Bragança', SAO_PAULO: 'São Paulo', OFICINA: 'Oficina', CLIENTE: 'Cliente' };
var ERRO_VERSAO_PEDIDO = 'Alguém alterou este pedido agora há pouco.';
var ERRO_ETAPA_PELO_CARD = 'Para mudar a etapa, arraste o card.';
// Site antigo aberto numa aba depois do deploy: manda corpo que a API nova entenderia
// de outro jeito (baixa sem confirmacao, divisao para outra etapa). Recarregar resolve.
var ERRO_SITE_ANTIGO = 'Atualize a página: o site mudou.';
var NOMES_CAIXA = { COSTURA: 'Costura', ACABAMENTO: 'Acabamento' };
var MAX_ITENS_DEMANDA = 30;
var CAMPOS_PEDIDO = ['origem', 'quem', 'local', 'previsao', 'responsavel'];
var NOMES_CAMPO = { origem: 'Origem', quem: 'Quem', local: 'Local', previsao: 'Previsão', responsavel: 'Responsável' };

// ---------- leitura das abas ----------

// PED-nnnn (pedido original) ou PED-nnnn.k (parte k de uma divisao).
var RE_PEDIDO = /^PED-(\d+)(?:\.(\d+))?$/;

function numeroDoPedido(id) {
  var m = RE_PEDIDO.exec(texto(id));
  return m ? Number(m[1]) : 0;
}

// Numero da parte (PED-0002.3 -> 3); 0 no pedido original.
function parteDoPedido(id) {
  var m = RE_PEDIDO.exec(texto(id));
  return m && m[2] !== undefined ? Number(m[2]) : 0;
}

// Pedido valido: numero > 0 (PED-0000 e a linha-semente) e, se for parte, k > 0.
function pedidoValido(id) {
  var m = RE_PEDIDO.exec(texto(id));
  return !!m && Number(m[1]) > 0 && (m[2] === undefined || Number(m[2]) > 0);
}

// Familia: PED-0002.3 -> PED-0002.
function raizDoPedido(id) {
  return texto(id).split('.')[0];
}

function compararPedidos(a, b) {
  return (numeroDoPedido(a) - numeroDoPedido(b)) || (parteDoPedido(a) - parteDoPedido(b));
}

function proximoIdPedido(pedidos) {
  var max = 0;
  (pedidos || []).forEach(function (p) {
    // a parte PED-0005.1 conta como 5: o proximo original nunca colide com uma familia
    var n = numeroDoPedido(p && p.id);
    if (n > max) max = n;
  });
  var s = String(max + 1);
  while (s.length < 4) s = '0' + s;
  return 'PED-' + s;
}

// Proxima parte da familia: maior k existente (aberta ou nao) + 1.
function proximoIdFilho(pedidos, raiz) {
  var max = 0;
  (pedidos || []).forEach(function (p) {
    var id = texto(p && p.id);
    if (!pedidoValido(id) || raizDoPedido(id) !== raiz) return;
    var k = parteDoPedido(id);
    if (k > max) max = k;
  });
  return raiz + '.' + (max + 1);
}

var ID_ETAPA_CONCLUIDO = 'concluido';

// Etapas validas (com id e nome), ordenadas; aba vazia = padrao. Sem a etapa de id
// `concluido` (aba antiga, de 4 linhas, de antes das etapas novas) entra uma etapa
// virtual Concluido no fim (maior ordem + 1): a penultima passa a ser a ultima da
// aba (`entregue`), que da a baixa, e o deploy nao depende de mexer na aba antes.
// O salvar_etapas grava a linha que falta.
function lerEtapas(linhas) {
  var e = lerEtapasDaAba(linhas);
  if (e.some(function (x) { return x.id === ID_ETAPA_CONCLUIDO; })) return e;
  var max = 0;
  e.forEach(function (x) { if (x.ordem > max) max = x.ordem; });
  return e.concat([{ id: ID_ETAPA_CONCLUIDO, nome: 'Concluído', ordem: max + 1 }]);
}

function lerEtapasDaAba(linhas) {
  var lidas = (linhas || []).filter(function (e) { return e && texto(e.id) !== '' && texto(e.nome) !== ''; })
    .map(function (e) {
      var o = numero(e.ordem);
      return { id: texto(e.id), nome: texto(e.nome), ordem: o === null || isNaN(o) ? Infinity : o };
    })
    .sort(function (a, b) {
      if (a.ordem !== b.ordem) return a.ordem < b.ordem ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  if (!lidas.length) return ETAPAS_PADRAO.map(function (e) { return { id: e.id, nome: e.nome, ordem: e.ordem }; });
  return lidas.map(function (e, i) { return { id: e.id, nome: e.nome, ordem: e.ordem === Infinity ? i + 1 : e.ordem }; });
}

// ---------- "pedido acompanha o corte" ----------
// Id do item na FALTANTES: <deal_id>|<CICLO>|<cod_item>|<cor>|<tamanho>. A conferencia
// pos-corte (Sync Faltantes) grava as linhas CORTE e marca SUBSTITUIDO as do PEDIDO que
// reaparecem no corte. O pedido feito antes continua com o item_id do PEDIDO na
// PEDIDOS_ITENS; a leitura troca pelo item do CORTE (mesmo id, CICLO = CORTE). A planilha
// nao e reescrita. Sem item correspondente (o material saiu no corte) fica o item antigo,
// marcado item_mudou: nao recebe baixa (a linha SUBSTITUIDO nao esta aberta) e o board avisa.

function indexarFaltantes(faltantes) {
  var m = {};
  (faltantes || []).forEach(function (l) {
    var id = texto(l && l.id);
    if (id && !m[id]) m[id] = l;
  });
  return m;
}

function idNoCorte(itemId) {
  var partes = texto(itemId).split('|');
  if (partes.length < 3 || partes[1].toUpperCase() !== 'PEDIDO') return '';
  partes[1] = 'CORTE';
  return partes.join('|');
}

function linhaSubstituida(l) {
  return !!l && semAcento(l.status) === 'SUBSTITUIDO';
}

// Linha da PEDIDOS_ITENS como vale agora: item_id do CORTE (com nome e unidade da linha
// do CORTE) ou item_mudou. item_id_gravado guarda o id que esta na planilha.
function itemDoPedidoAtual(it, faltantesPorId) {
  var id = texto(it.item_id);
  var atual = faltantesPorId[id];
  if (atual && !linhaSubstituida(atual)) return it;
  var corte = faltantesPorId[idNoCorte(id)];
  if (corte && !linhaSubstituida(corte)) {
    return Object.assign({}, it, {
      item_id: texto(corte.id), item_id_gravado: id,
      nome: texto(corte.descricao_item) || texto(it.nome), un: texto(corte.unidade) || texto(it.un)
    });
  }
  if (linhaSubstituida(atual)) return Object.assign({}, it, { item_mudou: true });
  return it;
}

// Id que a PEDIDOS_ITENS grava para este item (o do CORTE resolvido nao e gravado).
function idGravado(it) {
  return texto(it.item_id_gravado) || texto(it.item_id);
}

// O item do pedido pelo id que o site mandou: o atual ou (site aberto antes do corte) o gravado.
function itemDoPedidoPorId(itens, itemId) {
  return itens.filter(function (x) { return texto(x.item_id) === itemId; })[0] ||
    itens.filter(function (x) { return idGravado(x) === itemId; })[0];
}

function textoItemMudou(nome) {
  return nome + ' mudou no corte e não tem correspondente';
}

// [{ linha, id, itens: [linhas de PEDIDOS_ITENS] }], sem sementes. Com faltantes, os
// itens ja vem resolvidos para o ciclo atual (itemDoPedidoAtual).
function lerPedidos(pedidos, itens, faltantes) {
  var faltantesPorId = faltantes ? indexarFaltantes(faltantes) : null;
  var porId = {};
  var lista = [];
  (pedidos || []).forEach(function (p) {
    if (!p || !pedidoValido(p.id)) return;
    var id = texto(p.id);
    if (porId[id]) return;
    porId[id] = { linha: p, id: id, itens: [] };
    lista.push(porId[id]);
  });
  (itens || []).forEach(function (it) {
    if (!it) return;
    var pid = texto(it.pedido_id);
    if (!porId[pid] || texto(it.item_id) === '' || texto(it.deal_id) === '' || texto(it.deal_id) === '0') return;
    // qtd 0 = item que foi todo para uma parte do pedido (dividir_pedido).
    if (numero(it.qtd) === 0) return;
    porId[pid].itens.push(faltantesPorId ? itemDoPedidoAtual(it, faltantesPorId) : it);
  });
  return lista;
}

// Avisos de dados inconsistentes (corrida na geracao de ids, item em 2 pedidos).
function avisosPedidos(pedidos, itens, lista) {
  var avisos = [];
  var vistos = {};
  var jaAvisou = {};
  (pedidos || []).forEach(function (p) {
    if (!p || !pedidoValido(p.id)) return;
    var id = texto(p.id);
    if (vistos[id] && !jaAvisou[id]) {
      jaAvisou[id] = 1;
      avisos.push('Pedido ' + id + ' duplicado na planilha (gerado ao mesmo tempo?). Revise a aba PEDIDOS.');
    }
    vistos[id] = 1;
  });
  var porItem = {};
  var ordem = [];
  lista.forEach(function (p) {
    if (!pedidoAberto(p)) return;
    p.itens.forEach(function (it) {
      var k = texto(it.item_id);
      var fam = raizDoPedido(p.id);
      if (!porItem[k]) { porItem[k] = { ids: {}, n: 0, it: it }; ordem.push(k); }
      if (!porItem[k].ids[fam]) { porItem[k].ids[fam] = 1; porItem[k].n++; }
    });
  });
  ordem.forEach(function (k) {
    if (porItem[k].n > 1) {
      avisos.push('Item ' + texto(porItem[k].it.nome) + ' (OS ' + texto(porItem[k].it.os) + ') está em mais de um pedido aberto.');
    }
  });
  lista.forEach(function (p) {
    if (!pedidoAberto(p)) return;
    p.itens.forEach(function (it) {
      if (it.item_mudou) {
        avisos.push(p.id + ': ' + textoItemMudou(texto(it.nome) + ' (OS ' + texto(it.os) + ')') + ': confira o pedido.');
      }
    });
  });
  return avisos;
}

function pedidoAberto(p) {
  return texto(p.linha.baixado_em) === '';
}

// Pedido com baixa dada (entrou na etapa da baixa). Nao prende mais o item.
function pedidoBaixado(p) {
  return texto(p.linha.baixado_em) !== '';
}

// Pedido concluido (o destino confirmou o recebimento): finalizado, nao muda mais.
// Tambem conta o pedido que a API antiga levou para a ultima etapa (ela dava a baixa
// la e nao gravava concluido_em): etapa final + baixado_em, sem concluido_em.
function pedidoConcluido(p, etapas) {
  return texto(p.linha.concluido_em) !== '' || concluidoPelaApiAntiga(p.linha, etapas);
}

function concluidoPelaApiAntiga(linha, etapas) {
  var final = etapas && etapas.length ? etapaFinal(etapas) : null;
  return !!final && texto(linha.concluido_em) === '' && texto(linha.baixado_em) !== '' && texto(linha.etapa) === final.id;
}

// Etapas ja ordenadas (lerEtapas). Penultima: entrar nela da a baixa.
function etapaDaBaixa(etapas) {
  return etapas.length >= 2 ? etapas[etapas.length - 2] : null;
}

// Ultima: o destino confirmou o recebimento.
function etapaFinal(etapas) {
  return etapas[etapas.length - 1];
}

// Antepenultima ("Aguardando entrega"): so dela se divide um pedido.
function etapaDeDividir(etapas) {
  return etapas.length >= 3 ? etapas[etapas.length - 3] : null;
}

// item_id -> ids dos pedidos abertos que o contem, em ordem de numero
// (o pedido original e as partes dele podem ter o mesmo item).
function pedidosAbertosPorItem(lista) {
  var m = {};
  lista.slice().sort(function (a, b) { return compararPedidos(a.id, b.id); }).forEach(function (p) {
    if (!pedidoAberto(p)) return;
    p.itens.forEach(function (it) {
      var k = texto(it.item_id);
      m[k] = m[k] || [];
      if (m[k].indexOf(p.id) < 0) m[k].push(p.id);
    });
  });
  return m;
}

// item_id -> primeiro pedido aberto que o contem.
function pedidoAbertoPorItem(lista) {
  var todos = pedidosAbertosPorItem(lista);
  var m = {};
  Object.keys(todos).forEach(function (k) { m[k] = todos[k][0]; });
  return m;
}

// Datas distintas em ordem (aaaa-mm-dd ordena como texto); '' (sem previsao) por ultimo.
function previsoesDistintas(lista) {
  var vistas = {};
  var out = [];
  lista.forEach(function (d) { if (!vistas['_' + d]) { vistas['_' + d] = 1; out.push(d); } });
  return out.sort(function (a, b) {
    if (a === b) return 0;
    if (a === '') return 1;
    if (b === '') return -1;
    return a < b ? -1 : 1;
  });
}

// Previsao efetiva de uma linha da PEDIDOS_ITENS: a do item ou a do pedido.
function previsaoDoItem(it, linhaPedido, ano) {
  return dataISO(it.previsao, ano) || dataISO(linhaPedido.previsao, ano) || '';
}

// Board: pedidos, etapasPedido e o mapa item -> pedido aberto.
// faltantes: linhas da FALTANTES, para os itens seguirem o corte (itemDoPedidoAtual).
function montarPedidos(extras, ano, faltantes) {
  extras = extras || {};
  var etapas = lerEtapas(extras.etapas);
  var lista = lerPedidos(extras.pedidos, extras.pedidosItens, faltantes);
  var pedidos = lista.slice().sort(function (a, b) { return compararPedidos(a.id, b.id); })
    .map(function (p) {
      var l = p.linha;
      var baixadoEm = texto(l.baixado_em);
      // concluido pela API antiga: a data da baixa faz as vezes da conclusao
      var concluidoEm = texto(l.concluido_em) || (concluidoPelaApiAntiga(l, etapas) ? baixadoEm : '');
      var etapa = texto(l.etapa);
      var previsao = dataISO(l.previsao, ano);
      var itens = p.itens.map(function (it) {
        var q = numero(it.qtd);
        var item = {
          itemId: texto(it.item_id),
          dealId: texto(it.deal_id),
          os: texto(it.os),
          nome: texto(it.nome),
          un: texto(it.un),
          qtd: q === null || isNaN(q) ? null : q,
          fornecedor: texto(it.fornecedor),
          // previsao efetiva: a do item ou, vazia, a do pedido
          previsao: dataISO(it.previsao, ano) || previsao
        };
        // o item saiu no corte e nao tem correspondente: fica sem baixa
        if (it.item_mudou) item.itemMudou = true;
        return item;
      });
      var datas = previsoesDistintas(itens.map(function (i) { return i.previsao; }));
      return {
        id: p.id,
        pai: texto(l.pai),
        etapa: etapa,
        origem: semAcento(l.origem),
        quem: texto(l.quem),
        local: semAcento(l.local).replace(/\s+/g, '_'),
        previsao: previsao,
        previsaoMaisProxima: datas.length && datas[0] !== '' ? datas[0] : previsao,
        previsoesDiferentes: datas.length > 1,
        responsavel: texto(l.responsavel),
        criadoEm: texto(l.criado_em),
        baixadoEm: baixadoEm,
        concluidoEm: concluidoEm,
        versao: texto(l.atualizado_em),
        // finalizado = concluido (o destino confirmou); com so a baixa o pedido segue aberto
        finalizado: concluidoEm !== '',
        itens: itens
      };
    });
  return { pedidos: pedidos, etapasPedido: etapas, abertoPorItem: pedidoAbertoPorItem(lista),
    avisos: avisosPedidos(extras.pedidos, extras.pedidosItens, lista) };
}

// ---------- validacao do corpo ----------

function textoCurto(v, max, erro) {
  if (v === undefined || v === null) return { ok: true, valor: '' };
  if (typeof v !== 'string') return { ok: false, erro: erro };
  var t = v.trim().replace(/(\r\n|\n|\r)+/g, ' ');
  if (t.length > max) return { ok: false, erro: erro };
  return { ok: true, valor: t };
}

function qtdValida(v) {
  var n = typeof v === 'number' ? v : numero(v);
  if (n === null || !isFinite(n)) return null;
  n = arredondar(n);
  return n > 0 ? n : null;
}

// Fornecedor (ou cliente) e responsavel sao obrigatorios no pedido.
var ERRO_SEM_RESPONSAVEL = 'Informe o responsável.';
function erroQuemVazio(origem) {
  return origem === 'CLIENTE' ? 'Informe o cliente.' : 'Informe o fornecedor.';
}

// Normaliza um campo do pedido; { ok, valor } ou { ok: false, erro }.
function campoPedido(nome, v) {
  if (nome === 'origem') {
    var o = semAcento(v);
    return ORIGENS[o] ? { ok: true, valor: o } : { ok: false, erro: 'Origem inválida.' };
  }
  if (nome === 'local') {
    var l = semAcento(v).replace(/\s+/g, '_');
    return LOCAIS[l] ? { ok: true, valor: l } : { ok: false, erro: 'Local inválido.' };
  }
  if (nome === 'previsao') {
    var p = v === null || v === undefined ? '' : texto(v);
    return p === '' || dataValida(p) ? { ok: true, valor: p } : { ok: false, erro: 'Data inválida.' };
  }
  if (nome === 'quem') return textoCurto(v, 100, 'Fornecedor/cliente inválido.');
  return textoCurto(v, 100, 'Responsável inválido.');
}

// Deals citados no proprio corpo (para o 403 antes de ler a planilha).
function dealsDoCorpo(corpo) {
  if (!corpo || typeof corpo !== 'object') return [];
  if (corpo.tipo === 'gerar_pedido') {
    return (Array.isArray(corpo.itens) ? corpo.itens : []).map(function (i) { return texto(i && i.dealId); })
      .filter(function (d) { return d !== ''; });
  }
  return [];
}

function validarAcaoPedido(corpo) {
  if (!corpo || typeof corpo !== 'object') return erroAcao(400, 'Corpo inválido.');
  var tipo = corpo.tipo;
  if (TIPOS_PEDIDO.indexOf(tipo) < 0) return erroAcao(400, 'Tipo de ação inválido.');
  var acao = { tipo: tipo };
  var r;
  var i;

  if (tipo === 'nova_demanda') {
    acao.os = texto(corpo.os);
    if (!acao.os) return erroAcao(400, 'Informe a OS.');
    acao.caixa = semAcento(corpo.caixa);
    if (!NOMES_CAIXA[acao.caixa]) return erroAcao(400, 'Escolha o tipo de caixa.');
    if (!Array.isArray(corpo.itens) || !corpo.itens.length) return erroAcao(400, 'Informe ao menos um item.');
    if (corpo.itens.length > MAX_ITENS_DEMANDA) return erroAcao(400, 'No máximo 30 itens por demanda.');
    acao.itens = [];
    for (i = 0; i < corpo.itens.length; i++) {
      var d = corpo.itens[i] || {};
      var rn = textoCurto(d.nome, 100, 'Nome do item muito longo.');
      if (!rn.ok) return erroAcao(400, rn.erro);
      if (!rn.valor) return erroAcao(400, 'Informe o nome do item.');
      var rc = textoCurto(d.cor, 40, 'Cor muito longa.');
      if (!rc.ok) return erroAcao(400, rc.erro);
      var qn = qtdValida(d.qtd);
      if (qn === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
      var ru = textoCurto(d.un, 10, 'Unidade muito longa.');
      if (!ru.ok) return erroAcao(400, ru.erro);
      if (!ru.valor) return erroAcao(400, 'Informe a unidade do item.');
      acao.itens.push({ nome: rn.valor, cor: rc.valor, qtd: qn, un: ru.valor });
    }
    return { ok: true, acao: acao };
  }

  if (tipo === 'salvar_etapas') {
    if (!Array.isArray(corpo.etapas)) return erroAcao(400, 'Etapas inválidas.');
    var vistosNome = {};
    var vistosId = {};
    acao.etapas = [];
    for (i = 0; i < corpo.etapas.length; i++) {
      var e = corpo.etapas[i] || {};
      var nome = typeof e.nome === 'string' ? e.nome.trim() : '';
      if (!nome) return erroAcao(400, 'Toda etapa precisa de um nome.');
      if (nome.length > 60) return erroAcao(400, 'Nome de etapa muito longo.');
      var chave = semAcento(nome);
      if (vistosNome[chave]) return erroAcao(400, 'Já existe uma etapa com o nome ' + nome + '.');
      vistosNome[chave] = 1;
      var id = texto(e.id);
      if (id) {
        if (vistosId[id]) return erroAcao(400, 'Etapa repetida.');
        vistosId[id] = 1;
      }
      acao.etapas.push({ id: id, nome: nome });
    }
    if (acao.etapas.length < 3) return erroAcao(400, 'O quadro precisa de pelo menos 3 etapas.');
    return { ok: true, acao: acao };
  }

  if (tipo === 'gerar_pedido') {
    if (!Array.isArray(corpo.itens) || !corpo.itens.length) return erroAcao(400, 'Selecione ao menos um item.');
    acao.itens = [];
    var vistos = {};
    for (i = 0; i < corpo.itens.length; i++) {
      var it = corpo.itens[i] || {};
      var itemId = texto(it.itemId);
      var dealId = texto(it.dealId);
      if (!itemId || !dealId) return erroAcao(400, 'Item não informado.');
      if (vistos[itemId]) return erroAcao(400, 'Item repetido no pedido.');
      vistos[itemId] = 1;
      var q = qtdValida(it.qtd);
      if (q === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
      r = textoCurto(it.fornecedor, 100, 'Fornecedor inválido.');
      if (!r.ok) return erroAcao(400, r.erro);
      var rp = campoPedido('previsao', it.previsao);
      if (!rp.ok) return erroAcao(400, rp.erro);
      acao.itens.push({ itemId: itemId, dealId: dealId, qtd: q, fornecedor: r.valor, previsao: rp.valor });
    }
    acao.campos = {};
    var nomes = ['origem', 'quem', 'local', 'previsao', 'responsavel'];
    for (i = 0; i < nomes.length; i++) {
      r = campoPedido(nomes[i], corpo[nomes[i]]);
      if (!r.ok) return erroAcao(400, r.erro);
      acao.campos[nomes[i]] = r.valor;
    }
    if (!acao.campos.quem) return erroAcao(400, erroQuemVazio(acao.campos.origem));
    if (!acao.campos.responsavel) return erroAcao(400, ERRO_SEM_RESPONSAVEL);
    return { ok: true, acao: acao };
  }

  acao.pedidoId = texto(corpo.pedidoId);
  if (!acao.pedidoId) return erroAcao(400, 'Pedido não informado.');
  acao.versao = texto(corpo.versao);
  // O site novo so manda confirmouBaixa: true depois da confirmacao da baixa.
  acao.confirmouBaixa = corpo.confirmouBaixa === true;

  if (tipo === 'mover_pedido') {
    acao.etapa = texto(corpo.etapa);
    if (!acao.etapa) return erroAcao(400, 'Etapa inválida.');
  } else if (tipo === 'dividir_pedido') {
    // A parte vai sempre para a etapa da baixa. O site novo nao manda "etapa"; o antigo
    // mandava a etapa escolhida, recusada (409) se nao for a da baixa (aplicarDivisao).
    if (corpo.etapa !== undefined && corpo.etapa !== null) acao.etapaDoCorpo = texto(corpo.etapa);
    if (corpo.itens !== undefined && !Array.isArray(corpo.itens)) return erroAcao(400, 'Itens inválidos.');
    if (!corpo.itens || !corpo.itens.length) return erroAcao(400, 'Marque ao menos um item que chegou.');
    acao.itens = [];
    var vistosD = {};
    for (i = 0; i < corpo.itens.length; i++) {
      var idv = corpo.itens[i] || {};
      var did = texto(idv.itemId);
      if (!did) return erroAcao(400, 'Item não informado.');
      if (vistosD[did]) return erroAcao(400, 'Item repetido no pedido.');
      vistosD[did] = 1;
      var qd = qtdValida(idv.qtd);
      if (qd === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
      acao.itens.push({ itemId: did, qtd: qd });
    }
  } else if (tipo === 'editar_pedido') {
    var campos = corpo.campos && typeof corpo.campos === 'object' ? corpo.campos : {};
    if (Object.prototype.hasOwnProperty.call(campos, 'etapa')) return erroAcao(400, ERRO_ETAPA_PELO_CARD);
    acao.campos = {};
    for (i = 0; i < CAMPOS_PEDIDO.length; i++) {
      var n = CAMPOS_PEDIDO[i];
      if (!Object.prototype.hasOwnProperty.call(campos, n)) continue;
      r = campoPedido(n, campos[n]);
      if (!r.ok) return erroAcao(400, r.erro);
      acao.campos[n] = r.valor;
    }
    acao.itens = [];
    if (corpo.itens !== undefined && !Array.isArray(corpo.itens)) return erroAcao(400, 'Itens inválidos.');
    var vistosE = {};
    for (i = 0; i < (corpo.itens || []).length; i++) {
      var ie = corpo.itens[i] || {};
      var iid = texto(ie.itemId);
      if (!iid) return erroAcao(400, 'Item não informado.');
      if (vistosE[iid]) return erroAcao(400, 'Item repetido no pedido.');
      vistosE[iid] = 1;
      var mud = { itemId: iid };
      if (ie.qtd !== undefined) {
        var qe = qtdValida(ie.qtd);
        if (qe === null) return erroAcao(400, 'Informe uma quantidade maior que zero');
        mud.qtd = qe;
      }
      if (ie.fornecedor !== undefined) {
        r = textoCurto(ie.fornecedor, 100, 'Fornecedor inválido.');
        if (!r.ok) return erroAcao(400, r.erro);
        mud.fornecedor = r.valor;
      }
      if (ie.previsao !== undefined) {
        r = campoPedido('previsao', ie.previsao);
        if (!r.ok) return erroAcao(400, r.erro);
        mud.previsao = r.valor;
      }
      acao.itens.push(mud);
    }
    if (!Object.keys(acao.campos).length && !acao.itens.length) return erroAcao(400, 'Nada alterado.');
  }
  return { ok: true, acao: acao };
}

// ---------- aplicacao ----------

function restaDaLinha(l) {
  var falta = numero(l.qtd_falta);
  var bx = numero(l.qtd_baixada);
  if (falta === null || isNaN(falta) || (bx !== null && isNaN(bx))) return null;
  return arredondar(Math.max(0, falta - (bx || 0)));
}

function linhaHistorico(ctx, dealId, os, itemId, tipo, txt) {
  return {
    id: ctx.gerarId(),
    quando: ctx.agora,
    usuario: ctx.usuario,
    email: ctx.email,
    deal_id: dealId,
    os: os,
    item_id: itemId || '',
    acao: tipo,
    texto: txt,
    ploomes_status: 'PENDENTE',
    ploomes_id: '',
    tentativas: 0,
    erro: ''
  };
}

// Agrupa por deal_id, na ordem em que aparecem: [{ dealId, os, itens }].
function porOS(itens, dealDe, osDe) {
  var grupos = {};
  var ordem = [];
  itens.forEach(function (it) {
    var d = dealDe(it);
    if (!grupos[d]) { grupos[d] = { dealId: d, os: osDe(it), itens: [] }; ordem.push(d); }
    grupos[d].itens.push(it);
  });
  return ordem.map(function (d) { return grupos[d]; });
}

function op(aba, operacao, chave, linha) {
  return { aba: aba, operacao: operacao, chave: chave, linha: linha };
}

function primeiroNaoEditavel(deals) {
  for (var i = 0; i < deals.length; i++) if (!dealEditavel(deals[i])) return deals[i];
  return null;
}

function mostrarCampo(nome, v, etapas) {
  if (v === '') return '—';
  if (nome === 'etapa') {
    var e = etapas.filter(function (x) { return x.id === v; })[0];
    return e ? e.nome : v;
  }
  if (nome === 'origem') return ORIGENS[v] || v;
  if (nome === 'local') return LOCAIS[v] || v;
  if (nome === 'previsao') return dataValida(v) ? dataCurta(v) : v;
  return v;
}

function valorAtualCampo(linha, nome, ano) {
  if (nome === 'origem') return semAcento(linha.origem);
  if (nome === 'local') return semAcento(linha.local).replace(/\s+/g, '_');
  if (nome === 'previsao') return dataISO(linha.previsao, ano) || texto(linha.previsao);
  return texto(linha[nome]);
}

// linhas = { faltantes, caixasPcp, ganhas, pedidos, pedidosItens, etapas }
// ctx = { usuario, email, agora (ISO), gerarId }
function aplicarAcaoPedido(acao, linhas, ctx) {
  linhas = linhas || {};
  var u = ctx.usuario;
  var agora = ctx.agora;
  var faltantesPorId = indexarFaltantes(linhas.faltantes);
  var etapas = lerEtapas(linhas.etapas);
  // itens ja no ciclo atual: o pedido feito antes do corte da baixa no item do CORTE
  var lista = lerPedidos(linhas.pedidos, linhas.pedidosItens, linhas.faltantes || []);
  var abertos = pedidoAbertoPorItem(lista);
  var tipo = acao.tipo;

  if (tipo === 'salvar_etapas') return aplicarEtapas(acao, linhas, ctx, lista);
  if (tipo === 'nova_demanda') return aplicarNovaDemanda(acao, linhas, ctx);

  if (tipo === 'gerar_pedido') {
    var deals = acao.itens.map(function (i) { return i.dealId; });
    if (primeiroNaoEditavel(deals) !== null) return erroAcao(403, ERRO_NAO_EDITAVEL);
    var pid = proximoIdPedido(linhas.pedidos);
    var linhasItens = [];
    for (var i = 0; i < acao.itens.length; i++) {
      var it = acao.itens[i];
      var l = faltantesPorId[it.itemId];
      if (!l || texto(l.deal_id) !== it.dealId || semAcento(l.status) === 'SUBSTITUIDO') {
        return erroAcao(409, 'Item não encontrado.');
      }
      if (abertos[it.itemId]) return erroAcao(409, 'Item já está no ' + abertos[it.itemId] + '.');
      if (!STATUS_ABERTOS[semAcento(l.status)]) return erroAcao(409, 'Item já resolvido.');
      var resta = restaDaLinha(l);
      if (resta === null) return erroAcao(400, 'Item sem quantidade faltante registrada.');
      if (resta <= 0) return erroAcao(409, 'Item já resolvido.');
      if (it.qtd > resta) {
        return erroAcao(400, 'Falta só ' + formatarQtd(resta) + ' ' + texto(l.unidade) + ' de ' + texto(l.descricao_item));
      }
      linhasItens.push({
        id: pid + '|' + it.itemId, pedido_id: pid, item_id: it.itemId, deal_id: it.dealId, os: texto(l.os),
        nome: texto(l.descricao_item), un: texto(l.unidade), qtd: it.qtd, fornecedor: it.fornecedor, previsao: it.previsao
      });
    }
    var c = acao.campos;
    var operacoes = [op('PEDIDOS', 'append', 'id', {
      id: pid, etapa: etapas[0].id, origem: c.origem, quem: c.quem, local: c.local, previsao: c.previsao,
      responsavel: c.responsavel, criado_em: agora, criado_por: u, baixado_em: '', atualizado_em: agora
    })].concat(linhasItens.map(function (li) { return op('PEDIDOS_ITENS', 'append', 'id', li); }));
    var historicos = porOS(linhasItens, function (x) { return x.deal_id; }, function (x) { return x.os; })
      .map(function (g) {
        var n = g.itens.length;
        var txt = u + ' gerou ' + pid + ' · ' + n + (n === 1 ? ' item' : ' itens') + ' desta OS · ' +
          ORIGENS[c.origem] + (c.quem ? ' ' + c.quem : '');
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, txt);
      });
    return { ok: true, operacoes: operacoes, historicos: historicos, versao: agora, pedidoId: pid };
  }

  // editar / mover / baixar / dividir: pedido existente
  var p = lista.filter(function (x) { return x.id === acao.pedidoId; })[0];
  if (!p) return erroAcao(404, 'Pedido não encontrado.');
  if (!p.itens.length) return erroAcao(409, 'Pedido sem itens válidos.');
  var dealsP = p.itens.map(function (x) { return texto(x.deal_id); });
  if (primeiroNaoEditavel(dealsP) !== null) return erroAcao(403, ERRO_NAO_EDITAVEL);
  if (pedidoConcluido(p, etapas)) return erroAcao(409, 'Pedido finalizado não pode ser alterado.');
  var baixa = etapaDaBaixa(etapas);
  var final = etapaFinal(etapas);
  // Com a baixa dada o pedido so anda para a etapa final (o destino confirmou).
  if (pedidoBaixado(p) && !(tipo === 'mover_pedido' && acao.etapa === final.id)) {
    return erroAcao(409, 'Pedido com baixa só pode ir para ' + final.nome + '.');
  }
  // Site antigo: baixa sem a confirmacao do site novo, ou divisao para outra etapa.
  var entraNaBaixa = !!baixa && ((tipo === 'mover_pedido' && acao.etapa === baixa.id) || tipo === 'baixar_pedido');
  if (entraNaBaixa && !acao.confirmouBaixa) return erroAcao(409, ERRO_SITE_ANTIGO);
  if (tipo === 'dividir_pedido' && acao.etapaDoCorpo !== undefined && (!baixa || acao.etapaDoCorpo !== baixa.id)) {
    return erroAcao(409, ERRO_SITE_ANTIGO);
  }
  if (acao.versao !== texto(p.linha.atualizado_em)) return erroAcao(409, ERRO_VERSAO_PEDIDO);
  var grupos = porOS(p.itens, function (x) { return texto(x.deal_id); }, function (x) { return texto(x.os); });
  function existeEtapa(id) { return etapas.some(function (e) { return e.id === id; }); }

  if (tipo === 'dividir_pedido') return aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId);
  if (tipo === 'dividir_por_previsao') return aplicarDivisaoPorPrevisao(acao, linhas, ctx, p);

  if (tipo === 'mover_pedido') {
    if (!existeEtapa(acao.etapa)) return erroAcao(400, 'Etapa inválida.');
    if (acao.etapa === texto(p.linha.etapa)) return erroAcao(400, 'O pedido já está nessa etapa.');
    var nomeEtapa = mostrarCampo('etapa', acao.etapa, etapas);
    var linhaMov = { id: p.id, etapa: acao.etapa, atualizado_em: agora };
    var bxM = { operacoes: [], partes: {} };
    if (acao.etapa === final.id) {
      // Etapa final: o destino confirmou. A baixa ja foi dada na etapa anterior.
      if (!pedidoBaixado(p)) return erroAcao(400, 'Mova o pedido primeiro para ' + (baixa ? baixa.nome : final.nome) + '.');
      linhaMov = { id: p.id, etapa: acao.etapa, concluido_em: agora, atualizado_em: agora };
    } else if (baixa && acao.etapa === baixa.id) {
      // Entrar na etapa da baixa (Enviado ao destino final) da a baixa nas caixas.
      bxM = baixaDosItens(p.itens, faltantesPorId, agora);
      if (!bxM.ok) return bxM;
      linhaMov = { id: p.id, etapa: acao.etapa, baixado_em: agora, atualizado_em: agora };
    }
    return {
      ok: true,
      operacoes: bxM.operacoes.concat([op('PEDIDOS', 'update', 'id', linhaMov)]),
      historicos: grupos.map(function (g) {
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' moveu ' + p.id + ' para ' + nomeEtapa +
          textoBaixa(bxM.partes[g.dealId], (bxM.mudados || {})[g.dealId]));
      }),
      versao: agora,
      pedidoId: p.id
    };
  }

  if (tipo === 'baixar_pedido') {
    // Mantido por compatibilidade; o app da baixa movendo para a etapa da baixa.
    if (!baixa || texto(p.linha.etapa) !== baixa.id) return erroAcao(400, 'Dar baixa só na etapa ' + (baixa ? baixa.nome : final.nome) + '.');
    var bx = baixaDosItens(p.itens, faltantesPorId, agora);
    if (!bx.ok) return bx;
    return {
      ok: true,
      operacoes: bx.operacoes.concat([op('PEDIDOS', 'update', 'id', { id: p.id, baixado_em: agora, atualizado_em: agora })]),
      historicos: grupos.filter(function (g) { return bx.partes[g.dealId] || bx.mudados[g.dealId]; }).map(function (g) {
        var feitas = bx.partes[g.dealId] ? bx.partes[g.dealId].join('; ') : 'nenhum item';
        return linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' deu baixa do ' + p.id + ': ' + feitas + textoSemBaixa(bx.mudados[g.dealId]));
      }),
      versao: agora,
      pedidoId: p.id
    };
  }

  // editar_pedido
  var mudPedido = {};
  var resumoPedido = [];
  var erroCampo = '';
  CAMPOS_PEDIDO.forEach(function (n) {
    if (!Object.prototype.hasOwnProperty.call(acao.campos, n)) return;
    var antes = valorAtualCampo(p.linha, n, new Date(agora).getFullYear());
    var depois = acao.campos[n];
    if (antes === depois) return;
    // nao deixa limpar o fornecedor/cliente nem o responsavel
    if (depois === '' && n === 'quem') {
      erroCampo = erroQuemVazio(acao.campos.origem || valorAtualCampo(p.linha, 'origem', new Date(agora).getFullYear()));
    } else if (depois === '' && n === 'responsavel') {
      erroCampo = ERRO_SEM_RESPONSAVEL;
    }
    mudPedido[n] = depois;
    resumoPedido.push(NOMES_CAMPO[n] + ': ' + mostrarCampo(n, antes, etapas) + ' → ' + mostrarCampo(n, depois, etapas));
  });
  if (erroCampo) return erroAcao(400, erroCampo);
  var ano = new Date(agora).getFullYear();
  var previsaoPedidoDepois = mudPedido.previsao !== undefined ? mudPedido.previsao : valorAtualCampo(p.linha, 'previsao', ano);
  var opsItens = [];
  var resumoItens = {};
  for (var j = 0; j < acao.itens.length; j++) {
    var mi = acao.itens[j];
    var linhaPi = itemDoPedidoPorId(p.itens, mi.itemId);
    if (!linhaPi) return erroAcao(400, 'Item não está no pedido.');
    var nomeItem = texto(linhaPi.nome);
    var mud = {};
    var res = [];
    var qAntes = numero(linhaPi.qtd);
    if (mi.qtd !== undefined && mi.qtd !== qAntes) {
      // sem item atual nao ha resta para conferir
      if (linhaPi.item_mudou) return erroAcao(409, textoItemMudou(nomeItem) + ': a quantidade não pode mudar.');
      var lfe = faltantesPorId[texto(linhaPi.item_id)];
      if (!lfe) return erroAcao(409, 'Item não encontrado.');
      var re = restaDaLinha(lfe);
      if (re === null) return erroAcao(400, 'Item sem quantidade faltante registrada.');
      if (mi.qtd > re) return erroAcao(400, 'Falta só ' + formatarQtd(re) + ' ' + texto(lfe.unidade) + ' de ' + nomeItem);
      mud.qtd = mi.qtd;
      res.push('qtd de ' + nomeItem + ': ' + (qAntes === null || isNaN(qAntes) ? '—' : formatarQtd(qAntes)) + ' → ' + formatarQtd(mi.qtd));
    }
    var fAntes = texto(linhaPi.fornecedor);
    if (mi.fornecedor !== undefined && mi.fornecedor !== fAntes) {
      mud.fornecedor = mi.fornecedor;
      res.push('fornecedor de ' + nomeItem + ': ' + (fAntes || '—') + ' → ' + (mi.fornecedor || '—'));
    }
    if (mi.previsao !== undefined) {
      // compara a previsao efetiva (vazia = a do pedido, ja com a mudanca deste editar)
      var pvAntes = previsaoDoItem(linhaPi, p.linha, ano);
      var pvDepois = mi.previsao || previsaoPedidoDepois;
      if (pvAntes !== pvDepois) {
        mud.previsao = mi.previsao;
        res.push('previsão de ' + nomeItem + ': ' + mostrarCampo('previsao', pvAntes, etapas) + ' → ' + mostrarCampo('previsao', pvDepois, etapas));
      }
    }
    if (!res.length) continue;
    opsItens.push(op('PEDIDOS_ITENS', 'update', 'id', Object.assign({ id: texto(linhaPi.id) || p.id + '|' + idGravado(linhaPi) }, mud)));
    var dd = texto(linhaPi.deal_id);
    resumoItens[dd] = (resumoItens[dd] || []).concat(res);
  }
  if (!resumoPedido.length && !opsItens.length) return erroAcao(400, 'Nada alterado.');
  return {
    ok: true,
    operacoes: [op('PEDIDOS', 'update', 'id', Object.assign({ id: p.id }, mudPedido, { atualizado_em: agora }))].concat(opsItens),
    historicos: grupos.map(function (g) {
      var resumo = resumoPedido.concat(resumoItens[g.dealId] || []);
      return resumo.length ? linhaHistorico(ctx, g.dealId, g.os, '', tipo, u + ' alterou ' + p.id + ': ' + resumo.join(', ')) : null;
    }).filter(function (h) { return h; }),
    versao: agora,
    pedidoId: p.id
  };
}

// Baixa dos itens de um pedido na FALTANTES: soma min(qtd, resta) em qtd_baixada
// (pula SUBSTITUIDO e quem nao tem falta registrada). itens = linhas da
// PEDIDOS_ITENS ja no ciclo atual (lerPedidos com faltantes). Devolve { ok, operacoes,
// partes: { dealId: ['20 MT de VIÉS (resta 80 MT)'] }, mudados: { dealId: ['LINHA'] } }
// ou o erro. mudados = itens que sairam no corte sem correspondente: ficam sem baixa
// (a linha antiga SUBSTITUIDO nao recebe nada) e o historico diz isso.
function baixaDosItens(itens, faltantesPorId, agora) {
  var operacoes = [];
  var partes = {};
  var mudados = {};
  for (var k = 0; k < itens.length; k++) {
    var pi = itens[k];
    if (pi.item_mudou) {
      var dm = texto(pi.deal_id);
      (mudados[dm] = mudados[dm] || []).push(texto(pi.nome));
      continue;
    }
    var lf = faltantesPorId[texto(pi.item_id)];
    if (!lf || !STATUS_ABERTOS[semAcento(lf.status)]) continue;
    var falta = numero(lf.qtd_falta);
    var bx = numero(lf.qtd_baixada);
    if (bx !== null && isNaN(bx)) return erroAcao(400, 'Baixa registrada ilegível na planilha.');
    if (falta === null || isNaN(falta)) continue;
    bx = bx || 0;
    var r0 = arredondar(Math.max(0, falta - bx));
    var q = numero(pi.qtd);
    q = q === null || isNaN(q) ? 0 : q;
    var dar = arredondar(Math.min(q, r0));
    if (dar <= 0) continue;
    operacoes.push(op('FALTANTES', 'update', 'id', { id: texto(lf.id), qtd_baixada: arredondar(bx + dar), atualizado_em_app: agora }));
    var un = texto(lf.unidade);
    var d = texto(pi.deal_id);
    (partes[d] = partes[d] || []).push(formatarQtd(dar) + ' ' + un + ' de ' + texto(lf.descricao_item) +
      ' (resta ' + formatarQtd(arredondar(r0 - dar)) + ' ' + un + ')');
  }
  return { ok: true, operacoes: operacoes, partes: partes, mudados: mudados };
}

// " e deu baixa: 20 MT de VIÉS (resta 80 MT)" ou '' quando a OS nao teve baixa; mais
// " · sem baixa: LINHA mudou no corte e não tem correspondente" com item que mudou.
function textoBaixa(partes, mudados) {
  return (partes && partes.length ? ' e deu baixa: ' + partes.join('; ') : '') + textoSemBaixa(mudados);
}

function textoSemBaixa(mudados) {
  return mudados && mudados.length ? ' · sem baixa: ' + mudados.map(textoItemMudou).join('; ') : '';
}

// Linha da parte nova na PEDIDOS, copiando os dados do pedido.
function linhaParte(p, filho, raiz, etapaId, previsao, agora, u, baixado) {
  var l = p.linha;
  var ano = new Date(agora).getFullYear();
  return op('PEDIDOS', 'append', 'id', {
    id: filho, etapa: etapaId, origem: valorAtualCampo(l, 'origem', ano), quem: texto(l.quem),
    local: valorAtualCampo(l, 'local', ano), previsao: previsao, responsavel: texto(l.responsavel),
    criado_em: agora, criado_por: u, baixado_em: baixado ? agora : '', atualizado_em: agora, pai: raiz
  });
}

// Linha do item na parte nova (leva a previsao propria do item).
function linhaItemParte(x, filho, qtd, ano) {
  return op('PEDIDOS_ITENS', 'append', 'id', {
    id: filho + '|' + texto(x.item_id), pedido_id: filho, item_id: texto(x.item_id), deal_id: texto(x.deal_id), os: texto(x.os),
    nome: texto(x.nome), un: texto(x.un), qtd: qtd, fornecedor: texto(x.fornecedor), previsao: dataISO(x.previsao, ano) || ''
  });
}

// dividir_pedido: o que chegou (itens ou parte da quantidade) vira um pedido novo da
// mesma familia (PED-0002 -> PED-0002.k), ja na etapa da baixa e com a baixa nas caixas.
// So da etapa anterior a da baixa ("Aguardando entrega"). O pedido dividido fica com o
// resto; linha com qtd 0 e ignorada na leitura. Dividir uma parte cria outra parte da raiz.
function aplicarDivisao(acao, linhas, ctx, p, etapas, faltantesPorId) {
  var u = ctx.usuario;
  var agora = ctx.agora;
  var de = etapaDeDividir(etapas);
  var baixa = etapaDaBaixa(etapas);
  if (!de || !baixa || texto(p.linha.etapa) !== de.id) {
    return erroAcao(400, 'Dividir só com o pedido em ' + (de ? de.nome : 'Aguardando entrega') + '.');
  }
  var porItem = {};
  p.itens.forEach(function (x) { if (!porItem[texto(x.item_id)]) porItem[texto(x.item_id)] = x; });
  var movidos = [];
  for (var i = 0; i < acao.itens.length; i++) {
    var mi = acao.itens[i];
    var li = porItem[mi.itemId] || itemDoPedidoPorId(p.itens, mi.itemId);
    if (!li) return erroAcao(400, 'Item não está no pedido.');
    var q = numero(li.qtd);
    if (q === null || isNaN(q)) return erroAcao(400, 'Item sem quantidade no pedido.');
    if (mi.qtd > q) return erroAcao(400, 'O pedido tem só ' + formatarQtd(q) + ' ' + texto(li.un) + ' de ' + texto(li.nome) + '.');
    movidos.push({ linha: li, qtd: mi.qtd, resta: arredondar(q - mi.qtd) });
  }
  var sobra = p.itens.some(function (x) {
    var m = movidos.filter(function (y) { return y.linha === x; })[0];
    return !m || m.resta > 0;
  });
  if (!sobra) return erroAcao(400, 'Para mover o pedido inteiro, arraste o card.');

  var bx = baixaDosItens(movidos.map(function (m) { return Object.assign({}, m.linha, { qtd: m.qtd }); }), faltantesPorId, agora);
  if (!bx.ok) return bx;
  var raiz = raizDoPedido(p.id);
  var filho = proximoIdFilho(linhas.pedidos, raiz);
  var ano = new Date(agora).getFullYear();
  var operacoes = [linhaParte(p, filho, raiz, baixa.id, valorAtualCampo(p.linha, 'previsao', ano), agora, u, true)];
  movidos.forEach(function (m) { operacoes.push(linhaItemParte(m.linha, filho, m.qtd, ano)); });
  movidos.forEach(function (m) {
    operacoes.push(op('PEDIDOS_ITENS', 'update', 'id', { id: texto(m.linha.id) || p.id + '|' + idGravado(m.linha), qtd: m.resta }));
  });
  operacoes.push(op('PEDIDOS', 'update', 'id', { id: p.id, atualizado_em: agora }));
  operacoes = operacoes.concat(bx.operacoes);
  var historicos = porOS(movidos, function (m) { return texto(m.linha.deal_id); }, function (m) { return texto(m.linha.os); })
    .map(function (g) {
      var partes = g.itens.map(function (m) { return formatarQtd(m.qtd) + ' ' + texto(m.linha.un) + ' de ' + texto(m.linha.nome); });
      return linhaHistorico(ctx, g.dealId, g.os, '', acao.tipo,
        u + ' dividiu ' + p.id + ': ' + partes.join('; ') + ' foram para ' + filho + ' (' + baixa.nome + ')' +
          textoBaixa(bx.partes[g.dealId], bx.mudados[g.dealId]));
    });
  return { ok: true, operacoes: operacoes, historicos: historicos, versao: agora, pedidoId: filho };
}

// dividir_por_previsao: agrupa os itens pela previsao efetiva; o grupo da data
// mais proxima fica no pedido e cada outra data vira uma parte (na etapa do
// pedido, com a previsao do grupo). Sem data vai por ultimo.
function aplicarDivisaoPorPrevisao(acao, linhas, ctx, p) {
  var u = ctx.usuario;
  var agora = ctx.agora;
  var ano = new Date(agora).getFullYear();
  var datas = previsoesDistintas(p.itens.map(function (x) { return previsaoDoItem(x, p.linha, ano); }));
  if (datas.length < 2) return erroAcao(400, 'Os itens têm a mesma previsão.');
  var raiz = raizDoPedido(p.id);
  var existentes = (linhas.pedidos || []).slice();
  var operacoes = [];
  var zerar = [];
  var movidos = [];
  var partes = [];
  datas.slice(1).forEach(function (d) {
    var filho = proximoIdFilho(existentes, raiz);
    existentes.push({ id: filho });
    partes.push(filho);
    operacoes.push(linhaParte(p, filho, raiz, texto(p.linha.etapa), d, agora, u, false));
    p.itens.forEach(function (x) {
      if (previsaoDoItem(x, p.linha, ano) !== d) return;
      var q = numero(x.qtd);
      q = q === null || isNaN(q) ? 0 : q;
      operacoes.push(linhaItemParte(x, filho, q, ano));
      zerar.push(op('PEDIDOS_ITENS', 'update', 'id', { id: texto(x.id) || p.id + '|' + idGravado(x), qtd: 0 }));
      movidos.push({ linha: x, qtd: q, filho: filho, data: d });
    });
  });
  operacoes = operacoes.concat(zerar, [op('PEDIDOS', 'update', 'id', { id: p.id, atualizado_em: agora })]);
  var historicos = porOS(movidos, function (m) { return texto(m.linha.deal_id); }, function (m) { return texto(m.linha.os); })
    .map(function (g) {
      var txt = g.itens.map(function (m) {
        return formatarQtd(m.qtd) + ' ' + texto(m.linha.un) + ' de ' + texto(m.linha.nome) + ' foram para ' + m.filho +
          ' (' + (m.data ? 'previsão ' + dataCurta(m.data) : 'sem previsão') + ')';
      });
      return linhaHistorico(ctx, g.dealId, g.os, '', acao.tipo, u + ' dividiu ' + p.id + ' por previsão: ' + txt.join('; '));
    });
  return { ok: true, operacoes: operacoes, historicos: historicos, versao: agora, pedidoId: partes[0], partes: partes };
}

function slugEtapa(nome) {
  var s = semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'etapa';
}

var ERRO_ETAPAS_SO_ADM = 'Só administradores podem alterar as etapas do quadro.';

function aplicarEtapas(acao, linhas, ctx, lista) {
  if (texto(ctx.perfil).toUpperCase() !== 'ADM') return erroAcao(403, ERRO_ETAPAS_SO_ADM);
  var temLinhas = (linhas.etapas || []).some(function (e) { return e && texto(e.id) !== '' && texto(e.nome) !== ''; });
  var atuais = lerEtapas(linhas.etapas);
  var idsAtuais = {};
  atuais.forEach(function (e) { idsAtuais[e.id] = e; });
  var usados = {};
  atuais.forEach(function (e) { usados[e.id] = 1; });
  var i;
  for (i = 0; i < acao.etapas.length; i++) {
    if (acao.etapas[i].id && !idsAtuais[acao.etapas[i].id]) return erroAcao(400, 'Etapa inválida.');
  }
  // As duas ultimas (a da baixa e a final) ficam sempre no fim, nessa ordem.
  var n = acao.etapas.length;
  if (atuais.length >= 2) {
    var baixaAtual = atuais[atuais.length - 2];
    var finalAtual = atuais[atuais.length - 1];
    if (acao.etapas[n - 2].id !== baixaAtual.id || acao.etapas[n - 1].id !== finalAtual.id) {
      return erroAcao(400, 'As etapas ' + baixaAtual.nome + ' e ' + finalAtual.nome + ' precisam continuar no fim, nessa ordem.');
    }
  }
  var mantidas = {};
  acao.etapas.forEach(function (e) { if (e.id) mantidas[e.id] = 1; });
  var removidas = atuais.filter(function (e) { return !mantidas[e.id]; });
  for (i = 0; i < removidas.length; i++) {
    var rid = removidas[i].id;
    var comPedido = lista.some(function (p) { return !pedidoConcluido(p, atuais) && texto(p.linha.etapa) === rid; });
    if (comPedido) return erroAcao(409, 'A etapa ' + removidas[i].nome + ' tem pedidos abertos.');
  }
  var operacoes = acao.etapas.map(function (e, idx) {
    var id = e.id;
    if (!id) {
      var base = slugEtapa(e.nome);
      id = base;
      var n = 2;
      while (usados[id]) id = base + '_' + (n++);
      usados[id] = 1;
    }
    return op('ETAPAS_PEDIDO', 'appendOrUpdate', 'id', { id: id, nome: e.nome, ordem: idx + 1 });
  });
  // Removidas: a linha fica com nome e ordem vazios (a leitura ignora).
  if (temLinhas) {
    removidas.forEach(function (e) {
      operacoes.push(op('ETAPAS_PEDIDO', 'update', 'id', { id: e.id, nome: '', ordem: '' }));
    });
  }
  return { ok: true, operacoes: operacoes, historicos: [], versao: ctx.agora };
}

// 'aaaa-mm-dd hh:mm' no horario de Brasilia (como o Sync Faltantes grava data_separacao).
function dataHoraBrasilia(iso) {
  var d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString();
  return d.slice(0, 10) + ' ' + d.slice(11, 16);
}

// nova_demanda: falta descoberta depois que a caixa saiu. A caixa e achada na CAIXAS
// GANHAS pela OS + tipo; sem caixa, ou caixa que ainda nao saiu, recusa sem gravar nada.
// Os itens entram na FALTANTES com ciclo e origem POS_SAIDA e id <deal>|POS_SAIDA|<uuid>:
// o Sync Faltantes so mexe nas linhas do mesmo deal com ciclo PEDIDO/CORTE e casa por id.
function aplicarNovaDemanda(acao, linhas, ctx) {
  var rotulo = 'OS ' + acao.os + ' (' + NOMES_CAIXA[acao.caixa] + ')';
  var ganhas = (linhas.ganhas || []).filter(function (g) {
    return g && texto(g.os) === acao.os && tipoDaSecao(g.caixa) === acao.caixa && texto(g.deal_id) !== '';
  });
  var deals = {};
  ganhas.forEach(function (g) { deals[texto(g.deal_id)] = 1; });
  if (Object.keys(deals).length > 1) return erroAcao(409, 'Mais de uma caixa da ' + rotulo + ' saiu. Fale com o PCP.');
  if (!ganhas.length) {
    var noAlmox = (linhas.faltantes || []).some(function (l) {
      return l && texto(l.os) === acao.os && tipoDaSecao(l.secao) === acao.caixa;
    });
    return noAlmox ? erroAcao(409, 'A caixa da ' + rotulo + ' ainda não saiu.') : erroAcao(404, 'Caixa da ' + rotulo + ' não encontrada.');
  }
  var g = ganhas[0];
  var dealId = texto(g.deal_id);
  if (!dealEditavel(dealId)) return erroAcao(403, ERRO_NAO_EDITAVEL);
  var agora = ctx.agora;
  var quando = dataHoraBrasilia(agora);
  var os = texto(g.os);
  var operacoes = acao.itens.map(function (it) {
    return op('FALTANTES', 'append', 'id', {
      id: dealId + '|POS_SAIDA|' + ctx.gerarId(), os: os, ciclo: 'POS_SAIDA', origem: 'POS_SAIDA',
      referencia: texto(g.referencia), descricao_peca: texto(g.descricao_peca), cliente: texto(g.cliente), secao: acao.caixa,
      descricao_item: it.nome, nome_cor: it.cor, unidade: it.un, qtd_falta: it.qtd, qtd_baixada: 0, status: 'ABERTO',
      data_separacao: quando, deal_id: dealId, atualizado_em_app: agora
    });
  });
  var partes = acao.itens.map(function (it) {
    return formatarQtd(it.qtd) + ' ' + it.un + ' de ' + it.nome + (it.cor ? ' ' + it.cor : '');
  });
  return {
    ok: true,
    operacoes: operacoes,
    historicos: [linhaHistorico(ctx, dealId, os, '', acao.tipo, ctx.usuario + ' criou demanda pós-saída: ' + partes.join('; '))],
    versao: agora,
    itemIds: operacoes.map(function (o) { return o.linha.id; })
  };
}
