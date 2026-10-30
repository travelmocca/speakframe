import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const web = spawn('node', ['node_modules/next/dist/bin/next', process.argv.includes('--production') ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', process.env.PORT || '3000'], { stdio: 'inherit' });
const worker = spawn('node', ['--import', 'tsx', 'src/worker.ts'], { stdio: 'inherit' });
let closing = false;
function stop(code = 0) { if (closing) return; closing = true; web.kill('SIGTERM'); worker.kill('SIGTERM'); setTimeout(() => { web.kill('SIGKILL'); worker.kill('SIGKILL'); process.exit(code); }, 3000).unref(); }
web.on('exit', code => stop(code || 0)); worker.on('exit', code => stop(code || 0));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
