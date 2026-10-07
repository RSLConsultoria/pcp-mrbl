import { horaMinuto } from '../regras/datas';

export function FaixaOffline({ desde, temDados }: { desde: Date; temDados: boolean }) {
  return (
    <div className="faixa-offline" role="status">
      Sem conexão desde {horaMinuto(desde.toISOString())} — tentando de novo.
      {temDados ? ' O quadro mostra os últimos dados carregados.' : ''}
    </div>
  );
}
