import test from 'node:test';
import assert from 'node:assert/strict';
import { emailSetupIssues, sendLoginEmail } from '../backend/email.js';

test('missing and invalid email settings prevent an outbound request', async t => {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, original = globalThis.fetch;
  t.after(() => { if (key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = key; if (from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = from; globalThis.fetch = original; });
  process.env.RESEND_API_KEY = ' ';
  process.env.EMAIL_FROM = ' ';
  assert.deepEqual(emailSetupIssues(), ['RESEND_API_KEY', 'EMAIL_FROM']);
  globalThis.fetch = () => { throw new Error('No email request should be made'); };
  await assert.rejects(sendLoginEmail('traveller@example.test', '123456'), error => error.status === 503);
  process.env.RESEND_API_KEY = 'test-only';
  process.env.EMAIL_FROM = 'RailGo <invalid>';
  assert.deepEqual(emailSetupIssues(), ['EMAIL_FROM (invalid sender address)']);
});

test('Resend rejection details stay private and delivery needs an acceptance ID', async t => {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, original = globalThis.fetch;
  t.after(() => { if (key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = key; if (from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = from; globalThis.fetch = original; });
  process.env.RESEND_API_KEY = 'test-only';
  process.env.EMAIL_FROM = 'RailGo <login@example.test>';
  for (const status of [401, 403, 429, 500, 200]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'private provider details' }), { status });
    await assert.rejects(sendLoginEmail('traveller@example.test', '123456'), error => error.status === 502 && !error.message.includes('private provider details'));
  }
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).to[0], 'traveller@example.test');
    assert.equal(options.headers['Idempotency-Key'], 'login/test-challenge');
    return new Response(JSON.stringify({ id: 'accepted-test-email' }), { status: 200 });
  };
  await sendLoginEmail('traveller@example.test', '123456', 'test-challenge');
});
