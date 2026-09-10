# RailGo project audit

## Inspected architecture

Express 5 serves an existing HTML/CSS/vanilla JavaScript application. `app.js` owns search, checkout, maps, weather and bookings; `design.js` owns the Vande Bharat dashboard and login modal; `tracking-ui.js` adds the fleet directory and map controls. The Tamil/English assistant and the separate GitHub Pages browser demo share catalog, command and simulation modules. Existing local images and responsive styles are retained.

## Existing working features

- 1,209 demo trains, 36 stations, route/class filters, tourism cards.
- Haversine route interpolation, station dwell periods, stable simulated ETA, SSE and marker animation.
- Leaflet route layer cleanup, recenter/follow/full-route controls, stale-data indicator.
- Open-Meteo proxy with ten-minute cache; local dashboard hero and destination images.
- Seat checkout, JSON PNR persistence, assistant and static Pages demo tests.

## Bugs and missing work found before implementation

- Authentication only sets a browser flag; OTP is checked in public JavaScript and Google is a placeholder.
- Bookings are shared across all visitors, without authorization, passengers, transactional inventory or cancellation.
- JSON read/modify/write can lose concurrent bookings; duplicate seats and invalid calendar dates are accepted.
- Seat grid invents occupied seats rather than reading inventory; search omits journey date.
- API data is imported from mock modules rather than persisted relational data.
- Weather failures display invented measurements; moving coordinates undermine caching. Late weather responses can update a different selected train.
- Tourism image failures hide pictures; map destinations can lag the selected train.
- Server has no database health, comprehensive validation, session persistence, CSRF origin checks or standard security middleware.
- No direct login route guards; upcoming journeys include past/cancelled tickets.
- Secret scan, database ignore patterns and production configuration boundaries are missing.

## Implementation record

### Changes implemented

- Added Prisma 7/SQLite schema, committed migration, safe repeatable seed and database client. Retained every existing demo train instead of reducing the catalog to three services.
- Replaced JSON APIs with database stations, trains, classes, stops, tourism and owner-scoped bookings. Legacy endpoint aliases still serve the existing frontend.
- Added bcrypt OTP hashing, expiry, attempt/resend limits, browser-bound verification, session regeneration, persistent database sessions, logout and route/API guards.
- Implemented Google OAuth state, PKCE, ID-token verification and account-link conflict handling. Explicit development Google authentication completes the requested mobile → OTP → Google → dashboard flow.
- Added passenger validation, real date-specific seat maps, unique reservations, conditional inventory decrements, transaction boundaries and idempotent cancellation.
- Preserved the Haversine simulation and improved acceleration/braking. One shared SSE timer runs per watched train, with disconnect, logout and shutdown cleanup. Polling covers SSE outages and avoids overlapping polls.
- Preserved Leaflet layers and controls; added destination-specific tourist markers, stale-response guards and ten-minute weather refresh. Weather failures no longer show invented measurements. Forecast hours align with the provider's current time.
- Connected the existing dashboard and login design. Upcoming journeys exclude cancelled/past bookings. Search, tourism and checkout reject stale asynchronous responses; checkout controls disable during submission.
- Added local image fallbacks, passenger-field mobile layouts, request timeouts, CORS, Helmet, rate limits, Zod validation and centralized safe error responses.
- Added a local bootstrap command, updated README, secret scanner, ignore rules and isolated backend/browser tests.

### Bugs discovered and fixed during execution

1. Prisma's Windows schema engine failed to create a missing SQLite file from an absolute URL. The config now resolves the path and creates the empty file safely before migration.
2. Prisma relation loading for all 1,209 trains exceeded SQLite's parameter limit and broke assistant replies. Catalog reads now use bounded batches; full-catalog and assistant regression tests cover this.
3. An asynchronous dashboard test checked the upcoming card before its refresh completed. The test now waits for the observable result, and dashboard requests reject stale responses.
4. Prisma tooling pulled vulnerable transitive dependency versions. Compatible patched `deepmerge-ts` and `mysql2` overrides removed all npm audit findings; migration, generation and tests passed afterward.
5. Another service occupies IPv4 port 4173. This checkout's ignored local environment uses 4174; that other service was left running. The example default remains 4173 for fresh installations.
6. A strengthened browser image check exposed Helmet blocking inline `onerror` handlers. Image fallback now uses a registered capture listener; the dashboard's inline search action was converted to a registered handler too. The test waits for destination loading and scrolls the lazy image into view before simulating failure, preventing false-positive success from a card refresh.
7. The dashboard button conversion briefly used a single-element selector where a list was required. The selector was corrected; the final browser test opens the saved upcoming ticket and verifies cancellation removes it from upcoming journeys.

### Database models

`User`, `OtpVerification`, `Session`, `Station`, `Train`, `TrainStop`, `TrainClass`, `JourneyInventory`, `Booking`, `Passenger`, `SeatReservation`, `LiveTrainStatus`, `TouristSpot` (13 models).

