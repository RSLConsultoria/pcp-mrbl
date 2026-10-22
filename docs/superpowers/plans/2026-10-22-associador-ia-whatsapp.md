# Associador de mensagens por IA — plano de implementação

> **Para agentes:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans, tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** ligar sozinha a resposta da oficina à OS certa (sem citação e sem número da OS) e, na dúvida entre peças, perguntar no grupo.

**Arquitetura:** lógica pura nova em `n8n/src/associador.js` (ES5, sem I/O). O "Receber WhatsApp" chama um subworkflow Groq novo (o associador) quando as regras atuais não resolvem, grava a decisão e, se a mensagem foi ligada, dispara o "Interpretar WhatsApp" que já existe. A pergunta entra na fila de saída existente; o "Enviar WhatsApp" ganha a citação. O agendamento de 15 min fecha perguntas vencidas. App: selos, lista "aguardando associação" e "trocar OS".

**Tecnologias:** n8n (Code nodes ES5 gerados de `n8n/src` + `n8n/adaptadores`), Groq `openai/gpt-oss-120b`, Evolution API, Vite + React + TS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-associador-ia-whatsapp-design.md`.

## Restrições globais

- Fale e escreva em pt-BR (commits, comentários, textos da interface).
- Repositório público: testes e fixtures só com dados fictícios (OS 9000x, deal 70000x, grupo `grupo-teste@g.us`).
- `n8n/src` e `n8n/adaptadores`: JavaScript ES5 puro (`var`, `function`, sem arrow, sem import/export, sem template string).
- Depois de mexer em `n8n/src`, `n8n/adaptadores` ou `n8n/scripts`: `cd n8n && npm run build` e commitar `n8n/build/`, `n8n/workflows/*.sdk.js` e `n8n/workflows/json/*.json` junto.
- Planilha: nunca ordenar nem apagar linhas; gravações por `id`. Colunas novas sempre no fim.
- Itens que vão para nós Google Sheets com `autoMapInputData` não podem ter campos que não sejam colunas (o n8n cria a coluna).
- Limite de confiança do associador: **0,8**. Pergunta aberta: menos de **24 h**. Candidatos na dúvida: **2 ou 3**. No máximo **1 pergunta aberta por grupo**.
- Texto da pergunta: `Olá! Essa mensagem é sobre *A* ou *B*?` / `Olá! Essa mensagem é sobre *A*, *B* ou *C*?`.
- Valores novos: `associacao` = `IA`, `IA_DUVIDA`, `NAO_OS`; `tipo` = `PERGUNTA_ASSOCIACAO`.
- Colunas novas em `WHATSAPP_MENSAGENS` (fim): `associacao_confianca`, `associacao_motivo`, `pergunta_candidatos`, `pergunta_mensagem_id`, `pergunta_fechada_em`.
- A IA nunca grava no Ploomes, nunca decide data e nunca recebe telefone, JID ou nome de participante.

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `n8n/src/associador.js` (novo) | regras puras: candidatos, contexto, validação, pergunta, decisão, expiração, corpo do envio |
| `n8n/test/carregar.js` | inclui `associador.js` em `ARQUIVOS` (depois de `whatsapp.js`) |
| `n8n/test/associador.test.js` (novo) | testes das regras puras |
| `n8n/src/whatsapp.js` | `prepararEntradaWhatsapp` passa a devolver `precisaAssociar` e o pedido do associador |
| `n8n/adaptadores/montar-contexto-associador.js` (novo) | monta a entrada do subworkflow |
| `n8n/adaptadores/finalizar-associacao.js` (novo) | valida a saída e gera as gravações |
| `n8n/adaptadores/montar-envio-whatsapp.js` (novo) | corpo do `sendText` com citação |
| `n8n/adaptadores/fechar-perguntas-vencidas.js` (novo) | gravações das perguntas vencidas |
| `n8n/scripts/gerar-code-nodes.js` | registra os 4 adaptadores novos |
| `n8n/scripts/ids-subworkflows.js` | `ASSOCIADOR` |
| `n8n/scripts/gerar-workflow-sdk.js` | nós novos em Receber, Enviar e Retentar |
| `n8n/src/producao.js` | board e ação `associar_whatsapp` |
| `web/src/api/tipos.ts`, `web/src/telas/Producao.tsx`, `web/src/regras/otimista.ts`, `web/scripts/mock-api.mjs`, `web/src/styles/f4.css` | app e simulador |
| `n8n/workflows/README.md` | cabeçalhos novos e subworkflow no roteiro |

---

### Tarefa 1: Regras puras do associador

**Arquivos:**
- Criar: `n8n/src/associador.js`
- Modificar: `n8n/test/carregar.js` (ARQUIVOS)
- Teste: `n8n/test/associador.test.js`

**Interfaces (produz):**
- `LIMITE_CONFIANCA_ASSOCIADOR = 0.8`, `HORAS_PERGUNTA_ASSOCIACAO = 24`
- `candidatosAssociacaoWhatsapp(producoes, oficinaId, mensagens, hojeISO)` → `[{ dealId, os, peca, referencia, pecas, prazoVigente, statusPrazo, ultimaMensagemPcp: { quando, texto } | null }]` (só OS ativas na Costura da oficina; `producoes` = linhas cruas da aba PRODUCAO)
- `contextoAssociadorWhatsapp(msg, candidatos, mensagensGrupo, pergunta)` → `{ texto, quando, candidatos, conversa: [{ direcao, quando, texto, os }], pergunta: null | { texto, candidatos: [os], mensagemOriginal } , instrucoes, schema }`
- `validarAssociacaoWhatsapp(valor, candidatos)` → `{ ok: true, resultado: 'OS'|'DUVIDA'|'NAO_OS'|'SEM_ASSOCIACAO', dealId, os, candidatos: [dealId], confianca, motivo }` ou `{ ok: false, erro }`
- `textoPerguntaAssociacao(candidatos)` → string
- `perguntaAbertaWhatsapp(mensagens, grupoJid, agora)` → linha da pergunta aberta ou `null`

- [ ] **Passo 1: escrever os testes que falham** (`n8n/test/associador.test.js`)

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');

const ctx = carregar();
const producao = [
  { deal_id: '700001', os: '90001', oficina_id: 'of-1', em_costura: 'SIM', peca: 'BLUSA TESTE', referencia: 'REF-1', pecas: '11', data_combinada: '2026-10-30', lead_time: '' },
  { deal_id: '700002', os: '90002', oficina_id: 'of-1', em_costura: 'SIM', peca: 'CALCA TESTE', referencia: 'REF-2', pecas: '20', data_combinada: '', lead_time: '2026-11-05' },
  { deal_id: '700003', os: '90003', oficina_id: 'of-2', em_costura: 'SIM', peca: 'SAIA TESTE', referencia: 'REF-3', pecas: '5', data_combinada: '', lead_time: '' },
  { deal_id: '700004', os: '90004', oficina_id: 'of-1', em_costura: 'NAO', prevista: 'SIM', peca: 'VESTIDO TESTE', referencia: 'REF-4', pecas: '9' }
];
const mensagens = [
  { id: 'E1', direcao: 'ENVIADA', status_envio: 'ENVIADA', deal_id: '700001', grupo_jid: 'grupo-teste@g.us', quando: '2026-10-22T12:00:00.000Z', texto: 'Olá. A entrega de *BLUSA TESTE*...' }
];

test('candidatos: só OS da oficina na Costura, com a última mensagem do PCP', () => {
  const c = limpo(ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', mensagens, '2026-10-22'));
  assert.deepEqual(c.map((x) => x.os), ['90001', '90002']);
  assert.equal(c[0].pecas, 11);
  assert.equal(c[0].prazoVigente, '2026-10-30');
  assert.deepEqual(c[0].ultimaMensagemPcp, { quando: '2026-10-22T12:00:00.000Z', texto: 'Olá. A entrega de *BLUSA TESTE*...' });
  assert.equal(c[1].ultimaMensagemPcp, null);
});

test('validação: OS confiante, dúvida, não é OS e desvios', () => {
  const c = ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', [], '2026-10-22');
  const v = (x) => limpo(ctx.validarAssociacaoWhatsapp(x, c));
  assert.deepEqual(v({ resultado: 'OS', os: '90001', confianca: 0.9, motivo: 'fala da blusa' }),
    { ok: true, resultado: 'OS', dealId: '700001', os: '90001', candidatos: [], confianca: 0.9, motivo: 'fala da blusa' });
  assert.equal(v({ resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'x' }).resultado, 'DUVIDA');
  assert.deepEqual(v({ resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'x' }).candidatos, ['700001', '700002']);
  assert.equal(v({ resultado: 'NAO_OS', confianca: 0.95, motivo: 'saudação' }).resultado, 'NAO_OS');
  // OS com confiança baixa: vira dúvida se vierem candidatos válidos; senão sem associação
  assert.equal(v({ resultado: 'OS', os: '90001', candidatos: ['90001', '90002'], confianca: 0.6, motivo: 'x' }).resultado, 'DUVIDA');
  assert.equal(v({ resultado: 'OS', os: '90001', confianca: 0.6, motivo: 'x' }).resultado, 'SEM_ASSOCIACAO');
  // desvios = falha
  assert.equal(v({ resultado: 'OS', os: '99999', confianca: 0.9 }).ok, false);
  assert.equal(v({ resultado: 'DUVIDA', candidatos: ['90001'], confianca: 0.5 }).ok, false);
  assert.equal(v({ resultado: 'DUVIDA', candidatos: ['90001', '90001'], confianca: 0.5 }).ok, false);
  assert.equal(v({ resultado: 'OS', os: '90001', confianca: 1.5 }).ok, false);
  assert.equal(v({ resultado: 'TALVEZ', confianca: 0.5 }).ok, false);
  assert.equal(v(null).ok, false);
});

test('texto da pergunta: 2 e 3 peças, nomes iguais ganham quantidade e depois referência', () => {
  const p = (peca, pecas, referencia) => ({ peca, pecas, referencia });
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('CALCA', 20, 'R2')]), 'Olá! Essa mensagem é sobre *BLUSA* ou *CALCA*?');
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('CALCA', 20, 'R2'), p('SAIA', 5, 'R3')]), 'Olá! Essa mensagem é sobre *BLUSA*, *CALCA* ou *SAIA*?');
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('BLUSA', 20, 'R2')]), 'Olá! Essa mensagem é sobre *BLUSA* (11 peças) ou *BLUSA* (20 peças)?');
  assert.equal(ctx.textoPerguntaAssociacao([p('BLUSA', 11, 'R1'), p('BLUSA', 11, 'R2')]), 'Olá! Essa mensagem é sobre *BLUSA* (R1) ou *BLUSA* (R2)?');
});

test('pergunta aberta: do grupo, enviada ou na fila, menos de 24 h e não fechada', () => {
  const base = { id: 'P1', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', grupo_jid: 'grupo-teste@g.us', status_envio: 'ENVIADA', quando: '2026-10-22T12:00:00.000Z', pergunta_fechada_em: '' };
  const agora = '2026-10-22T20:00:00.000Z';
  assert.equal(ctx.perguntaAbertaWhatsapp([base], 'grupo-teste@g.us', agora).id, 'P1');
  assert.equal(ctx.perguntaAbertaWhatsapp([{ ...base, status_envio: 'PENDENTE' }], 'grupo-teste@g.us', agora).id, 'P1');
  assert.equal(ctx.perguntaAbertaWhatsapp([base], 'outro@g.us', agora), null);
  assert.equal(ctx.perguntaAbertaWhatsapp([{ ...base, pergunta_fechada_em: '2026-10-22T13:00:00.000Z' }], 'grupo-teste@g.us', agora), null);
  assert.equal(ctx.perguntaAbertaWhatsapp([{ ...base, status_envio: 'ERRO' }], 'grupo-teste@g.us', agora), null);
  assert.equal(ctx.perguntaAbertaWhatsapp([base], 'grupo-teste@g.us', '2026-10-23T12:00:01.000Z'), null);
});

test('contexto do associador: sem JID, telefone nem nome de participante', () => {
  const c = ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', mensagens, '2026-10-22');
  const grupo = [{ id: 'R0', direcao: 'RECEBIDA', grupo_jid: 'grupo-teste@g.us', participante_jid: '5500000000001@s.whatsapp.net', participante_nome: 'Fulano', quando: '2026-10-22T11:00:00.000Z', texto: 'bom dia', os: '' }];
  const e = limpo(ctx.contextoAssociadorWhatsapp({ texto: 'a blusa sai dia 27', quando: '2026-10-22T13:00:00.000Z' }, c, grupo, null));
  const s = JSON.stringify(e);
  assert.ok(!/5500000000001|Fulano|grupo-teste/.test(s));
  assert.equal(e.texto, 'a blusa sai dia 27');
  assert.deepEqual(e.conversa, [{ direcao: 'RECEBIDA', quando: '2026-10-22T11:00:00.000Z', texto: 'bom dia', os: '' }]);
  assert.equal(e.pergunta, null);
  assert.ok(e.instrucoes.length > 0 && e.schema.resultado);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `cd n8n && node --test test/associador.test.js`
Expected: FAIL (`ctx.candidatosAssociacaoWhatsapp is not a function`).

- [ ] **Passo 3: implementar** — criar `n8n/src/associador.js` e acrescentar `'associador.js'` em `ARQUIVOS` de `n8n/test/carregar.js`, logo depois de `'whatsapp.js'`.

```js
// ===== src/associador.js =====
// Associador por IA (22/10): liga a mensagem da oficina à OS certa quando as
// regras fixas (citação, OS no texto, única cobrança) não resolvem. Regras
// puras; a IA só escolhe entre candidatos e nunca recebe JID, telefone ou nome.

var LIMITE_CONFIANCA_ASSOCIADOR = 0.8;
var HORAS_PERGUNTA_ASSOCIACAO = 24;
var LIMITE_CONVERSA_ASSOCIADOR = 10;
var RESULTADOS_ASSOCIADOR = { OS: 1, DUVIDA: 1, NAO_OS: 1 };

var INSTRUCOES_ASSOCIADOR_WHATSAPP = 'Descubra de qual OS da lista a mensagem da oficina fala. ' +
  'As oficinas conhecem a peça, não o número da OS. Use a conversa recente do grupo. ' +
  'Responda OS quando tiver certeza, DUVIDA com 2 ou 3 candidatos quando não souber entre eles, ' +
  'NAO_OS quando a mensagem não fala de nenhuma peça (saudação, ok, figurinha). Devolva só o objeto.';

var SCHEMA_ASSOCIADOR_WHATSAPP = {
  resultado: ['OS', 'DUVIDA', 'NAO_OS'],
  os: 'número da OS escolhida (só em OS)',
  candidatos: 'lista de 2 ou 3 números de OS (só em DUVIDA)',
  confianca: 'número entre 0 e 1',
  motivo: 'frase curta em português'
};

function ultimaMensagemPcpAssociador(mensagens, dealId) {
  var enviadas = (mensagens || []).filter(function (m) {
    return m && texto(m.deal_id) === dealId && semAcento(m.direcao) === 'ENVIADA' && mensagemVistaPelaOficina(m);
  }).sort(function (a, b) { return Date.parse(texto(a.quando)) - Date.parse(texto(b.quando)); });
  var ultima = enviadas[enviadas.length - 1];
  return ultima ? { quando: texto(ultima.quando), texto: cortarTextoInterprete(ultima.texto) } : null;
}

function candidatosAssociacaoWhatsapp(producoes, oficinaId, mensagens, hojeISO) {
  return (producoes || []).filter(function (p) {
    return p && texto(p.deal_id) && texto(p.oficina_id) === texto(oficinaId) && semAcento(p.em_costura) === 'SIM';
  }).map(function (p) {
    var dealId = texto(p.deal_id);
    var status = statusPrazo({ dealId: dealId, os: texto(p.os), dataCombinada: texto(p.data_combinada), leadTime: texto(p.lead_time) }, hojeISO);
    var pecas = numero(p.pecas);
    return {
      dealId: dealId, os: texto(p.os), peca: texto(p.peca), referencia: texto(p.referencia),
      pecas: pecas === null || isNaN(pecas) ? null : pecas,
      prazoVigente: status.data, statusPrazo: status.status,
      ultimaMensagemPcp: ultimaMensagemPcpAssociador(mensagens, dealId)
    };
  });
}

function contextoAssociadorWhatsapp(msg, candidatos, mensagensGrupo, pergunta) {
  var conversa = linhasWhatsappUnicas((mensagensGrupo || []).filter(mensagemVistaPelaOficina), false)
    .sort(function (a, b) { return Date.parse(texto(a.quando)) - Date.parse(texto(b.quando)); })
    .slice(-LIMITE_CONVERSA_ASSOCIADOR)
    .map(function (m) {
      return {
        direcao: semAcento(m.direcao), quando: texto(m.quando),
        texto: semAcento(m.tipo_conteudo) === 'NAO_TEXTUAL' ? '[conteúdo não textual]' : cortarTextoInterprete(m.texto),
        os: texto(m.os)
      };
    });
  return {
    texto: cortarTextoInterprete(msg && msg.texto),
    quando: texto(msg && msg.quando),
    candidatos: (candidatos || []).map(function (c) {
      return { os: c.os, peca: c.peca, referencia: c.referencia, pecas: c.pecas, prazoVigente: c.prazoVigente, statusPrazo: c.statusPrazo, ultimaMensagemPcp: c.ultimaMensagemPcp };
    }),
    conversa: conversa,
    pergunta: pergunta ? {
      texto: cortarTextoInterprete(pergunta.texto),
      candidatos: (pergunta.candidatos || []).slice(),
      mensagemOriginal: cortarTextoInterprete(pergunta.mensagemOriginal)
    } : null,
    instrucoes: INSTRUCOES_ASSOCIADOR_WHATSAPP,
    schema: JSON.parse(JSON.stringify(SCHEMA_ASSOCIADOR_WHATSAPP))
  };
}

function validarAssociacaoWhatsapp(valor, candidatos) {
  var falha = function (erro) { return { ok: false, erro: erro }; };
  if (!valor || typeof valor !== 'object') return falha('Saída do associador vazia.');
  var resultado = semAcento(valor.resultado);
  if (!RESULTADOS_ASSOCIADOR[resultado]) return falha('Resultado inválido do associador.');
  var confianca = Number(valor.confianca);
  if (!isFinite(confianca) || confianca < 0 || confianca > 1) return falha('Confiança inválida do associador.');
  var porOs = {};
  (candidatos || []).forEach(function (c) { porOs[texto(c.os)] = c; });
  var motivo = cortarTextoInterprete(valor.motivo, 200);
  var lista = Array.isArray(valor.candidatos) ? valor.candidatos.map(texto) : [];
  var vistos = {};
  for (var i = 0; i < lista.length; i++) {
    if (!porOs[lista[i]] || vistos[lista[i]]) return falha('Candidatos inválidos do associador.');
    vistos[lista[i]] = 1;
  }
  var duvida = function () {
    if (lista.length < 2 || lista.length > 3) return null;
    return { ok: true, resultado: 'DUVIDA', dealId: '', os: '', candidatos: lista.map(function (os) { return porOs[os].dealId; }), confianca: confianca, motivo: motivo };
  };
  if (resultado === 'NAO_OS') return { ok: true, resultado: 'NAO_OS', dealId: '', os: '', candidatos: [], confianca: confianca, motivo: motivo };
  if (resultado === 'DUVIDA') return duvida() || falha('Candidatos inválidos do associador.');
  var os = texto(valor.os);
  if (!porOs[os]) return falha('OS fora da lista de candidatos.');
  if (confianca >= LIMITE_CONFIANCA_ASSOCIADOR) {
    return { ok: true, resultado: 'OS', dealId: porOs[os].dealId, os: os, candidatos: [], confianca: confianca, motivo: motivo };
  }
  return duvida() || { ok: true, resultado: 'SEM_ASSOCIACAO', dealId: '', os: '', candidatos: [], confianca: confianca, motivo: motivo };
}

function rotuloPecaPergunta(c, todos) {
  var nome = texto(c.peca) || texto(c.referencia) || 'peça';
  var mesmoNome = todos.filter(function (o) { return (texto(o.peca) || texto(o.referencia) || 'peça') === nome; });
  if (mesmoNome.length < 2) return '*' + nome + '*';
  var mesmaQtd = mesmoNome.filter(function (o) { return o.pecas === c.pecas; });
  if (mesmaQtd.length < 2 && c.pecas !== null && c.pecas !== undefined) return '*' + nome + '* (' + formatarQtd(c.pecas) + (c.pecas === 1 ? ' peça)' : ' peças)');
  return '*' + nome + '* (' + texto(c.referencia) + ')';
}

function textoPerguntaAssociacao(candidatos) {
  var rotulos = (candidatos || []).map(function (c) { return rotuloPecaPergunta(c, candidatos); });
  var lista = rotulos.length > 2 ? rotulos.slice(0, -1).join(', ') + ' ou ' + rotulos[rotulos.length - 1] : rotulos.join(' ou ');
  return 'Olá! Essa mensagem é sobre ' + lista + '?';
}

function perguntaAbertaWhatsapp(mensagens, grupoJid, agora) {
  var agoraMs = Date.parse(texto(agora));
  var limite = HORAS_PERGUNTA_ASSOCIACAO * 3600000;
  return linhasWhatsappUnicas((mensagens || []).filter(function (m) {
    if (!m || semAcento(m.tipo) !== 'PERGUNTA_ASSOCIACAO' || texto(m.grupo_jid) !== texto(grupoJid)) return false;
    if (texto(m.pergunta_fechada_em)) return false;
    var status = semAcento(m.status_envio);
    if (status !== 'ENVIADA' && status !== 'PENDENTE' && status !== 'ENVIANDO') return false;
    var ts = Date.parse(texto(m.quando));
    return isFinite(ts) && isFinite(agoraMs) && agoraMs - ts < limite;
  }), false)[0] || null;
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `cd n8n && node --test test/associador.test.js && npm test`
Expected: PASS, com a suíte inteira verde.

- [ ] **Passo 5: commit**

```bash
git add n8n/src/associador.js n8n/test/carregar.js n8n/test/associador.test.js
git commit -m "feat: regras puras do associador de mensagens por IA"
```

---

### Tarefa 2: Decisão da associação e expiração das perguntas

**Arquivos:**
- Modificar: `n8n/src/associador.js`
- Teste: `n8n/test/associador.test.js`

**Interfaces:**
- Consome (Tarefa 1): `validarAssociacaoWhatsapp`, `textoPerguntaAssociacao`, `perguntaAbertaWhatsapp`, `candidatosAssociacaoWhatsapp`.
- Produz:
  - `decidirAssociacaoWhatsapp(entrada, saidaModelo, contexto)` onde `entrada = { mensagem: <linha gravada da mensagem>, candidatos, pergunta: <linha da pergunta aberta> | null, original: <linha da mensagem original da pergunta> | null }`, `contexto = { agora, gerarId: function () }` → `{ ok: true, resultado, operacoes: [ {aba:'WHATSAPP_MENSAGENS', operacao:'update'|'append', chave:'id', linha} ], interpretar: null | { mensagemId, dealId } }` ou `{ ok: false, erro }`.
  - `fecharPerguntasVencidasWhatsapp(mensagens, agora)` → `{ operacoes }`.

Regras (do spec 3.3–3.4):
1. Sem pergunta (`entrada.pergunta` nulo):
   - `OS` → update da mensagem: `deal_id`, `os`, `associacao: 'IA'`, `associacao_confianca`, `associacao_motivo` + campos de interpretação pendente (`camposInterpretacaoPendenteWhatsapp(1, agora)`); `interpretar = { mensagemId, dealId }`.
   - `DUVIDA` → se já existe pergunta aberta no grupo (não deveria, mas confere), vira `SEM_ASSOCIACAO`; senão update da mensagem `associacao: 'IA_DUVIDA'` + append da pergunta: `{ id: gerarId(), evolution_id: '', quando: agora, grupo_jid, grupo_nome, participante_jid: '', participante_nome: 'PCP', direcao: 'ENVIADA', tipo: 'PERGUNTA_ASSOCIACAO', tipo_conteudo: 'TEXTO', texto: textoPerguntaAssociacao(candidatos escolhidos), resposta_a_evolution_id: mensagem.evolution_id, deal_id: '', os: '', oficina_id, associacao: 'MANUAL', status_envio: 'PENDENTE', erro: '', criado_em: agora, pergunta_candidatos: dealIds.join(';'), pergunta_mensagem_id: mensagem.id, pergunta_fechada_em: '' }`.
   - `NAO_OS` → update `associacao: 'NAO_OS'`, confiança e motivo.
   - `SEM_ASSOCIACAO` → update só `associacao_confianca` e `associacao_motivo` (a linha já está `SEM_ASSOCIACAO`).
2. Com pergunta aberta (modo resposta; candidatos = todas as OS da oficina; os da pergunta vêm em `pergunta.pergunta_candidatos`):
   - `OS` **com dealId entre os da pergunta** → update da resposta (`IA`, sem interpretação: `interpretacao_status: ''`), update da original (`deal_id`, `os`, `associacao: 'IA'` + interpretação pendente), update da pergunta (`deal_id`, `os`, `pergunta_fechada_em: agora`); `interpretar = { mensagemId: original.id, dealId }`.
   - Qualquer outro resultado → não respondeu: segue a regra 1 (OS → liga; NAO_OS → NAO_OS; SEM_ASSOCIACAO → só motivo), mas `DUVIDA` vira `SEM_ASSOCIACAO` (já existe pergunta aberta no grupo). A pergunta continua aberta.
3. Saída inválida do modelo → `{ ok: false, erro }`.

- [ ] **Passo 1: testes que falham** (acrescentar em `n8n/test/associador.test.js`)

```js
const msgLinha = { id: 'WA-R-1', evolution_id: 'EVO-1', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE', oficina_id: 'of-1', direcao: 'RECEBIDA', texto: 'a blusa sai dia 27', quando: '2026-10-22T13:00:00.000Z', associacao: 'SEM_ASSOCIACAO' };
const ctxDecisao = { agora: '2026-10-22T13:00:05.000Z', gerarId: () => 'WA-P-1' };
const cands = () => ctx.candidatosAssociacaoWhatsapp(producao, 'of-1', [], '2026-10-22');

test('decisão OS: liga a mensagem como IA e pede interpretação', () => {
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'OS', os: '90001', confianca: 0.92, motivo: 'fala da blusa' }, ctxDecisao));
  assert.equal(r.ok, true);
  assert.equal(r.resultado, 'OS');
  assert.equal(r.operacoes.length, 1);
  assert.deepEqual(
    { id: r.operacoes[0].linha.id, deal_id: r.operacoes[0].linha.deal_id, os: r.operacoes[0].linha.os, associacao: r.operacoes[0].linha.associacao, associacao_confianca: r.operacoes[0].linha.associacao_confianca, interpretacao_status: r.operacoes[0].linha.interpretacao_status },
    { id: 'WA-R-1', deal_id: '700001', os: '90001', associacao: 'IA', associacao_confianca: 0.92, interpretacao_status: 'PENDENTE' });
  assert.deepEqual(r.interpretar, { mensagemId: 'WA-R-1', dealId: '700001' });
});

test('decisão DUVIDA: marca IA_DUVIDA e enfileira a pergunta citando a mensagem', () => {
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'duas peças' }, ctxDecisao));
  assert.equal(r.resultado, 'DUVIDA');
  assert.equal(r.operacoes[0].linha.associacao, 'IA_DUVIDA');
  const p = r.operacoes[1];
  assert.equal(p.operacao, 'append');
  assert.equal(p.linha.tipo, 'PERGUNTA_ASSOCIACAO');
  assert.equal(p.linha.texto, 'Olá! Essa mensagem é sobre *BLUSA TESTE* ou *CALCA TESTE*?');
  assert.equal(p.linha.resposta_a_evolution_id, 'EVO-1');
  assert.equal(p.linha.pergunta_candidatos, '700001;700002');
  assert.equal(p.linha.pergunta_mensagem_id, 'WA-R-1');
  assert.equal(p.linha.status_envio, 'PENDENTE');
  assert.equal(r.interpretar, null);
});

test('decisão NAO_OS e SEM_ASSOCIACAO não perguntam nem interpretam', () => {
  const nao = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'NAO_OS', confianca: 0.9, motivo: 'saudação' }, ctxDecisao));
  assert.equal(nao.operacoes.length, 1);
  assert.equal(nao.operacoes[0].linha.associacao, 'NAO_OS');
  const sem = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null },
    { resultado: 'OS', os: '90001', confianca: 0.5, motivo: 'incerto' }, ctxDecisao));
  assert.equal(sem.resultado, 'SEM_ASSOCIACAO');
  assert.equal(sem.operacoes[0].linha.associacao, undefined);
  assert.equal(sem.operacoes[0].linha.associacao_motivo, 'incerto');
  assert.equal(sem.interpretar, null);
});

test('modo resposta: escolheu a OS liga original e resposta e fecha a pergunta', () => {
  const pergunta = { id: 'WA-P-1', tipo: 'PERGUNTA_ASSOCIACAO', pergunta_candidatos: '700001;700002', pergunta_mensagem_id: 'WA-R-1', grupo_jid: 'grupo-teste@g.us' };
  const resposta = { ...msgLinha, id: 'WA-R-2', evolution_id: 'EVO-2', texto: 'é a blusa' };
  const r = limpo(ctx.decidirAssociacaoWhatsapp({ mensagem: resposta, candidatos: cands().filter((c) => c.os !== '90003'), pergunta, original: msgLinha },
    { resultado: 'OS', os: '90001', confianca: 0.95, motivo: 'respondeu blusa' }, ctxDecisao));
  assert.equal(r.resultado, 'OS');
  const porId = Object.fromEntries(r.operacoes.map((o) => [o.linha.id, o.linha]));
  assert.equal(porId['WA-R-2'].associacao, 'IA');
  assert.equal(porId['WA-R-2'].interpretacao_status, '');
  assert.equal(porId['WA-R-1'].deal_id, '700001');
  assert.equal(porId['WA-R-1'].interpretacao_status, 'PENDENTE');
  assert.equal(porId['WA-P-1'].pergunta_fechada_em, '2026-10-22T13:00:05.000Z');
  assert.equal(porId['WA-P-1'].deal_id, '700001');
  assert.deepEqual(r.interpretar, { mensagemId: 'WA-R-1', dealId: '700001' });
});

test('modo resposta: não respondeu segue o fluxo normal, sem nova pergunta', () => {
  const pergunta = { id: 'WA-P-1', pergunta_candidatos: '700001;700002', pergunta_mensagem_id: 'WA-R-1' };
  const entrada = { mensagem: { ...msgLinha, id: 'WA-R-3' }, candidatos: cands(), pergunta, original: msgLinha };
  const nao = limpo(ctx.decidirAssociacaoWhatsapp(entrada, { resultado: 'NAO_OS', confianca: 0.9, motivo: 'outro assunto' }, ctxDecisao));
  assert.deepEqual(nao.operacoes.map((o) => [o.linha.id, o.linha.associacao]), [['WA-R-3', 'NAO_OS']]);
  const duvida = limpo(ctx.decidirAssociacaoWhatsapp(entrada, { resultado: 'DUVIDA', candidatos: ['90001', '90002'], confianca: 0.5, motivo: 'x' }, ctxDecisao));
  assert.equal(duvida.resultado, 'SEM_ASSOCIACAO');
  assert.equal(duvida.operacoes.length, 1);
});

test('saída inválida do modelo falha', () => {
  const r = ctx.decidirAssociacaoWhatsapp({ mensagem: msgLinha, candidatos: cands(), pergunta: null, original: null }, { resultado: 'OS', os: '12345', confianca: 0.9 }, ctxDecisao);
  assert.equal(r.ok, false);
});

test('perguntas com mais de 24 h fecham e a original volta para SEM_ASSOCIACAO', () => {
  const linhas = [
    { id: 'WA-P-1', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', status_envio: 'ENVIADA', grupo_jid: 'g@g.us', quando: '2026-10-21T10:00:00.000Z', pergunta_mensagem_id: 'WA-R-1', pergunta_fechada_em: '' },
    { id: 'WA-R-1', direcao: 'RECEBIDA', associacao: 'IA_DUVIDA', grupo_jid: 'g@g.us', quando: '2026-10-21T09:59:00.000Z' },
    { id: 'WA-P-2', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', status_envio: 'ENVIADA', grupo_jid: 'h@g.us', quando: '2026-10-22T10:00:00.000Z', pergunta_mensagem_id: 'WA-R-9', pergunta_fechada_em: '' }
  ];
  const r = limpo(ctx.fecharPerguntasVencidasWhatsapp(linhas, '2026-10-22T11:00:00.000Z'));
  assert.deepEqual(r.operacoes.map((o) => o.linha), [
    { id: 'WA-P-1', pergunta_fechada_em: '2026-10-22T11:00:00.000Z' },
    { id: 'WA-R-1', associacao: 'SEM_ASSOCIACAO' }
  ]);
});
```

- [ ] **Passo 2: rodar e ver falhar** — `cd n8n && node --test test/associador.test.js` → FAIL (`decidirAssociacaoWhatsapp is not a function`).

- [ ] **Passo 3: implementar** (acrescentar ao fim de `n8n/src/associador.js`)

```js
function opMensagemWhatsapp(linha, operacao) {
  return { aba: 'WHATSAPP_MENSAGENS', operacao: operacao || 'update', chave: 'id', linha: linha };
}

function linhaLigadaIA(mensagem, cand, v, agora, interpretar) {
  return Object.assign({
    id: texto(mensagem.id), deal_id: cand.dealId, os: cand.os, associacao: 'IA',
    associacao_confianca: v.confianca, associacao_motivo: v.motivo
  }, interpretar ? camposInterpretacaoPendenteWhatsapp(1, agora)
    : { interpretacao_status: '', interpretacao_tentativas: '', interpretacao_proxima: '' });
}

function decidirAssociacaoWhatsapp(entrada, saidaModelo, contexto) {
  entrada = entrada || {};
  contexto = contexto || {};
  var mensagem = entrada.mensagem || {};
  var candidatos = entrada.candidatos || [];
  var agora = texto(contexto.agora);
  var v = validarAssociacaoWhatsapp(saidaModelo, candidatos);
  if (!v.ok) return v;
  var porDeal = {};
  candidatos.forEach(function (c) { porDeal[c.dealId] = c; });

  var daPergunta = entrada.pergunta ? texto(entrada.pergunta.pergunta_candidatos).split(';') : [];
  if (entrada.pergunta && v.resultado === 'OS' && daPergunta.indexOf(v.dealId) >= 0) {
    var cand = porDeal[v.dealId];
    var original = entrada.original || {};
    return {
      ok: true, resultado: 'OS',
      operacoes: [
        opMensagemWhatsapp(linhaLigadaIA(mensagem, cand, v, agora, false)),
        opMensagemWhatsapp(linhaLigadaIA(original, cand, v, agora, true)),
        opMensagemWhatsapp({ id: texto(entrada.pergunta.id), deal_id: cand.dealId, os: cand.os, pergunta_fechada_em: agora })
      ],
      interpretar: { mensagemId: texto(original.id), dealId: cand.dealId }
    };
  }

  var base = { id: texto(mensagem.id), associacao_confianca: v.confianca, associacao_motivo: v.motivo };
  if (v.resultado === 'OS') {
    return { ok: true, resultado: 'OS', operacoes: [opMensagemWhatsapp(linhaLigadaIA(mensagem, porDeal[v.dealId], v, agora, true))],
      interpretar: { mensagemId: texto(mensagem.id), dealId: v.dealId } };
  }
  if (v.resultado === 'NAO_OS') {
    return { ok: true, resultado: 'NAO_OS', operacoes: [opMensagemWhatsapp(Object.assign({ associacao: 'NAO_OS' }, base))], interpretar: null };
  }
  if (v.resultado === 'DUVIDA' && !entrada.pergunta) {
    var escolhidos = v.candidatos.map(function (d) { return porDeal[d]; });
    var pergunta = {
      id: texto(contexto.gerarId()), evolution_id: '', quando: agora, grupo_jid: texto(mensagem.grupo_jid), grupo_nome: texto(mensagem.grupo_nome),
      participante_jid: '', participante_nome: 'PCP', direcao: 'ENVIADA', tipo: 'PERGUNTA_ASSOCIACAO', tipo_conteudo: 'TEXTO',
      texto: textoPerguntaAssociacao(escolhidos), resposta_a_evolution_id: texto(mensagem.evolution_id), deal_id: '', os: '',
      oficina_id: texto(mensagem.oficina_id), associacao: 'MANUAL', status_envio: 'PENDENTE', erro: '', criado_em: agora,
      pergunta_candidatos: v.candidatos.join(';'), pergunta_mensagem_id: texto(mensagem.id), pergunta_fechada_em: ''
    };
    return { ok: true, resultado: 'DUVIDA', operacoes: [
      opMensagemWhatsapp(Object.assign({ associacao: 'IA_DUVIDA' }, base)),
      opMensagemWhatsapp(pergunta, 'append')
    ], interpretar: null };
  }
  return { ok: true, resultado: 'SEM_ASSOCIACAO', operacoes: [opMensagemWhatsapp(base)], interpretar: null };
}

function fecharPerguntasVencidasWhatsapp(mensagens, agora) {
  var agoraMs = Date.parse(texto(agora));
  var limite = HORAS_PERGUNTA_ASSOCIACAO * 3600000;
  var unicas = linhasWhatsappUnicas(mensagens || [], false);
  var porId = {};
  unicas.forEach(function (m) { if (m && texto(m.id)) porId[texto(m.id)] = m; });
  var operacoes = [];
  unicas.forEach(function (m) {
    if (!m || semAcento(m.tipo) !== 'PERGUNTA_ASSOCIACAO' || texto(m.pergunta_fechada_em)) return;
    var ts = Date.parse(texto(m.quando));
    if (!isFinite(ts) || !isFinite(agoraMs) || agoraMs - ts < limite) return;
    operacoes.push(opMensagemWhatsapp({ id: texto(m.id), pergunta_fechada_em: texto(agora) }));
    var original = porId[texto(m.pergunta_mensagem_id)];
    if (original && semAcento(original.associacao) === 'IA_DUVIDA') {
      operacoes.push(opMensagemWhatsapp({ id: texto(original.id), associacao: 'SEM_ASSOCIACAO' }));
    }
  });
  return { operacoes: operacoes };
}
```

- [ ] **Passo 4:** `cd n8n && node --test test/associador.test.js && npm test` → PASS.
- [ ] **Passo 5: commit** — `git add n8n/src/associador.js n8n/test/associador.test.js && git commit -m "feat: decisão do associador e expiração das perguntas"`

---

### Tarefa 3: Associador no "Receber WhatsApp"

**Arquivos:**
- Modificar: `n8n/src/whatsapp.js` (`prepararEntradaWhatsapp`)
- Criar: `n8n/adaptadores/montar-contexto-associador.js`, `n8n/adaptadores/finalizar-associacao.js`
- Modificar: `n8n/scripts/gerar-code-nodes.js`, `n8n/scripts/ids-subworkflows.js`, `n8n/scripts/gerar-workflow-sdk.js`
- Teste: `n8n/test/whatsapp-entrada-associador.test.js` (novo), `n8n/test/workflow-whatsapp-entrada.test.js`

**Interfaces:**
- Consome: `candidatosAssociacaoWhatsapp`, `perguntaAbertaWhatsapp`, `contextoAssociadorWhatsapp`, `decidirAssociacaoWhatsapp` (Tarefas 1–2); `requisicoesDeEscrita(ops, historicos, planilha, PLANILHA_ID)`, `planilhaDoLote(json, LEITURAS_WHATSAPP_ENTRADA)` (existentes).
- Produz: `prepararEntradaWhatsapp(...).precisaAssociar` (boolean) e `.pedidoAssociador = { mensagem: <linhaMensagem>, candidatos, pergunta, original, entrada: <contextoAssociadorWhatsapp> }`; `IDS_SUBWORKFLOWS.ASSOCIADOR`.

Regras em `prepararEntradaWhatsapp` (depois de calcular `associacao` e `linhaMensagem`):
- `precisaAssociar = msg.tipoConteudo === 'TEXTO' && !associacao.dealId && candidatos.length > 0`, com `candidatos = candidatosAssociacaoWhatsapp(dados.producao, msg.oficinaId, dados.mensagens, dataISOEmSaoPaulo(agora))`.
- `pergunta = perguntaAbertaWhatsapp(dados.mensagens, msg.grupoJid, agora)`; se houver, `original` = linha com `id === pergunta.pergunta_mensagem_id`. O modelo recebe todas as OS da oficina e, em `entrada.pergunta.candidatos`, os números das OS perguntadas.
- `conversa do grupo` = mensagens com `grupo_jid === msg.grupoJid`.
- Quando `precisaAssociar` é falso, o retorno fica idêntico ao de hoje (os testes atuais continuam verdes).

- [ ] **Passo 1: testes que falham** (`n8n/test/whatsapp-entrada-associador.test.js`)

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregar, limpo } = require('./carregar');
const ctx = carregar();

const payload = (id, textoMsg) => ({ event: 'messages.upsert', instance: 'producao', data: {
  key: { remoteJid: 'grupo-teste@g.us', fromMe: false, id, participant: '5500000000001@s.whatsapp.net' },
  pushName: 'Pessoa Teste', message: { conversation: textoMsg }, messageTimestamp: 1792690000 } });
const dados = () => ({
  oficinas: [{ ploomes_id: 'of-1', nome: 'OFICINA A', grupo_jid: 'grupo-teste@g.us', grupo_nome: 'GRUPO TESTE', ativo: 'SIM' }],
  producao: [
    { deal_id: '700001', os: '90001', oficina_id: 'of-1', em_costura: 'SIM', peca: 'BLUSA TESTE', pecas: '11' },
    { deal_id: '700002', os: '90002', oficina_id: 'of-1', em_costura: 'SIM', peca: 'CALCA TESTE', pecas: '20' }
  ],
  mensagens: []
});
const contexto = { instancia: 'producao', agora: '2026-10-22T13:00:00.000Z', gerarId: (e) => 'WA-R-' + e };

test('sem regra que resolva e com OS na Costura: pede o associador', () => {
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-1', 'a blusa sai dia 27'), dados(), contexto));
  assert.equal(r.precisaInterpretar, false);
  assert.equal(r.precisaAssociar, true);
  assert.deepEqual(r.pedidoAssociador.candidatos.map((c) => c.os), ['90001', '90002']);
  assert.equal(r.pedidoAssociador.mensagem.id, 'WA-R-EVO-1');
  assert.equal(r.pedidoAssociador.pergunta, null);
  assert.ok(!JSON.stringify(r.pedidoAssociador.entrada).includes('5500000000001'));
});

test('com pergunta aberta: todos os candidatos da oficina, a pergunta e a original junto', () => {
  const d = dados();
  d.producao.push({ deal_id: '700003', os: '90003', oficina_id: 'of-1', em_costura: 'SIM', peca: 'SAIA TESTE' });
  d.mensagens = [
    { id: 'WA-R-0', direcao: 'RECEBIDA', grupo_jid: 'grupo-teste@g.us', texto: 'vai atrasar', associacao: 'IA_DUVIDA', quando: '2026-10-22T12:00:00.000Z' },
    { id: 'WA-P-1', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', status_envio: 'ENVIADA', grupo_jid: 'grupo-teste@g.us', quando: '2026-10-22T12:00:05.000Z', texto: 'Olá! Essa mensagem é sobre *BLUSA TESTE* ou *CALCA TESTE*?', pergunta_candidatos: '700001;700002', pergunta_mensagem_id: 'WA-R-0', pergunta_fechada_em: '' }
  ];
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-2', 'é a blusa'), d, contexto));
  assert.equal(r.precisaAssociar, true);
  assert.deepEqual(r.pedidoAssociador.candidatos.map((c) => c.os), ['90001', '90002', '90003']);
  assert.deepEqual(r.pedidoAssociador.entrada.pergunta.candidatos, ['90001', '90002']);
  assert.equal(r.pedidoAssociador.pergunta.id, 'WA-P-1');
  assert.equal(r.pedidoAssociador.original.id, 'WA-R-0');
  assert.equal(r.pedidoAssociador.entrada.pergunta.mensagemOriginal, 'vai atrasar');
});

test('regra fixa resolvendo (OS no texto) não chama o associador', () => {
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-3', 'a 90001 sai dia 27'), dados(), contexto));
  assert.equal(r.precisaAssociar, false);
  assert.equal(r.precisaInterpretar, true);
});

test('oficina sem OS na Costura não chama o associador', () => {
  const d = dados();
  d.producao = [];
  const r = limpo(ctx.prepararEntradaWhatsapp(payload('EVO-4', 'a blusa sai dia 27'), d, contexto));
  assert.equal(r.precisaAssociar, false);
});
```

E em `n8n/test/workflow-whatsapp-entrada.test.js`, acrescentar:

```js
test('sem associação: chama o associador, grava a decisão e dispara a interpretação', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Precisa Interpretar?', 1), ['Precisa Associar?']);
  assert.deepEqual(destinos(w, 'Precisa Associar?', 0), ['Montar Contexto do Associador']);
  assert.deepEqual(destinos(w, 'Montar Contexto do Associador'), ['Associar com Modelo']);
  assert.deepEqual(destinos(w, 'Associar com Modelo'), ['Finalizar Associação']);
  assert.deepEqual(destinos(w, 'Finalizar Associação'), ['Gravar Associação']);
  assert.deepEqual(destinos(w, 'Gravar Associação'), ['Interpretar Associada?']);
  assert.deepEqual(destinos(w, 'Interpretar Associada?', 0), ['Disparar Interpretação']);
  const assoc = no(w, 'Associar com Modelo');
  assert.equal(assoc.parameters.options.waitForSubWorkflow, true);
  assert.equal(no(w, 'Disparar Interpretação').parameters.options.waitForSubWorkflow, false);
  assert.ok(!w.nodes.some((n) => n.type === 'n8n-nodes-base.httpRequest' && /evolution/i.test(String(n.parameters.url))));
});
```

- [ ] **Passo 2:** `cd n8n && npm test` → FAIL nos testes novos.

- [ ] **Passo 3: implementar `prepararEntradaWhatsapp`** — em `n8n/src/whatsapp.js`, trocar o `return { ok: true, precisaInterpretar: ... }` final por:

```js
  var pedidoAssociador = null;
  if (msg.tipoConteudo === 'TEXTO' && !associacao.dealId) {
    var hojeEntrada = dataISOEmSaoPaulo(agora);
    var todosCandidatos = candidatosAssociacaoWhatsapp(dados.producao, msg.oficinaId, dados.mensagens, hojeEntrada);
    var pergunta = perguntaAbertaWhatsapp(dados.mensagens, msg.grupoJid, agora);
    var original = null;
    var candidatos = todosCandidatos;
    var perguntados = [];
    if (pergunta) {
      var daPergunta = texto(pergunta.pergunta_candidatos).split(';');
      perguntados = todosCandidatos.filter(function (c) { return daPergunta.indexOf(c.dealId) >= 0; });
      original = linhasWhatsappUnicas((dados.mensagens || []).filter(function (m) {
        return m && texto(m.id) === texto(pergunta.pergunta_mensagem_id);
      }), false)[0] || null;
      if (!original || !perguntados.length) { pergunta = null; original = null; }
    }
    if (candidatos.length) {
      var doGrupo = (dados.mensagens || []).filter(function (m) { return m && texto(m.grupo_jid) === msg.grupoJid; });
      pedidoAssociador = {
        mensagem: linhaMensagem, candidatos: candidatos, pergunta: pergunta, original: original,
        entrada: contextoAssociadorWhatsapp({ texto: msg.texto, quando: msg.quando || agora }, candidatos, doGrupo,
          pergunta ? { texto: pergunta.texto, candidatos: perguntados.map(function (c) { return c.os; }), mensagemOriginal: original.texto } : null)
      };
    }
  }
  return {
    ok: true,
    precisaInterpretar: precisaInterpretar,
    precisaAssociar: !!pedidoAssociador,
    pedidoAssociador: pedidoAssociador,
    mensagemId: mensagemId,
    // ...demais campos exatamente como hoje (quando, dealId, os, versao, contextoInterpretacao, operacoes)
  };
```

(Escrever o objeto completo: manter `quando`, `dealId`, `os`, `versao`, `contextoInterpretacao` e `operacoes` como estão hoje.)

- [ ] **Passo 4: adaptadores**

`n8n/adaptadores/montar-contexto-associador.js`:

```js
// ===== adaptador: Montar Contexto do Associador =====
// Manda ao subworkflow só o contexto sem JID, telefone ou nome (contextoAssociadorWhatsapp).
var preparadaAssoc = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
return [{ json: (preparadaAssoc.pedidoAssociador || {}).entrada || {} }];
```

`n8n/adaptadores/finalizar-associacao.js`:

```js
// ===== adaptador: Finalizar Associação =====
// O subworkflow devolve { associacao: {...} }. Valida, decide e monta as gravações.
// Falha (saída inválida) = erro do nó; a mensagem continua SEM_ASSOCIACAO.
var preparadaFim = $('Preparar Entrada WhatsApp').first().json.preparacao || {};
var pedidoFim = preparadaFim.pedidoAssociador || {};
var saidaAssoc = ($input.first().json || {}).associacao;
var decisao = decidirAssociacaoWhatsapp(pedidoFim, saidaAssoc, {
  agora: new Date().toISOString(),
  gerarId: function () { return 'WA-P-' + texto(pedidoFim.mensagem && pedidoFim.mensagem.id).replace(/^WA-R-/, ''); }
});
if (!decisao.ok) throw new Error('Saída inválida do associador: ' + decisao.erro);
if (!decisao.operacoes.length) return [];
var planilhaAssoc = planilhaDoLote($('Ler Contexto WhatsApp').first().json || {}, LEITURAS_WHATSAPP_ENTRADA);
return requisicoesDeEscrita(decisao.operacoes, [], planilhaAssoc, PLANILHA_ID).map(function (req, i) {
  return { json: Object.assign({ interpretar: i === 0 ? decisao.interpretar : null }, req) };
});
```

Registrar em `n8n/scripts/gerar-code-nodes.js` (objeto `NODES`):

```js
  'montar-contexto-associador': 'Montar Contexto do Associador',
  'finalizar-associacao': 'Finalizar Associação',
```

`n8n/scripts/ids-subworkflows.js`: acrescentar `ASSOCIADOR: 'CONFIGURAR_ASSOCIADOR'` (o id real entra na Tarefa 8).

- [ ] **Passo 5: workflow** — em `n8n/scripts/gerar-workflow-sdk.js`, no bloco `whatsappEntrada`:
  - criar a condição `Precisa Associar?` (mesmo molde de `Precisa Interpretar?`, lendo `$('Preparar Entrada WhatsApp').first().json.precisaAssociar`);
  - `code('montarContextoAssociador', 'Montar Contexto do Associador', 'montar-contexto-associador')`;
  - nó `Associar com Modelo`: cópia do `Interpretar com Modelo` com `IDS_SUBWORKFLOWS.ASSOCIADOR` e `output: [{ associacao: {} }]`;
  - `codeComErro`-like `Finalizar Associação` (`onError: 'continueErrorOutput'`, saída de erro → `Montar Erro de Interpretação`);
  - `httpGoogle('gravarAssociacao', 'Gravar Associação', 'POST', "expr('{{ $json.url }}')", true, ERRO_SAIDA, '')`;
  - condição `Interpretar Associada?` lendo `{{ !!$json.interpretar }}`;
  - `Montar Pedido de Interpretação (Entrada)`: Code inline `return [{ json: $('Finalizar Associação').first().json.interpretar }];` — ou reaproveitar via adaptador pequeno `montar-pedido-interpretacao-entrada.js` registrado em `NODES`;
  - `executarWorkflow('dispararInterpretacaoEntrada', 'Disparar Interpretação', IDS_SUBWORKFLOWS.INTERPRETAR_WHATSAPP, false, 'continueRegularOutput')`.
  - Posições em `POS_WHATSAPP_ENTRADA` na linha `y = 520`, colunas 7 a 13.
  - Ligações: `precisaInterpretarWhatsapp.onFalse(precisaAssociar.onTrue(montarContextoAssociador.to(associarComModelo.onError(montarErroInterpretacaoWhatsapp...))))`, `associarComModelo.to(finalizarAssociacao...)`, `finalizarAssociacao.to(gravarAssociacao).to(interpretarAssociada.onTrue(montarPedidoInterpretacaoEntrada.to(dispararInterpretacaoEntrada)))`.
  - Falha do associador cai em `Montar Erro de Interpretação` → `Registrar Erro de Interpretação` (ERROS_APP), como o intérprete.

- [ ] **Passo 6:** `cd n8n && npm run build && npm test` → PASS (inclui `workflow-whatsapp-entrada.test.js`).
- [ ] **Passo 7: commit** — `git add n8n && git commit -m "feat: associador por IA no Receber WhatsApp"`

---

### Tarefa 4: Envio com citação

**Arquivos:**
- Modificar: `n8n/src/associador.js` (função nova `corpoEnvioWhatsapp`)
- Criar: `n8n/adaptadores/montar-envio-whatsapp.js`
- Modificar: `n8n/scripts/gerar-code-nodes.js`, `n8n/scripts/gerar-workflow-sdk.js` (bloco `whatsappSaida`)
- Teste: `n8n/test/associador.test.js`, `n8n/test/workflow-whatsapp-saida.test.js`

**Interfaces:** produz `corpoEnvioWhatsapp(selecionada, mensagens)` → `{ number, text, quoted? }`. `selecionada` = item do "Selecionar Saida WhatsApp" (`{ id, grupo_jid, texto }`).

- [ ] **Passo 1: testes que falham**

```js
test('corpo do envio: cita a mensagem original quando a linha responde a ela', () => {
  const linhas = [
    { id: 'WA-P-1', resposta_a_evolution_id: 'EVO-1', grupo_jid: 'grupo-teste@g.us', texto: 'Olá! Essa mensagem é sobre *A* ou *B*?' },
    { id: 'WA-R-1', evolution_id: 'EVO-1', participante_jid: '5500000000001@s.whatsapp.net', texto: 'a blusa sai dia 27', direcao: 'RECEBIDA' }
  ];
  assert.deepEqual(limpo(ctx.corpoEnvioWhatsapp({ id: 'WA-P-1', grupo_jid: 'grupo-teste@g.us', texto: 'Olá! Essa mensagem é sobre *A* ou *B*?' }, linhas)), {
    number: 'grupo-teste@g.us', text: 'Olá! Essa mensagem é sobre *A* ou *B*?',
    quoted: { key: { id: 'EVO-1', remoteJid: 'grupo-teste@g.us', fromMe: false, participant: '5500000000001@s.whatsapp.net' }, message: { conversation: 'a blusa sai dia 27' } }
  });
  assert.deepEqual(limpo(ctx.corpoEnvioWhatsapp({ id: 'X', grupo_jid: 'g@g.us', texto: 'oi' }, [{ id: 'X' }])), { number: 'g@g.us', text: 'oi' });
});
```

Em `workflow-whatsapp-saida.test.js`:

```js
test('envio passa pelo Montar Envio WhatsApp e manda o corpo pronto', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Conectada?', 0), ['Montar Envio WhatsApp']);
  assert.deepEqual(destinos(w, 'Montar Envio WhatsApp'), ['Enviar pela Evolution']);
  assert.match(no(w, 'Enviar pela Evolution').parameters.jsonBody, /\$json\.corpo/);
});
```

- [ ] **Passo 2:** `cd n8n && npm test` → FAIL.
- [ ] **Passo 3: implementar**

```js
// Corpo do sendText. A Evolution não guarda mensagens: a citação leva a original inteira.
function corpoEnvioWhatsapp(selecionada, mensagens) {
  selecionada = selecionada || {};
  var corpo = { number: texto(selecionada.grupo_jid), text: typeof selecionada.texto === 'string' ? selecionada.texto : '' };
  var linha = linhasWhatsappUnicas((mensagens || []).filter(function (m) { return m && texto(m.id) === texto(selecionada.id); }), false)[0] || {};
  var citada = texto(linha.resposta_a_evolution_id);
  if (!citada) return corpo;
  var original = (mensagens || []).filter(function (m) { return m && texto(m.evolution_id) === citada; })[0];
  if (!original) return corpo;
  corpo.quoted = {
    key: { id: citada, remoteJid: corpo.number, fromMe: false, participant: texto(original.participante_jid) },
    message: { conversation: typeof original.texto === 'string' ? original.texto : texto(original.texto) }
  };
  return corpo;
}
```

`n8n/adaptadores/montar-envio-whatsapp.js`:

```js
// ===== adaptador: Montar Envio WhatsApp =====
// Fica entre "Conectada?" e "Enviar pela Evolution": nada daqui volta para a planilha.
var selecionadaEnvio = $('Selecionar Saida WhatsApp').first().json || {};
var filaEnvio = $('Ler Fila WhatsApp').all().map(function (i) { return i.json || {}; });
return [{ json: { corpo: corpoEnvioWhatsapp(selecionadaEnvio, filaEnvio) } }];
```

Registrar `'montar-envio-whatsapp': 'Montar Envio WhatsApp'` em `NODES`. No gerador: novo `code('montarEnvioWhatsapp', 'Montar Envio WhatsApp', 'montar-envio-whatsapp')`; `jsonBody` do "Enviar pela Evolution" vira `expr("{{ JSON.stringify($json.corpo) }}")`; ligação `conectada.onTrue(montarEnvioWhatsapp.to(enviarWhatsapp.to(resultadoWhatsapp).to(gravarResultadoWhatsapp)))`. Conferir que "Resultado WhatsApp" lê o id de `$('Selecionar Saida WhatsApp')` (não de `$input`); se ler de `$input`, ajustar para não depender do item do "Montar Envio".

- [ ] **Passo 4:** `cd n8n && npm run build && npm test` → PASS.
- [ ] **Passo 5: commit** — `git add n8n && git commit -m "feat: envio do WhatsApp cita a mensagem original"`

---

### Tarefa 5: Fechar perguntas vencidas no agendamento de 15 min

**Arquivos:**
- Criar: `n8n/adaptadores/fechar-perguntas-vencidas.js`
- Modificar: `n8n/scripts/gerar-code-nodes.js`, `n8n/scripts/gerar-workflow-sdk.js` (bloco `retentarInterpretacao`)
- Teste: `n8n/test/workflow-retentar-interpretacao.test.js` (criar se não existir, no molde de `workflow-whatsapp-entrada.test.js`)

- [ ] **Passo 1: teste que falha**

```js
test('agendamento fecha perguntas vencidas depois de ler as pendentes', () => {
  const w = workflow();
  assert.deepEqual(destinos(w, 'Ler Interpretações Pendentes'), ['Marcar Tentativas', 'Fechar Perguntas Vencidas']);
  assert.deepEqual(destinos(w, 'Fechar Perguntas Vencidas'), ['Gravar Perguntas Fechadas']);
});
```

- [ ] **Passo 2:** `cd n8n && npm test` → FAIL.
- [ ] **Passo 3: implementar**

```js
// ===== adaptador: Fechar Perguntas Vencidas =====
// Pergunta do associador com mais de 24 h fecha; a original volta para SEM_ASSOCIACAO.
var planilhaVencidas = planilhaDoLote($('Ler Interpretações Pendentes').first().json || {}, LEITURAS_RETENTAR_INTERPRETACAO);
var vencidas = fecharPerguntasVencidasWhatsapp(planilhaVencidas.linhas.WHATSAPP_MENSAGENS, new Date().toISOString());
if (!vencidas.operacoes.length) return [];
return requisicoesDeEscrita(vencidas.operacoes, [], planilhaVencidas, PLANILHA_ID).map(function (r) { return { json: r }; });
```

Registrar `'fechar-perguntas-vencidas': 'Fechar Perguntas Vencidas'`. No gerador: `code(...)` + `httpGoogle('gravarPerguntasFechadas', 'Gravar Perguntas Fechadas', 'POST', "expr('{{ $json.url }}')", true, "onError: 'continueRegularOutput',\n    ", '')`, ligado como segundo destino de "Ler Interpretações Pendentes"; posições na linha `y = 260`.

- [ ] **Passo 4:** `cd n8n && npm run build && npm test` → PASS.
- [ ] **Passo 5: commit** — `git add n8n && git commit -m "feat: perguntas do associador vencem em 24 h"`

---

### Tarefa 6: Board e "trocar OS" na API

**Arquivos:**
- Modificar: `n8n/src/producao.js` (`mensagemProducaoBoardBase`, `mensagensSemAssociacaoProducaoBoard`, `processarAssociacaoWhatsapp`, `mensagensDaProducao` se filtrar por associação)
- Teste: `n8n/test/acoes-producao.test.js`, `n8n/test/producao.test.js`

Comportamento:
- Mensagem no board ganha `associacaoMotivo` (só quando `associacao === 'IA'`) e `pergunta: true` quando `tipo === 'PERGUNTA_ASSOCIACAO'`.
- "Aguardando associação" passa a incluir `IA_DUVIDA` (com `perguntado: true`); `NAO_OS` continua fora.
- `associar_whatsapp` aceita mensagem `SEM_ASSOCIACAO` (sem `deal_id`), `IA_DUVIDA` (sem `deal_id`) ou `IA` (com `deal_id` de outra OS da mesma oficina). Para `IA`: se existe sugestão `PENDENTE` da mensagem, acrescenta `{ aba: 'WHATSAPP_SUGESTOES', operacao: 'update', chave: 'id', linha: { id, status: 'IGNORADA', decidido_em: ctx.agora, decidido_por: ctx.usuario } }`; só pede interpretação se a mensagem não tem sugestão nenhuma (regra atual de `mensagemTemSugestaoWhatsapp`). Mesma OS da atual → 409 `'A mensagem já está nesta OS.'`. Histórico: `'<usuario> trocou a OS de uma mensagem do WhatsApp: <os antiga> → <os nova>.'`.

- [ ] **Passo 1: testes que falham** (em `acoes-producao.test.js`)

```js
test('associar aceita mensagem ligada pela IA: troca a OS e ignora a sugestão pendente', () => {
  const { ctx, estado, cab } = contexto();
  ctx.DEALS_PRODUCAO_EDITAVEIS = ['700001', '700003'];
  const dados = linhas();
  dados.producao.push({ deal_id: '700003', os: '90003', oficina_id: 'of-1', oficina_nome: 'OFICINA A', atualizado_em_ploomes: 'v3' });
  dados.whatsappMensagens = [{ id: 'MSG-IA', direcao: 'RECEBIDA', associacao: 'IA', deal_id: '700001', os: '90001', oficina_id: 'of-1', grupo_jid: 'grupo-teste@g.us', texto: 'sai dia 20', tipo_conteudo: 'TEXTO' }];
  dados.whatsappSugestoes = [{ id: 'SUG-IA', mensagem_id: 'MSG-IA', deal_id: '700001', os: '90001', status: 'PENDENTE' }];
  const r = limpo(ctx.processarAcao(estado, cab, { tipo: 'associar_whatsapp', dealId: '700003', mensagemId: 'MSG-IA', versao: 'v3' }, dados, T0, () => 'H'));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const msg = r.operacoes.find((o) => o.aba === 'WHATSAPP_MENSAGENS').linha;
  assert.deepEqual({ deal_id: msg.deal_id, os: msg.os, associacao: msg.associacao }, { deal_id: '700003', os: '90003', associacao: 'MANUAL' });
  assert.equal(r.operacoes.find((o) => o.aba === 'WHATSAPP_SUGESTOES').linha.status, 'IGNORADA');
  assert.match(r.historicos[0].texto, /trocou a OS de uma mensagem do WhatsApp: 90001 → 90003/);
  const mesma = ctx.processarAcao(estado, cab, { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-IA', versao: 'v1' }, dados, T0, () => 'H');
  assert.equal(mesma.status, 409);
});

test('associar aceita IA_DUVIDA e recusa NAO_OS', () => {
  const { ctx, estado, cab } = contexto();
  const dados = linhas();
  dados.whatsappMensagens = [
    { id: 'MSG-D', direcao: 'RECEBIDA', associacao: 'IA_DUVIDA', deal_id: '', oficina_id: 'of-1', grupo_jid: 'grupo-teste@g.us', texto: 'vai atrasar', tipo_conteudo: 'TEXTO' },
    { id: 'MSG-N', direcao: 'RECEBIDA', associacao: 'NAO_OS', deal_id: '', oficina_id: 'of-1', grupo_jid: 'grupo-teste@g.us', texto: 'bom dia', tipo_conteudo: 'TEXTO' }
  ];
  dados.whatsappSugestoes = [];
  assert.equal(ctx.processarAcao(estado, cab, { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-D', versao: 'v1' }, dados, T0, () => 'H').status, 200);
  assert.equal(ctx.processarAcao(estado, cab, { tipo: 'associar_whatsapp', dealId: '700001', mensagemId: 'MSG-N', versao: 'v1' }, dados, T0, () => 'H').status, 409);
});
```

Em `producao.test.js` (ou onde `mensagensSemAssociacaoProducaoBoard` já é testada):

```js
test('board: IA_DUVIDA aparece como perguntado; NAO_OS fica fora; IA leva o motivo', () => {
  const ctx = carregar();
  const msgs = [
    { id: 'A', direcao: 'RECEBIDA', associacao: 'IA_DUVIDA', deal_id: '', oficina_id: 'of-1', quando: '2026-10-22T10:00:00.000Z', texto: 'x' },
    { id: 'B', direcao: 'RECEBIDA', associacao: 'NAO_OS', deal_id: '', oficina_id: 'of-1', quando: '2026-10-22T10:00:00.000Z', texto: 'bom dia' }
  ];
  const lista = limpo(ctx.mensagensSemAssociacaoProducaoBoard(msgs, []));
  assert.deepEqual(lista.map((m) => [m.id, m.perguntado]), [['A', true]]);
  const base = limpo(ctx.mensagemProducaoBoard({ id: 'C', associacao: 'IA', associacao_motivo: 'fala da blusa', direcao: 'RECEBIDA' }));
  assert.equal(base.associacaoMotivo, 'fala da blusa');
  const pergunta = limpo(ctx.mensagemProducaoBoard({ id: 'P', tipo: 'PERGUNTA_ASSOCIACAO', direcao: 'ENVIADA', associacao: 'MANUAL' }));
  assert.equal(pergunta.pergunta, true);
});
```

- [ ] **Passo 2:** `cd n8n && npm test` → FAIL.
- [ ] **Passo 3: implementar**
  - `mensagemProducaoBoardBase`: depois do objeto, `if (semAcento(m.associacao) === 'IA' && texto(m.associacao_motivo)) base.associacaoMotivo = texto(m.associacao_motivo); if (semAcento(m.tipo) === 'PERGUNTA_ASSOCIACAO') base.pergunta = true;` (transformar o `return {...}` em `var base = {...}; ...; return base;`).
  - `mensagensSemAssociacaoProducaoBoard`: filtro vira `var a = semAcento(m.associacao); return m && semAcento(m.direcao) === 'RECEBIDA' && !texto(m.deal_id) && (a === 'SEM_ASSOCIACAO' || a === 'IA_DUVIDA');` e no `map`: `if (semAcento(m.associacao) === 'IA_DUVIDA') base.perguntado = true;`.
  - `processarAssociacaoWhatsapp`: trocar a condição de recusa por

```js
  var assoc = semAcento(mensagem.associacao);
  var troca = assoc === 'IA' && !!texto(mensagem.deal_id);
  var livre = !texto(mensagem.deal_id) && (assoc === 'SEM_ASSOCIACAO' || assoc === 'IA_DUVIDA');
  if (semAcento(mensagem.direcao) !== 'RECEBIDA' || !(troca || livre)) {
    return erroAcao(409, 'Esta mensagem já foi associada ou não pode ser associada.');
  }
  if (troca && texto(mensagem.deal_id) === texto(producao.deal_id)) return erroAcao(409, 'A mensagem já está nesta OS.');
```

    e, ao montar o retorno, quando `troca`: acrescentar a operação de `IGNORADA` para cada sugestão `PENDENTE` com `mensagem_id === mensagem.id`, usar o histórico de troca (com `texto(mensagem.os)` → `texto(producao.os)`) e manter `interpretar` pela regra atual.
- [ ] **Passo 4:** `cd n8n && npm run build && npm test` → PASS.
- [ ] **Passo 5: commit** — `git add n8n && git commit -m "feat: board e troca de OS para mensagens ligadas pela IA"`

---

### Tarefa 7: App e simulador

**Arquivos:**
- Modificar: `web/src/api/tipos.ts`, `web/src/telas/Producao.tsx`, `web/src/regras/otimista.ts`, `web/src/styles/f4.css`, `web/scripts/mock-api.mjs`
- Teste: `web/src/regras/otimista.test.ts`, `web/e2e/f4.spec.ts`

- [ ] **Passo 1: tipos** — em `MensagemProducao`: `associacao: 'CITACAO' | 'OS_NO_TEXTO' | 'ULTIMA_COBRANCA' | 'MANUAL' | 'SEM_ASSOCIACAO' | 'IA' | 'IA_DUVIDA' | 'NAO_OS';` mais `associacaoMotivo?: string; // motivo da IA (associacao IA)` e `pergunta?: boolean; // pergunta do associador`. Em `MensagemWhatsappSemAssociacao`: `perguntado?: boolean; // IA_DUVIDA: a IA perguntou à oficina`.

- [ ] **Passo 2: teste otimista que falha** (`web/src/regras/otimista.test.ts`, dentro de `describe('aplicarOtimista: producao e sugestoes'`)

```ts
  it('trocar OS de mensagem ligada pela IA move a mensagem e ignora a sugestão pendente dela', () => {
    const msg = { id: 'MSG-IA', quando: '2026-10-22T10:00:00.000Z', participanteNome: 'Pessoa da oficina', direcao: 'RECEBIDA' as const,
      texto: 'sai dia 22', associacao: 'IA' as const, statusEnvio: '' as const, tipoConteudo: 'TEXTO' as const };
    const a = { ...prod(), mensagens: [msg], sugestoes: [{ ...prod().sugestoes[0], mensagemId: 'MSG-IA' }] };
    const b = { ...prod(), dealId: '700002', os: '90002', sugestoes: [], mensagens: [] };
    const r = aplicar(quadro({ producao: [a, b] }), { tipo: 'associar_whatsapp', dealId: '700002', mensagemId: 'MSG-IA', versao: 'v1' });
    expect(r.producao?.[0].mensagens).toEqual([]);
    expect(r.producao?.[0].sugestoes[0].status).toBe('IGNORADA');
    expect(r.producao?.[1].mensagens[0]).toMatchObject({ id: 'MSG-IA', associacao: 'MANUAL' });
  });
```

Run: `cd web && npx vitest run src/regras/otimista.test.ts` → FAIL.

- [ ] **Passo 3: implementar o otimista** — em `aplicarOtimista`, `case 'associar_whatsapp'`: se a mensagem não está em `mensagensWhatsappSemAssociacao`, procurar em `producao[].mensagens` com `associacao === 'IA'`; achando, remover da OS de origem (marcando como `IGNORADA` as sugestões `PENDENTE` com `mensagemId` igual) e pôr no topo da OS de destino com `associacao: 'MANUAL'`. Espelha a regra do servidor da Tarefa 6.

```ts
    case 'associar_whatsapp': {
      const mensagem = board.mensagensWhatsappSemAssociacao?.find((m) => m.id === acao.mensagemId);
      if (mensagem) {
        const associado = { ...mensagem, associacao: 'MANUAL' as const };
        const semAssociacao = board.mensagensWhatsappSemAssociacao?.filter((m) => m.id !== acao.mensagemId);
        const atualizado = comProducao(board, acao.dealId, (p) => ({ ...p, mensagens: [associado, ...p.mensagens] }));
        return { ...atualizado, mensagensWhatsappSemAssociacao: semAssociacao };
      }
      const origem = board.producao?.find((p) => p.dealId !== acao.dealId && p.mensagens.some((m) => m.id === acao.mensagemId && m.associacao === 'IA'));
      if (!origem) return board;
      const movida = { ...origem.mensagens.find((m) => m.id === acao.mensagemId)!, associacao: 'MANUAL' as const };
      const semNaOrigem = comProducao(board, origem.dealId, (p) => ({
        ...p,
        mensagens: p.mensagens.filter((m) => m.id !== acao.mensagemId),
        sugestoes: p.sugestoes.map((s) => (s.mensagemId === acao.mensagemId && s.status === 'PENDENTE' ? { ...s, status: 'IGNORADA' as const } : s))
      }));
      return comProducao(semNaOrigem, acao.dealId, (p) => ({ ...p, mensagens: [movida, ...p.mensagens] }));
    }
```

Run: `cd web && npx vitest run` → PASS.

- [ ] **Passo 4: tela** — em `web/src/telas/Producao.tsx`:
  - Na conversa da OS, depois do `<p>` do texto:

```tsx
              {m.associacao === 'IA' && <small className="producao-selo producao-selo--ia" title={m.associacaoMotivo}>ligada pela IA</small>}
              {m.pergunta && <small className="producao-selo producao-selo--ia">pergunta da IA</small>}
              {m.associacao === 'IA' && editavel && <TrocarOs mensagem={m} item={item} producao={producao} editaveis={editaveis} executar={executar} />}
```

  - Componente `TrocarOs` no mesmo arquivo, no molde de `MensagemPendente`: `select` com `opcoesAssociacaoMensagem(producao, item.oficinaId, editaveis).filter((p) => p.dealId !== item.dealId)`, botão "Trocar OS" que chama `executar({ tipo: 'associar_whatsapp', dealId, mensagemId: m.id, versao }, 'Mensagem movida para a OS escolhida.')`. Sem opções: não renderiza.
  - Em `MensagemPendente`, depois do `<p>`: `{mensagem.perguntado && <small className="producao-selo">perguntado à oficina</small>}`.
  - `web/src/styles/f4.css`:

```css
.producao-selo { display: inline-block; margin-top: 4px; padding: 1px 6px; border-radius: 8px; font-size: 11px; background: var(--cinza-claro, #eef0f4); color: var(--texto-suave, #5b6475); }
.producao-selo--ia { background: #e8ecff; color: #3346a8; }
```

  (Usar os tokens de cor que `f4.css` já usa, se existirem com outro nome.)

- [ ] **Passo 5: simulador** — em `web/scripts/mock-api.mjs`:
  - nos dados fictícios, uma mensagem `associacao: 'IA'` com `associacaoMotivo: 'Fala da peça CAMISA TESTE'` numa OS editável, uma pergunta (`direcao: 'ENVIADA'`, `pergunta: true`) e uma pendente com `associacao: 'IA_DUVIDA'`, `perguntado: true`;
  - `associarWhatsapp(corpo, usuario)` aceita mover mensagem `IA` entre OS (mesma regra da Tarefa 6) e `IA_DUVIDA` da lista pendente.

- [ ] **Passo 6: e2e** (`web/e2e/f4.spec.ts`)

```ts
test('mensagem ligada pela IA mostra o selo e pode trocar de OS', async ({ page }) => {
  await entrarNaProducao(page); // helper já usado no arquivo
  await page.getByRole('button', { name: /OS 90002/ }).first().click();
  await expect(page.getByText('ligada pela IA')).toBeVisible();
  await page.getByLabel('Trocar para a OS').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Trocar OS' }).click();
  await expect(page.getByText('Mensagem movida para a OS escolhida.')).toBeVisible();
});

test('pendente perguntada à oficina aparece com a etiqueta', async ({ page }) => {
  await entrarNaProducao(page);
  await page.getByText(/aguardando associação/).click();
  await expect(page.getByText('perguntado à oficina')).toBeVisible();
});
```

  (Usar o helper de login/navegação que `f4.spec.ts` já tem; ajustar o número da OS ao dado do simulador.)

- [ ] **Passo 7:** `cd web && npx vitest run && npm run build && CI=1 npx playwright test` → tudo PASS.
- [ ] **Passo 8: commit** — `git add web && git commit -m "feat: app mostra mensagens ligadas pela IA e permite trocar a OS"`

---

### Tarefa 8: Roteiro, subworkflow Groq e homologação

**Arquivos:**
- Modificar: `n8n/workflows/README.md`, `n8n/scripts/ids-subworkflows.js`, gerados (`npm run build`)

- [ ] **Passo 1: README** — na seção da F4 do roteiro, acrescentar:
  - cabeçalhos novos no fim da `WHATSAPP_MENSAGENS`: `associacao_confianca | associacao_motivo | pergunta_candidatos | pergunta_mensagem_id | pergunta_fechada_em`;
  - subworkflow "PCP MRBL - Associador WhatsApp (Groq)" (id real) e a ordem de publicação: associador → Receber WhatsApp → Enviar WhatsApp → Retentar Interpretação → API homolog;
  - rollback: anotar `versionId` de cada workflow antes do PUT.
- [ ] **Passo 2: criar o subworkflow pelo MCP do n8n** (homologação), no molde do intérprete `pTRkYh6xs7HGM7CM`: nós "Receber Contexto" (executeWorkflowTrigger passthrough) → "Montar Pedido" (Code; mensagem de sistema abaixo; `model: 'openai/gpt-oss-120b'`, `temperature: 0`, `reasoning_effort: 'low'`, `response_format: json_object`, conteúdo do usuário = `JSON.stringify(contexto).slice(0, 12000)`) → "Chamar Groq" (HTTP 4.2, credencial groqApi "WhatsPCPGroq", timeout 60000) → "Devolver Associacao" (Code: `JSON.parse` do conteúdo; devolve `{ associacao: { resultado, os, candidatos, confianca: Number(...), motivo } }`; erro se não for JSON). Sistema:

```
Você liga mensagens de oficinas de costura, enviadas num grupo de WhatsApp da confecção MRBL, à OS certa.
Responda SOMENTE com um objeto JSON com as chaves: resultado, os, candidatos, confianca, motivo.
resultado é um de: OS (sabe qual OS da lista), DUVIDA (fica entre 2 ou 3 OS da lista), NAO_OS (a mensagem não fala de peça nenhuma: saudação, ok, figurinha, assunto geral).
os: o número de uma OS da lista (só em OS). candidatos: lista com 2 ou 3 números de OS da lista (só em DUVIDA).
As oficinas falam o nome da peça, não o número da OS. Use os candidatos (peça, quantidade, prazo, última mensagem do PCP) e a conversa recente do grupo.
Quando houver "pergunta", a mensagem pode ser a resposta da oficina a ela: escolha a OS que a oficina indicou.
Nunca escolha OS fora da lista. motivo: frase curta em português. confianca: número de 0 a 1.
```

  Publicar e anotar o id em `IDS_SUBWORKFLOWS.ASSOCIADOR`; `cd n8n && npm run build && npm test`; commit `chore: id real do associador (homologação)`; push da branch.
- [ ] **Passo 3: planilha** — gravar os 5 cabeçalhos novos no fim da `WHATSAPP_MENSAGENS` (sem mexer nas linhas).
- [ ] **Passo 4: publicar em homologação** pelo "Utilitario - Deploy PCP (manual)" (`fzSTmObQZQP7vr2i`) com o commit fixo: "Receber WhatsApp" (`on1aUkF944tU63UU`, preservando o caminho secreto do webhook), "Enviar WhatsApp" (`otnIf27pfRMjy4Zj`), "Retentar Interpretação" (`jJhDxA8gHMmWe5J2`) e API homolog (`dI2NUYzxfApYM8iA`). Anotar as versões anteriores.
- [ ] **Passo 5: QA no grupo de teste** (FAUSTINO BP, card 607612577), com uma segunda OS de teste na mesma oficina só se o dono criar o card (senão testar dúvida pelo simulador):
  1. mensagem sem citação citando a peça ("o TESTE PCP sai dia 29") → ligada `IA` → sugestão no app;
  2. "bom dia" → `NAO_OS`, nada no app;
  3. com 2 OS na oficina: mensagem ambígua → pergunta no grupo citando a mensagem → resposta "é o TESTE PCP" → as duas ligadas, sugestão da original;
  4. trocar OS pelo app numa mensagem `IA`.
- [ ] **Passo 6:** registrar em `.superpowers/sdd/progress.md` (fora do Git) commits, versões anteriores e resultado do QA.

---

## Autorrevisão (feita)

- Cobertura do spec: fluxo 3 (T3), candidatos 3.1 (T1), entrada/saída 3.2 (T1–T2), pergunta e travas 3.3 (T1–T2, T4), resposta 3.4 (T2–T3), dados 4 (T2, T8), n8n 5 (T3–T5, T8), app 6 (T6–T7), limites 7 (restrições globais, T1), testes 8 (todas).
- A trava "nunca duas perguntas sobre a mesma mensagem" sai da própria decisão: a mensagem que gerou pergunta vira `IA_DUVIDA` e não volta ao associador; e com pergunta aberta no grupo a nova mensagem vai em modo resposta (sem nova pergunta).
- Nomes conferidos entre tarefas: `candidatosAssociacaoWhatsapp`, `contextoAssociadorWhatsapp`, `validarAssociacaoWhatsapp`, `textoPerguntaAssociacao`, `perguntaAbertaWhatsapp`, `decidirAssociacaoWhatsapp`, `fecharPerguntasVencidasWhatsapp`, `corpoEnvioWhatsapp`, `IDS_SUBWORKFLOWS.ASSOCIADOR`.
