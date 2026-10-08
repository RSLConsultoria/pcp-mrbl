// Converte workflows/*.sdk.js no JSON de workflow do n8n (workflows/json/*.json),
// avaliando o arquivo com um SDK falso que so registra nodes e conexoes.
// O JSON e o que o utilitario de deploy envia pela API publica do n8n
// (POST /workflows para criar, PUT /workflows/{id} para atualizar).
// Rode depois de gerar-workflow-sdk.js (o npm run build ja chama).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pasta = path.join(__dirname, '..', 'workflows');
const saida = path.join(pasta, 'json');

// id estavel por workflow + nome do node, no formato uuid
function idEstavel(semente) {
  const h = crypto.createHash('sha256').update(semente).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16), '8' + h.slice(17, 20), h.slice(20, 32)].join('-');
}

function converter(arquivo) {
  let src = fs.readFileSync(arquivo, 'utf8');
  src = src.replace(/^import .*$/m, '').replace('export default workflow', 'module.exports = workflow');

  const nodes = new Map();
  const conexoes = []; // [origem, saida, destino]
  const ligar = (de, idx, para) => {
    if (!conexoes.some((c) => c[0] === de && c[1] === idx && c[2] === para)) conexoes.push([de, idx, para]);
  };
  const cadeia = (head, tail) => ({ _head: head, _tail: tail, to: (x) => { ligar(tail, 0, x._head); return cadeia(head, x._tail); } });
  const objeto = (n) => {
    const o = cadeia(n, n);
    o.onTrue = (x) => { ligar(n, 0, x._head); return o; };
    o.onFalse = (x) => { ligar(n, 1, x._head); return o; };
    // splitInBatches: saida 0 = done, saida 1 = cada lote
    o.onDone = (x) => { ligar(n, 0, x._head); return o; };
    o.onEachBatch = (x) => { ligar(n, 1, x._head); return o; };
    return o;
  };
  const montar = (type, version, config) => {
    const { name, parameters, position, credentials, ...resto } = config;
    if (nodes.has(name)) throw new Error('Node repetido: ' + name);
    const n = { name, type, typeVersion: version, position, parameters: parameters || {} };
    if (credentials) n.credentials = credentials;
    Object.assign(n, resto);
    nodes.set(name, n);
    return name;
  };
  const sdk = {
    node: ({ type, version, config }) => objeto(montar(type, version, config)),
    trigger: ({ type, version, config }) => objeto(montar(type, version, config)),
    ifElse: ({ version, config }) => objeto(montar('n8n-nodes-base.if', version, config)),
    splitInBatches: ({ version, config }) => objeto(montar('n8n-nodes-base.splitInBatches', version, config)),
    nextBatch: (loop) => ({ _head: loop._head, _tail: loop._head }),
    expr: (s) => '=' + s,
    workflow: (id, nome, settings) => {
      const w = { id, nome, settings: settings || {} };
      let ultimo = null;
      w.add = (x) => { ultimo = x._tail; return w; };
      w.to = (x) => { ligar(ultimo, 0, x._head); ultimo = x._tail; return w; };
      return w;
    }
  };
  const m = { exports: {} };
  new Function('module', ...Object.keys(sdk), src)(m, ...Object.values(sdk));
  const w = m.exports;

  const lista = [...nodes.values()].map((n) => {
    const out = Object.assign({ id: idEstavel(w.id + '|' + n.name) }, n);
    if (n.type === 'n8n-nodes-base.webhook') out.webhookId = idEstavel(w.id + '|webhook|' + n.name);
    return out;
  });
  const connections = {};
  for (const [de, idx, para] of conexoes) {
    const c = (connections[de] = connections[de] || { main: [] });
    while (c.main.length <= idx) c.main.push([]);
    c.main[idx].push({ node: para, type: 'main', index: 0 });
  }
  return { name: w.nome, nodes: lista, connections, settings: Object.assign({ executionOrder: 'v1' }, w.settings) };
}

if (require.main === module) {
  fs.mkdirSync(saida, { recursive: true });
  for (const f of fs.readdirSync(pasta).filter((x) => x.endsWith('.sdk.js'))) {
    const wf = converter(path.join(pasta, f));
    const destino = path.join(saida, f.replace('.sdk.js', '.json'));
    fs.writeFileSync(destino, JSON.stringify(wf, null, 1) + '\n');
    console.log('workflows/json/' + path.basename(destino) + ': ' + wf.nodes.length + ' nodes');
  }
}

module.exports = { converter };
