# Project status — September 15, 2026

The application now serves a sourced public catalogue instead of generated train, ticket and tourist data.

- 10,516 unique five-digit train numbers: 8,490 records published in 2025 and 2,026 additional records from a 2016 archive.
- 9,494 stations and 289,363 published route entries. Missing coordinates remain null; 1,106 stations cannot be placed from the bundled source.
- 5,142 Wikidata places with Wikimedia Commons photographs, author credit, license and original-file links, including beaches, lakes, botanical gardens and other route destinations.
- Forward route searches include intermediate stations. Directory and tourist results are paginated. Newer source records sort before older archive records.
- Tourist matching checks all route stations, with 10/30/50/100 km filters and per-station coverage. Distances are straight-line. Every station also links to Google Maps so users can explore beyond indexed coverage.
- Google Maps opens the place coordinate or station search; directions start at the relevant station. Leaflet shows station connections, not claimed GPS or surveyed rail alignment.
- Mock fares, seats, ratings, platforms, moving trains and new demo tickets are removed from the public application. Booking opens IRCTC; live running status opens NTES.
- Backend OTP supports Gmail SMTP and Resend with hashed, expiring, browser-bound, single-use codes, attempt/rate limits, resend and expiry countdowns, Resend idempotency keys and session persistence. `npm run auth:setup` opens a local Gmail setup page that verifies sender authentication over TLS before saving private email configuration.
- Profile opens a four-field form (first name, birth date, contact mobile, Gmail/email) followed by email OTP in the same dialog. Verification saves the profile atomically and preserves account IDs. Edits need another OTP; unverified phone numbers cannot merge accounts. Pending details are bound to the requesting browser and cleared from consumed challenges. Additive profile migrations were applied after backing up the local database; the existing one user and zero bookings were preserved.
- Database migration/import preserves accounts and existing ticket records; SQLite backups are made before catalogue replacement. Raw public downloads and test fixtures are not served by the application.

## External limits

The catalogue does not verify that all 10,516 services run today. Source publication dates are not current railway verification. Tourism coverage is not exhaustive in every town and remote image availability depends on Wikimedia. Unknown or failed data is identified rather than substituted.

Neither Gmail App Password nor Resend sender credentials are set up. Follow [AUTH_SETUP.md](AUTH_SETUP.md) to configure a sender. Direct inspection of `https://live-train-five.vercel.app/api/auth/config` returns static HTML, not the backend JSON: the public website also needs the persistent Node backend and `RAILGO_BACKEND_URL` before email login can work. Tests verify OTP behavior through test-only provider interception; actual inbox delivery remains unverified. Live railway tracking and ticket issuing require authorized providers and have not been connected.

Validation completed for the profile update: **50 unit/integration tests passed**, including valid calendar dates, Indian mobile normalization, pending-profile privacy, OTP cancellation, verified profile updates and keeping unverified contact numbers separate from account identity. Fullstack profile/OTP, GitHub Pages and Vercel browser suites passed. Desktop/mobile checks cover the four-field form, OTP resumption after refresh, staying in the same dialog, profile editing and logout. Syntax checks passed for 59 JavaScript files and source secret checks passed. Actual inbox delivery remains untested because no sender credentials have been supplied. The prior dependency audit found zero production vulnerabilities; this profile update adds no dependencies.

No commit, push or remote deployment was performed. [PROJECT_AUDIT.md](PROJECT_AUDIT.md) is a historical audit of the earlier demo architecture; this document and [README.md](README.md) describe the current application.
