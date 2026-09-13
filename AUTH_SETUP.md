# Email OTP login with Resend

RailGo signs users in with their email address and a six-digit code sent by Resend. Mobile verification and Google login remain removed.

1. In Resend, verify a sender domain and create an API key with sending permission. Use a sender address on that verified domain. Resend's default test sender has recipient restrictions, so use your verified domain for public login. See [Resend email API](https://resend.com/docs/api-reference/emails/send-email) and [domain setup](https://resend.com/docs/dashboard/domains/introduction).
2. Set these values privately in the backend `.env` (or backend hosting environment):

   ```dotenv
   RESEND_API_KEY=your_private_resend_key
   EMAIL_FROM=RailGo <login@your-verified-domain.com>
   SESSION_SECRET=YOUR_SESSION_SECRET
   ```

   Use a random session secret of at least 32 characters. Keep the real key out of `public/config.js`, screenshots, source control and chat. `npm run dev` already generates a session secret if it is missing.
3. Run `npm run auth:check`, then `npm run dev`. Startup generates Prisma Client and applies the additive email verification migration without deleting bookings.
4. Open the printed server URL with `/login`, enter your email, click Send code, and enter the code from your inbox. Check spam too. Successful verification opens the dashboard. Profile displays your email and a Sign out button.

Codes expire after ten minutes and permit five attempts. Resends have a sixty-second cooldown. Requests are also limited by IP. Codes are HMAC-hashed in the database, bound to the requesting browser and consumed once. They are never returned by the API, printed to logs, or accepted from a fixed development code. Reloading resumes an unexpired pending challenge. Resend replaces the old code. Restarting requires the same session secret to retain sessions and pending codes.

Bookings belong to the verified email account and can be recovered by signing in with the same email on another browser. Existing guest bookings are linked during verification when the browser still has its old guest cookie. Records without that cookie remain in the database; no ownership is inferred from passenger details. Existing email accounts retain their ID after email verification.

Vercel currently hosts a static preview, which cannot send email or persist authenticated sessions. Deploy the existing Node/SQLite backend on persistent hosting (see `DEPLOYMENT.md`), configure Resend there, and set `apiBase` in `public/config.js` to that backend's HTTPS origin. The preview then redirects to the backend's dashboard, where sign-in works on the same origin. The optional `render.yaml` includes the two email environment variables. No service is provisioned by these file edits.

Without email credentials, the server still starts and search works, but sign-in clearly reports unavailable. Automated tests intercept the Resend request with a test-only fixture; live email delivery needs your configured Resend account and has not been verified by those tests.
