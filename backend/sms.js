// Twilio Verify owns OTP generation and delivery. Codes and provider credentials
// never enter logs, responses or database rows.
export function createSmsProvider({ env = process.env, fetchImpl = (...args) => fetch(...args) } = {}) {
  const configured = () => env.SMS_PROVIDER === 'twilio-verify' &&
    Boolean(env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim() && env.TWILIO_VERIFY_SERVICE_SID?.trim());
  const unavailable = () => Object.assign(new Error('SMS verification is temporarily unavailable. Please try again later.'), { status: 503 });
  async function request(resource, fields, checking = false) {
    if (!configured()) throw unavailable();
    try {
      const response = await fetchImpl(`https://verify.twilio.com/v2/Services/${encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID.trim())}/${resource}`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID.trim()}:${env.TWILIO_AUTH_TOKEN.trim()}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });
      // Expired/consumed verification resources return 404; never approve them.
      if (checking && response.status === 404) return { status: 'expired' };
      if (!response.ok) throw unavailable();
      return await response.json();
    } catch { throw unavailable(); }
  }
  return {
    configured,
    async send(mobileNumber) {
      const result = await request('Verifications', { To: `+91${mobileNumber}`, Channel: 'sms' });
      if (result.status !== 'pending' || typeof result.sid !== 'string' || !result.sid) throw unavailable();
      return result.sid;
    },
    async verify(verificationId, code) {
      const result = await request('VerificationCheck', { VerificationSid: verificationId, Code: code }, true);
      return result.status === 'approved' && result.sid === verificationId;
    },
  };
}
