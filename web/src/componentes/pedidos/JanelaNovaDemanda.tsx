import { useId, useState } from 'react';
import type { Board } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import {
  acaoNovaDemanda, caixaDaDemanda, linhaVazia, TIPOS_CAIXA_DEMANDA, validarDemanda, type LinhaDemanda, type TipoCaixaDemanda
} from '../../regras/demanda';
import { Janela } from '../Janela';

interface Props {
  board: Board;
  executar: Executar;
  onFechar: () => void;
}

// Nova demanda pós-saída: falta descoberta depois que a caixa saiu. Os itens entram em Faltas
// sem pedido com o selo pós-saída e seguem o fluxo normal. A janela fecha na hora; se o servidor
// recusar, o aviso mostra a mensagem dele.
export function JanelaNovaDemanda({ board, executar, onFechar }: Props) {
  const id = useId();
  const [os, setOs] = useState('');
  const [tipo, setTipo] = useState<TipoCaixaDemanda | ''>('');
  const [linhas, setLinhas] = useState<LinhaDemanda[]>(() => [linhaVazia()]);
  const [tentou, setTentou] = useState(false);
  const v = validarDemanda(linhas);
  const achada = os.trim() && tipo ? caixaDaDemanda(board, os, tipo) : null;
  const erroCaixa = achada && 'erro' in achada ? achada.erro : null;
  const temErroItem = Object.keys(v.erros).length > 0;
  const falta = !os.trim() ? 'Informe a OS.'
    : !tipo ? 'Escolha o tipo de caixa.'
      : v.itens.length === 0 && !temErroItem ? 'Informe ao menos um item.' : null;
  const erroGeral = falta ?? erroCaixa;
  const mudar = (k: number, m: Partial<LinhaDemanda>) => setLinhas((ls) => ls.map((l, i) => (i === k ? { ...l, ...m } : l)));

  function criar() {
    setTentou(true);
    if (erroGeral || temErroItem || !tipo) return;
    const acao = acaoNovaDemanda(os, tipo, v.itens);
    void executar(acao, mensagemSucesso(acao));
    onFechar();
  }

  return (
    <Janela titulo="Nova demanda" sobretitulo="Falta depois da saída" larga onFechar={onFechar}
      rodape={<>
        {tentou && erroGeral
          ? <span className="janela__nota janela__nota--erro">{erroGeral}</span>
          : <span className="janela__nota">Os itens entram em Faltas sem pedido com o selo pós-saída e ficam registrados no Ploomes da OS.</span>}
        <button type="button" className="botao botao--leve" onClick={onFechar}>Cancelar</button>
        <button type="button" className="botao botao--signal" onClick={criar}>Criar demanda</button>
      </>}>
      <div className="campos">
        <div className="campo">
          <label htmlFor={`${id}-os`}>OS<span className="obrigatorio" aria-hidden="true"> *</span></label>
          <input id={`${id}-os`} type="text" inputMode="numeric" autoComplete="off" maxLength={20} value={os} onChange={(e) => setOs(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-tipo`}>Tipo de caixa<span className="obrigatorio" aria-hidden="true"> *</span></label>
          <select id={`${id}-tipo`} value={tipo} required onChange={(e) => setTipo(e.target.value as TipoCaixaDemanda)}>
            {tipo === '' && <option value="" disabled>Selecionar</option>}
            {TIPOS_CAIXA_DEMANDA.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
      </div>
      {achada && 'caixa' in achada && <p className="janela__ajuda">{[achada.caixa.peca, achada.caixa.cliente].filter(Boolean).join(' · ')}</p>}
      {erroCaixa && <p className="campo__erro" role="alert">{erroCaixa}</p>}
      <ul className="demanda__itens">
        {linhas.map((l, k) => {
          const base = `${id}-${k}`;
          const n = k + 1;
          const erro = tentou ? v.erros[k] : undefined;
          return (
            <li key={k} className="demanda__item">
              <div className="campo">
                <label htmlFor={`${base}-nome`}>Item {n}<span className="obrigatorio" aria-hidden="true"> *</span></label>
                <input id={`${base}-nome`} type="text" maxLength={100} value={l.nome} aria-invalid={erro ? true : undefined}
                  onChange={(e) => mudar(k, { nome: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor={`${base}-cor`}>Cor do item {n} (opcional)</label>
                <input id={`${base}-cor`} type="text" maxLength={40} value={l.cor} onChange={(e) => mudar(k, { cor: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor={`${base}-qtd`}>Quantidade do item {n}<span className="obrigatorio" aria-hidden="true"> *</span></label>
                <input id={`${base}-qtd`} type="text" inputMode="decimal" autoComplete="off" value={l.qtd}
                  onChange={(e) => mudar(k, { qtd: e.target.value })} />
              </div>
              <div className="campo">
                <label htmlFor={`${base}-un`}>Unidade do item {n}<span className="obrigatorio" aria-hidden="true"> *</span></label>
                <input id={`${base}-un`} type="text" maxLength={10} placeholder="UN, MT, cones" value={l.un}
                  onChange={(e) => mudar(k, { un: e.target.value })} />
              </div>
              {linhas.length > 1 && (
                <button type="button" className="botao botao--leve" aria-label={`Remover item ${n}`}
                  onClick={() => setLinhas((ls) => ls.filter((_, i) => i !== k))}>Remover</button>
              )}
              {erro && <p className="campo__erro demanda__erro">{erro}</p>}
            </li>
          );
        })}
      </ul>
      <button type="button" className="botao botao--contorno" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>+ Adicionar item</button>
    </Janela>
  );
}
