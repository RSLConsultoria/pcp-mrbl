import { useEffect, useRef } from 'react';

interface Props {
  rotulo: string; // nome acessível do grupo (ex.: "Confirmar Resolvido do PED-0044")
  texto: string; // "Mover para Resolvido dá baixa de 2 itens em 2 OS. A baixa não pode ser desfeita."
  ocupado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

// Confirmação na própria tela (sem confirm()) antes de mover um pedido para a última etapa,
// que dá a baixa nas caixas. Usada no quadro (soltar o card), no painel e no Dividir pedido.
export function ConfirmarResolvido({ rotulo, texto, ocupado, onConfirmar, onCancelar }: Props) {
  const confirmarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmarRef.current?.focus(); }, []);
  return (
    <div className="confirmacao confirmacao--resolvido" role="group" aria-label={rotulo}>
      <p className="confirmacao__texto">{texto}</p>
      <div className="acoes">
        <button ref={confirmarRef} type="button" className="botao botao--signal" disabled={ocupado} onClick={onConfirmar}>
          Confirmar
        </button>
        <button type="button" className="botao botao--leve" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
