import { useId } from 'react';
import type { Acao, Caixa } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { useValorDoBoard } from '../../hooks/useValorDoBoard';
import { mensagemSucesso } from '../../regras/acoes';
import { CampoData, CampoTexto } from './Campos';

interface Props { caixa: Caixa; usuarios: string[]; executar: Executar }

// Topo do painel: responsável, previsão geral e observação geral da caixa.
export function CamposCaixa({ caixa, usuarios, executar }: Props) {
  const idResp = useId();
  const [resp, setResp, reverterResp] = useValorDoBoard(caixa.responsavel);
  const base = { dealId: caixa.dealId, versao: caixa.versao };
  const enviar = (acao: Acao) => executar(acao, mensagemSucesso(acao));
  // Quem está na caixa continua na lista mesmo que não esteja mais ativo em USUARIOS.
  const opcoes = !caixa.responsavel || usuarios.includes(caixa.responsavel) ? usuarios : [caixa.responsavel, ...usuarios];

  return (
    <div className="campos">
      <div className="campo">
        <label htmlFor={idResp}>Responsável</label>
        <select id={idResp} value={resp}
          onChange={async (e) => {
            const v = e.target.value;
            setResp(v);
            if (!(await enviar({ tipo: 'responsavel', ...base, valor: v }))) reverterResp();
          }}>
          <option value="">Sem responsável</option>
          {opcoes.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <CampoData rotulo="Previsão geral" doBoard={caixa.previsao} versao={caixa.versao}
        salvar={(v, versao) => enviar({ tipo: 'previsao_caixa', ...base, versao, valor: v })} />
      <CampoTexto rotulo="Observação geral" doBoard={caixa.observacao} versao={caixa.versao}
        salvar={(v, versao) => enviar({ tipo: 'obs_caixa', ...base, versao, valor: v })} />
    </div>
  );
}
