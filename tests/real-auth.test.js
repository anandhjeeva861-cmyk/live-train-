import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSmsProvider } from '../backend/sms.js';
import { databaseEnvironment } from './helpers.js';

test('Twilio transport sends E.164 SMS and only accepts the bound approved verification', async () => {
  const env = { SMS_PROVIDER: 'twilio-verify', TWILIO_ACCOUNT_SID: 'YOUR_ACCOUNT_SID', TWILIO_AUTH_TOKEN: 'YOUR_AUTH_TOKEN', TWILIO_VERIFY_SERVICE_SID: 'YOUR_SERVICE_SID' };
  let payload = { status: 'pending', sid: 'verification-id' }, status = 200;
  const calls = [];
  const provider = createSmsProvider({ env, fetchImpl: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify(payload), { status }); } });
  assert.equal(await provider.send('9876543210'), 'verification-id');
  assert.equal(calls[0].url, 'https://verify.twilio.com/v2/Services/YOUR_SERVICE_SID/Verifications');
  assert.equal(new URLSearchParams(calls[0].options.body).get('To'), '+919876543210');
  payload = { status: 'approved', sid: 'verification-id' };
  assert.equal(await provider.verify('verification-id', '654321'), true);
  assert.equal(new URLSearchParams(calls[1].options.body).get('VerificationSid'), 'verification-id');
  assert.equal(new URLSearchParams(calls[1].options.body).get('Code'), '654321');
  payload.sid = 'different-verification';
  assert.equal(await provider.verify('verification-id', '654321'), false);
  status = 404;
  assert.equal(await provider.verify('verification-id', '654321'), false);
  status = 500; payload = { message: 'private provider diagnostic' };
  await assert.rejects(provider.send('9876543210'), e => e.status === 503 && !e.message.includes('private'));
  const missing = createSmsProvider({ env: {}, fetchImpl: () => assert.fail('Must not call provider without configuration') });
  await assert.rejects(missing.send('9876543210'), { status: 503 });
});

