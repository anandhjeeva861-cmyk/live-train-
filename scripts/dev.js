import { existsSync, copyFileSync, appendFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

if (!existsSync('.env')) copyFileSync('.env.example', '.env');
dotenv.config({ quiet: true });
if (process.env.NODE_ENV === 'production') throw new Error('Use npm start for production; dev bootstrap is local only.');
const additions = [];
if (!process.env.DATABASE_URL) additions.push('DATABASE_URL=file:./prisma/dev.db');
if (!process.env.SESSION_SECRET) additions.push(`SESSION_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
if (process.env.DEV_OTP_MODE === undefined) additions.push('DEV_OTP_MODE=false');
if (process.env.DEV_GOOGLE_AUTH === undefined) additions.push('DEV_GOOGLE_AUTH=false');
if (additions.length) appendFileSync('.env', `\n${additions.join('\n')}\n`);
dotenv.config({ quiet: true, override: true });
for (const args of [['generate'], ['migrate', 'deploy'], ['db', 'seed']]) {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
const child = spawn(process.execPath, ['--watch', 'server.js'], { stdio: 'inherit', windowsHide: true });
child.on('exit', code => process.exit(code || 0));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
