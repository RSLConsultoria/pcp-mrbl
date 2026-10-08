import { useId, useRef, useState, type FormEvent } from 'react';
import type { Acao, Item } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { arredondar3, lerQuantidade, mensagemSucesso, validarBaixa } from '../../regras/acoes';
import { itemAberto } from '../../regras/colunas';
import { ddmm } from '../../regras/datas';
import { contaDoItem } from '../../regras/quantidade';
import { CampoData, CampoTexto } from './Campos';

interface Props { item: Item; dealId: string; executar: Executar }

function Baixa({ item, dealId, executar }: Props) {
  const idCampo = useId();
  const idErro = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [qtd, setQtd] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const travado = useRef(false); // barra o clique duplo antes de o estado renderizar

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (travado.current) return;
    const er = validarBaixa(qtd, item);
    if (er) {
      setErro(er);
      campo.current?.focus();
      return;
    }
    const acao: Acao = { tipo: 'baixa', dealId, itemId: item.id, valor: arredondar3(lerQuantidade(qtd)!), versao: item.versao };
    travado.current = true;
    setEnviando(true);
    const ok = await executar(acao, mensagemSucesso(acao, item));
    travado.current = false;
    setEnviando(false);
    if (ok) setQtd('');
  }

  return (
    <form className="baixa" onSubmit={registrar} noValidate>
      <label htmlFor={idCampo}>Chegou</label>
      <div className="baixa__linha">
        <div className="baixa__campo">
          <input id={idCampo} ref={campo} type="text" inputMode="decimal" autoComplete="off" value={qtd}
            aria-label={item.un ? `Chegou (${item.un})` : undefined}
            aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined}
            onChange={(e) => { setQtd(e.target.value); setErro(null); }} />
          {item.un && <span className="baixa__un" aria-hidden="true">{item.un}</span>}
        </div>
        <button type="submit" className="botao botao--signal" disabled={enviando}>Registrar baixa</button>
      </div>
      {erro && <p id={idErro} className="campo__erro">{erro}</p>}
    </form>
  );
}

export function ItemEditavel({ item, dealId, executar }: Props) {
  const aberto = itemAberto(item);
  const zerado = item.resta === 0; // tudo chegou: nada mais a baixar nem a prever
  const base = { dealId, itemId: item.id, versao: item.versao };
  const enviar = (acao: Acao) => executar(acao, mensagemSucesso(acao, item));
  const detalhes = [
    !item.editavel && item.previsao && `previsão ${ddmm(item.previsao)}`,
    item.resolvidoEm && `resolvido em ${ddmm(item.resolvidoEm)}`
  ].filter(Boolean).join(' · ');

  return (
    <li className={aberto ? 'item' : 'item item--resolvido'}>
      <div className="item__topo">
        <span className="item__nome">{item.nome}{item.cor && <span className="item__cor"> {item.cor}</span>}</span>
        <span className={aberto ? 'tag tag--falta' : 'tag tag--ok'}>{aberto ? item.status.toLowerCase() : 'resolvido'}</span>
      </div>
      <span className="item__conta">{contaDoItem(item)}</span>
      {detalhes && <span className="item__detalhe">{detalhes}</span>}
      {item.obsAlmox && <p className="item__almox"><span>Almoxarifado:</span> {item.obsAlmox}</p>}

      {!item.editavel ? (
        <>
          {item.obsPcp && <p className="item__obs">{item.obsPcp}</p>}
          <p className="item__nota">Item lido da planilha de caixas ganhas; não pode ser alterado aqui.</p>
        </>
      ) : zerado ? (
        <>
          {item.obsPcp && <p className="item__obs">{item.obsPcp}</p>}
          <p className="item__nota">Item resolvido.</p>
        </>
      ) : (
        <div className="item__edicao">
          {item.resta !== null
            ? <Baixa item={item} dealId={dealId} executar={executar} />
            : <p className="item__nota">Quantidade faltante não informada; registre pela observação.</p>}
          <div className="campos">
            <CampoData rotulo="Previsão do item" doBoard={item.previsao} versao={item.versao}
              salvar={(v, versao) => enviar({ tipo: 'previsao_item', ...base, versao, valor: v })} />
            <CampoTexto rotulo="Observação do item" doBoard={item.obsPcp} versao={item.versao}
              salvar={(v, versao) => enviar({ tipo: 'obs_item', ...base, versao, valor: v })} />
          </div>
        </div>
      )}
    </li>
  );
}
