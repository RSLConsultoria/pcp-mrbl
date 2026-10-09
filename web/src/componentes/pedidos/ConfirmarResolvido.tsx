import { useEffect, useRef, type KeyboardEvent } from 'react';

interface Props {
  rotulo: string; // nome acessível do grupo (ex.: "Confirmar Resolvido do PED-0044")
  texto: string; // "Mover para Resolvido dá baixa de 2 itens em 2 OS. A baixa não pode ser desfeita."
  ocupado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

// Confirmação na própria tela (sem confirm()) antes de mover um pedido para a última etapa,
// que dá a baixa nas caixas. Usada no quadro (soltar o card), no painel e no Dividir pedido.
// A baixa não volta: o foco começa em Cancelar (um Enter distraído não confirma) e Esc cancela.
export function ConfirmarResolvido({ rotulo, texto, ocupado, onConfirmar, onCancelar }: Props) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelarRef.current?.focus(); }, []);
  function aoTecla(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape' || ocupado) return;
    e.stopPropagation(); // não fecha o painel que está atrás
    onCancelar();
  }
  return (
    <div className="confirmacao confirmacao--resolvido" role="group" aria-label={rotulo} onKeyDown={aoTecla}>
      <p className="confirmacao__texto">{texto}</p>
      <div className="acoes">
        <button type="button" className="botao botao--signal" disabled={ocupado} onClick={onConfirmar}>
          Confirmar
        </button>
        <button ref={cancelarRef} type="button" className="botao botao--leve" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
