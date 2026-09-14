export function emailSetupIssues() {
  const issues = [];
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || /^(your_|placeholder)/i.test(key)) issues.push('RESEND_API_KEY');
  if (!from) issues.push('EMAIL_FROM');
  else if (!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from) && !/^[^<>\r\n]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(from)) issues.push('EMAIL_FROM (invalid sender address)');
  return issues;
}
export const emailConfigured = () => emailSetupIssues().length === 0;

export async function sendLoginEmail(email, code) {
  if (!emailConfigured()) throw Object.assign(new Error('Email login is not configured. Please contact the site owner.'), { status: 503 });
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM.trim(), to: [email], subject: 'Your RailGo login code',
        text: `Your RailGo verification code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.` }),
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
