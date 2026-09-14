# RailGo deployment

## Vercel static frontend

vercel.json selects the Other framework, runs npm run build:vercel and publishes dist/vercel. The build copies browser assets to the output root and uses an absolute base path, so direct dashboard, booking and tracking URLs resolve assets correctly. Trailing slash URLs are normalized. The install command skips dependency lifecycle scripts because the static build does not use Prisma or native SQLite bindings.

Run npm run build:vercel to check the artifact. Run npm run test:vercel to verify the generated frontend at every configured route, including login-free booking and reload persistence. This test uses a local static server with the configured rewrites; it does not deploy to Vercel. Redeploy the project from Vercel to publish these changes. Remote deployment has not been performed by this local edit. See [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).

This is the labelled browser demo: bookings stay on the device and tracking is simulated. It requires no OTP or Google login. The local SQLite backend is not deployed as a Vercel Function; [Vercel SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) explains the storage limitation.

## GitHub Pages

Run npm run build:pages after editing public/index.html. Root index.html remains the generated Pages entry. The optional Pages workflow uses scripts/stage-pages.js and dist/pages, preserving repository-relative assets.

## Persistent backend

render.yaml describes an optional paid Node service with a persistent disk. No service is provisioned by editing the file. It generates Prisma during build, applies migrations and seeds the database at startup. The backend uses Render's RENDER_EXTERNAL_URL automatically. Set FRONTEND_URL only if using a custom domain. The blueprint provides SESSION_SECRET, DATABASE_URL and TRUST_PROXY. No Twilio or Google credentials are needed.

Set RESEND_API_KEY and EMAIL_FROM privately on the backend as described in AUTH_SETUP.md. Verified email accounts own bookings; keep the database and session secret across deployments. Verify /api/health and make a demo booking, then confirm it survives a restart. Use one SQLite app instance and back up the disk.

Set RAILGO_BACKEND_URL to the backend's public HTTPS origin in Vercel environment variables and in GitHub repository Actions variables. The build generates the public config; no credential is copied. Set RAILGO_REQUIRE_EMAIL_LOGIN=true so a missing backend URL fails the build. Visitors open the backend's /login; supported booking/tracking routes are preserved. Leave the URL empty only for the standalone static preview.

Production railway tracking still needs an authorized feed. Bookings are demo reservations, not issued railway tickets.


## Publish email login from this repository

1. Push the updated source (including render.yaml and scripts/hosting-config.js) to GitHub. No hosted service is created by a push alone.
2. In Render, choose New > Blueprint and connect `anandhjeeva861-cmyk/live-train-`. Use the repository's `render.yaml`. It defines a **paid Node service and persistent disk**; review Render's displayed cost before creating it. [Blueprint documentation](https://render.com/docs/blueprint-spec).
3. Supply `RESEND_API_KEY` and `EMAIL_FROM` privately when prompted. The blueprint generates the session secret, configures SQLite persistence, applies migrations and seeds the catalog. The default Render HTTPS origin is detected automatically. No private key goes in GitHub source or frontend variables.
4. Wait until the backend is live. Open its `/api/health` and confirm `database: connected`; `/api/auth/config` must report `configured: true`. Open its `/login` and verify a code delivered to your actual inbox. Configured does not prove inbox delivery: check Resend's delivery events if the message is absent.
5. In **Vercel > Project > Settings > Environment Variables**, set `RAILGO_BACKEND_URL` to the backend origin (HTTPS, no trailing path), and `RAILGO_REQUIRE_EMAIL_LOGIN=true`. Apply these to each deployed environment that should have email login. Redeploy so the build can read them. Setting Resend keys on this static frontend does not start an email backend.
6. In **GitHub > repository > Settings > Secrets and variables > Actions > Variables**, set the same two public variables. In **Settings > Pages**, choose GitHub Actions, then run **Publish RailGo Pages** from Actions. The workflow is manual; a normal push runs checks but does not publish Pages. If using branch-based Pages instead, set the public backend origin in `public/config.js` and push it; Actions build variables are not applied to branch publishing.
7. Visit both deployed homepages. They should open the backend `/login`. The `#login` fragment also opens the login form on standalone previews, without requiring GitHub Pages to serve a `/login` route. Sign in and check that refresh retains the session.

Local checks: `npm run auth:check -- --url http://localhost:4173` (use the actual printed port). For a deployed backend, pass its HTTPS origin instead. This command does not send an email or print credential values.

The standalone preview now always shows the email form and a visible Email login label on mobile. Its Send code button remains disabled until a backend is connected, with an explicit message that no code was sent. A frontend-only deploy is not a working email service.
