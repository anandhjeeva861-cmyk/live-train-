import 'dotenv/config';
import { emailSetupIssues, emailProvider, emailEnvironment } from '../backend/email.js';
import { verifyBackend } from './verify-backend.js';
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
    const origins = process.argv.flatMap((argument, index) => argument === '--origin' ? [process.argv[index + 1]] : []);
    const checked = await verifyBackend(value, origins);
    console.log('Backend health, email configuration and session cookie retention passed.');
    for (const origin of checked.origins) console.log(`Credentialed CORS and OTP preflights passed for ${origin}.`);
    console.log('No email was sent. Verify an inbox code in each browser to confirm delivery and browser cookie support.');
  } catch (error) {
    console.error('Backend check failed: ' + (error instanceof TypeError ? 'invalid URL or connection failed' : error.message));
    process.exitCode = 1;
  }
}
