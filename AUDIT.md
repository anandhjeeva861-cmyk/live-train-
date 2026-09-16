# Project audit — 16 September 2026

## Hosted OTP root cause

The owner confirmed that the Node backend has never been deployed. Read-only checks found empty `apiBase` in both public configuration files:

- `https://live-train-five.vercel.app/config.js`
- `https://anandhjeeva861-cmyk.github.io/live-train-/public/config.js`

The Vercel `/api/auth/config` URL returned HTTP 200 with an HTML page, not the JSON authentication API. Both sites publish static assets; localhost runs `server.js`, SQLite and the privately configured Gmail sender. Local `.env` is correctly excluded from Git and is not copied to hosted environments.

GitHub Pages serves static sites. Vercel Functions cannot retain this application's local SQLite file across deployments/instances. The existing supported architecture is one persistent HTTPS Node backend shared by both frontends. See [GitHub publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [Vercel SQLite documentation](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

**External setup remains required:** create the persistent backend, privately configure its email sender, set `RAILGO_BACKEND_URL` on Vercel and GitHub Actions, choose GitHub Actions as the Pages source, then redeploy. [DEPLOYMENT.md](DEPLOYMENT.md) contains the exact commands and variables. No service was provisioned, secrets uploaded, code pushed or remote deployment performed during this audit. Automated provider interception does not establish real hosted email delivery.

## Bugs fixed

| Finding | Result |
|---|---|
| Hosted builds accepted a syntactically valid URL even when it pointed to a static page, unhealthy backend, unconfigured sender or broken session setup | Required hosted builds now check health, JSON responses, email settings, session cookies and applicable frontend CORS before publishing. No OTP is sent by the check. |
| GitHub Pages workflow ran only manually, so pushing fixes could leave the published version unchanged | The Actions workflow now also deploys pushes to `main`; initial backend/Pages settings are still required. |
| `npm run check` required the untracked `data/` directory, which is absent from a clean checkout | Syntax checking now visits the actual versioned source directories. |
| Repeated builds copied files over old output, retaining deleted assets | Each build clears only its validated output directory inside `dist/` before copying assets. |
| Session `touch()` rewrote stale session data and could recreate a session deleted during logout | Touch updates only the expiry of an existing record; expired sessions are periodically pruned on writes. Regression checks cover newer OTP challenges and deleted sessions. |
| Browser cookie support was cached for the lifetime of the page | Auth requests now reuse only simultaneous probes and recheck cookie retention. A changed cookie policy prevents email delivery and offers the backend Profile link. |
| Partial weather data displayed `NaN`, `undefined` or null as a zero reading; stale route work could change the weather heading | Missing values stay unavailable, and outdated route work is ignored before changing weather UI. |
| Empty/whitespace weather coordinates became zero in the static API | Static and Node APIs reject blank coordinates; the static API also supports the documented `lon` alias. |
| Tourism filters left old map markers selectable while a new request was pending | Old spots/markers are cleared and pagination is disabled until fresh results arrive. |

## Scope and verification

Reviewed server routing, origin checks, session/OTP persistence, provider errors, profile validation, database migrations/import, booking ownership/transactions, public data/search/tourism, browser API/auth flows, weather rendering, build scripts, CI and hosting configuration. Legacy booking/tracking fixtures remain for regression coverage; public production routes do not issue synthetic railway tickets or GPS positions.

Baseline: 57 automated tests passed. After the fixes:

| Check | Result |
|---|---|
| `npm test` | 59 passed, including session race, deployment gate and weather validation regressions |
| `npm run test:hosted` | 2 passed: HTTPS frontends, changed/blocked cookies and OTP/session persistence across backend restart |
| `npm run test:fullstack` | Passed desktop/mobile profile verification, catalogue, tourism and partial/stale weather checks |
| `npm run test:browser` | Passed assistant actions, speech lifecycle, errors and responsive layout |
| `npm run test:pages` / `npm run test:vercel` | Both passed, including repository-relative assets and configured page routes |
| `npm run test:email-setup` | 13 passed; sender setup, provider errors and private credential handling |
| `npm run check` | 67 JavaScript files passed |
| Clean checkout without `.env`, `data/` or `node_modules/` | Syntax check and both static build scripts passed; a second build removed an obsolete marker asset |
| Production build without a backend URL | Correctly failed before producing a new deployment |
| `npm run security:secrets` / `git diff --check` | Passed |
| `npm audit --json` | Zero reported vulnerabilities |

Tests use isolated databases and intercepted email delivery, preserving the local sender configuration and user database. Browser tests simulate hosting locally; they do not prove that live Vercel/Pages OTP has been enabled. No real verification email was sent during this audit.

## Cleanup

Removed the obsolete `CLINE_PROMPT.md` task prompt. Moved the three unreferenced root preview screenshots (`desktop-preview.png`, `login-preview.png`, `mobile-preview.png`) out of versioned source into ignored `test-results/unused-previews/`, keeping them recoverable. The tracked project no longer includes these four obsolete files. Generated test artifacts remain ignored; no disk-space reclamation is claimed.

Source datasets, migrations, vendor licenses, local `.env`, application databases and recovery backups are retained. `PROJECT_AUDIT.md` is retained as historical context; this document describes the current audit.
