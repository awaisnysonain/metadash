import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const node = process.execPath;

const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const API_PORT = process.env.PORT || '5011';
const VITE_PORT = process.env.VITE_PORT || '5000';

function spawnProc(args: string[], env?: Record<string, string>): ChildProcess {
  return spawn(node, args, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, ...env },
  });
}

console.log(`[dev:all] API  → http://localhost:${API_PORT}`);
console.log(`[dev:all] Vite → http://localhost:${VITE_PORT} (proxies /api → :${API_PORT})`);

const server = spawnProc([tsxCli, 'watch', 'server/index.ts'], { PORT: API_PORT });
const vite = spawnProc([viteCli, '--port', VITE_PORT, '--strictPort', '--host', '0.0.0.0']);

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill();
  vite.kill();
  process.exit(code);
}

server.on('error', err => {
  console.error('[dev:all] API process failed:', err.message);
  shutdown(1);
});

vite.on('error', err => {
  console.error('[dev:all] Vite process failed:', err.message);
  shutdown(1);
});

server.on('exit', code => {
  if (!shuttingDown && code !== 0 && code !== null) {
    console.error(`[dev:all] API exited with code ${code}`);
    shutdown(code);
  }
});

vite.on('exit', code => {
  if (!shuttingDown && code !== 0 && code !== null) {
    console.error(`[dev:all] Vite exited with code ${code}`);
    shutdown(code);
  }
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
