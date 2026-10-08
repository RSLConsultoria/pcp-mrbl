import { useId, useRef, useState } from 'react';
import type { Acao, Caixa } from '../../api/tipos';
import type { Executar } from '../../hooks/useAcao';
import { justificativaValida, mensagemSucesso, MIN_JUSTIFICATIVA, tamanhoJustificativa } from '../../regras/acoes';
import { colunaDaCaixa, COLUNAS, type ColunaId } from '../../regras/colunas';

interface Props { caixa: Caixa; perfil: string; executar: Executar }

// ADM move direto; os outros perfis justificam com pelo menos 15 caracteres.
export function MoverPara({ caixa, perfil, executar }: Props) {
  const idTitulo = useId();
  const idJust = useId();
  const idContador = useId();
  const atual = colunaDaCaixa(caixa);
  const adm = perfil.trim().toUpperCase() === 'ADM';
  const [destino, setDestino] = useState<ColunaId | null>(null);
  const [just, setJust] = useState('');
  const [enviando, setEnviando] = useState(false);
  const travado = useRef(false); // barra o clique duplo antes de o estado renderizar

  const mover = async (valor: ColunaId, justificativa?: string) => {
    if (travado.current) return false;
    const acao: Acao = { tipo: 'mover', dealId: caixa.dealId, valor, versao: caixa.versao, ...(justificativa ? { justificativa } : {}) };
    travado.current = true;
    setEnviando(true);
    const ok = await executar(acao, mensagemSucesso(acao));
    travado.current = false;
    setEnviando(false);
    return ok;
  };

  const fechar = () => { setDestino(null); setJust(''); };
  const nomeDestino = COLUNAS.find((c) => c.id === destino)?.nome;
  const n = tamanhoJustificativa(just);

  return (
    <section className="secao">
      <h3 className="secao__titulo" id={idTitulo}>Mover para</h3>
      <div className="mover" role="group" aria-labelledby={idTitulo}>
        {COLUNAS.map((col) => (
          <button key={col.id} type="button" className="mover__botao"
            aria-pressed={col.id === atual || col.id === destino} disabled={col.id === atual || enviando}
            onClick={() => {
              if (adm) void mover(col.id);
              else { setDestino(col.id); setJust(''); }
            }}>
            <span className="mover__ponto" style={{ background: col.cor }} />{col.nome}
          </button>
        ))}
      </div>
      {destino && !adm && (
        <div className="justificativa">
          <p className="justificativa__destino">Mover para <strong>{nomeDestino}</strong></p>
          <div className="campo campo--largo">
            <label htmlFor={idJust}>Justificativa (obrigatória)</label>
            <textarea id={idJust} rows={3} maxLength={500} value={just} aria-describedby={idContador} autoFocus
              onChange={(e) => setJust(e.target.value)} />
          </div>
          <div className="justificativa__acoes">
            <span id={idContador} className={n >= MIN_JUSTIFICATIVA ? 'contador contador--ok' : 'contador'}>
              {n}/{MIN_JUSTIFICATIVA}
            </span>
            <button type="button" className="botao botao--leve" onClick={fechar}>Cancelar</button>
            <button type="button" className="botao botao--navy" disabled={!justificativaValida(just) || enviando}
              onClick={async () => { if (await mover(destino, just.trim())) fechar(); }}>
              Confirmar e mover
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
