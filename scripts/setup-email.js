import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import { z } from 'zod';
import { smtpTransport, smtpFailure } from '../backend/email.js';

const defaultEnvFile = fileURLToPath(new URL('../.env', import.meta.url));
const senderSchema = z.object({ email: z.string().trim().toLowerCase().max(254).email(), password: z.string().max(100).transform(value => value.replace(/\s/g, '')).pipe(z.string().regex(/^[a-zA-Z0-9]{16}$/)) });
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function gmailEnvironment(input) {
  const result = senderSchema.safeParse(input);
  if (!result.success) throw Object.assign(new Error('Enter your Gmail address and the 16-character App Password from Google.'), { status: 400 });
  const { email, password } = result.data;
  if (!/@(?:gmail|googlemail)\.com$/.test(email)) throw Object.assign(new Error('Use a personal Gmail address for this setup. Other SMTP senders can be configured in .env.'), { status: 400 });
  return { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: email, SMTP_PASS: password, EMAIL_FROM: `RailGo <${email}>` };
}

export async function saveEmailEnvironment(envFile, settings) {
  let source = '';
  try { source = await readFile(envFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const keys = new Set(Object.keys(settings));
  const retained = source.split(/\r?\n/).filter(line => !keys.has(line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=/)?.[1])).join('\n').trimEnd();
  // Values are validated, single-line strings. Quote them for dotenv, never a shell.
  const updated = Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
  const temporary = `${envFile}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${retained}\n${updated}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, envFile);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

function page(token, loginUrl, message = '', saved = false) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RailGo — Email setup</title>
  <style>body{font:16px/1.6 system-ui,sans-serif;background:#f0f5fa;color:#102750;margin:0;padding:32px 16px}main{max-width:640px;margin:auto;background:white;padding:28px;border-radius:18px;box-shadow:0 12px 40px #16335718}h1{line-height:1.2}a{color:#075ecb}label{display:block;margin-top:18px;font-weight:600}input{box-sizing:border-box;display:block;width:100%;padding:12px;border:1px solid #8eacc8;border-radius:8px;font:inherit}button,.button{display:inline-block;margin-top:20px;background:#075ecb;color:white;padding:12px 18px;border:0;border-radius:8px;font:inherit;font-weight:600;text-decoration:none}small{display:block;color:#4b6179}.message{padding:14px;background:${saved ? '#e3f7e9' : '#fff1ea'};border-radius:8px}code{overflow-wrap:anywhere}</style>
  <main><small>RAILGO · LOCAL EMAIL SETUP</small><h1>${saved ? 'Gmail sender connected' : 'Connect Gmail for OTP'}</h1>
  ${message ? `<p class="message" role="status">${escape(message)}</p>` : ''}
  ${saved ? `<p>The SMTP server accepted your sender login. Open RailGo, send a code to your email, and verify the code from your inbox to finish testing delivery.</p><a class="button" href="${escape(loginUrl)}">Open RailGo email login</a>` : `<p>உங்கள் Gmail மூலம் verification code அனுப்ப இந்த setup-ஐ முடிக்கவும்.</p><ol><li>Turn on <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer">Google 2-Step Verification</a>.</li><li>Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Google App Passwords</a>, create one named RailGo, and enter it below. <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">Google setup help</a></li></ol>
  <form method="post" action="/configure"><input type="hidden" name="token" value="${token}"><label>Sender Gmail address<input type="email" name="email" autocomplete="username" maxlength="254" required></label><label>Google App Password<input type="password" name="password" autocomplete="new-password" maxlength="100" required aria-describedby="password-help"></label><small id="password-help">Use the 16-character App Password. Keep it out of chat and screenshots.</small><button type="submit">Verify sender &amp; save</button></form><p>Credentials are sent to Google over TLS to check the sender login, then saved in this project's private <code>.env</code>. This page is available only on this computer. No email is sent by this setup check.</p>`}
  <hr><h2>For your Vercel website</h2><p>This connects the local app only. The public website also needs the Node backend on persistent hosting. Set these same email settings privately on that backend, then set <code>RAILGO_BACKEND_URL</code> to its HTTPS origin in Vercel and redeploy. Follow <code>DEPLOYMENT.md</code> in the project. Never put the App Password in public/config.js.</p></main></html>`;
}

export function createEmailSetup({ envFile = defaultEnvFile, transportFactory = smtpTransport, loginUrl = 'http://localhost:4174/login', nodeEnv = process.env.NODE_ENV } = {}) {
  if (nodeEnv === 'production') throw new Error('Email setup is local only. Configure production secrets in the hosting dashboard.');
  const app = express(), token = randomBytes(32).toString('hex');
  let busy = false, lastAttempt = 0;
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = `127.0.0.1:${req.socket.localPort}`;
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || req.get('host') !== host) return res.status(403).send('Open this setup using its printed 127.0.0.1 address.');
    if (req.method !== 'GET' && req.get('origin') !== `http://${host}`) return res.status(403).send('Open the local setup page and submit its form.');
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '4kb' }));
  app.get('/', (_req, res) => res.type('html').send(page(token, loginUrl)));
  app.post('/configure', async (req, res) => {
    const provided = typeof req.body?.token === 'string' ? req.body.token : '';
    if (Buffer.byteLength(provided) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(provided), Buffer.from(token))) return res.status(403).send('Reload the setup page before saving.');
    if (busy || Date.now() - lastAttempt < 5000) return res.status(429).type('html').send(page(token, loginUrl, 'Please wait a few seconds before trying again.'));
    let settings;
    try { settings = gmailEnvironment(req.body); }
    catch (error) { return res.status(400).type('html').send(page(token, loginUrl, error.message)); }
    busy = true; lastAttempt = Date.now();
    let transport;
    try {
      transport = transportFactory(settings);
      await transport.verify();
      await saveEmailEnvironment(envFile, settings);
      res.type('html').send(page(token, loginUrl, 'Saved locally. Open RailGo and check an actual OTP email next.', true));
    } catch (error) {
      const message = ['EACCES', 'EPERM', 'ENOSPC'].includes(error.code) ? 'Could not save the local .env file. Check file permissions and available space.' : smtpFailure(error).message;
      res.status(502).type('html').send(page(token, loginUrl, message));
    } finally { transport?.close(); busy = false; }
  });
  app.use((_error, _req, res, _next) => res.status(400).send('Invalid setup request. Reload the local setup page.'));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let local = {};
  try { local = parse(await readFile(defaultEnvFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.AUTH_SETUP_PORT || 4180);
  const appPort = Number(local.PORT || process.env.PORT || 4173);
  if (![port, appPort].every(value => Number.isInteger(value) && value >= 1 && value <= 65535)) throw new Error('Invalid local port.');
  const app = createEmailSetup({ nodeEnv: process.env.NODE_ENV || local.NODE_ENV, loginUrl: `http://localhost:${appPort}/login` });
  const server = app.listen(port, '127.0.0.1', () => console.log(`RailGo email setup: http://127.0.0.1:${port}/\nEnter the App Password only in that local page. Press Ctrl+C to close setup.`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Email setup port is already in use. Use the existing setup page or set AUTH_SETUP_PORT.' : 'Could not start the local email setup page.'); process.exitCode = 1; });
}
