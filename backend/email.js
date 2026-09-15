import nodemailer from 'nodemailer';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const emailKeys = ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
export function emailEnvironment() {
  const env = { ...process.env };
  // Local setup changes take effect without restarting the dev launcher, whose
  // children may inherit the previous empty values. Hosted/test environments
  // always retain their explicitly supplied configuration.
  if (!['production', 'test'].includes(env.NODE_ENV)) {
    try { const local = parse(readFileSync(new URL('../.env', import.meta.url))); for (const key of emailKeys) if (Object.hasOwn(local, key)) env[key] = local[key]; }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Could not read local email configuration.'); }
  }
  return env;
}
export const emailProvider = env => env.EMAIL_PROVIDER?.trim() || (env.SMTP_HOST?.trim() ? 'smtp' : 'resend');
export function emailSetupIssues(env = emailEnvironment()) {
  const issues = [];
  const key = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  const provider = emailProvider(env);
  if (provider === 'smtp') {
    if (!env.SMTP_HOST?.trim() || !/^[a-z0-9.-]+$/i.test(env.SMTP_HOST.trim())) issues.push('SMTP_HOST');
    if (![465, 587].includes(Number(env.SMTP_PORT || 465))) issues.push('SMTP_PORT (465 or 587)');
    if (!env.SMTP_USER?.trim()) issues.push('SMTP_USER');
    if (!env.SMTP_PASS?.trim() || /^(your_|placeholder)/i.test(env.SMTP_PASS)) issues.push('SMTP_PASS');
  } else if (provider !== 'resend') issues.push('EMAIL_PROVIDER (resend or smtp)');
  else if (!key || /^(your_|placeholder)/i.test(key)) issues.push('RESEND_API_KEY');
  if (!from) issues.push('EMAIL_FROM');
  else if (!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from) && !/^[^<>\r\n]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(from)) issues.push('EMAIL_FROM (invalid sender address)');
  return issues;
}
export const emailConfigured = () => emailSetupIssues().length === 0;

export function smtpTransport(env) {
  const port = Number(env.SMTP_PORT || 465);
  return nodemailer.createTransport({ host: env.SMTP_HOST.trim(), port, secure: port === 465, requireTLS: true,
    auth: { user: env.SMTP_USER.trim(), pass: env.SMTP_HOST.trim() === 'smtp.gmail.com' ? env.SMTP_PASS.replace(/\s/g, '') : env.SMTP_PASS },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, dnsTimeout: 5000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true });
}
export function smtpFailure(error) {
  return Object.assign(new Error(error.code === 'EAUTH'
    ? 'Email sender sign-in failed. Use a valid Gmail App Password, not your normal Google password.'
    : 'Could not deliver the verification email. Check the sender settings and connection, then retry.'), { status: 502 });
}

export async function sendLoginEmail(email, code, challengeId, env = emailEnvironment()) {
  if (emailSetupIssues(env).length) throw Object.assign(new Error('Email login is not configured. Please contact the site owner.'), { status: 503 });
  const message = { from: env.EMAIL_FROM.trim(), to: [email], subject: 'Your RailGo login code',
    text: `Your RailGo verification code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.` };
  if (emailProvider(env) === 'smtp') {
    const transport = smtpTransport(env);
    try {
      const sent = await transport.sendMail(message);
      if (!sent.accepted?.some(address => String(address).toLowerCase() === email.toLowerCase()) || sent.rejected?.length) throw new Error('Recipient not accepted');
      return;
    } catch (error) { throw smtpFailure(error); }
    finally { transport.close(); }
  }
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json', ...(challengeId && { 'Idempotency-Key': `login/${challengeId}` }) },
      body: JSON.stringify(message),
    });
  } catch {
    throw Object.assign(new Error('Could not send the verification email. Please try again shortly.'), { status: 502 });
  }
  const payload = await response.json().catch(() => ({}));
  if (response.ok && typeof payload.id === 'string' && payload.id) return;
  const configuration = [400, 401, 403, 422].includes(response.status);
  // Log only a fixed classification and HTTP status, never raw provider errors,
  // recipient addresses, authorization headers or verification codes.
  console.error(`Email delivery rejected: HTTP ${response.status}; ${configuration ? 'check Resend API key, verified sender and test-recipient restrictions' : 'check Resend availability or sending limits'}.`);
  throw Object.assign(new Error(configuration
    ? 'The email service rejected this request. The site owner must check the sender and email delivery configuration.'
    : 'The email service is temporarily unavailable or its sending limit was reached. Please try again later.'), { status: 502 });
}
