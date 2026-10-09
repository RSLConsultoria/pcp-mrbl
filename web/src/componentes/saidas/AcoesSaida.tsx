import { useEffect, useRef, useState } from 'react';
import type { Acao, Caixa, EtapaPedido, Pedido } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { mensagemSucesso } from '../../regras/acoes';
import { itensAbertos } from '../../regras/colunas';
import { itensParaPedido, podeEnviarOficina, textoEnviarSoNaUltima, textoOficinaRecebeu, type ColunaSaidaId } from '../../regras/saidas';

interface Props {
  caixa: Caixa;
  coluna: ColunaSaidaId;
  pedidos: Pedido[];
  etapas: EtapaPedido[];
  executar: Executar;
  onSelecionarParaPedido: (c: Caixa) => void;
}

// Próximos passos da caixa que saiu com falta. Um só botão principal por etapa.
// Enviar à oficina só aparece na coluna Resolvido: tudo baixado ou todo o material na última etapa.
export function AcoesSaida({ caixa, coluna, pedidos, etapas, executar, onSelecionarParaPedido }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const reabrirRef = useRef<HTMLButtonElement>(null);
  const voltarFoco = useRef(false);

  useEffect(() => {
    if (confirmando) confirmarRef.current?.focus();
    else if (voltarFoco.current) { voltarFoco.current = false; reabrirRef.current?.focus(); }
  }, [confirmando]);

  if (coluna === 'concluido') return null;
  const paraPedido = itensParaPedido(caixa).length;
  // os que o servidor baixa no "Oficina recebeu": abertos e com a falta informada
  const abertos = itensAbertos(caixa).filter((i) => i.falta !== null).length;
  const enviada = caixa.tratativa === 'ENVIADO';
  const podeEnviar = !enviada && podeEnviarOficina(caixa, pedidos, etapas);

  // O board já mostra a caixa na coluna nova; a gravação segue na fila.
  const agir = (acao: Acao) => void executar(acao, mensagemSucesso(acao));

  return (
    <section className="secao">
      <h3 className="secao__titulo">O que fazer</h3>
      <div className="acoes">
        {paraPedido > 0 && (
          <button type="button" className={coluna === 'sem_pedido' ? 'botao botao--navy' : 'botao botao--contorno'}
            onClick={() => onSelecionarParaPedido(caixa)}>
            Selecionar para pedido
          </button>
        )}
        {podeEnviar && (
          <button type="button" className="botao botao--signal"
            onClick={() => agir({ tipo: 'enviar_oficina', dealId: caixa.dealId, versao: caixa.versao })}>
            Enviar à oficina
          </button>
        )}
        {enviada && !confirmando && (
          <button ref={reabrirRef} type="button" className="botao botao--navy" onClick={() => setConfirmando(true)}>
            Oficina recebeu
          </button>
        )}
      </div>
      {podeEnviar && <p className="acoes__nota">Marca a caixa como enviada e registra no Ploomes.</p>}
      {!enviada && !podeEnviar && <p className="acoes__nota">{textoEnviarSoNaUltima(etapas)}</p>}
      {enviada && confirmando && (
        <div className="confirmacao" role="group" aria-label="Confirmar recebimento da oficina">
          <p className="confirmacao__texto">{textoOficinaRecebeu(abertos)}</p>
          <div className="acoes">
            <button ref={confirmarRef} type="button" className="botao botao--navy"
              onClick={() => {
                agir({ tipo: 'oficina_recebeu', dealId: caixa.dealId, versao: caixa.versao });
                setConfirmando(false);
              }}>
              Confirmar recebimento
            </button>
            <button type="button" className="botao botao--leve"
              onClick={() => { voltarFoco.current = true; setConfirmando(false); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
