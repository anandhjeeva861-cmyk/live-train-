# Live Train deployment

Use one separately hosted HTTPS Node backend for both static frontends:

- Vercel: `https://live-train-five.vercel.app/`
- GitHub Pages: `https://anandhjeeva861-cmyk.github.io/live-train-/`

The entry point is **`server.js`**, started with **`npm start`**. Gmail delivery, OTP verification, accounts and SQLite sessions run there. GitHub Pages and Vercel serve browser files only. Nothing runs Node or SQLite on GitHub Pages or in Vercel Functions.

The owner reports local Gmail OTP working. These changes preserve the existing local `.env`. No service has been provisioned, secrets uploaded or remote deployment performed by these edits. Replace the example backend URL below with your actual service URL.

On 16 September 2026, a read-only check of both deployed `config.js` files found `apiBase` empty. Vercel's `/api/auth/config` returned HTML instead of JSON. The owner confirmed that no backend has been deployed. Both websites therefore need a persistent backend, its URL configured **and a new frontend deployment**. An empty public URL cannot be fixed by adding Gmail secrets to a frontend. Local `.env` settings are private and do not transfer through a GitHub push.

## 1. Deploy the backend on Render

Use a **paid Render Node Web Service with a persistent disk**. Free Render web services block SMTP ports 25/465/587 and cannot attach persistent disks. See [Render free service limits](https://render.com/docs/free).

Push the source changes without `.env`, credentials, database files or test output. In Render choose **New > Blueprint**, connect `anandhjeeva861-cmyk/live-train-` and use `render.yaml`. Review the paid service/disk cost before creating it. Enter the private sender settings when prompted. For manual creation, use:

| Setting | Value |
|---|---|
| Runtime / version | Node / 24 |
| Root directory / branch | Repository root / `main` |
| Compute | Paid `0.5c-512mb` or larger |
| Instances | **1**, no clustering or autoscaling |
| Persistent disk | 1 GB mounted at `/var/data` |
| Build command | `DATABASE_URL=file:./prisma/build.db npm ci --include=dev && DATABASE_URL=file:./prisma/build.db npx prisma generate` |
| Start command | `npx prisma migrate deploy && npx prisma db seed && npm start` |
| Health check | `/api/health` |

The disk exists at runtime, not during builds, so migrations and seeding belong in the start command. The temporary database URL applies to both dependency installation hooks and Prisma generation; neither needs access to `/var/data` during a build. These command-scoped overrides do not change the production `DATABASE_URL`. Seeding preserves accounts/tickets and skips an unchanged catalogue import. See [Render disks](https://render.com/docs/disks) and [Blueprint settings](https://render.com/docs/blueprint-spec).

### Backend environment variables

Set these **only on the backend**. Copy the working Gmail settings privately from local `.env` into Render's environment editor. Do not change the local file, commit credentials or paste them into chat. Do not copy the entire local `.env`: its local port, database and HTTP origin do not apply in production.

| Variable | Value |
|---|---|
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `file:/var/data/railgo.db` |
| `SESSION_SECRET` | Random secret, at least 32 characters; Blueprint generates it. Keep stable across restarts/deploys. |
| `TRUST_PROXY` | `true` for Render's HTTPS proxy |
| `SESSION_SAME_SITE` | `none` |
| `EMAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | Your existing sender Gmail address, entered privately |
| `SMTP_PASS` | That sender's existing Google App Password, entered privately |
| `EMAIL_FROM` | `Live Train <your_sender@gmail.com>` with the same sender |
| `ALLOWED_ORIGINS` | The exact comma-separated value below |

```text
https://live-train-five.vercel.app,https://anandhjeeva861-cmyk.github.io,http://localhost:4174,http://127.0.0.1:4174
```

Origins contain scheme, hostname and optional port, **not paths**. Do not put `/live-train-/` in CORS. Local ports 4173 and 4174 are also accepted by default. Add other localhost ports and any exact Vercel preview origin explicitly; wildcard origins are rejected. Only allow sites you control.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. Do not force production to local port 4174. Leave `FRONTEND_URL` unset on Render unless using a custom domain. Despite its historical name, that variable must be the **backend HTTPS origin** when set; the two frontend origins belong in `ALLOWED_ORIGINS`. Other hosting providers must set `FRONTEND_URL` to their backend origin. Do not copy the local HTTP value into production.

Gmail OTP requires no Resend, Google OAuth, Twilio, `JWT_SECRET` or OpenAI key. `RAILGO_BACKEND_URL` is a frontend build variable, unnecessary on the backend. The local Gmail setup helper refuses production and is not part of the hosted server.

### Check the deployed backend

Render provides a URL in the form **`https://<your-service-name>.onrender.com`**. Use the exact dashboard URL without `/api` or `/profile` when configuring the base URL. See [Render web service URLs](https://render.com/docs/web-services).

- `/api/health` must report `status: "ok"` and `database: "connected"`.
- `/api/auth/config` must report `configured: true`. This checks settings, not inbox delivery.
- Open `/profile`, enter your details and email, send an actual OTP and verify it before connecting the frontends. Check Spam too.
- Run the deployment check below. It checks database health, email configuration, credentialed CORS, JSON POST preflights for both OTP endpoints, cookie flags and session persistence. It creates and revokes temporary sessions, sends no email and prints no credentials:

```text
npm run auth:check -- --url https://<your-service-name>.onrender.com --origin https://live-train-five.vercel.app --origin https://anandhjeeva861-cmyk.github.io --origin http://localhost:4174
```

This command cannot detect a browser's third-party-cookie policy or prove Gmail delivery. The browser/inbox tests below remain necessary.

## 2. Connect Vercel

In **Vercel > Project > Settings > Environment Variables**, add:

```dotenv
RAILGO_BACKEND_URL=https://<your-service-name>.onrender.com
RAILGO_REQUIRE_EMAIL_LOGIN=true
```

Use the real backend origin. Apply to Production and any supported Preview environment, then **redeploy**. Each preview hostname must also appear in the backend's exact origin allowlist. Existing builds do not change when an environment variable changes. Vercel production/preview builds now refuse a missing URL automatically using `VERCEL_ENV`, even if `RAILGO_REQUIRE_EMAIL_LOGIN` was omitted or set to false. Local static previews remain available. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

`vercel.json` selects Other framework, install `npm ci --ignore-scripts`, build `npm run build:vercel`, output `dist/vercel`. The generated `dist/vercel/config.js` contains only the public backend URL. Do not add Gmail credentials to this static frontend project. Keep the internal `RAILGO_BACKEND_URL` name; visible branding is Live Train.

After redeploying, open `https://live-train-five.vercel.app/config.js` and confirm `apiBase` is your backend origin.

Before producing a hosted build, the build now checks backend health, email configuration, session cookies and credentialed CORS. Vercel's production domain is taken from `VERCEL_PROJECT_PRODUCTION_URL`; previews use `VERCEL_URL`. Enable Vercel's automatically exposed system environment variables. If using additional/custom domains, set `RAILGO_FRONTEND_ORIGINS` to their exact comma-separated HTTPS origins. Those same origins must be allowed on the backend. A failed check stops publication and explains the missing configuration; it sends no email. This check verifies configuration and session persistence, not real inbox delivery.

## 3. Connect GitHub Pages

1. In **GitHub > repository > Settings > Secrets and variables > Actions > Variables**, set repository variable **`RAILGO_BACKEND_URL`** to the **same HTTPS backend origin** as Vercel.
2. In **Settings > Pages**, choose **GitHub Actions**.
3. Run **Actions > Publish Live Train Pages > Run workflow** on `main`.

The workflow runs `node scripts/stage-pages.js`, requires a healthy backend with email settings and publishes only `dist/pages`. It checks CORS for the repository owner's `github.io` origin. For a custom Pages domain, also set repository variable `RAILGO_FRONTEND_ORIGINS`. It does not run a backend on Pages. After the initial setup, pushes to `main` publish automatically; manual publishing remains available. Missing backend configuration fails the deployment instead of silently publishing a site with disabled OTP.

After the workflow succeeds, open `https://anandhjeeva861-cmyk.github.io/live-train-/public/config.js` and confirm it has the same `apiBase` as Vercel. If it is still empty, check the repository **Actions variable**, selected workflow branch and Pages publishing source; editing a Vercel variable does not update Pages.

The generated `dist/pages/public/config.js` contains only:

```javascript
window.LIVE_TRAIN_CONFIG = {
  apiBase: "https://<your-service-name>.onrender.com"
};
```

This URL is public by design. No SMTP credentials, session secrets, App Passwords, codes or recipient data belong in config, browser storage or URLs. The source `public/config.js` stays empty; builds fill its published copy. Node serves its own `/config.js` with an empty API base to keep local and backend-hosted pages on their own origin.

For deliberate branch-based Pages publishing instead, set only `apiBase` in `public/config.js` to the same origin, run `npm run build:pages`, then publish. Actions variables do not affect branch publishing. Actions is the configured publishing path.

## 4. Cookies, endpoints and persistence

Both hosted frontends call the shared backend with `credentials: "include"`. CORS permits exact approved origins; the API rejects other-origin mutations. Production cookies use `HttpOnly; Secure; SameSite=None`; local HTTP retains `SameSite=Lax`. Render's proxy setting lets Express recognize HTTPS. Session tokens are not readable in frontend JavaScript. See [Express session options](https://expressjs.com/en/resources/middleware/session/) and [credentialed CORS](https://fetch.spec.whatwg.org/#cors-protocol-and-credentials).

Browsers may still block cross-site cookies. Before sending an OTP, the frontend creates a session with `POST /api/auth/session`, then checks it with `GET /api/auth/session`. If the cookie does not return, **Continue on secure Live Train** opens the same backend's `/profile`, where the cookie is first-party. In that case the user verifies and uses the app on the backend; the original static site cannot appear signed in through a blocked cookie. Cookie partitioning can also require separate sign-in from each frontend even though both share the same account database.

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/session` then `GET /api/auth/session` | Confirm cookie retention before sending |
| `GET /api/auth/config` | Sender status and this browser's pending OTP |
| `POST /api/auth/email/send` | `{ "email": "you@example.com", "profile": { "firstName": "Your name", "dateOfBirth": "1995-05-10", "mobileNumber": "your 10-digit number" } }` |
| `POST /api/auth/email/verify` | `{ "email": "you@example.com", "code": "six digits from inbox" }` with the same browser session |
| `POST /api/auth/email/cancel` | Cancel this browser's pending OTP |
| `GET /api/auth/me` | Verified profile |
| `POST /api/auth/logout` | Revoke session and cookie |

OTP codes are **not stored only in memory**. SQLite holds HMAC-hashed challenges, attempts, cooldowns, expiry, consumption and browser binding; its `Session` table holds sessions. The persistent disk and unchanged `SESSION_SECRET` preserve pending OTPs and authenticated sessions across restarts. Codes expire in 10 minutes, allow 5 attempts, have a 60-second resend cooldown and are single-use.

This is appropriate for **one backend process** shared by both frontends. IP request limits remain in memory and reset on restart; per-email cooldowns and OTP attempt limits persist. Before scaling to multiple processes/replicas, migrate to a shared database such as PostgreSQL and a shared rate-limit store such as Redis. Do not create independent SQLite files on replicas or use an ephemeral serverless filesystem. Maintain private, database-consistent SQLite backups and retain the signing secret for recovery. Disk deployments can briefly interrupt requests; retry after the health check recovers.

## 5. Test localhost, Vercel and Pages

1. **Localhost:** leave `.env` unchanged. Run `npm run dev`, open `http://localhost:4174/` (or printed port), select Profile, enter the four details and verify the inbox code. Refresh and sign out. Local API requests must remain on localhost.
2. **Vercel:** after redeployment, open `https://live-train-five.vercel.app/`. Browser Network should show `/api/auth/session`, `/api/auth/config`, `/api/auth/email/send` and `/api/auth/email/verify` targeting the actual HTTPS backend. Send and verify an inbox code, refresh and check Profile. The send response must never contain the code.
3. **Pages:** repeat at `https://anandhjeeva861-cmyk.github.io/live-train-/`. Use Profile or `#profile`; static Pages does not serve a Node `/profile` route. Both frontends must use exactly the same backend URL.
4. Wait 60 seconds between sends to the same address. A new code replaces the old one. Verify in the same browser/site that requested the code; check wrong/reused codes fail and logout works.
5. With third-party cookies blocked, use the secure Live Train link and complete verification on the backend. No privacy setting change is needed.
6. To test persistence, request a code on the backend, restart it and verify before the original 10-minute deadline. Confirm an authenticated profile survives another restart. Keep the disk and signing secret unchanged.

Automated checks require Node 24, Chromium/Chrome and OpenSSL:

```text
npm run check
npm run security:secrets
npm test
npm run test:email-setup
npm run test:hosted
npm run test:fullstack
npm run test:pages
npm run test:vercel
npm run build:vercel
node scripts/stage-pages.js
```

`test:hosted` uses isolated HTTPS domains, production cookies/CORS, test-only SMTP interception, separate SQLite files and process restarts. It checks both frontend layouts, OTP verification, profile refresh and cookie-blocking fallback. Tests neither send real mail nor change local credentials, and do not prove a remote service is configured.

The current audit passed 59 unit/API tests, email-setup, hosted HTTPS/restart, fullstack, assistant, Pages and Vercel browser suites, syntax/secret checks and both dependency-free static builds in a clean checkout. See [AUDIT.md](AUDIT.md) for the complete results. Local `.env` was preserved. Test origins are not deployed services: build with the real backend URL before publishing. Real hosted inbox delivery remains to be verified after provisioning.

## Troubleshooting

- **Missing URL at build:** set the public `RAILGO_BACKEND_URL` in that frontend's build environment and rebuild. It must be HTTPS with no credentials, path, query or fragment.
- **API returns HTML:** use the Node backend origin, not the Vercel/Pages frontend URL or a URL with `/api` appended.
- **403/CORS:** match browser `Origin` exactly to `ALLOWED_ORIGINS`; Pages has no repository path in its origin. Restart the backend after changing variables.
- **Cookies blocked:** follow the secure Live Train link. Do not put session tokens into public config, URLs or browser storage.
- **Gmail authentication fails:** the App Password must belong to `SMTP_USER`, and `EMAIL_FROM` should use that sender. Normal Google passwords do not work. App error responses do not reveal credentials.
- **SMTP timeout:** use hosting that permits outbound 465 or 587; free Render cannot run this setup. Check inbox/Spam after provider acceptance.
- **Lost state after deploy:** check the absolute database path is on the mounted disk and the signing secret has not changed. Do not regenerate the secret at each startup.

Live railway tracking and ticket issuing still require authorized providers. Catalogue/tourism limitations remain documented in `DATA_SOURCES.md`.
