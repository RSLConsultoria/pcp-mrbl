import { useCallback, useEffect, useId, useRef } from 'react';
import { useValorDoBoard } from '../../hooks/useValorDoBoard';
import { dataPronta } from '../../regras/acoes';

export type Salvar = (valor: string) => Promise<boolean>;

// Espera o fim da digitação da data antes de salvar; o seletor do navegador salva logo depois.
const ESPERA_DATA_MS = 700;

function useRefAtual<T>(v: T) {
  const r = useRef(v);
  r.current = v;
  return r;
}

// Data (aaaa-mm-dd): salva ao mudar. Data incompleta ou inválida volta ao valor do board.
export function CampoData({ rotulo, doBoard, salvar }: { rotulo: string; doBoard: string; salvar: Salvar }) {
  const id = useId();
  const [valor, setValor, reverter] = useValorDoBoard(doBoard);
  const doBoardRef = useRefAtual(doBoard);
  const salvarRef = useRefAtual(salvar);
  const timer = useRef<number | undefined>(undefined);
  const pendente = useRef<string | null>(null);

  const confirmar = useCallback(async () => {
    window.clearTimeout(timer.current);
    const v = pendente.current;
    pendente.current = null;
    if (v === null || v === doBoardRef.current) return;
    if (!dataPronta(v)) { reverter(); return; }
    if (!(await salvarRef.current(v))) reverter();
  }, [doBoardRef, salvarRef, reverter]);

  // Fechar o painel com uma data recém-escolhida ainda salva.
  useEffect(() => () => { void confirmar(); }, [confirmar]);

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} type="date" value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          pendente.current = e.target.value;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void confirmar(), ESPERA_DATA_MS);
        }}
        onBlur={() => void confirmar()} />
    </div>
  );
}

// Texto livre: salva ao sair do campo, só se mudou.
export function CampoTexto({ rotulo, doBoard, salvar, placeholder }: {
  rotulo: string; doBoard: string; salvar: Salvar; placeholder?: string;
}) {
  const id = useId();
  const [valor, setValor, reverter] = useValorDoBoard(doBoard);
  return (
    <div className="campo campo--largo">
      <label htmlFor={id}>{rotulo}</label>
      <textarea id={id} rows={2} maxLength={500} value={valor} placeholder={placeholder}
        onChange={(e) => setValor(e.target.value)}
        onBlur={async () => {
          const v = valor.trim();
          if (v === doBoard.trim()) return;
          if (!(await salvar(v))) reverter();
        }} />
    </div>
  );
}
