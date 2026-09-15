import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { emailSetupIssues, sendLoginEmail } from '../backend/email.js';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'resend';

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

const smtpEnv = { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'sender@gmail.com', SMTP_PASS: 'test-only', EMAIL_FROM: 'RailGo <sender@gmail.com>' };
test('SMTP requires a sender, credentials and encrypted submission port', () => {
  assert.deepEqual(emailSetupIssues(smtpEnv), []);
  assert.deepEqual(emailSetupIssues({ ...smtpEnv, SMTP_PASS: '' }), ['SMTP_PASS']);
  assert.deepEqual(emailSetupIssues({ ...smtpEnv, SMTP_PORT: '25' }), ['SMTP_PORT (465 or 587)']);
  assert.deepEqual(emailSetupIssues({ ...smtpEnv, SMTP_HOST: 'smtp.gmail.com/path' }), ['SMTP_HOST']);
  assert.deepEqual(emailSetupIssues({ ...smtpEnv, EMAIL_PROVIDER: 'unsupported' }), ['EMAIL_PROVIDER (resend or smtp)']);
});

test('SMTP delivery requires recipient acceptance, validates TLS and closes the transport', async t => {
  let closed = 0, received;
  t.mock.method(nodemailer, 'createTransport', options => {
    assert.equal(options.secure, true);
    assert.equal(options.requireTLS, true);
    assert.equal(options.tls.rejectUnauthorized, true);
    assert.equal(options.tls.minVersion, 'TLSv1.2');
    assert.equal(options.disableFileAccess, true);
    assert.equal(options.disableUrlAccess, true);
    assert.equal(options.logger, false);
    assert.equal(options.debug, false);
    assert.equal(options.auth.pass, 'test-only');
    return { sendMail: async message => { received = message; return { accepted: ['TRAVELLER@example.test'], rejected: [] }; }, close: () => closed++ };
  });
  await sendLoginEmail('traveller@example.test', '123456', 'test-challenge', smtpEnv);
  assert.equal(closed, 1);
  assert.equal(received.from, smtpEnv.EMAIL_FROM);
  assert.deepEqual(received.to, ['traveller@example.test']);
  assert.match(received.text, /123456/);
});

test('SMTP errors and rejected recipients cannot report a sent code or leak credentials', async t => {
  for (const outcome of [{ accepted: [], rejected: ['traveller@example.test'] }, Object.assign(new Error('private credentials and server response'), { code: 'EAUTH' }), new Error('private network detail')]) {
    let closed = false;
    const mock = t.mock.method(nodemailer, 'createTransport', () => ({
      sendMail: async () => { if (outcome instanceof Error) throw outcome; return outcome; }, close: () => { closed = true; }
    }));
    await assert.rejects(sendLoginEmail('traveller@example.test', '123456', 'test-challenge', smtpEnv), error => error.status === 502 && !error.message.includes('private') && !error.message.includes('test-only'));
    assert.equal(closed, true);
    mock.mock.restore();
  }
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
