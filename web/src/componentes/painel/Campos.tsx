import { useCallback, useEffect, useId, useRef } from 'react';
import { useValorDoBoard } from '../../hooks/useValorDoBoard';
import { passoDaData } from '../../regras/acoes';

export type Salvar = (valor: string) => Promise<boolean>;

// Espera o fim da digitação da data antes de salvar; o seletor do navegador salva logo depois.
const ESPERA_DATA_MS = 700;

function useRefAtual<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

// Data (aaaa-mm-dd): salva ao mudar. Data pela metade ou com ano incompleto espera a
// digitação; ao sair do campo assim, volta ao valor do board sem gravar.
export function CampoData({ rotulo, doBoard, salvar }: { rotulo: string; doBoard: string; salvar: Salvar }) {
  const id = useId();
  const [valor, setValor, reverter, setFocado] = useValorDoBoard(doBoard);
  const doBoardRef = useRefAtual(doBoard);
  const salvarRef = useRefAtual(salvar);
  const timer = useRef<number | undefined>(undefined);
  const pendente = useRef<string | null>(null);

  const confirmar = useCallback(async (aoSair: boolean) => {
    window.clearTimeout(timer.current);
    const v = pendente.current;
    if (v === null) return;
    if (v === doBoardRef.current) { pendente.current = null; return; }
    const passo = passoDaData(v, false, aoSair);
    if (passo === 'esperar') return; // ano ainda incompleto: segue pendente
    pendente.current = null;
    if (passo === 'reverter') { reverter(); return; }
    if (!(await salvarRef.current(v))) reverter();
  }, [doBoardRef, salvarRef, reverter]);

  // Fechar o painel com uma data recém-escolhida ainda salva.
  useEffect(() => () => { void confirmar(true); }, [confirmar]);

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type="date" value={valor}
        onFocus={() => setFocado(true)}
        onChange={(e) => {
          const el = e.target;
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
            el.value = doBoardRef.current; // limpa o que ficou pela metade
            reverter();
            return;
          }
          void confirmar(true);
        }} />
    </div>
  );
}

// Texto livre: salva ao sair do campo, só se mudou. Fechar o painel (Esc ou ×) com
// texto digitado também salva.
export function CampoTexto({ rotulo, doBoard, salvar, placeholder }: {
  rotulo: string; doBoard: string; salvar: Salvar; placeholder?: string;
}) {
  const id = useId();
  const [valor, setValor, reverter, setFocado] = useValorDoBoard(doBoard);
  const valorRef = useRefAtual(valor);
  const doBoardRef = useRefAtual(doBoard);
  const salvarRef = useRefAtual(salvar);
  const enviado = useRef<string | null>(null); // evita gravar duas vezes (sair do campo e fechar)

  const confirmar = useCallback(async () => {
    const v = valorRef.current.trim();
    if (v === doBoardRef.current.trim() || v === enviado.current) return;
    enviado.current = v;
    if (!(await salvarRef.current(v))) {
      enviado.current = null;
      reverter();
    }
  }, [valorRef, doBoardRef, salvarRef, reverter]);

  useEffect(() => () => { void confirmar(); }, [confirmar]);

  return (
    <div className="campo campo--largo">
      <label htmlFor={id}>{rotulo}</label>
      <textarea id={id} rows={2} maxLength={500} value={valor} placeholder={placeholder}
        onFocus={() => { setFocado(true); enviado.current = null; }}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => { setFocado(false); void confirmar(); }} />
    </div>
  );
}
