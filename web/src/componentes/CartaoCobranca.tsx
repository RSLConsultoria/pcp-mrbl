import { useState } from 'react';
import type { Board } from '../api/tipos';
import type { Executar } from '../hooks/useAcao';
import {
  acoesDoCartao, alternarLinha, cancelarCartao, confirmarCartao, editarTextoLinha, erroCartao, linhasEnviaveis, MAX_TEXTO_COBRANCA,
  textoEnfileiradas, type CartaoCobranca as Cartao
} from '../regras/assistente';
import { LinkPeca } from './LinkPeca';

const ALVO: Record<Cartao['alvo'], string> = { atrasadas: 'OS atrasadas ou vencendo', todas: 'Todas as OS na Costura', oficinas: 'OS das oficinas pedidas' };

// Cartão de cobrança do Assistente (F5d). Nada sai daqui sem o clique em "Confirmar e enviar":
// cada linha marcada vira uma enviar_whatsapp (mesma ação, chave e fila do Controle de produção).
// Depois de confirmado ou cancelado, fica só leitura.
export function CartaoCobranca({ cartao, board, executar, onMudar }: {
  cartao: Cartao; board: Board; executar: Executar; onMudar: (c: Cartao) => void;
}) {
  const [erro, setErro] = useState('');
  const aberto = cartao.estado === 'aberto';
  const n = linhasEnviaveis(cartao).length;
  const confirmar = () => {
    const e = erroCartao(cartao);
    if (e) return setErro(e);
    const acoes = acoesDoCartao(cartao, board);
    if (!acoes.length) return setErro('Nenhuma OS pode ser cobrada agora. Atualize a página e tente de novo.');
    setErro('');
    for (const a of acoes) void executar(a, 'Cobrança colocada na fila do WhatsApp');
    onMudar(confirmarCartao(cartao, acoes.length));
  };
  return (
    <section className={`cobranca-cartao cobranca-cartao--${cartao.estado}`} aria-label="Cartão de cobrança">
      <header className="cobranca-cartao__cabecalho">
        <strong>Cobrança de prazo</strong>
        <span>{ALVO[cartao.alvo]}{cartao.total > cartao.linhas.length ? ` · mostrando ${cartao.linhas.length} de ${cartao.total}` : ''}</span>
      </header>
      <ul className="cobranca-cartao__linhas">
        {cartao.linhas.map((l) => (
          <li key={l.dealId} className={l.travada ? 'cobranca-cartao__linha cobranca-cartao__linha--travada' : 'cobranca-cartao__linha'}>
            <div className="cobranca-cartao__marca">
              <input type="checkbox" checked={l.marcada} disabled={!aberto || l.travada} aria-label={`Cobrar a OS ${l.os}`}
                onChange={() => onMudar(alternarLinha(cartao, l.dealId))} />
              <span><LinkPeca os={l.os} className="cobranca-cartao__os" rotulo={`OS ${l.os}`} /> · {l.peca} · {l.oficina}</span>
            </div>
            <small className="cobranca-cartao__prazo">Prazo {l.prazo} · {l.situacao}</small>
            {l.travada
              ? <small className="cobranca-cartao__motivo">{l.motivo}</small>
              : <textarea rows={3} maxLength={MAX_TEXTO_COBRANCA} value={l.texto} readOnly={!aberto} disabled={!l.marcada && aberto}
                  aria-label={`Mensagem da OS ${l.os}`} onChange={(e) => onMudar(editarTextoLinha(cartao, l.dealId, e.target.value))} />}
          </li>
        ))}
      </ul>
      {aberto ? <footer className="cobranca-cartao__rodape">
        {erro && <p className="campo__erro" role="alert">{erro}</p>}
        <button type="button" className="botao botao--signal" disabled={n === 0} onClick={confirmar}>Confirmar e enviar ({n})</button>
        <button type="button" className="botao botao--contorno" onClick={() => onMudar(cancelarCartao(cartao))}>Cancelar</button>
      </footer>
        : <p className="cobranca-cartao__fim" role="status">{cartao.estado === 'confirmado' ? textoEnfileiradas(cartao.enfileiradas) : 'Cobrança cancelada. Nada foi enviado.'}</p>}
    </section>
  );
}
