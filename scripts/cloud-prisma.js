import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './generate-cloud-schema.js';

export async function runCloudPrisma(action) {
  if (!['generate', 'migrate'].includes(action)) throw new Error('Use generate or migrate.');
  if (action === 'migrate' && !/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || '')) throw new Error('Cloud migrations require a PostgreSQL DATABASE_URL.');
  const args = action === 'generate' ? ['generate'] : ['migrate', 'deploy'];
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', ...args, '--config', 'prisma.cloud.config.ts'], { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Cloud database ${action} failed.`)));
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await runCloudPrisma(process.argv[2] || 'generate');
