import { useId } from 'react';
import type { DadosPedido, EtapaPedido, LocalPedido, OrigemPedido } from '../../api/tipos';

export type FormPedido = DadosPedido & { etapa?: string };

interface Props {
  valor: FormPedido;
  onMudar: (v: FormPedido) => void;
  usuarios: string[];
  etapas?: EtapaPedido[]; // presente só no painel do pedido
}

// Dados do pedido: etapa (no painel), solicitar a, quem, local, previsão e responsável.
export function CamposPedido({ valor, onMudar, usuarios, etapas }: Props) {
  const id = useId();
  const mudar = (parcial: Partial<FormPedido>) => onMudar({ ...valor, ...parcial });
  const nomeQuem = valor.origem === 'CLIENTE' ? 'Cliente' : 'Fornecedor';
  const opcoes = !valor.responsavel || usuarios.includes(valor.responsavel) ? usuarios : [valor.responsavel, ...usuarios];
  return (
    <div className="campos">
      {etapas && (
        <div className="campo">
          <label htmlFor={`${id}-etapa`}>Etapa</label>
          <select id={`${id}-etapa`} value={valor.etapa} onChange={(e) => mudar({ etapa: e.target.value })}>
            {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
      )}
      <div className="campo">
        <label htmlFor={`${id}-origem`}>Solicitar a</label>
        <select id={`${id}-origem`} value={valor.origem} onChange={(e) => mudar({ origem: e.target.value as OrigemPedido })}>
          <option value="FORNECEDOR">Fornecedor</option>
          <option value="CLIENTE">Cliente</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-quem`}>{nomeQuem}</label>
        <input id={`${id}-quem`} type="text" maxLength={100} value={valor.quem} placeholder="Opcional · vale para todos os itens"
          onChange={(e) => mudar({ quem: e.target.value })} />
      </div>
      <div className="campo">
        <label htmlFor={`${id}-local`}>Local de entrega</label>
        <select id={`${id}-local`} value={valor.local} onChange={(e) => mudar({ local: e.target.value as LocalPedido })}>
          <option value="BRAGANCA">Bragança</option>
          <option value="SAO_PAULO">São Paulo</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${id}-prev`}>Previsão de entrega</label>
        <input id={`${id}-prev`} type="date" value={valor.previsao} onChange={(e) => mudar({ previsao: e.target.value })} />
      </div>
      <div className="campo">
        <label htmlFor={`${id}-resp`}>Responsável</label>
        <select id={`${id}-resp`} value={valor.responsavel} onChange={(e) => mudar({ responsavel: e.target.value })}>
          <option value="">Sem responsável</option>
          {opcoes.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
    </div>
  );
}
