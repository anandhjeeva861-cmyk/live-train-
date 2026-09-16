import test from 'node:test';
import assert from 'node:assert/strict';
import { profileSchema } from '../backend/profile.js';
import { databaseEnvironment, readEmailCode, testProfile } from './helpers.js';

test('profile validates actual calendar dates, names and Indian contact numbers', () => {
  for (const change of [{ firstName: '' }, { firstName: '<script>' }, { firstName: 'A'.repeat(81) }, { dateOfBirth: '2001-02-29' }, { dateOfBirth: '2999-01-01' }, { dateOfBirth: '1899-01-01' }, { dateOfBirth: 'not a date' }, { mobileNumber: '123' }, { mobileNumber: '+44 7911 123456' }, { mobileNumber: '9000000001abc' }]) {
    assert.equal(profileSchema.safeParse({ ...testProfile, ...change }).success, false);
  }
  assert.equal(profileSchema.parse({ ...testProfile, firstName: '  அருண்  ' }).firstName, 'அருண்');
  for (const mobileNumber of ['+91 90000 00001', '919000000001', '09000000001', '9000000001']) assert.equal(profileSchema.parse({ ...testProfile, mobileNumber }).mobileNumber, testProfile.mobileNumber);
});

test('email verification owns profile changes, resumes safely and keeps phone ownership separate', { timeout: 180000 }, async t => {
  Object.assign(process.env, databaseEnvironment('profile', { fixtures: true }));
  await import('./email-provider.fixture.js');
  const { app } = await import('../server.js'), { prisma } = await import('../backend/db.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (route, body) => {
      const response = await fetch(base + '/api/auth/' + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, ...(body && { body: JSON.stringify(body) }) });
      const next = response.headers.getSetCookie(); if (next.length) cookie = next.map(value => value.split(';')[0]).join('; ');
      return { status: response.status, body: await response.json() };
    };
  }
  const a = client(), b = client(), email = 'profile@example.test';
  const send = profile => a('email/send', { email, profile });
  const verify = (code, extra = {}) => a('email/verify', { email, code, ...extra });
  const allowResend = () => prisma.emailVerification.update({ where: { email }, data: { sentAt: new Date(0) } });
  assert.equal((await a('email/send', { email })).status, 400);
  assert.equal((await send(testProfile)).status, 200);
  const firstCode = readEmailCode(process.env.MAIL_TEST_OUTBOX, email);
  assert.equal(await prisma.user.findUnique({ where: { email } }), null, 'An email request must not create a user or save an unverified profile');
  assert.deepEqual((await a('config')).body.pending.profile, testProfile);
  assert.equal((await b('config')).body.pending, null, 'Another browser cannot read pending birth date or contact number');
  assert.equal((await b('me')).status, 401);
  await b('email/cancel', {});
  assert.ok((await a('config')).body.pending, 'Another browser cannot cancel this challenge');
  assert.equal((await verify('000000')).status, 400);
  const accepted = await verify(firstCode, { profile: { ...testProfile, firstName: 'Unverified Replacement' } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.user.firstName, testProfile.firstName, 'Verification uses the details bound to the sent challenge');
  assert.equal(accepted.body.user.dateOfBirth, testProfile.dateOfBirth);
  assert.equal(accepted.body.user.mobileNumber, testProfile.mobileNumber);
  assert.equal(accepted.body.user.profileComplete, true);
  assert.equal((await prisma.emailVerification.findUnique({ where: { email } })).dateOfBirth, null, 'Consumed challenges clear temporary profile data');
  const originalId = accepted.body.user.id, update = { firstName: 'Updated Traveller', dateOfBirth: '1998-05-16', mobileNumber: '9000000002' };
  await allowResend();
  assert.equal((await send(update)).status, 200);
  const cancelledCode = readEmailCode(process.env.MAIL_TEST_OUTBOX, email);
  assert.equal((await a('me')).body.user.firstName, testProfile.firstName, 'Sending an OTP does not change an existing profile');
  await a('email/cancel', {});
  assert.equal((await a('config')).body.pending, null);
  assert.equal((await verify(cancelledCode)).status, 400);
  assert.equal((await send(update)).status, 429, 'Changing details preserves the resend cooldown');
  await allowResend();
  assert.equal((await send(update)).status, 200);
  const updated = await verify(readEmailCode(process.env.MAIL_TEST_OUTBOX, email));
  assert.equal(updated.body.user.id, originalId, 'Verified updates preserve the existing account');
  assert.equal(updated.body.user.firstName, update.firstName);
  assert.equal(updated.body.user.dateOfBirth, update.dateOfBirth);
  assert.equal(updated.body.user.mobileNumber, update.mobileNumber);
  const otherEmail = 'other-profile@example.test';
  assert.equal((await b('email/send', { email: otherEmail, profile: update })).status, 200);
  const other = await b('email/verify', { email: otherEmail, code: readEmailCode(process.env.MAIL_TEST_OUTBOX, otherEmail) });
  assert.notEqual(other.body.user.id, originalId, 'An unverified contact number cannot merge accounts');
  assert.equal((await prisma.user.findUnique({ where: { id: originalId } })).mobileVerified, false);
  assert.equal((await a('logout', {})).status, 200);
  assert.equal((await a('me')).status, 401);
});
