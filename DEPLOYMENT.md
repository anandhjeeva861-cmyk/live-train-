# RailGo deployment

## Vercel static frontend

vercel.json selects the Other framework, runs npm run build:vercel and publishes dist/vercel. The build copies browser assets to the output root and uses an absolute base path, so direct dashboard, booking and tracking URLs resolve assets correctly. Trailing slash URLs are normalized. The install command skips dependency lifecycle scripts because the static build does not use Prisma or native SQLite bindings.

Run npm run build:vercel to check the artifact. Run npm run test:vercel to verify the generated frontend at every configured route, including login-free booking and reload persistence. This test uses a local static server with the configured rewrites; it does not deploy to Vercel. Redeploy the project from Vercel to publish these changes. Remote deployment has not been performed by this local edit. See [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).

This is the labelled browser demo: bookings stay on the device and tracking is simulated. It requires no OTP or Google login. The local SQLite backend is not deployed as a Vercel Function; [Vercel SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) explains the storage limitation.

## GitHub Pages

Run npm run build:pages after editing public/index.html. Root index.html remains the generated Pages entry. The optional Pages workflow uses scripts/stage-pages.js and dist/pages, preserving repository-relative assets.

## Persistent backend

render.yaml describes an optional paid Node service with a persistent disk. No service is provisioned by editing the file. It generates Prisma during build, applies migrations and seeds the database at startup. Set FRONTEND_URL to its HTTPS origin. The blueprint provides SESSION_SECRET, DATABASE_URL and TRUST_PROXY. No Twilio or Google credentials are needed.

Set RESEND_API_KEY and EMAIL_FROM privately on the backend as described in AUTH_SETUP.md. Verified email accounts own bookings; keep the database and session secret across deployments. Verify /api/health and make a demo booking, then confirm it survives a restart. Use one SQLite app instance and back up the disk.

To connect the static frontend, put the backend's public origin in public/config.js as apiBase. Visitors then open that backend's /dashboard so cookies stay on one origin. Leave apiBase empty for standalone static mode.

Production railway tracking still needs an authorized feed. Bookings are demo reservations, not issued railway tickets.
