import type { EtapaPedido, Item, Pedido } from '../../api/tipos';
import { itemAberto } from '../../regras/colunas';
import { contaDoItem } from '../../regras/quantidade';
import { textoPedidoDoItem } from '../../regras/saidas';

interface Props { item: Item; pedidos: Pedido[]; etapas: EtapaPedido[] }

// Item no painel de Saídas: só leitura, com o pedido em que está.
export function ItemSaida({ item, pedidos, etapas }: Props) {
  const aberto = itemAberto(item);
  const tag = !aberto ? 'tag tag--ok' : item.pedidoId ? 'tag tag--pedido' : 'tag tag--falta';
  return (
    <li className={aberto ? 'item' : 'item item--resolvido'}>
      <div className="item__topo">
        <span className="item__nome">{item.nome}{item.cor && <span className="item__cor"> {item.cor}</span>}</span>
        <span className={tag}>{aberto ? textoPedidoDoItem(item, pedidos, etapas) : 'resolvido'}</span>
      </div>
      <span className="item__conta">{contaDoItem(item)}</span>
      {item.obsAlmox && <p className="item__almox"><span>Almoxarifado:</span> {item.obsAlmox}</p>}
      {item.obsPcp && <p className="item__obs">{item.obsPcp}</p>}
    </li>
  );
}
