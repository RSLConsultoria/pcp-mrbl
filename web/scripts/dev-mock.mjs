// Sobe o mock da API e o Vite apontando para ele. Ctrl+C encerra os dois.
import { spawn } from 'node:child_process';

const porta = process.env.MOCK_PORT || '8787';
const base = `http://localhost:${porta}`;
const env = {
  ...process.env,
  MOCK_PORT: porta,
  VITE_API_LOGIN: `${base}/pcp-login`,
  VITE_API_BOARD: `${base}/pcp-board`,
  VITE_API_ACAO: `${base}/pcp-acao`
};
const filhos = [
  spawn(process.execPath, ['scripts/mock-api.mjs'], { env, stdio: 'inherit' }),
  spawn('npx vite --port 5174 --strictPort', { env, stdio: 'inherit', shell: true })
];
let saindo = false;
function sair(codigo = 0) {
  if (saindo) return;
  saindo = true;
  for (const f of filhos) {
    if (f.exitCode !== null) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(f.pid), '/T', '/F'], { stdio: 'ignore' });
    else f.kill('SIGTERM');
  }
  setTimeout(() => process.exit(codigo), 500);
}
for (const f of filhos) f.on('exit', (c) => sair(c ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => sair(0));
