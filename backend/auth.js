import session from 'express-session';
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { prisma, writeTransaction } from './db.js';
import { z } from 'zod';
import { emailConfigured, sendLoginEmail } from './email.js';
import { profileSchema, challengeProfile, profileColumns, clearedProfile } from './profile.js';

export const production = process.env.NODE_ENV === 'production';
export const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const otpSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const codeDigest = (id, code) => crypto.createHmac('sha256', otpSecret).update(`${id}:${code}`).digest('hex');
const emailSchema = z.string().trim().toLowerCase().max(254).email();
const userDto = user => ({ id: user.id, name: user.name, firstName: user.name, email: user.email,
  dateOfBirth: user.dateOfBirth, mobileNumber: user.contactMobile, emailVerified: user.emailVerified,
  profileComplete: Boolean(user.name && user.dateOfBirth && user.contactMobile) });

class DatabaseSessions extends session.Store {
  get(sid, cb) {
    prisma.session.findUnique({ where: { id: digest(sid) } }).then(row => {
      cb(null, row && row.expiresAt > new Date() ? JSON.parse(row.data) : null);
    }).catch(cb);
  }
  set(sid, data, cb = () => {}) {
    const record = { data: JSON.stringify(data), expiresAt: new Date(data.cookie.expires || Date.now() + 7 * 86400000) };
    prisma.session.upsert({ where: { id: digest(sid) }, create: { id: digest(sid), ...record }, update: record }).then(() => cb()).catch(cb);
  }
  destroy(sid, cb = () => {}) { prisma.session.deleteMany({ where: { id: digest(sid) } }).then(() => cb()).catch(cb); }
  touch(sid, data, cb) { this.set(sid, data, cb); }
}

export function authMiddleware() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (production && (!secret || secret.length < 32)) {
    throw new Error('Production requires a strong SESSION_SECRET.');
  }
  // Generated only in process memory, never written to examples or logs.
  return session({ name: 'railgo.sid', secret: secret || crypto.randomBytes(48).toString('base64url'),
    store: new DatabaseSessions(), resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 7 * 86400000 },
  });
}

export async function requireAuth(req, _res, next) {
  if (!req.session.userId || !req.session.emailAuthenticated) throw fail(401, 'Please sign in with your email to continue.');
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user?.emailVerified) throw fail(401, 'Please sign in with your email to continue.');
  req.user = user;
  next();
}

const save = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
export function registerAuth(app) {
  app.use('/api/auth', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/auth/config', async (req, res) => {
    const challenge = req.session.emailChallenge ? await prisma.emailVerification.findUnique({ where: { id: req.session.emailChallenge } }) : null;
    const pending = challenge?.delivered && !challenge.consumed && challenge.attempts < 5 && challenge.expiresAt > new Date() && challenge.sessionHash === digest(req.sessionID) && challengeProfile(challenge);
    res.json({ configured: emailConfigured(), pending: pending ? { email: challenge.email, profile: challengeProfile(challenge), expiresAt: challenge.expiresAt, retryAt: new Date(challenge.sentAt.getTime() + 60000) } : null });
  });
  const limiter = limit => rateLimit({ windowMs: 15 * 60_000, limit, message: { error: 'Too many attempts. Please try again in 15 minutes.' } });
  app.post('/api/auth/email/send', limiter(10), async (req, res) => {
    const email = emailSchema.parse(req.body?.email);
    const profile = profileSchema.parse(req.body?.profile);
    if (!emailConfigured()) throw fail(503, 'Email login is not configured. Please contact the site owner.');
    const id = crypto.randomUUID(), code = String(crypto.randomInt(100000, 1000000)), now = new Date();
    await writeTransaction(async tx => {
      await tx.emailVerification.deleteMany({ where: { expiresAt: { lte: now } } });
      const previous = await tx.emailVerification.findUnique({ where: { email } });
      if (previous && now - previous.sentAt < 60000) throw fail(429, 'Please wait 60 seconds before requesting another code.');
      const record = { id, email, ...profileColumns(profile), sessionHash: digest(req.sessionID), codeHash: codeDigest(id, code), expiresAt: new Date(+now + 600000), sentAt: now, attempts: 0, consumed: false, delivered: false };
      await tx.emailVerification.upsert({ where: { email }, create: record, update: record });
    });
    req.session.emailChallenge = id;
    await save(req);
    try { await sendLoginEmail(email, code, id); }
    catch (error) {
      // Do not leave a failed send in the resend cooldown or accept its code.
      await prisma.emailVerification.deleteMany({ where: { id, delivered: false } });
      throw error;
    }
    await prisma.emailVerification.updateMany({ where: { id }, data: { delivered: true } });
    res.json({ sent: true, email, profile, expiresAt: new Date(+now + 600000), retryAt: new Date(+now + 60000) });
  });
  app.post('/api/auth/email/cancel', async (req, res) => {
    if (req.session.emailChallenge) {
      await prisma.emailVerification.updateMany({ where: { id: req.session.emailChallenge, sessionHash: digest(req.sessionID), consumed: false }, data: { consumed: true, ...clearedProfile } });
      delete req.session.emailChallenge;
      await save(req);
    }
    res.json({ cancelled: true });
  });
  app.post('/api/auth/email/verify', limiter(30), async (req, res) => {
    const email = emailSchema.parse(req.body?.email);
    const code = z.string().regex(/^\d{6}$/, 'Enter the six-digit code.').parse(req.body?.code);
    const result = await writeTransaction(async tx => {
      const row = req.session.emailChallenge ? await tx.emailVerification.findUnique({ where: { id: req.session.emailChallenge } }) : null;
      if (!row || row.email !== email || row.sessionHash !== digest(req.sessionID) || row.consumed || !row.delivered || row.expiresAt <= new Date() || row.attempts >= 5 || !challengeProfile(row)) return null;
      await tx.emailVerification.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      if (!crypto.timingSafeEqual(Buffer.from(row.codeHash, 'hex'), Buffer.from(codeDigest(row.id, code), 'hex'))) return null;
      await tx.emailVerification.update({ where: { id: row.id }, data: { consumed: true, ...clearedProfile } });
      const verifiedProfile = { name: row.firstName, dateOfBirth: row.dateOfBirth, contactMobile: row.contactMobile, emailVerified: true };
      let user = await tx.user.findUnique({ where: { email } });
      const guest = req.session.userId ? await tx.user.findUnique({ where: { id: req.session.userId } }) : null;
      if (!user && guest?.mobileNumber.startsWith('guest:') && !guest.email) {
        user = await tx.user.update({ where: { id: guest.id }, data: { email, ...verifiedProfile } });
      } else {
        user = await tx.user.upsert({ where: { email }, create: { email, ...verifiedProfile, mobileNumber: 'email:' + crypto.randomUUID() }, update: verifiedProfile });
        if (guest?.mobileNumber.startsWith('guest:') && !guest.email) await tx.booking.updateMany({ where: { userId: guest.id }, data: { userId: user.id } });
      }
      return user;
    });
    if (!result) throw fail(400, 'Invalid or expired code. Request a new code after five failed attempts.');
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = result.id;
    req.session.emailAuthenticated = true;
    await save(req);
    res.json({ user: userDto(result) });
  });
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: userDto(req.user) }));
  app.post('/api/auth/logout', async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie('railgo.sid', { httpOnly: true, secure: production, sameSite: 'lax' });
    res.json({ loggedOut: true });
  });
}
