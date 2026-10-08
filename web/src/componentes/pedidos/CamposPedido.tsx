import { useId } from 'react';
import type { DadosPedido, EtapaPedido, LocalPedido, OrigemPedido } from '../../api/tipos';
import { NOME_LOCAL, opcoesComAtual, opcoesDeQuem, quemAoTrocarOrigem } from '../../regras/pedidos';

export type FormPedido = DadosPedido & { etapa?: string };

interface Props {
  valor: FormPedido;
  onMudar: (v: FormPedido) => void;
  fornecedores: string[]; // aba FORNECEDORES
  clientes: string[]; // clientes das OSs do pedido
  responsaveis: string[]; // aba RESPONSAVEIS
  etapas?: EtapaPedido[]; // presente só no painel do pedido
}

// Dados do pedido: etapa (no painel), solicitar a, fornecedor/cliente, local, previsão e
// responsável. Fornecedor/cliente e responsável são obrigatórios: com o valor vazio, o
// select mostra "Selecione…".
export function CamposPedido({ valor, onMudar, fornecedores, clientes, responsaveis, etapas }: Props) {
  const id = useId();
  const mudar = (parcial: Partial<FormPedido>) => onMudar({ ...valor, ...parcial });
  const nomeQuem = valor.origem === 'CLIENTE' ? 'Cliente' : 'Fornecedor';
  const opcoesQuem = opcoesComAtual(opcoesDeQuem(valor.origem, fornecedores, clientes), valor.quem);
  const opcoesResp = opcoesComAtual(responsaveis, valor.responsavel);
  return (
    <div className="campos">
      {etapas && (
        <div className="campo">
          <label htmlFor={`${id}-etapa`}>Etapa</label>
          <select id={`${id}-etapa`} value={valor.etapa} onChange={(e) => mudar({ etapa: e.target.value })}>
            {/* etapa que saiu do quadro: aparece como está, para que escolher qualquer etapa conte como mudança */}
            {valor.etapa && !etapas.some((e) => e.id === valor.etapa) && <option value={valor.etapa} disabled>Outra etapa</option>}
            {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      )}
      <div className="campo">
        <label htmlFor={`${id}-origem`}>Solicitar a</label>
        <select id={`${id}-origem`} value={valor.origem} onChange={(e) => {
          const origem = e.target.value as OrigemPedido;
          mudar({ origem, quem: quemAoTrocarOrigem(valor.quem, opcoesDeQuem(origem, fornecedores, clientes)) });
        }}>
          <option value="FORNECEDOR">Fornecedor</option>
          <option value="CLIENTE">Cliente</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-quem`}>{nomeQuem}</label>
        <select id={`${id}-quem`} value={valor.quem} required
          onChange={(e) => mudar({ quem: e.target.value })}>
          {valor.quem === '' && <option value="" disabled>Selecione…</option>}
          {opcoesQuem.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-local`}>Local de entrega</label>
        <select id={`${id}-local`} value={valor.local} onChange={(e) => mudar({ local: e.target.value as LocalPedido })}>
          {(Object.keys(NOME_LOCAL) as LocalPedido[]).map((l) => <option key={l} value={l}>{NOME_LOCAL[l]}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-prev`}>Previsão de entrega</label>
        <input id={`${id}-prev`} type="date" value={valor.previsao} onChange={(e) => mudar({ previsao: e.target.value })} />
      </div>
      <div className="campo">
        <label htmlFor={`${id}-resp`}>Responsável</label>
        <select id={`${id}-resp`} value={valor.responsavel} required
          onChange={(e) => mudar({ responsavel: e.target.value })}>
          {valor.responsavel === '' && <option value="" disabled>Selecione…</option>}
          {opcoesResp.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  );
}
