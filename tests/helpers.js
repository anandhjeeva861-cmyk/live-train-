import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export function databaseEnvironment(prefix) {
  mkdirSync('test-results', { recursive: true });
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: `file:${path.resolve(`test-results/${prefix}-${crypto.randomUUID()}.db`).replaceAll('\\', '/')}`,
    SESSION_SECRET: crypto.randomBytes(48).toString('base64url'), DEV_OTP_MODE: 'true', DEV_GOOGLE_AUTH: 'true', OPENAI_API_KEY: '' };
  writeFileSync(env.DATABASE_URL.slice(5), '');
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['prisma/seed.js']]) {
    const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (result.status !== 0) {
      let message = String(result.stderr || result.error || 'Unknown database setup error');
      for (const [key, value] of Object.entries(env)) if (/SECRET|TOKEN|PASSWORD|API_KEY/.test(key) && value) message = message.replaceAll(value, '[redacted]');
      throw new Error(`Test database setup failed: ${message.slice(-2500)}`);
    }
  }
  return env;
}

export async function browserLogin(request, base, mobileNumber = `9${crypto.randomInt(100000000, 999999999)}`) {
  let response = await request.post(`${base}/api/auth/send-otp`, { data: { mobileNumber } });
  if (response.status() !== 200) throw new Error('Test send OTP failed');
  response = await request.post(`${base}/api/auth/verify-otp`, { data: { mobileNumber, otp: '123456' } });
  if (response.status() !== 200) throw new Error('Test verify OTP failed');
  response = await request.get(`${base}/api/auth/google`, { maxRedirects: 0 });
  if (response.status() !== 302) throw new Error('Test development Google login failed');
}
