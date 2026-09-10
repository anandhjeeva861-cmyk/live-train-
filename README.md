# RailGo — booking, tracking and tourism

The existing Vande Bharat dashboard, HTML/CSS/JavaScript frontend, Leaflet maps, Tamil/English voice assistant and GitHub Pages demo are preserved. Express now serves Prisma/SQLite application data, server-side authentication and transactional demo bookings.

## Run locally

Requires Node.js **22.12+** (tested on Node 24) and npm. No PostgreSQL installation is needed. Real login requires Twilio Verify and Google OAuth credentials: follow [AUTH_SETUP.md](AUTH_SETUP.md), then run `npm run auth:check`. Real authentication is now the default; missing credentials show a setup message without silently using demo login.

```powershell
npm install
npm run dev
```

After dependencies are installed, **`npm run dev` is the one-command startup**. It creates `.env` if needed, generates a private local session secret, generates Prisma Client, applies committed migrations, safely seeds missing catalog records, and starts Express with watching. It never resets bookings.

The default address is `http://localhost:4173`. **This workspace's local `.env` uses `http://localhost:4174` because another service already occupies 4173.** Use the address printed by startup. Change `PORT`, `FRONTEND_URL` and `GOOGLE_CALLBACK_URL` together if choosing another port.

The equivalent explicit setup is:

1. `npm install`
2. `copy .env.example .env` — only if `.env` does not already exist; do not overwrite your credentials.
3. `npx prisma generate`
4. `npx prisma migrate dev`
5. `npx prisma db seed`
6. `npm run dev`

For an already configured database, `npm start` runs the server without migrations or watching. Development bootstrap writes a random `SESSION_SECRET` only into ignored `.env`; it is never displayed. With direct `npm start` and no secret configured, development uses an ephemeral session signing secret, so sessions then expire on server restart.

## Development login and booking

For offline testing only, explicitly set both `DEV_OTP_MODE=true` and `DEV_GOOGLE_AUTH=true` in local `.env` and restart. With the default `false` values, enter the code actually received by SMS and complete Google's account chooser. Automated tests configure their own isolated demo environment.

1. Open `/login`, or select **Sign in / Profile**.
2. Enter an Indian 10-digit mobile number starting with 6–9. The UI supplies +91; the API also accepts the +91 prefix.
3. Enter development OTP **123456**.
4. Select **Continue with Google**. With `DEV_GOOGLE_AUTH=true`, the backend creates a clearly identified development profile and redirects to `/dashboard`.
5. Search Chennai (MAS) → Bengaluru (SBC), choose a date and train type, select **Book Now**, enter each passenger's details, choose the first passenger's seat and confirm. Other passengers receive distinct available seats in that class.
6. View saved PNRs in **My Bookings**, use a PNR or train number for tracking, or cancel a demo ticket to restore seats.

Demo OTP hashes use bcrypt; real OTP generation and checking belong to Twilio Verify, with only the provider verification ID stored locally. Codes expire locally after five minutes, attempts are limited to five, and resending requires 60 seconds. Google login requires a recently verified mobile in the same browser. Sessions use HttpOnly, SameSite cookies and SQLite storage. Logging out revokes the session and its streams. Bookings and PNR lookups are restricted to their owner.

The four old, unowned JSON demo bookings remain intact in `data/bookings.json`. They are not silently assigned to a new account. New bookings use the database; the separate static Pages demo continues to use browser storage.

## Data and inventory

Prisma models: `User`, `OtpVerification`, `Session`, `Station`, `Train`, `TrainStop`, `TrainClass`, `JourneyInventory`, `Booking`, `Passenger`, `SeatReservation`, `LiveTrainStatus`, `TouristSpot`.

Seed data includes all **36 stations, 1,209 trains and 12 tourist spots** from the existing catalog. Named demo services include 12639 Brindavan Express, 12027 Chennai Bengaluru Shatabdi and TR101 South Heritage Tourism Special. Bengaluru has Lalbagh, Bangalore Palace, Cubbon Park and Nandi Hills. Local destination images provide fallbacks; a fallback may be illustrative.

