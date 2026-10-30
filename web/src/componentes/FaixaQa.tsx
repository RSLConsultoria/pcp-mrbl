import { textoFaixaQa } from '../regras/qa';

// Fixa no topo enquanto o board vier da API homolog (ambiente de QA).
export function FaixaQa({ copiadoEm }: { copiadoEm: string }) {
  return <div className="faixa-qa" role="status">{textoFaixaQa(copiadoEm)}</div>;
}
