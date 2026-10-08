// Cores da faixa dos cards: as mesmas da bolinha da etiqueta física.
export function Legenda() {
  return (
    <div className="legenda" aria-hidden="true">
      <span><i style={{ background: 'var(--tipo-costura)' }} />Costura</span>
      <span><i style={{ background: 'var(--tipo-acabamento)' }} />Acabamento</span>
    </div>
  );
}
