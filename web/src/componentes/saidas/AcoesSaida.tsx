import { useEffect, useRef, useState } from 'react';
import type { Acao, Caixa } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import { itensAbertos } from '../../regras/colunas';
import { itensParaPedido, type ColunaSaidaId } from '../../regras/saidas';

interface Props {
  caixa: Caixa;
  coluna: ColunaSaidaId;
  executar: Executar;
  onSelecionarParaPedido: (c: Caixa) => void;
}

// Próximos passos da caixa que saiu com falta. Um só botão principal por etapa.
export function AcoesSaida({ caixa, coluna, executar, onSelecionarParaPedido }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const reabrirRef = useRef<HTMLButtonElement>(null);
  const voltarFoco = useRef(false);

  useEffect(() => {
    if (confirmando) confirmarRef.current?.focus();
    else if (voltarFoco.current) { voltarFoco.current = false; reabrirRef.current?.focus(); }
  }, [confirmando]);

  if (coluna === 'resolvido') return null;
  const paraPedido = itensParaPedido(caixa).length;
  const abertos = itensAbertos(caixa).length;
  const enviada = caixa.tratativa === 'ENVIADO';

  async function agir(acao: Acao) {
    setEnviando(true);
    await executar(acao, mensagemSucesso(acao));
    setEnviando(false);
  }

  return (
    <section className="secao">
      <h3 className="secao__titulo">O que fazer</h3>
      <div className="acoes">
        {paraPedido > 0 && (
          <button type="button" className={coluna === 'sem_tratativa' ? 'botao botao--navy' : 'botao botao--contorno'}
            onClick={() => onSelecionarParaPedido(caixa)}>
            Selecionar para pedido
          </button>
        )}
        {!enviada && (
          <button type="button" className={coluna === 'almoxarifado' ? 'botao botao--signal' : 'botao botao--contorno'}
            disabled={enviando} onClick={() => agir({ tipo: 'enviar_oficina', dealId: caixa.dealId, versao: caixa.versao })}>
            Enviar à oficina
          </button>
        )}
        {enviada && !confirmando && (
          <button ref={reabrirRef} type="button" className="botao botao--navy" disabled={enviando} onClick={() => setConfirmando(true)}>
            Oficina recebeu
          </button>
        )}
      </div>
      {!enviada && <p className="acoes__nota">Marca a caixa como enviada e registra no Ploomes.</p>}
      {enviada && confirmando && (
        <div className="confirmacao" role="group" aria-label="Confirmar recebimento da oficina">
          <p className="confirmacao__texto">
            A oficina recebeu o material? Isso dá baixa total {abertos > 1 ? `nos ${abertos} itens abertos` : 'no item aberto'} desta caixa.
          </p>
          <div className="acoes">
            <button ref={confirmarRef} type="button" className="botao botao--navy" disabled={enviando}
              onClick={async () => {
                await agir({ tipo: 'oficina_recebeu', dealId: caixa.dealId, versao: caixa.versao });
                setConfirmando(false);
              }}>
              Confirmar recebimento
            </button>
            <button type="button" className="botao botao--leve" disabled={enviando}
              onClick={() => { voltarFoco.current = true; setConfirmando(false); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
