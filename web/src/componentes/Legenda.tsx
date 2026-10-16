// Cores da faixa dos cards: as mesmas da bolinha da etiqueta física.
export function Legenda() {
  return (
    <div className="legenda" aria-hidden="true">
      <span><i style={{ background: 'var(--tipo-costura)' }} />Costura</span>
      <span><i style={{ background: 'var(--tipo-acabamento)' }} />Acabamento</span>
    </div>
  );
}

// Controle de produção: o que cada barra e cada sinal do Gantt quer dizer.
// As amostras usam as mesmas classes das barras (styles/f4.css).
export function LegendaProducao() {
  return (
    <div className="legenda legenda--producao" aria-label="Legenda do Gantt">
      <span title="Barra até a data combinada com a oficina"><i className="legenda__barra gantt__barra" />Prazo combinado</span>
      <span title="Sem data combinada: a barra vai até o lead time"><i className="legenda__barra gantt__barra gantt__barra--lead" />Lead time</span>
      <span title="Prazo hoje ou nos próximos dias"><i className="legenda__barra gantt__barra gantt__barra--proximo" />Vence em breve</span>
      <span title="O prazo já passou"><i className="legenda__barra gantt__barra gantt__barra--atrasado" />Atrasada</span>
      <span title="Sem data de início da costura: aparece só o marco do prazo"><i className="legenda__marco" />Sem início</span>
      <span title="Falta aviamento na caixa de costura: impede finalizar a costura"><b>🚫</b>Falta na costura</span>
      <span title="Falta aviamento na caixa de acabamento: precisa estar pronto quando a costura acabar"><b>⚠️</b>Falta no acabamento</span>
    </div>
  );
}
