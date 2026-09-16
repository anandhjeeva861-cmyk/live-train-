# Email OTP login — Gmail or Resend

Click **Profile** to enter first name, date of birth, Indian mobile number and Gmail/email address. RailGo verifies that email with a six-digit code delivered through Gmail SMTP or Resend, then saves the profile and keeps the user in the same dialog. Both providers use the same browser-bound verification flow. The contact mobile number is not verified by email OTP, and does not merge or authenticate accounts.

Profile requests must include all four fields. Invalid dates, future birth dates and invalid Indian mobile numbers are rejected before sending. Pending details are visible only to the requesting browser, survive a page refresh with the session cookie, and cannot alter an existing profile until OTP verification succeeds. Consumed challenges clear temporary profile details. Cancelled challenges cannot be verified. The profile dialog supports editing details with another OTP, and logout clears its entered details.

## Gmail: local setup without buying a sender domain

1. Sign into the Gmail account that will send the codes. Enable [Google 2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification), then create an [App Password](https://myaccount.google.com/apppasswords) named RailGo. Use that 16-character password; your normal Google password will not work. Some managed or Advanced Protection accounts do not offer App Passwords; see [Google's requirements](https://support.google.com/accounts/answer/185833).
2. Run `npm run auth:setup` and open **http://127.0.0.1:4180/**. Enter the sender Gmail address and App Password only in this local page, then select **Verify sender & save**. The helper checks Google's SMTP login over TLS before saving only the email settings in the ignored `.env`. Existing database/session settings remain intact. The helper binds only to this computer, validates request origins and does not print passwords. Stop it with Ctrl+C when finished.
3. Run `npm run dev`, open **http://localhost:4174/** in this workspace (use the port printed by startup), click **Profile**, enter the four details and select **Send email OTP**. Enter the code from the actual inbox. Local email setting changes are read without restarting the dev launcher; reopen Profile after saving sender settings. Sender login verification alone does not prove inbox delivery; also check Spam.

For manual configuration or hosting, set these **privately on the backend**:

```dotenv
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_sender@gmail.com
SMTP_PASS=your_google_app_password
EMAIL_FROM=RailGo <your_sender@gmail.com>
```

Other authenticated SMTP providers can use port 465 (TLS) or 587 (required STARTTLS). Certificates are validated. Hosted environments load their own secrets; the local setup helper refuses production mode. SMTP/provider rejection never returns a successful send or leaves a usable code. Gmail account limits and delivery filtering still apply.

**The local setup does not update https://live-train-five.vercel.app/.** That site currently serves static files: its `/api/auth/config` returns HTML instead of the backend's JSON. Deploy the Node/SQLite backend on persistent hosting, configure the sender there, and set its HTTPS origin as `RAILGO_BACKEND_URL` in Vercel before redeploying. See [DEPLOYMENT.md](DEPLOYMENT.md#publish-email-login-from-this-repository). Adding SMTP credentials to this static Vercel project alone cannot send email.

## Resend alternative

1. In Resend, verify a sender domain and create an API key with sending permission. Use a sender address on that verified domain. Resend's default test sender has recipient restrictions, so use your verified domain for public login. See [Resend email API](https://resend.com/docs/api-reference/emails/send-email) and [domain setup](https://resend.com/docs/dashboard/domains/introduction).
2. Set these values privately in the backend `.env` (or backend hosting environment):

   ```dotenv
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=your_private_resend_key
   EMAIL_FROM=RailGo <login@your-verified-domain.com>
   SESSION_SECRET=YOUR_SESSION_SECRET
   ```

   Use a random session secret of at least 32 characters. Keep the real key out of `public/config.js`, screenshots, source control and chat. `npm run dev` already generates a session secret if it is missing.
3. Run `npm run auth:check`, then `npm run dev`. Startup generates Prisma Client and applies the additive email verification migration without deleting bookings.
4. Open the printed server URL, click Profile, enter first name, birth date, mobile and email, then select Send email OTP. Enter the code from your inbox and check Spam too. Successful verification shows the saved profile in the same dialog. Done closes it; Sign out ends the session.

Codes expire after ten minutes and permit five attempts. Resends have a sixty-second cooldown. Requests are also limited by IP. Codes are HMAC-hashed in the database, bound to the requesting browser and consumed once. They are never returned by the API, printed to logs, or accepted from a fixed development code. Reloading resumes an unexpired pending challenge. Resend replaces the old code. Restarting requires the same session secret to retain sessions and pending codes.

Bookings belong to the verified email account and can be recovered by signing in with the same email on another browser. Existing guest bookings are linked during verification when the browser still has its old guest cookie. Records without that cookie remain in the database; no ownership is inferred from passenger details. Existing email accounts retain their ID after email verification.

Vercel currently hosts a static preview, which cannot send email or persist authenticated sessions. Deploy the existing Node/SQLite backend on persistent hosting (see `DEPLOYMENT.md`), configure the chosen sender there, and set `RAILGO_BACKEND_URL` to that backend's HTTPS origin in Vercel build variables and GitHub Actions variables. The preview then redirects to the backend's login page, where sign-in works on the same origin. The optional `render.yaml` includes Gmail SMTP variables. No service is provisioned by these file edits.

Without email credentials, the server still starts and search works, but sign-in clearly reports unavailable. Automated tests intercept Resend and SMTP only inside the test process. Live inbox delivery needs your configured sender account and has not been verified by those tests.


If no OTP arrives:

- Run `npm run auth:check`. It lists missing settings for the selected `EMAIL_PROVIDER`. Resend needs `RESEND_API_KEY` and `EMAIL_FROM`; SMTP needs its host, port, user, password and sender. `.env.example` is a template; real values belong in the ignored `.env` or hosting secrets. Hosted changes require restarting/redeploying that backend.
- For Gmail, run `npm run auth:setup` and check the sender login. The App Password must belong to `SMTP_USER`; `EMAIL_FROM` should use that same address. If the Google password was changed, recreate its App Password. Hosting must allow outbound SMTP connections on port 465 or 587.
- Confirm you opened the server address printed by startup, not Live Server or a file preview. Run `npm run auth:check -- --url http://localhost:4173`, using your actual port, to check the running server.
- For public recipients, use a sender on your verified Resend domain. Resend's test sender is restricted; a Gmail recipient address is fine, but putting your Gmail address in `EMAIL_FROM` does not verify it as a sender domain.
- Check the backend's sanitized email error log and the Resend dashboard. A 401/403 usually requires checking the API key, sender/domain or recipient restrictions. An accepted API request can still bounce or go to spam; check the delivery event, inbox and spam folder.
- After a rejected delivery, the app permits retry without retaining the failed challenge's cooldown; the overall request rate limit still applies. Only the latest successfully sent code can be verified.
- A live frontend without a deployed backend cannot send OTP. Follow the repository-specific steps in [DEPLOYMENT.md](DEPLOYMENT.md#publish-email-login-from-this-repository).
