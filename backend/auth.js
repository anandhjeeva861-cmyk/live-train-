import session from 'express-session';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { prisma, writeTransaction } from './db.js';

export const production = process.env.NODE_ENV === 'production';
export const devOtp = !production && process.env.DEV_OTP_MODE === 'true';
export const devGoogle = !production && process.env.DEV_GOOGLE_AUTH === 'true';
export const fail = (status, message) => Object.assign(new Error(message), { status });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

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
  if (production && (!secret || secret.length < 32 || devOtp || devGoogle || process.env.DEV_OTP_MODE === 'true' || process.env.DEV_GOOGLE_AUTH === 'true')) {
    throw new Error('Production requires a strong SESSION_SECRET and development authentication flags disabled.');
  }
  // Generated only in process memory, never written to examples or logs.
  return session({ name: 'railgo.sid', secret: secret || crypto.randomBytes(48).toString('base64url'),
    store: new DatabaseSessions(), resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 7 * 86400000 },
  });
}

export async function requireAuth(req, _res, next) {
  if (!req.session.userId) throw fail(401, 'Sign in to continue.');
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
  if (!user) throw fail(401, 'Sign in to continue.');
  req.user = user;
  next();
}

const phoneSchema = z.string().transform(value => value.replace(/^\+91/, '')).pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid Indian 10-digit mobile number.'));
const save = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));

export function registerAuth(app) {
  const limit = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many login attempts. Try again later.' } });
  app.use('/api/auth', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/auth/config', (_req, res) => res.json({ devOtp, devGoogle, development: !production }));
  app.post('/api/auth/send-otp', limit, async (req, res) => {
    const mobileNumber = phoneSchema.parse(req.body?.mobileNumber);
    if (!devOtp) throw fail(503, 'SMS delivery is not configured. Contact the operator.');
    const otpHash = await bcrypt.hash('123456', 12);
    const challenge = await writeTransaction(async tx => {
      const existing = await tx.otpVerification.findUnique({ where: { mobileNumber } });
      if (existing && Date.now() - existing.createdAt.getTime() < 60_000) throw fail(429, 'Wait 60 seconds before requesting another OTP.');
      const data = { id: crypto.randomUUID(), otpHash, expiresAt: new Date(Date.now() + 5 * 60_000), attempts: 0, verified: false, createdAt: new Date() };
      return tx.otpVerification.upsert({ where: { mobileNumber }, create: { mobileNumber, ...data }, update: data });
    });
    delete req.session.verifiedMobile;
    delete req.session.oauthState;
    req.session.challengeId = challenge.id;
    await save(req);
    res.json({ sent: true, development: true, expiresIn: 300, resendAfter: 60 });
  });
  app.post('/api/auth/verify-otp', limit, async (req, res) => {
    const mobileNumber = phoneSchema.parse(req.body?.mobileNumber);
    const otp = z.string().regex(/^\d{6}$/, 'Enter six OTP digits.').parse(req.body?.otp);
    const record = await prisma.otpVerification.findUnique({ where: { mobileNumber } });
    if (!record || record.id !== req.session.challengeId) throw fail(400, 'Request an OTP in this browser first.');
    const claim = await prisma.otpVerification.updateMany({ where: { id: record.id, verified: false, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
    if (!claim.count) throw fail(400, 'OTP expired, already used, or attempt limit reached. Request another OTP.');
    if (!await bcrypt.compare(otp, record.otpHash)) throw fail(400, 'Incorrect OTP.');
    const consume = await prisma.otpVerification.updateMany({ where: { id: record.id, verified: false, expiresAt: { gt: new Date() } }, data: { verified: true } });
    if (!consume.count) throw fail(400, 'OTP already used.');
    await regenerate(req);
    req.session.verifiedMobile = mobileNumber;
    req.session.verifiedUntil = Date.now() + 10 * 60_000;
    await save(req);
    res.json({ verified: true, next: '/api/auth/google', development: devOtp });
  });
  function verifiedMobile(req) {
    if (!req.session.verifiedMobile || req.session.verifiedUntil < Date.now()) throw fail(401, 'Verify your mobile OTP before Google login.');
    return req.session.verifiedMobile;
  }
  async function finish(req, profile) {
    const mobileNumber = verifiedMobile(req);
    const user = await writeTransaction(async tx => {
      const linked = await tx.user.findFirst({ where: { OR: [{ googleId: profile.googleId }, ...(profile.email ? [{ email: profile.email }] : [])] } });
      if (linked && linked.mobileNumber !== mobileNumber) throw fail(409, 'This Google account is linked to a different mobile number.');
      const mobileUser = await tx.user.findUnique({ where: { mobileNumber } });
      if (mobileUser?.googleId && mobileUser.googleId !== profile.googleId) throw fail(409, 'Use the Google account linked to this mobile number.');
      return tx.user.upsert({ where: { mobileNumber }, create: { mobileNumber, mobileVerified: true, ...profile }, update: { mobileVerified: true, ...profile } });
    });
    await regenerate(req);
    req.session.userId = user.id;
    await save(req);
  }
  const oauth = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_CALLBACK_URL);
  app.get('/api/auth/google', limit, async (req, res) => {
    const mobile = verifiedMobile(req);
    if (devGoogle) {
      await finish(req, { googleId: `development:${mobile}`, email: null, name: 'Demo Traveller', avatar: null });
      return res.redirect('/dashboard');
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) throw fail(503, 'Google OAuth is not configured.');
    req.session.oauthState = crypto.randomBytes(32).toString('hex');
    const { codeVerifier, codeChallenge } = await oauth().generateCodeVerifierAsync();
    req.session.codeVerifier = codeVerifier;
    await save(req);
    res.redirect(oauth().generateAuthUrl({ scope: ['openid', 'email', 'profile'], state: req.session.oauthState, code_challenge: codeChallenge, code_challenge_method: 'S256', prompt: 'select_account' }));
  });
  app.get('/api/auth/google/callback', limit, async (req, res) => {
    verifiedMobile(req);
    if (typeof req.query.state !== 'string' || !req.session.oauthState || req.query.state !== req.session.oauthState) throw fail(400, 'Invalid OAuth state. Restart sign-in.');
    delete req.session.oauthState;
    const codeVerifier = req.session.codeVerifier;
    delete req.session.codeVerifier;
    await save(req);
    if (req.query.error || typeof req.query.code !== 'string') return res.redirect('/login?error=google');
    try {
      const client = oauth();
      const { tokens } = await client.getToken({ code: req.query.code, codeVerifier });
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email_verified) throw fail(401, 'Google email must be verified.');
      await finish(req, { googleId: profile.sub, email: profile.email, name: profile.name || 'Traveller', avatar: profile.picture || null });
      res.redirect('/dashboard');
    } catch (error) { if (error.status) throw error; throw fail(502, 'Google login failed. Restart sign-in.'); }
  });
  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user, development: devGoogle }));
  app.post('/api/auth/logout', async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie('railgo.sid', { httpOnly: true, secure: production, sameSite: 'lax' });
    res.json({ loggedOut: true });
  });
}
