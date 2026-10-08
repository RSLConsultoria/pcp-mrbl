import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { useValorDoBoard } from '../../hooks/useValorDoBoard';
import { passoDaData } from '../../regras/acoes';

// Salva o valor com a versão que a tela tinha quando a edição começou: se outra pessoa
// mudou o mesmo alvo nesse meio-tempo, o servidor responde 409 em vez de sobrescrever.
export type Salvar = (valor: string, versao: string) => Promise<boolean>;

interface PropsCampo { rotulo: string; doBoard: string; versao: string; salvar: Salvar }

// Espera o fim da digitação da data antes de salvar; o seletor do navegador salva logo depois.
const ESPERA_DATA_MS = 700;

function useRefAtual<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

// Versão do alvo no início da edição local; usada (e esquecida) ao salvar ou desistir.
function useVersaoDaEdicao(versao: string) {
  const atual = useRefAtual(versao);
  const daEdicao = useRef<string | null>(null);
  const marcar = useCallback(() => { daEdicao.current ??= atual.current; }, [atual]);
  const tirar = useCallback(() => {
    const v = daEdicao.current ?? atual.current;
    daEdicao.current = null;
    return v;
  }, [atual]);
  return useMemo(() => ({ marcar, tirar }), [marcar, tirar]); // estável: o salvar ao fechar depende dele
}

// Data (aaaa-mm-dd): salva ao mudar. Data pela metade ou com ano incompleto espera a
// digitação; ao sair do campo assim, volta ao valor do board sem gravar.
export function CampoData({ rotulo, doBoard, versao, salvar }: PropsCampo) {
  const id = useId();
  const [valor, setValor, reverter, setFocado] = useValorDoBoard(doBoard);
  const doBoardRef = useRefAtual(doBoard);
  const salvarRef = useRefAtual(salvar);
  const edicao = useVersaoDaEdicao(versao);
  const timer = useRef<number | undefined>(undefined);
  const pendente = useRef<string | null>(null);

  const confirmar = useCallback(async (aoSair: boolean) => {
    window.clearTimeout(timer.current);
    const v = pendente.current;
    if (v === null) return;
    if (v === doBoardRef.current) { pendente.current = null; edicao.tirar(); return; }
    const passo = passoDaData(v, false, aoSair);
    if (passo === 'esperar') return; // ano ainda incompleto: segue pendente
    pendente.current = null;
    const ver = edicao.tirar();
    if (passo === 'reverter') { reverter(); return; }
    if (!(await salvarRef.current(v, ver))) reverter();
  }, [doBoardRef, salvarRef, reverter, edicao]);

  // Fechar o painel com uma data recém-escolhida ainda salva.
  useEffect(() => () => { void confirmar(true); }, [confirmar]);

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type="date" value={valor}
        onFocus={() => setFocado(true)}
        onChange={(e) => {
          const el = e.target;
          edicao.marcar();
          setValor(el.value);
          window.clearTimeout(timer.current);
          // Data pela metade: o navegador devolve '' com badInput. Não é remoção; espera.
          if (el.validity.badInput) { pendente.current = null; return; }
          pendente.current = el.value;
          timer.current = window.setTimeout(() => void confirmar(false), ESPERA_DATA_MS);
        }}
        onBlur={(e) => {
          setFocado(false);
          const el = e.currentTarget;
          if (el.validity.badInput) {
            window.clearTimeout(timer.current);
            pendente.current = null;
            edicao.tirar();
            el.value = doBoardRef.current; // limpa o que ficou pela metade
            reverter();
            return;
          }
          // Apagar segmento a segmento: o 1º Backspace dá badInput e os seguintes não
          // disparam onChange (o valor segue ''). Ao sair, vale o que o campo mostra.
          if (pendente.current === null && el.value !== doBoardRef.current) pendente.current = el.value;
          void confirmar(true);
        }} />
    </div>
  );
}

// Texto livre: salva ao sair do campo, só se mudou. Fechar o painel (Esc ou ×) com
// texto digitado também salva.
export function CampoTexto({ rotulo, doBoard, versao, salvar, placeholder }: PropsCampo & { placeholder?: string }) {
  const id = useId();
  const [valor, setValor, reverter, setFocado] = useValorDoBoard(doBoard);
  const valorRef = useRefAtual(valor);
  const doBoardRef = useRefAtual(doBoard);
  const salvarRef = useRefAtual(salvar);
  const edicao = useVersaoDaEdicao(versao);
  const enviado = useRef<string | null>(null); // evita gravar duas vezes (sair do campo e fechar)

  // O board trouxe valor novo: o que foi enviado já chegou (ou foi substituído).
  useEffect(() => { enviado.current = null; }, [doBoard]);

  const confirmar = useCallback(async () => {
    const v = valorRef.current.trim();
    if (v === enviado.current) return;
    if (v === doBoardRef.current.trim()) { edicao.tirar(); return; }
    enviado.current = v;
    if (!(await salvarRef.current(v, edicao.tirar()))) {
      enviado.current = null;
      reverter();
    }
  }, [valorRef, doBoardRef, salvarRef, reverter, edicao]);

  useEffect(() => () => { void confirmar(); }, [confirmar]);

  return (
    <div className="campo campo--largo">
      <label htmlFor={id}>{rotulo}</label>
      <textarea id={id} rows={2} maxLength={500} value={valor} placeholder={placeholder}
        onFocus={() => setFocado(true)}
        onChange={(e) => { edicao.marcar(); setValor(e.target.value); }}
        onBlur={() => { setFocado(false); void confirmar(); }} />
    </div>
  );
}
