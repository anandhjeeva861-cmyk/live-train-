// Explicitly preloaded by tests only; application code has no test OTP bypass.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
if (process.env.NODE_ENV !== 'test' || !process.env.MAIL_TEST_OUTBOX) throw new Error('Test mail fixture requires an isolated test environment.');
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://api.resend.com/emails') return original(url, options);
  const mail = JSON.parse(options.body);
  mkdirSync(process.env.MAIL_TEST_OUTBOX, { recursive: true });
  const key = createHash('sha256').update(mail.to[0]).digest('hex');
  writeFileSync(`${process.env.MAIL_TEST_OUTBOX}/${key}.json`, JSON.stringify(mail));
  return new Response(JSON.stringify({ id: 'test-mail' }), { status: 200 });
};
