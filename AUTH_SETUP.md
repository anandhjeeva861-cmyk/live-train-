# Real SMS OTP and Google login

Real authentication is implemented, but **both provider accounts must be configured**. No SMS/Google credentials were present when this change was made. Missing credentials never trigger a fake login or the fixed demo OTP. The local `.env` and fresh-install defaults now disable both demo modes.

## 1. Twilio Verify

1. Create your Twilio account at [Twilio Console](https://console.twilio.com/).
2. Create a **Verify Service** with the friendly name RailGo; configure **SMS** and a **6-digit code** (the UI accepts six digits).
3. Copy the **Account SID**, **Auth Token**, and **Verify Service SID** into your local `.env` using the empty fields below. Do not paste these values in chat or source files.
4. Ensure the account can send to your intended Indian mobile number; check trial recipient restrictions, account balance and Verify country permissions in the console. Actual delivery/account authorization is controlled by Twilio.

The backend starts an SMS verification and checks the entered code with Twilio. Twilio generates the real OTP; RailGo does not hard-code or store it. RailGo separately enforces five-minute local expiry, five attempts, browser binding and a 60-second resend delay. A failed or timed-out send cannot be verified. See [Twilio verification creation](https://www.twilio.com/docs/verify/api/verification) and [verification checks](https://www.twilio.com/docs/verify/api/verification-check).

## 2. Google OAuth

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a project.
2. Configure the Google Auth Platform consent screen: application name RailGo and your support/developer email. Configure the appropriate audience; while your app is in testing, add the Google accounts you will use as test users.
3. Create an **OAuth client**, application type **Web application**. An API key is not an OAuth client credential.
4. Add this exact **Authorized redirect URI** for the current checkout:

   `http://localhost:4174/api/auth/google/callback`

5. Copy **Client ID** and **Client secret** into `.env`.
6. Use `http://localhost:4174/login` consistently. Do not switch between `localhost` and `127.0.0.1`; their session cookies are different. If you change the port, update both `.env` URLs and the Google console redirect URI.

The backend requests only `openid email profile`, redirects to Google's account chooser, exchanges the authorization code on the server, validates the Google ID token and verifies email ownership. State and PKCE bind the callback to the current browser. The existing mobile → OTP → Google sequence is preserved. See [Google's web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server).

## 3. Local environment

Keep your existing database/session configuration. Fill only these authentication fields in local `.env`:

```dotenv
DEV_OTP_MODE=false
DEV_GOOGLE_AUTH=false
SMS_PROVIDER=twilio-verify
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4174/api/auth/google/callback
FRONTEND_URL=http://localhost:4174
PORT=4174
```

Empty values above are intentional, safe placeholders. Never commit `.env`. For hosted production, use HTTPS, set `NODE_ENV=production`, keep both demo flags false and set secrets in the hosting environment.

## 4. Check and start

```powershell
npm run auth:check
npm run dev
```

Stop an older RailGo dev server before starting another on the same port. `auth:check` prints only configured/missing statuses, never values. It confirms configuration presence and matching origins, not provider billing or live access. `npm run dev` applies the added OTP-provider migration automatically.

Open `/login`, enter your mobile, use the code received by SMS, and choose **Continue with Google**. You should see Google's account chooser, then RailGo's dashboard. Previously created demo profiles can upgrade to the verified Google account after real mobile verification, retaining their bookings. An already linked real account cannot be silently replaced by another Google account. Existing development sessions and OTP challenges are not accepted after switching to full real-auth mode.

Missing credentials show setup-unavailable messages. OAuth cancellation, wrong host, expired mobile verification, account conflicts and invalid state return to the login UI instead of a raw JSON error page. A failed Google attempt can be retried while the mobile verification is still valid.

Refreshing the page or reopening the login modal resumes the current browser's unexpired OTP challenge or verified Google step. A failed configuration request shows a connection retry instead of incorrectly reporting missing provider setup. For a GitHub/Vercel deployment, follow [DEPLOYMENT.md](DEPLOYMENT.md); real login needs the running Express service and its persistent database.

## Testing limits

Automated tests mock the Twilio transport and Google's token exchange. They verify provider requests, wrong/expired codes, failed sends, attempt limits, OAuth state/PKCE, callback replay, demo-profile upgrades and ownership conflicts. They do **not** prove SMS delivery or real Google account access. Those final checks require your configured accounts and an interactive sign-in. No SMS was sent or provider account created automatically.

For offline development only, explicitly set both demo flags to `true`; this re-enables OTP `123456` and the development Google profile. The GitHub Pages static demo remains separate from server authentication.
