import { itemAberto } from '../../regras/colunas';
import { contaDoItem } from '../../regras/quantidade';
import { textoPedidosDaParte, type ItemDaParte } from '../../regras/saidas';

// Item no painel de Saídas: só leitura, com os pedidos dele nesta etapa.
export function ItemSaida({ x }: { x: ItemDaParte }) {
  const { item } = x;
  const aberto = itemAberto(item);
  const comPedido = x.pedidoIds.length > 0;
  const tag = comPedido ? 'tag tag--pedido' : aberto ? 'tag tag--falta' : 'tag tag--ok';
  return (
    <li className={aberto ? 'item' : 'item item--resolvido'}>
      <div className="item__topo">
        <span className="item__nome">{item.nome}{item.cor && <span className="item__cor"> {item.cor}</span>}</span>
        <span className={tag}>{comPedido || aberto ? textoPedidosDaParte(x) : 'resolvido'}</span>
      </div>
      <span className="item__conta">{contaDoItem(item)}</span>
      {item.obsAlmox && <p className="item__almox"><span>Almoxarifado:</span> {item.obsAlmox}</p>}
      {item.obsPcp && <p className="item__obs">{item.obsPcp}</p>}
    </li>
  );
}