Seed verified: 36 stations, 1,209 trains, 12 tourist spots. The named Chennai/Bengaluru normal and tourism services and all four requested Bengaluru attractions are present. Class capacity is a template; remaining inventory is per class **and journey date**. Re-running seed never resets accounts, bookings or seat reservations.

### Added files

- `backend/auth.js`, `backend/bookings.js`, `backend/catalog.js`, `backend/db.js`, `backend/tracking.js`
- `prisma.config.ts`, `prisma/schema.prisma`, `prisma/seed.js`, `prisma/migrations/migration_lock.toml`, `prisma/migrations/20260910174702_railgo_initial/migration.sql`
- `public/auth.js`, `scripts/dev.js`, `scripts/check-secrets.js`, `PROJECT_AUDIT.md`
- `tests/backend.test.js`, `tests/fullstack.browser.test.js`, `tests/helpers.js`, `tests/production.test.js`

### Changed files

`server.js`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `README.md`, `public/index.html`, generated `index.html`, `public/api-client.js`, `public/app.js`, `public/design.js`, `public/reference.css`, `public/shared/assistant-core.js`, `public/shared/tracking.js`, `public/shared/weather.js`, `scripts/check.js`, `tests/assistant.browser.test.js`.

The original frontend, local images, static demo, catalog files and four old JSON demo bookings are retained. Those old bookings have no account ownership and are not automatically attached to a new user. No history rewrite or push was performed.

### API implementation

Implemented health; OTP send/verify; Google entry/callback; current user/logout; stations; train search/detail/stops/classes; booking create/list/PNR/cancel; tracking snapshot/SSE; tourism list/detail; cached weather. Added auth configuration and preserved fleet directory, assistant and existing aliases. See the complete methods, parameters and request example in [README.md](README.md#apis).

### Executed verification — 10 September 2026

| Check | Result |
|---|---|
| `npm install` | PASS |
| `npx prisma generate` | PASS — Prisma Client 7.10.0 |
| `npx prisma migrate dev` | PASS — initial migration applied; subsequent run in sync |
| `npx prisma db seed` | PASS — 36 / 1,209 / 12; repeat seed preserves application data |
| `npm run dev` | PASS — running at `http://localhost:4174` |
| Local health and desktop/mobile login smoke | PASS — database connected, login loads, no page errors or mobile overflow |
| `npm run check` | PASS — 37 JavaScript files |
| `npm test` | PASS — 30 tests including nested API integration tests |
| `npm run test:fullstack` | PASS — login, booking, reload/restart persistence, PNR, tracking, cancellation, logout and responsive layout |
| `npm run test:browser` | PASS — existing assistant, speech lifecycle, tracking and mobile regression |
| `npm run test:pages` | PASS — independent static Pages demo preserved |
| Concurrent bookings/cancellations | PASS — single winner for contested seat/last capacity, no negative inventory, no duplicate restoration |
| Two-client SSE cleanup | PASS — one engine; final disconnect removes timer and registry entry |
| Weather outage/cache | PASS — explicit unavailable response; no invented readings; tracking continues |
| Production dev-auth rejection | PASS — dev flags cannot be enabled in production; unconfigured SMS returns 503 |
| `npm audit` | PASS — zero vulnerabilities |
| Git diff review / whitespace check | PASS |

Screenshots: `test-results/fullstack-desktop.png`, `test-results/fullstack-mobile.png`, `test-results/local-login-desktop.png`, `test-results/local-login-mobile.png`, plus existing assistant/Pages previews. All test artifacts/databases are ignored.

### GitHub security check

| Check | Result |
|---|---|
| `.env` ignored | PASS |
| Database files ignored | PASS |
| Private keys/service-account files ignored | PASS |
| Hard-coded secrets scan | PASS |
| Tracked files audit | PASS — no environment secrets, databases or private key files tracked |
| `.env.example` safe | PASS — credential fields empty |
| Git diff reviewed | PASS |
| Reachable Git history scan | PASS — no detected credentials; values never printed |

SAFE TO PUSH TO GITHUB under the executed secret checks. The scanner checks common patterns, not every possible future credential format. No automatic push or commit was made.

### Local usage and production limits

Open `http://localhost:4174/login`. Enter a valid Indian mobile number, OTP `123456`, then Continue with Google to use the development profile. Later startups use `npm run dev` (dependencies are installed already).

Real Google OAuth credentials were unavailable, so real provider authorization was not exercised. Production requires an SMS adapter/provider, Google credentials/callback registration, authorized railway GPS/reservation/PNR services, payment integration and production hosting configuration. Optional AI provider access and actual microphone hardware were not exercised. Simulation and mock OTP are development features; static Pages remains an explicitly separate browser demo. PostgreSQL requires an adapter/provider change and separate migrations/data transfer as documented in README.
