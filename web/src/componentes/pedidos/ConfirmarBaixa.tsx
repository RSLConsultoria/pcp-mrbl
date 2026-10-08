import { useEffect, useRef, useState } from 'react';
import type { Pedido } from '../../api/tipos';
import { textoConfirmarBaixa } from '../../regras/pedidosQuadro';

interface Props {
  pedido: Pedido;
  baixando: boolean;
  onBaixar: () => Promise<void> | void;
}

// Dar baixa nas caixas com confirmação na própria tela, como o Oficina recebeu.
export function ConfirmarBaixa({ pedido, baixando, onBaixar }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const abrirRef = useRef<HTMLButtonElement>(null);
  const voltarFoco = useRef(false);

  useEffect(() => {
    if (confirmando) confirmarRef.current?.focus();
    else if (voltarFoco.current) { voltarFoco.current = false; abrirRef.current?.focus(); }
  }, [confirmando]);

  if (!confirmando) {
    return (
      <button ref={abrirRef} type="button" className="botao botao--signal baixa-pedido__abrir" disabled={baixando}
        onClick={() => setConfirmando(true)}>
        Dar baixa nas caixas
      </button>
    );
  }
  return (
    <div className="confirmacao confirmacao--baixa" role="group" aria-label={`Confirmar baixa do ${pedido.id}`}>
      <p className="confirmacao__texto">{textoConfirmarBaixa(pedido)}</p>
      <div className="acoes">
        <button ref={confirmarRef} type="button" className="botao botao--signal" disabled={baixando}
          onClick={async () => { await onBaixar(); setConfirmando(false); }}>
          Confirmar baixa
        </button>
        <button type="button" className="botao botao--leve" disabled={baixando}
          onClick={() => { voltarFoco.current = true; setConfirmando(false); }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
