import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaveis(el: HTMLElement | null): HTMLElement[] {
  return el ? [...el.querySelectorAll<HTMLElement>(FOCAVEIS)] : [];
}

interface Props {
  titulo: string;
  sobretitulo?: string;
  larga?: boolean;
  onFechar: () => void;
  voltarFoco?: () => HTMLElement | null; // destino do foco ao fechar, no lugar de onde estava
  rodape: ReactNode;
  children: ReactNode;
}

// Janela modal: foca o primeiro campo, prende o Tab dentro, Esc fecha e o foco volta
// para onde estava.
export function Janela({ titulo, sobretitulo, larga, onFechar, voltarFoco, rodape, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const voltarFocoRef = useRef(voltarFoco);
  voltarFocoRef.current = voltarFoco;
  const idTitulo = useId();

  useEffect(() => {
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const campo = ref.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (campo ?? focaveis(ref.current)[0])?.focus();
    return () => (voltarFocoRef.current?.() ?? antes)?.focus();
  }, []);

  function aoTecla(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation(); // não fecha o painel que está atrás
      onFechar();
      return;
    }
    if (e.key !== 'Tab') return;
    const lista = focaveis(ref.current);
    if (lista.length === 0) return;
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  }

  return (
    <div className="janela-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        className={larga ? 'janela janela--larga' : 'janela'} onKeyDown={aoTecla}>
        <header className="janela__cabecalho">
          <div>
            {sobretitulo && <span className="janela__sobretitulo">{sobretitulo}</span>}
            <h2 id={idTitulo} className="janela__titulo">{titulo}</h2>
          </div>
          <button type="button" className="painel__fechar" aria-label="Fechar" title="Fechar" onClick={onFechar}>×</button>
        </header>
        <div className="janela__corpo">{children}</div>
        <footer className="janela__rodape">{rodape}</footer>
      </div>
    </div>
  );
}
