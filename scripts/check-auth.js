import 'dotenv/config';
import { emailSetupIssues, emailProvider, emailEnvironment } from '../backend/email.js';
const missing = emailSetupIssues();
const remoteCheck = process.argv.includes('--url');
const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
if (secret.length < 32) missing.push('SESSION_SECRET (at least 32 characters)');
if (!remoteCheck && missing.length) {
  console.error('Email login setup needed: ' + missing.join(', ') + '. Run npm run auth:setup for Gmail, or see AUTH_SETUP.md for Resend.');
  process.exitCode = 1;
} else if (!remoteCheck) {
  console.log(`Email login variables are present (${emailProvider(emailEnvironment())}). Verify an actual code from your inbox to confirm delivery.`);
}
if (remoteCheck) {
  const value = process.argv[process.argv.indexOf('--url') + 1];
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use a server origin such as http://localhost:4173');
    const response = await fetch(new URL('/api/auth/config', url), { signal: AbortSignal.timeout(10000), redirect: 'manual' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('This URL does not serve the email backend. Static GitHub Pages/Vercel output alone cannot deliver OTP.');
    const config = await response.json();
    if (typeof config.configured !== 'boolean') throw new Error('This URL returned an unexpected auth configuration.');
    console.log(config.configured ? 'Running backend: email variables are configured (delivery is not yet proven).' : 'Running backend: email settings are missing or invalid. Set them on that server and restart it.');
    if (!config.configured) process.exitCode = 1;
  } catch (error) {
    console.error('Backend check failed: ' + (error instanceof TypeError ? 'invalid URL or connection failed' : error.message));
    process.exitCode = 1;
  }
}
