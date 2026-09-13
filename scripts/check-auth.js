import 'dotenv/config';
const missing = ['RESEND_API_KEY', 'EMAIL_FROM'].filter(key => !process.env[key]?.trim());
const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || '';
if (secret.length < 32) missing.push('SESSION_SECRET (at least 32 characters)');
if (missing.length) {
  console.error('Email login setup needed: ' + missing.join(', ') + '. See AUTH_SETUP.md.');
  process.exitCode = 1;
} else {
  console.log('Email login variables are present. Live delivery still requires a valid Resend key and verified sender domain.');
}
