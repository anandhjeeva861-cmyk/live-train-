export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendLoginEmail(email, code) {
  if (!emailConfigured()) throw Object.assign(new Error('Email login is not configured. Please contact the site owner.'), { status: 503 });
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: 'Your RailGo login code',
        text: `Your RailGo verification code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.` }),
    });
    if (!response.ok || !(await response.json()).id) throw new Error('Delivery failed');
  } catch {
    throw Object.assign(new Error('Could not send the verification email. Please try again shortly.'), { status: 502 });
  }
}
