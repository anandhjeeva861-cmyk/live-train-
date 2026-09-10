import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
let ready = true;
for (const name of required) {
  const present = Boolean(process.env[name]?.trim());
  console.log(`${name}: ${present ? 'configured' : 'MISSING'}`);
  ready &&= present;
}
for (const name of ['DEV_OTP_MODE', 'DEV_GOOGLE_AUTH']) {
  const disabled = process.env[name] === 'false';
  console.log(`${name}: ${disabled ? 'disabled (real authentication)' : 'must be false for real authentication'}`);
  ready &&= disabled;
}
if (process.env.SMS_PROVIDER !== 'twilio-verify') { console.log('SMS_PROVIDER: must be twilio-verify'); ready = false; }
try {
  const callback = new URL(process.env.GOOGLE_CALLBACK_URL);
  const frontend = new URL(process.env.FRONTEND_URL);
  if (callback.origin !== frontend.origin || callback.pathname !== '/api/auth/google/callback' || callback.search || callback.hash || callback.username || callback.password || !['http:', 'https:'].includes(callback.protocol)) throw new Error();
  console.log('Callback and frontend origin: match');
} catch { ready = false; console.log('Callback and frontend origin: check configuration'); }
console.log(ready ? 'Configuration present. Provider account access and actual SMS/Google sign-in still require a live test.' : 'Real authentication is blocked until the missing configuration is added to local .env.');
process.exitCode = ready ? 0 : 1;
