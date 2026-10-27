import type { ReactNode } from 'react';
import type { MensagemProducao } from '../api/tipos';
import { dataHora } from '../regras/datas';

interface Props {
  mensagens: MensagemProducao[];
  // Controles de cada mensagem no painel do Controle de produção; sem eles a conversa é só
  // leitura (Visão da peça). trocarOs fica logo depois dos selos da IA e reenviar no fim, como
  // sempre foi no painel.
  trocarOs?: (m: MensagemProducao) => ReactNode;
  reenviar?: (m: MensagemProducao) => ReactNode;
}

// Conversa da OS no WhatsApp: painel do Controle de produção e Visão da peça.
export function ConversaWhatsapp({ mensagens, trocarOs, reenviar }: Props) {
  if (mensagens.length === 0) return <p className="producao-vazio">Nenhuma mensagem associada.</p>;
  return (
    <ol className="producao-conversa">{mensagens.map((m) => <li key={m.id} className={`producao-mensagem producao-mensagem--${m.direcao.toLowerCase()}`}>
      <span>{m.direcao === 'ENVIADA' ? 'PCP' : m.participanteNome || 'Oficina'} · {dataHora(m.quando)}</span>
      <p>{m.tipoConteudo === 'NAO_TEXTUAL' ? 'Conteúdo não textual' : m.texto}</p>
      {m.associacao === 'SEM_ASSOCIACAO' && <small>Mensagem ainda sem associação</small>}
      {m.associacao === 'IA' && <small className="producao-selo producao-selo--ia" title={m.associacaoMotivo}>ligada pela IA</small>}
      {m.pergunta && <small className="producao-selo producao-selo--ia">pergunta da IA</small>}
      {trocarOs?.(m)}
      {m.statusEnvio === 'PENDENTE' && (m.envioTentativas ? <small>Aguardando nova tentativa ({m.envioTentativas} de 5)</small> : <small>Na fila de envio</small>)}
      {m.interpretacao === 'ERRO' && <small>Não foi possível interpretar esta mensagem.</small>}
      {m.statusEnvio === 'ERRO' && <small>Falha no envio.</small>}
      {reenviar?.(m)}
    </li>)}</ol>
  );
}
