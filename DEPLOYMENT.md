# RailGo hosting and login

## Current diagnosis

The repository's GitHub Pages URL serves a browser demo. The linked Vercel URL returned `FUNCTION_INVOCATION_FAILED` (HTTP 500) on the homepage and auth/health endpoints during the audit. No production function logs or provider credentials were available. Local authentication configuration still lacks the three Twilio credentials and two Google credentials.

GitHub Pages serves static files, so pushing Express code does not start its server or database. See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Vercel Functions cannot persist this application's local SQLite file across invocations; see [Vercel's SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

## Publish the frontend

Existing branch-based GitHub Pages publishing remains supported: keep `main` and root selected in repository Settings → Pages. Generated `index.html` points at `public/`.

Alternatively, select **GitHub Actions** in Settings → Pages, then run **Publish RailGo Pages** manually in Actions. This workflow publishes only `dist/pages` browser assets. It is manual so it does not conflict with existing branch publishing. The separate **RailGo checks** workflow automatically tests pushes to main and pull requests.

`vercel.json` explicitly builds the same static frontend instead of attempting to run this SQLite backend as a serverless function. Its output can be previewed with `node scripts/stage-pages.js`. This addresses the unsupported deployment architecture; the exact previous function failure would require Vercel logs. Git-linked Vercel projects should redeploy on push; otherwise redeploy from their dashboard. This preview retains the visibly labelled browser demo until a real backend URL is configured. It is not real SMS or Google authentication.

## Host the full application

`render.yaml` is an optional Render Blueprint for a Node 24 web service with a persistent SQLite disk. Import this repository in Render → New → Blueprint. **It selects a paid starter service and persistent disk.** Review its cost in your account; no service has been provisioned by this change.

The blueprint installs dependencies and generates Prisma during build using a temporary build database path. At runtime it applies migrations, seeds missing catalog data and starts Express against `/var/data/railgo.db`. Render disks are available at runtime, not in build/pre-deploy commands. See [Render Express hosting](https://render.com/docs/deploy-node-express-app) and [persistent disks](https://render.com/docs/disks).

Set these values privately in the hosting dashboard:

- `FRONTEND_URL`: the service's exact HTTPS origin, without a trailing slash.
- `GOOGLE_CALLBACK_URL`: that origin plus `/api/auth/google/callback`; register this exact URI in Google Cloud too.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

The blueprint generates the session secret, enables the single reverse-proxy hop and disables both demo auth modes. Keep one app instance for SQLite. Back up the persistent disk. Follow [AUTH_SETUP.md](AUTH_SETUP.md) for provider setup; configure a six-digit Twilio Verify code.

After deployment, visit the backend's `/api/health`, then its `/login`. Complete actual SMS verification and Google's account chooser. Verify a booking survives a service restart. Configuration presence and mocked tests do not prove actual provider access.

Production tracking remains unavailable until an authorized railway feed is connected, as before. Local tracking is a simulation, and bookings are demo reservations, not issued railway tickets.

## Connect GitHub Pages / Vercel to the real app

After the backend health and login checks pass, put **only its public origin** in `public/config.js` as `apiBase`, commit and push. The frontend then opens that origin's `/login` page. Express already serves the same frontend; keeping login on one origin avoids cross-site cookie blocking and losing the OTP session during Google's callback. Do not put credentials in this public file. No backend URL was invented or configured during this audit.

For local use leave `apiBase` empty. Set your provider credentials in ignored `.env`, run `npm run auth:check`, then restart `npm run dev`. The current local address is `http://localhost:4174/login`.
