// Numera chamadas assíncronas: só a mais recente pode aplicar o resultado.
// Uma recarga antiga que responde depois de uma nova é ignorada.
export function criarSequencia() {
  let atual = 0;
  return {
    nova(): () => boolean {
      const minha = ++atual;
      return () => minha === atual;
    }
  };
}
