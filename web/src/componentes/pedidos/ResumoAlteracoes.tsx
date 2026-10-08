// O que o editar_pedido vai gravar, linha a linha, antes de salvar.
export function ResumoAlteracoes({ linhas }: { linhas: string[] }) {
  return (
    <section className="resumo" aria-label="Resumo do que será gravado" aria-live="polite">
      <h3 className="resumo__titulo">Resumo do que será gravado</h3>
      {linhas.length === 0 ? <p className="vazio">Nada alterado.</p> : (
        <ul className="resumo__linhas">
          {linhas.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      {linhas.length > 0 && <p className="resumo__nota">Fica registrado no histórico de cada OS do pedido e no Ploomes.</p>}
    </section>
  );
}