test('Real authentication routes with controlled provider responses (no SMS sent)', { timeout: 180000 }, async t => {
  Object.assign(process.env, databaseEnvironment('real-auth'), { DEV_OTP_MODE: 'false', DEV_GOOGLE_AUTH: 'false', GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID', GOOGLE_CLIENT_SECRET: 'YOUR_CLIENT_SECRET' });
  const { authMiddleware, registerAuth } = await import('../backend/auth.js');
  const { prisma } = await import('../backend/db.js');
  let smsFailure = false, ready = true, authOptions, tokenOptions;
  const googleClient = {
    generateCodeVerifierAsync: async () => ({ codeVerifier: 'test-only-verifier', codeChallenge: 'test-only-challenge' }),
    generateAuthUrl: options => { authOptions = options; return `https://accounts.google.com/o/oauth2/v2/auth?state=${options.state}`; },
    getToken: async options => { tokenOptions = options; return { tokens: { id_token: 'test-only-id-token' } }; },
    verifyIdToken: async () => ({ getPayload: () => ({ sub: 'google-user-one', email: 'traveller@example.test', email_verified: true, name: 'Traveller' }) }),
  };
  const app = express(); app.use(express.json(), authMiddleware());
  registerAuth(app, { smsProvider: { configured: () => ready, send: async phone => { if (smsFailure) throw new Error('private diagnostic'); return `verification-${phone}`; }, verify: async (_id, code) => code === '654321' }, googleClientFactory: () => googleClient });
  app.use((error, _req, res, _next) => res.status(error.status || 400).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.GOOGLE_CALLBACK_URL = `${base}/api/auth/google/callback`;
  function client() {
    let cookie = '';
    return async (url, body) => {
      const response = await fetch(base + url, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body && { body: JSON.stringify(body) }) });
      const incoming = response.headers.getSetCookie();
      if (incoming.length) cookie = incoming.map(s => s.split(';')[0]).join('; ');
      return { status: response.status, location: response.headers.get('location'), body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
    };
  }
  const a = client(), guest = client(), phone = '9876543210';
  try {
    await t.test('real configuration, missing provider and mobile-first guard', async () => {
      const config = (await a('/api/auth/config')).body;
      assert.equal(config.devOtp, false); assert.equal(config.devGoogle, false); assert.equal(config.googleReady, true);
      assert.equal((await guest('/api/auth/google')).location, '/login?error=mobile');
      ready = false;
      assert.equal((await a('/api/auth/send-otp', { mobileNumber: phone })).status, 503);
      ready = true;
    });
    await t.test('SMS challenge persistence, no demo bypass, browser binding and single consumption', async () => {
      const sent = await a('/api/auth/send-otp', { mobileNumber: phone });
      assert.equal(sent.status, 200); assert.equal(sent.body.development, false);
      const row = await prisma.otpVerification.findUnique({ where: { mobileNumber: phone } });
      assert.equal(row.otpHash, null); assert.equal(row.provider, 'twilio-verify'); assert.equal(row.providerVerificationId, `verification-${phone}`);
      const resumed = (await a('/api/auth/config')).body.pendingOtp;
      assert.equal(resumed.mobileNumber, phone); assert.equal(resumed.providerVerificationId, undefined);
      assert.equal((await guest('/api/auth/config')).body.pendingOtp, null);
      assert.equal((await a('/api/auth/send-otp', { mobileNumber: phone })).status, 429);
      assert.equal((await a('/api/auth/verify-otp', { mobileNumber: phone, otp: '123456' })).status, 400);
      assert.equal((await guest('/api/auth/verify-otp', { mobileNumber: phone, otp: '654321' })).status, 400);
      assert.equal((await a('/api/auth/verify-otp', { mobileNumber: phone, otp: '654321' })).status, 200);
      assert.equal((await a('/api/auth/verify-otp', { mobileNumber: phone, otp: '654321' })).status, 400);
      assert.equal((await a('/api/auth/me')).status, 401);
    });
    await t.test('Google state, PKCE, denial retry and existing demo account upgrade', async () => {
      const existing = await prisma.user.create({ data: { mobileNumber: phone, googleId: `development:${phone}`, name: 'Demo Traveller' } });
      assert.match((await a('/api/auth/google')).location, /^https:\/\/accounts.google.com\//);
      assert.equal(authOptions.code_challenge_method, 'S256');
      assert.equal((await a('/api/auth/google/callback?state=wrong&code=example')).location, '/login?error=state');
      assert.equal((await a(`/api/auth/google/callback?state=${authOptions.state}&error=access_denied`)).location, '/login?error=denied');
      assert.equal((await a('/api/auth/config')).body.mobileVerified, true);
      await a('/api/auth/google');
      const callback = `/api/auth/google/callback?state=${authOptions.state}&code=example`;
      assert.equal((await a(callback)).location, '/dashboard');
      assert.equal(tokenOptions.codeVerifier, 'test-only-verifier');
      const me = (await a('/api/auth/me')).body;
      assert.equal(me.user.id, existing.id); assert.equal(me.user.googleId, 'google-user-one'); assert.equal(me.development, false);
      assert.equal((await a(callback)).location, '/login?error=mobile');
      const sessions = await prisma.session.findMany();
      assert.ok(sessions.some(row => JSON.parse(row.data).authenticationMode === 'real'));
    });
    await t.test('delivery failure is sanitized and cannot verify', async () => {
      const c = client(), mobileNumber = '9876543211'; smsFailure = true;
      const result = await c('/api/auth/send-otp', { mobileNumber });
      assert.equal(result.status, 503); assert.ok(!result.body.error.includes('private'));
      assert.equal((await prisma.otpVerification.findUnique({ where: { mobileNumber } })).deliveryStatus, 'failed');
      assert.equal((await c('/api/auth/verify-otp', { mobileNumber, otp: '654321' })).status, 400);
      smsFailure = false;
    });
    await t.test('real OTP attempt limit, expiry and Google account ownership', async () => {
      const c = client(), mobileNumber = '9876543212';
      await c('/api/auth/send-otp', { mobileNumber });
      for (let i = 0; i < 5; i++) assert.equal((await c('/api/auth/verify-otp', { mobileNumber, otp: '000000' })).status, 400);
      assert.equal((await c('/api/auth/verify-otp', { mobileNumber, otp: '654321' })).status, 400);
      await prisma.otpVerification.update({ where: { mobileNumber }, data: { attempts: 0, expiresAt: new Date(0) } });
      assert.equal((await c('/api/auth/verify-otp', { mobileNumber, otp: '654321' })).status, 400);
      await prisma.otpVerification.update({ where: { mobileNumber }, data: { expiresAt: new Date(Date.now() + 60000) } });
      assert.equal((await c('/api/auth/verify-otp', { mobileNumber, otp: '654321' })).status, 200);
      await c('/api/auth/google');
      assert.equal((await c(`/api/auth/google/callback?state=${authOptions.state}&code=example`)).location, '/login?error=account');
      assert.equal((await c('/api/auth/me')).status, 401);
    });
  } finally { await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});
