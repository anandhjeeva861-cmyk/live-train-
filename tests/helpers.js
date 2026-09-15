import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export function databaseEnvironment(prefix, { fixtures = false } = {}) {
  mkdirSync('test-results', { recursive: true });
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: `file:${path.resolve(`test-results/${prefix}-${crypto.randomUUID()}.db`).replaceAll('\\', '/')}`,
    RAILGO_TEST_FIXTURES: String(fixtures), SESSION_SECRET: crypto.randomBytes(48).toString('base64url'), OPENAI_API_KEY: '',
    EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-only', EMAIL_FROM: 'RailGo <login@example.test>',
    MAIL_TEST_OUTBOX: path.resolve(`test-results/mail-${crypto.randomUUID()}`) };
  writeFileSync(env.DATABASE_URL.slice(5), '');
  for (const args of [['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['prisma/seed.js']]) {
    const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (result.status !== 0) {
      let message = String(result.stderr || result.error || 'Unknown database setup error');
      for (const [key, value] of Object.entries(env)) if (/SECRET|TOKEN|PASSWORD|API_KEY|SMTP_PASS/.test(key) && value) message = message.replaceAll(value, '[redacted]');
      throw new Error(`Test database setup failed: ${message.slice(-2500)}`);
    }
  }
  return env;
}

export async function browserLogin(request, base, outbox) {
  const email = `test-${crypto.randomUUID()}@example.test`;
  const response = await request.post(base + '/api/auth/email/send', { data: { email } });
  if (response.status() !== 200) throw new Error('Test email delivery failed');
  const verified = await request.post(base + '/api/auth/email/verify', { data: { email, code: readEmailCode(outbox, email) } });
  if (verified.status() !== 200) throw new Error('Test email login failed');
}

export function readEmailCode(outbox, email) {
  const key = crypto.createHash('sha256').update(email).digest('hex');
  return JSON.parse(readFileSync(`${outbox}/${key}.json`, 'utf8')).text.match(/\b\d{6}\b/)[0];
}
