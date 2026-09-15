# RailGo — public train routes and real places

RailGo now uses **10,516 unique train numbers, 9,494 stations, 289,363 route entries and 5,142 photographed tourist places**. Search between intermediate stations, browse train numbers, inspect published schedules, filter attractions near every route station and open actual locations in Google Maps.

**These are public snapshots, not 10,516 verified current services.** 8,490 train records come from a dataset published September 15, 2025; 2,026 additional records come from a 2016 archive. Source dates are shown throughout the app. Check NTES before travel. See [DATA_SOURCES.md](DATA_SOURCES.md) for provenance, licensing and coverage.

## Start locally

Requires Node.js 22.12+ (tested with Node 24), npm and Windows, macOS or Linux. Python is needed only to rebuild the train snapshot.

```powershell
npm install
npm run dev
```

Startup generates Prisma Client, applies migrations, imports the public catalogue, and starts Express. This workspace uses **http://localhost:4174**; use the address printed by startup. A new installation defaults to port 4173. Existing `.env`, accounts and tickets are preserved. Before replacing catalogue rows, the importer makes a SQLite backup under ignored `test-results/`. Imports are fingerprinted and repeated startup does not reset accounts.

The bundled data works without railway API credentials. The interface does not manufacture fares, seats, ratings, platforms, moving trains or tickets. Ticket actions link to IRCTC, and live status links to NTES. Existing legacy tickets remain in the database; they are not valid railway tickets.

## Email OTP

The backend implements actual email OTP using Resend: random six-digit codes, HMAC storage, requesting-browser binding, 10-minute expiry, 5 attempts, 60-second resend cooldown, request limits, single use and session regeneration. The form shows expiry and resend countdowns. Provider requests include an idempotency key.

Configure `RESEND_API_KEY` and `EMAIL_FROM` privately in `.env`, using your verified sender domain. Run `npm run auth:check`, restart the backend and verify an email from your inbox. See [AUTH_SETUP.md](AUTH_SETUP.md). **This workspace has no Resend account configured. Live inbox delivery has not been tested.** Automated OTP tests intercept the provider only in the test process; the app has no fixed code or fake send fallback.

## Rebuild public data

```powershell
npm run data:trains
npm run data:tourism
npm run data:seed
```

Raw downloads and photo metadata caches stay in ignored `data/sources/`. The train importer pins the reviewed Kaggle version/hash and DataMeet commit. The tourism importer uses Wikidata and Commons, expands beach/lake/garden and other categories in bounded queries, respects rate limits, caches metadata and excludes places without an attributed photograph. It can take several minutes. Restart the backend after rebuilding data so its in-memory index is refreshed.

## APIs

| Endpoint | Result |
|---|---|
| `GET /api/stations?q=Katpadi` | Station names/codes and known coordinates |
| `GET /api/trains/search?from=KPD&to=SBC&limit=12` | Published routes containing the stations in that order |
| `GET /api/trains/catalog?q=12639&source=kaggle-2025&offset=0&limit=8` | Paginated directory, optional source filter |
| `GET /api/trains/12639` | Source metadata and full published station schedule |
| `GET /api/trains/12639/stops` | Stops, source times, day, unknown platforms |
| `GET /api/tourist-spots?train=12639&radiusKm=30&offset=0&limit=12` | Photographed places near route stations, attribution and Google Maps links |
| `GET /api/tourist-spots?train=12639&station=KPD&radiusKm=100` | Attractions near one selected route station |
| `GET /api/weather?lat=12.9&lng=77.5` | Open-Meteo weather or explicit unavailable result |
| `GET /api/auth/config` | Delivery setup status and this browser's pending challenge |
| `POST /api/auth/email/send` | Send a code with `{ "email": "you@example.com" }` |
| `POST /api/auth/email/verify` | Verify `{ "email": "you@example.com", "code": "code from inbox" }` |
| `GET /api/auth/me` | Signed-in account |
| `POST /api/auth/logout` | Revoke the session |
| `POST /api/assistant` | Tamil/English route, weather and tourism commands |

Train search dates are validated but do not certify that an archived service runs on that date. Classes are empty for public records. Authenticated live-status and booking requests return 503 until their respective real providers are integrated; there is no synthetic fallback.

## Checks and hosting

```powershell
npm run check
npm test
npm run test:fullstack
npm run test:browser
npm run test:pages
npm run test:vercel
npm run security:secrets
```

Tests use separate SQLite files and test-only email delivery. Older booking/concurrency regression fixtures live exclusively under `tests/fixtures/`; production never seeds or serves them.

Vercel and GitHub Pages can serve the public catalogue without a backend. Email login requires a persistent hosted Node/SQLite backend. [DEPLOYMENT.md](DEPLOYMENT.md) explains configuration. Regenerate the root Pages entry with `npm run build:pages` after changing `public/index.html`. No changes have been deployed remotely.