`TrainClass.totalSeats` and `availableSeats` describe the default class capacity. **Bookable remaining seats belong to `JourneyInventory`, keyed by train class and ISO journey date.** Search with `date` and the classes endpoint return this date's remaining inventory. Without a date, train listings show default capacity. Unique seat reservations, conditional decrements and transactions prevent duplicate seats and negative inventory. Cancellation is idempotent. Monetary demo fares are integer rupees. Journey dates are calendar strings validated against the current date in India, avoiding UTC date shifts.

The database lives at `prisma/dev.db` by default and is ignored by Git. Schema and migrations are tracked. Prisma configuration follows the [Prisma 7 configuration and adapter architecture](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7).

For PostgreSQL later: change the Prisma datasource provider, replace the SQLite adapter in `backend/db.js` with the PostgreSQL adapter, configure `DATABASE_URL` privately, generate a **separate PostgreSQL migration history**, transfer data, and rerun integration/concurrency tests. SQLite migration SQL is not portable to PostgreSQL. Relations and application inventory logic are already separated from database setup.

## APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Database/server health |
| GET | `/api/auth/config` | Public development-mode indicators |
| POST | `/api/auth/send-otp` | `{mobileNumber}` |
| POST | `/api/auth/verify-otp` | `{mobileNumber, otp}` |
| GET | `/api/auth/google` | Google or explicit development login |
| GET | `/api/auth/google/callback` | Validated OAuth callback with state and PKCE |
| GET | `/api/auth/me` | Current authenticated account |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/stations?q=` | Station list/search |
| GET | `/api/trains?from=MAS&to=SBC&date=2099-10-12&type=normal&class=CC` | Exact origin/destination search; no unrelated fallback |
| GET | `/api/trains/catalog?q=Mumbai&type=all&offset=0&limit=8` | Paginated fleet directory |
| GET | `/api/trains/:trainNumber` | Train detail; legacy IDs also supported |
| GET | `/api/trains/:trainNumber/stops` | Ordered route/stops |
| GET | `/api/trains/:trainNumber/classes?date=2099-10-12` | Date-specific availability and occupied seat numbers |
| POST | `/api/bookings` | Authenticated transactional booking |
| GET | `/api/bookings` | Own bookings |
| GET | `/api/bookings/:pnr` | Own PNR |
| PATCH | `/api/bookings/:pnr/cancel` | Cancel own demo ticket |
| GET | `/api/tracking/:trainNumber` | Authenticated simulated telemetry |
| GET | `/api/tracking/:trainNumber/stream` | Authenticated SSE, `live` events every 2.5 seconds |
| GET | `/api/tourism?station=SBC&city=Bengaluru` | Destination places |
| GET | `/api/tourism/:id` | Destination detail |
| GET | `/api/weather?lat=12.97&lon=77.59` | Cached Open-Meteo weather |
| GET / POST | `/api/assistant/status`, `/api/assistant` | Authenticated Tamil/English assistant |

Existing frontend aliases remain supported: `/api/trains/search`, `/api/trains/by-number/:number`, `/api/trains/:id/live`, `/api/trains/:id/live-stream`, `/api/tourist-spots`, `/api/bookings/pnr/:pnr`, and weather `lng`.

Booking JSON example (demo data only):

```json
{
  "trainNumber": "12639",
  "journeyDate": "2099-10-12",
  "classCode": "CC",
  "seat": "S1",
  "passengers": [{"name": "Demo Traveller", "age": 28, "gender": "other"}]
}
```

## Tracking and weather

Tracking is **development-only simulation, not live railway GPS**. The preserved shared engine uses Haversine segment distances, integrated acceleration/cruise/braking, station dwell periods, destination holds and repeating demo journeys. The demo restarts at the origin after its arrival hold; that reset is a new `journeyId`, not real train movement. Routes are illustrative station-to-station segments. Booking timetables and the continuous simulation clock are separate.

One timer serves all SSE viewers of a train, stops when the final viewer leaves, and removes slow/disconnected clients. Train switching closes the old stream and clears route/POI layers. The frontend reconnects through EventSource and polls during outages. Normal updates move the marker without fitting the whole map. Database telemetry snapshots are refreshed at most every ten seconds per active train.

Open-Meteo requests are coalesced and cached for ten minutes, including failures. The UI requests weather at most once per ten minutes while following the same train. Failures show unavailable values instead of fabricated weather and do not interrupt tracking. Map tiles, Google fonts and Leaflet's CDN need internet access.

## Assistant and static hosting

The existing **Ask Live Train** panel supports Tamil, English and Tanglish commands, text chat, browser speech recognition and speech synthesis. Try “Chennai to Bangalore tomorrow for two passengers”, “Track 12639”, “Weather in Bengaluru”, “Tourist spots near Mysuru”, or “Show my bookings”. Browser microphone and voice support still depend on your browser, permissions and installed voices.

Basic commands work without an AI key. Optionally configure `OPENAI_API_KEY` and `OPENAI_MODEL` in local `.env` for the existing server-side AI integration. Never put credentials in `public/config.js`. Live application answers use database catalog records. The assistant does not perform booking, cancellation or payment mutations.

GitHub Pages remains a **separate browser-only demo**, with localStorage tickets and simulated tracking. It cannot run Express, SQLite, real authentication or private AI calls. Run `npm run build:pages` after modifying `public/index.html`; the root `index.html` is generated. The hosted backend URL is configured in one place, `public/config.js` (`apiBase`); cookies and SSE use that same API client. Cross-site cookie deployment requires an intentional authentication/cookie policy review; local same-origin hosting is the verified configuration.

## Tests

```powershell
npm run check
npm test
npm run test:fullstack
npm run test:browser
npm run test:pages
npm run security:secrets
node scripts/check-secrets.js --history
npm audit
```

Backend tests create isolated SQLite databases under ignored `test-results/`. They test auth, expiry/attempt limits, route/class/date filtering, full-catalog loading, ownership, concurrent claims, cancellations, tracking/SSE cleanup, tourism, weather outages, and production development-mode rejection. Browser tests cover the login → OTP → Google → dashboard flow, booking, reload **and server restart** persistence, PNR tracking, train switching, image fallback, logout, assistant regression and widths 360/390/768/1024. Screenshots are saved in `test-results/`.

Browser tests use installed Chrome/Edge, `BROWSER_PATH`, or Playwright Chromium (`npx playwright install chromium`). Speech and AI provider behavior are mocked in regression tests. Genuine Google OAuth, SMS delivery, live AI billing/access and microphone hardware require their external services/devices. See `PROJECT_AUDIT.md` for executed results.

## Production and secret safety

Copy `.env.example` to `.env` only for initial setup. Add credentials **only** to local `.env`; never commit it. Set production secrets in the hosting provider's environment settings. Example credential fields are empty; no realistic fake credentials are provided.

Production startup refuses `DEV_OTP_MODE=true` or `DEV_GOOGLE_AUTH=true` and requires a strong `SESSION_SECRET` (or `JWT_SECRET` as an alternative session-signing configuration). Production uses Secure cookies and requires HTTPS. Configure `TRUST_PROXY=true` only behind your trusted single reverse proxy.

Remaining production integrations:

- Twilio account credentials and a Verify Service with SMS enabled. The adapter is implemented; actual delivery requires an active account with recipient/country access. See [AUTH_SETUP.md](AUTH_SETUP.md).
- Google OAuth client ID, client secret and registered callback URL. State, PKCE and ID-token verification are implemented; real credentials were unavailable for testing.
- Authorized railway tracking, reservation/PNR and ticket-issuance providers. Production tracking returns 503 until a real provider is added.
- Payment provider and verified webhooks for real payments. Current tickets/cancellations have no money movement and are not valid railway tickets.
- Optional AI credentials; production hosting, backups, monitoring and PostgreSQL migration when needed.

`security:secrets` checks tracked source **and new unignored files**, sensitive filenames and common credential patterns. `--history` checks reachable Git blobs too. It prints filename, line and category only, never detected values. This is a preventive pattern check, not a guarantee against every future secret format. Dependency overrides select patched `deepmerge-ts` and `mysql2` releases used by Prisma tooling; validated Prisma commands and tests pass with them.

After all checks pass, review and push yourself:

```powershell
git status
git add .
git commit -m "Complete RailGo full-stack backend and database"
git push
```

The existing `origin` remote is retained. No automatic commit, push, force-push or history rewrite is performed.
