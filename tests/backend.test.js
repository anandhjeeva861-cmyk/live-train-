import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseEnvironment, readEmailCode } from './helpers.js';
import { setTimeout as delay } from 'node:timers/promises';
import crypto from 'node:crypto';

test('RailGo database and API integration', { timeout: 180000 }, async t => {
  Object.assign(process.env, databaseEnvironment('backend', { fixtures: true }));
  await import('./email-provider.fixture.js');
  const { app } = await import('../server.js');
  const { prisma } = await import('../backend/db.js');
  const { streams, closeStreams } = await import('../backend/tracking.js');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (url, method = 'GET', body, extra = {}) => {
      const response = await fetch(`${base}${url}`, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }), ...extra }, ...(body !== undefined && { body: JSON.stringify(body) }) });
      const incoming = response.headers.getSetCookie();
      if (incoming.length) cookie = incoming.map(s => s.split(';')[0]).join('; ');
      const payload = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
      return { status: response.status, body: payload, headers: response.headers, cookie };
    };
  }
  const a = client(), b = client(), guest = client();
  const date = '2099-10-12';
  const payload = { trainNumber: '12639', journeyDate: date, classCode: 'CC', seat: 'S1', passengers: [{ name: 'Demo Passenger', age: 25, gender: 'other' }, { name: 'Second Passenger', age: 30, gender: 'female' }] };
  let pnr;
  try {
    await t.test('health, seeded relationships and guarded routes', async () => {
      assert.equal((await a('/api/health')).body.database, 'connected');
      assert.equal(await prisma.train.count(), 1209);
      assert.equal(await prisma.station.count(), 36);
      for (const page of ['/dashboard', '/book', '/tracking', '/bookings']) { const r = await guest(page); assert.equal(r.status, 200); }
      assert.equal((await guest('/api/bookings')).status, 401);
      assert.equal((await guest('/api/tracking/12639')).status, 401);
    });
    await t.test('email login resumes and removed provider endpoints return 404', async () => {
      const login = async (client, email) => {
        assert.equal((await client('/api/auth/email/send', 'POST', { email })).status, 200);
        return client('/api/auth/email/verify', 'POST', { email, code: readEmailCode(process.env.MAIL_TEST_OUTBOX, email) });
      };
      const first = await login(a, 'first@example.test');
      assert.equal(first.status, 200);
      assert.equal((await a('/api/auth/me')).body.user.id, first.body.user.id);
      for (const path of ['guest', 'send-otp', 'verify-otp']) assert.equal((await a('/api/auth/' + path, 'POST', {})).status, 404);
      for (const path of ['google', 'google/callback']) assert.equal((await a('/api/auth/' + path)).status, 404);
      const other = await login(b, 'second@example.test');
      assert.notEqual(first.body.user.id, other.body.user.id);
      assert.equal(await prisma.otpVerification.count(), 0);
    });
    await t.test('email codes are browser-bound, rate-limited and consumed once', async () => {
      const c = client(), d = client(), email = 'security@example.test';
      const sent = await c('/api/auth/email/send', 'POST', { email: ' SECURITY@EXAMPLE.TEST ' });
      assert.equal(sent.status, 200);
      assert.equal(sent.body.email, email);
      const code = readEmailCode(process.env.MAIL_TEST_OUTBOX, email);
      assert.equal(JSON.stringify(sent.body).includes(code), false);
      assert.equal((await c('/api/auth/email/send', 'POST', { email })).status, 429);
      assert.equal((await c('/api/auth/config')).body.pending.email, email);
      assert.equal((await d('/api/auth/email/verify', 'POST', { email, code })).status, 400);
      assert.equal((await c('/api/auth/email/verify', 'POST', { email, code: '000000' })).status, 400);
      const results = await Promise.all([c('/api/auth/email/verify', 'POST', { email, code }), c('/api/auth/email/verify', 'POST', { email, code })]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
      assert.equal((await c('/api/auth/email/verify', 'POST', { email, code })).status, 400);
      const row = await prisma.emailVerification.findUnique({ where: { email } });
      assert.notEqual(row.codeHash, code);
      assert.equal(row.consumed, true);
      await prisma.emailVerification.update({ where: { email }, data: { sentAt: new Date(0) } });
      assert.equal((await d('/api/auth/email/send', 'POST', { email })).status, 200);
      const again = await d('/api/auth/email/verify', 'POST', { email, code: readEmailCode(process.env.MAIL_TEST_OUTBOX, email) });
      assert.equal(again.body.user.id, results.find(r => r.status === 200).body.user.id);
    });
    await t.test('expired and exhausted email codes cannot log in; provider failure is safe', async () => {
      const c = client(), email = 'expiry@example.test';
      assert.equal((await c('/api/auth/email/send', 'POST', { email })).status, 200);
      const code = readEmailCode(process.env.MAIL_TEST_OUTBOX, email);
      for (let i = 0; i < 5; i++) assert.equal((await c('/api/auth/email/verify', 'POST', { email, code: '000000' })).status, 400);
      assert.equal((await c('/api/auth/email/verify', 'POST', { email, code })).status, 400);
      await prisma.emailVerification.update({ where: { email }, data: { attempts: 0, expiresAt: new Date(0) } });
      assert.equal((await c('/api/auth/email/verify', 'POST', { email, code })).status, 400);
      assert.equal((await c('/api/auth/email/send', 'POST', { email: 'invalid' })).status, 400);
      const original = globalThis.fetch;
      globalThis.fetch = (url, options) => String(url) === 'https://api.resend.com/emails' ? Promise.resolve(new Response('secret provider error', { status: 500 })) : original(url, options);
      try {
        const failed = await c('/api/auth/email/send', 'POST', { email: 'failure@example.test' });
        assert.equal(failed.status, 502);
        assert.equal(JSON.stringify(failed.body).includes('secret provider'), false);
        assert.equal((await c('/api/auth/config')).body.pending, null);
      } finally { globalThis.fetch = original; }
      assert.equal((await c('/api/auth/email/send', 'POST', { email: 'failure@example.test' })).status, 200, 'A failed provider send must not leave a resend cooldown');
    });
    await t.test('station, normal/tourism/class/date search and empty routes', async () => {
      assert.equal((await a('/api/trains')).body.trains.length, 1209);
      assert.ok((await a('/api/stations')).body.some(s => s.code === 'KPD'));
      assert.equal((await a('/api/trains?from=MAS&to=SBC&type=normal')).body.count, 2);
      assert.equal((await a('/api/trains?from=MAS&to=SBC&type=tourism')).body.trains[0].number, 'TR101');
      assert.equal((await a('/api/trains?from=MAS&to=SBC&class=EC')).body.count, 1);
      assert.equal((await a('/api/trains?from=UAM&to=MDU')).body.count, 0);
      assert.equal((await a('/api/trains?date=2099-02-30')).status, 400);
      assert.equal((await a('/api/trains/12639/stops')).body.length, 4);
      const assistant = await a('/api/assistant', 'POST', { message: 'Chennai to Coimbatore tomorrow for two passengers' });
      assert.equal(assistant.status, 200); assert.equal(assistant.body.action.to, 'CBE'); assert.match(assistant.body.reply, /published routes/);
    });
    await t.test('passenger validation, transactional booking and PNR/list persistence', async () => {
      assert.equal((await a('/api/bookings', 'POST', { ...payload, passengers: 2 })).status, 400);
      assert.equal((await a('/api/bookings', 'POST', { ...payload, journeyDate: '2020-01-01' })).status, 400);
      const r = await a('/api/bookings', 'POST', payload);
      assert.equal(r.status, 201, JSON.stringify(r.body)); pnr = r.body.pnr;
      assert.match(pnr, /^\d{10}$/); assert.equal(r.body.passengerDetails.length, 2); assert.equal(r.body.totalFare, 1440);
      assert.equal(new Set(r.body.passengerDetails.map(p => p.seatNumber)).size, 2);
      assert.equal((await a('/api/bookings')).body[0].pnr, pnr);
      assert.equal((await a(`/api/bookings/${pnr}`)).body.pnr, pnr);
      assert.equal((await a('/api/bookings', 'POST', payload)).status, 409);
      assert.equal(await prisma.passenger.count(), 2);
      const classes = (await a(`/api/trains/12639/classes?date=${date}`)).body;
      assert.equal(classes.find(c => c.classCode === 'CC').availableSeats, 36);
    });
    await t.test('booking retries return one ticket, survive cancellation and remain scoped to the account', async () => {
      const headers = { 'Idempotency-Key': crypto.randomUUID() };
      const input = { ...payload, journeyDate: '2099-11-01' };
      const before = await prisma.booking.count();
      const results = await Promise.all(Array.from({ length: 4 }, () => a('/api/bookings', 'POST', input, headers)));
      assert.ok(results.every(r => r.status === 201), JSON.stringify(results.map(r => r.body)));
      assert.equal(new Set(results.map(r => r.body.pnr)).size, 1);
      assert.equal(await prisma.booking.count(), before + 1);
      const ticket = results[0].body;
      assert.equal(ticket.requestKey, undefined);
      const seats = (await a('/api/trains/12639/classes?date=2099-11-01')).body.find(c => c.classCode === 'CC');
      assert.equal(seats.availableSeats, seats.totalSeats - 2);
      assert.equal((await a('/api/bookings', 'POST', { ...input, seat: 'S4' }, headers)).status, 409);
      assert.equal((await a('/api/bookings', 'POST', input, { 'Idempotency-Key': 'invalid' })).status, 400);
      assert.equal((await b('/api/bookings', 'POST', input, headers)).status, 409, 'Another account cannot retrieve this ticket by its request key');
      await a(`/api/bookings/${ticket.pnr}/cancel`, 'PATCH');
      const replay = await a('/api/bookings', 'POST', input, headers);
      assert.equal(replay.body.pnr, ticket.pnr);
      assert.equal(replay.body.status, 'CANCELLED');
      assert.equal(await prisma.booking.count(), before + 1);
    });
    await t.test('ownership isolation and cross-origin mutation rejection', async () => {

      assert.deepEqual((await b('/api/bookings')).body, []);
      assert.equal((await b(`/api/bookings/${pnr}`)).status, 404);
      assert.equal((await b(`/api/bookings/${pnr}/cancel`, 'PATCH')).status, 404);
      assert.equal((await a('/api/bookings', 'POST', payload, { Origin: 'https://untrusted.example' })).status, 403);
    });
    await t.test('concurrent seat claims and date-isolated capacity', async () => {
      const attempts = await Promise.all(Array.from({ length: 5 }, () => a('/api/bookings', 'POST', { ...payload, seat: 'S3', passengers: payload.passengers.slice(0, 1) })));
      assert.equal(attempts.filter(r => r.status === 201).length, 1);
      assert.equal(attempts.filter(r => r.status === 409).length, 4);
      assert.equal((await a('/api/bookings', 'POST', { ...payload, journeyDate: '2099-10-13' })).status, 201);
      const c = await prisma.trainClass.findUnique({ where: { trainId_classCode: { trainId: 'south-heritage', classCode: 'PC' } } });
      await prisma.journeyInventory.create({ data: { trainClassId: c.id, journeyDate: date, availableSeats: 1 } });
      const race = await Promise.all(Array.from({ length: 4 }, () => a('/api/bookings', 'POST', { ...payload, trainNumber: 'TR101', classCode: 'PC', seat: undefined, passengers: payload.passengers.slice(0, 1) })));
      assert.equal(race.filter(r => r.status === 201).length, 1);
      assert.equal(await prisma.journeyInventory.count({ where: { availableSeats: { lt: 0 } } }), 0);
    });
    await t.test('cancellation restores seats exactly once under concurrency', async () => {
      const results = await Promise.all([a(`/api/bookings/${pnr}/cancel`, 'PATCH'), a(`/api/bookings/${pnr}/cancel`, 'PATCH')]);
      assert.ok(results.every(r => r.status === 200 && r.body.status === 'CANCELLED'));
      const c = (await a(`/api/trains/12639/classes?date=${date}`)).body.find(c => c.classCode === 'CC');
      assert.equal(c.availableSeats, 37); assert.deepEqual(c.bookedSeats, [3]);
    });
    await t.test('tracking contract, database snapshot, shared SSE engine and disconnect cleanup', async () => {
      const r = await a('/api/tracking/12639');
      assert.equal(r.status, 200); assert.equal(r.body.simulated, true);
      for (const field of ['latitude', 'longitude', 'currentSpeed', 'averageSpeed', 'progressPercent', 'distanceRemaining', 'etaMinutes']) assert.ok(Number.isFinite(r.body[field]), field);
      assert.ok(await prisma.liveTrainStatus.findUnique({ where: { trainId: 'brindavan' } }));
      const cookie = (await a('/api/auth/me')).cookie;
      const controllers = [new AbortController(), new AbortController()];
      for (const controller of controllers) {
        const response = await fetch(`${base}/api/tracking/12639/stream`, { headers: { Cookie: cookie }, signal: controller.signal });
        const reader = response.body.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /event: live/);
      }
      assert.equal(streams.size, 1); assert.equal(streams.get('brindavan').clients.size, 2);
      controllers[0].abort(); await delay(100); assert.equal(streams.get('brindavan').clients.size, 1);
      controllers[1].abort(); await delay(100); assert.equal(streams.size, 0);
    });
    await t.test('tourism cards and invalid weather coordinates', async () => {
      const spots = (await a('/api/tourism?station=SBC')).body;
      assert.equal(spots.length, 4); assert.ok(spots.every(s => s.image && s.description));
      assert.equal((await a('/api/tourism/3')).body.name, 'Lalbagh Botanical Garden');
      assert.equal((await a('/api/weather?lat=91&lon=1')).status, 400);
      assert.equal((await a('/api/weather?lat=1')).status, 400);
    });
    await t.test('weather provider failure is explicit, cached and does not block tracking', async () => {
      const original = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = (url, ...args) => String(url).startsWith('https://api.open-meteo.com') ? (calls++, Promise.reject(new Error('Test outage'))) : original(url, ...args);
      try {
        const r = await a('/api/weather?lat=12.9&lon=77.5');
        assert.equal(r.body.fallback, true); assert.equal(r.body.current, null);
        await a('/api/weather?lat=12.9&lon=77.5'); assert.equal(calls, 1);
        assert.equal((await a('/api/tracking/12639')).status, 200);
      } finally { globalThis.fetch = original; }
    });
    await t.test('logout revokes session', async () => {
      assert.equal((await a('/api/auth/logout', 'POST', {})).status, 200);
      assert.equal((await a('/api/auth/me')).status, 401);
      assert.equal((await a('/api/bookings')).status, 401);
    });
    await t.test('deleted account cannot open protected HTML with an old session', async () => {
      await prisma.user.delete({ where: { id: (await b('/api/auth/me')).body.user.id } });
      assert.equal((await b('/dashboard')).status, 200);
      assert.equal((await b('/api/bookings')).status, 401);
    });
  } finally { closeStreams(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); }
});
