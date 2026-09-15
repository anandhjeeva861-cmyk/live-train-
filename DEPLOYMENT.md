# RailGo deployment

## Vercel static frontend

vercel.json selects the Other framework, runs npm run build:vercel and publishes dist/vercel. The build copies browser assets to the output root and uses an absolute base path, so direct dashboard, booking and tracking URLs resolve assets correctly. Trailing slash URLs are normalized. The install command skips dependency lifecycle scripts because the static build does not use Prisma or native SQLite bindings.

Run npm run build:vercel to check the artifact. Run npm run test:vercel to verify public catalogue data and unavailable email login at every configured route. This test uses a local static server with the configured rewrites; it does not deploy to Vercel. Remote deployment has not been performed by this local edit. See [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).

This is the public catalogue snapshot: route searches, attributed photographs and Google Maps links work without login. It does not simulate bookings or moving trains. The local SQLite backend is not deployed as a Vercel Function; [Vercel SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) explains the storage limitation.

## GitHub Pages

Run npm run build:pages after editing public/index.html. Root index.html remains the generated Pages entry. The optional Pages workflow uses scripts/stage-pages.js and dist/pages, preserving repository-relative assets.

## Persistent backend

render.yaml describes an optional paid Node service with a persistent disk. No service is provisioned by editing the file. It generates Prisma during build, applies migrations and seeds the database at startup. The backend uses Render's RENDER_EXTERNAL_URL automatically. Set FRONTEND_URL only if using a custom domain. The blueprint provides SESSION_SECRET, DATABASE_URL and TRUST_PROXY. No Twilio or Google credentials are needed.

Configure Gmail SMTP or Resend privately on the backend as described in AUTH_SETUP.md. The blueprint defaults to Gmail: supply SMTP_USER, SMTP_PASS (Google App Password) and EMAIL_FROM with the same sender address. For Resend instead, set EMAIL_PROVIDER=resend and RESEND_API_KEY with a verified EMAIL_FROM; unused SMTP settings may be removed. Keep the database and session secret across deployments. Verify /api/health and actual inbox OTP delivery, then confirm the account survives a restart. The catalogue importer preserves accounts and existing tickets, backs up the database and replaces unowned mock records. Use one SQLite app instance and back up the persistent disk.

Set RAILGO_BACKEND_URL to the backend's public HTTPS origin in Vercel environment variables and in GitHub repository Actions variables. The build generates the public config; no credential is copied. Set RAILGO_REQUIRE_EMAIL_LOGIN=true so a missing backend URL fails the build. Visitors open the backend's /login; supported booking/tracking routes are preserved. Leave the URL empty only for the standalone static preview.

Live railway tracking and ticket issuing need authorized providers. Public timetable records show no fabricated fares, inventory or live positions. Ticket actions open IRCTC and status actions open NTES. See DATA_SOURCES.md for archive dates and coverage.


## Publish email login from this repository

1. Push the updated source (including render.yaml and scripts/hosting-config.js) to GitHub. No hosted service is created by a push alone.
2. In Render, choose New > Blueprint and connect `anandhjeeva861-cmyk/live-train-`. Use the repository's `render.yaml`. It defines a **paid Node service and persistent disk**; review Render's displayed cost before creating it. [Blueprint documentation](https://render.com/docs/blueprint-spec).
3. Supply `SMTP_USER` (sender Gmail address), `SMTP_PASS` (Google App Password) and `EMAIL_FROM` (`RailGo <same_sender@gmail.com>`) privately when prompted. See [AUTH_SETUP.md](AUTH_SETUP.md) to create the App Password. The blueprint generates the session secret, configures SQLite persistence, applies migrations and seeds the catalog. The default Render HTTPS origin is detected automatically. No private key goes in GitHub source or frontend variables. A hosting plan must allow outbound SMTP; the blueprint already uses a paid persistent service. For Resend, change the blueprint's email variables to `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` before creating the service.
4. Wait until the backend is live. Open its `/api/health` and confirm `database: connected`; `/api/auth/config` must report `configured: true`. Open its `/login` and verify a code delivered to your actual inbox. Configured does not prove inbox delivery: check Spam and the sender/provider settings if the message is absent.
5. In **Vercel > Project > Settings > Environment Variables**, set `RAILGO_BACKEND_URL` to the backend origin (HTTPS, no trailing path), and `RAILGO_REQUIRE_EMAIL_LOGIN=true`. Apply these to each deployed environment that should have email login. Redeploy so the build can read them. Setting Resend keys on this static frontend does not start an email backend.
6. In **GitHub > repository > Settings > Secrets and variables > Actions > Variables**, set the same two public variables. In **Settings > Pages**, choose GitHub Actions, then run **Publish RailGo Pages** from Actions. The workflow is manual; a normal push runs checks but does not publish Pages. If using branch-based Pages instead, set the public backend origin in `public/config.js` and push it; Actions build variables are not applied to branch publishing.
7. Visit both deployed homepages. They should open the backend `/login`. The `#login` fragment also opens the login form on standalone previews, without requiring GitHub Pages to serve a `/login` route. Sign in and check that refresh retains the session.

Local checks: `npm run auth:check -- --url http://localhost:4173` (use the actual printed port). For a deployed backend, pass its HTTPS origin instead. This command does not send an email or print credential values.

The standalone preview now always shows the email form and a visible Email login label on mobile. Its Send code button remains disabled until a backend is connected, with an explicit message that no code was sent. A frontend-only deploy is not a working email service.
