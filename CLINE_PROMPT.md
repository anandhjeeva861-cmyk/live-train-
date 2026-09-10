# Cline Prompt — Upgrade Existing Train App to Tracking-First Full-stack Product

Copy the prompt below into Cline while your existing project folder is open.

---

You are working inside my existing full-stack train web app repository. Do not create a disconnected second app. First inspect the existing codebase, understand the current architecture, run the available checks, and then upgrade the same project in-place.

## Main objective

Build a polished, responsive train booking + live train tracking web app inspired by the attached Live Train reference UI. Live tracking is the highest-priority feature. The product must work well on laptop and mobile layouts.

Keep the current stack unless there is a strong technical reason to change it. The current project is expected to be Node.js + Express on the backend and HTML/CSS/vanilla JavaScript on the frontend. Do not migrate to React merely for style. If the repository is different, adapt to what is actually present.

## Step 1 — Audit before editing

Inspect every relevant file first, including package.json, server/API files, public/frontend files, mock data, README and persistence files. Run syntax checks and the existing app if possible. Identify bugs, UX problems, security issues, incorrect API behavior, duplicated code, race conditions, broken responsive behavior, map problems, excessive API calls and missing error states.

Create or update `AUDIT.md` with:
- issue
- severity
- affected file/function
- root cause
- fix applied
- any remaining production risk

Do not claim a bug is fixed until the code has been changed and checked.

## Step 2 — Fix known v1 problems

Verify whether these issues exist; if they do, fix them:

1. Train search must never return unrelated fallback trains when an exact From/To route has no match. Return an honest empty state instead.
2. When switching tracked trains, clear old route lines, station markers and tourist markers correctly. Do not accumulate Leaflet layers.
3. Do not call the weather provider on every 2–3 second tracking update. Add server caching and client throttling.
4. Route movement must not give every segment equal travel time. Calculate Haversine distance per segment and interpolate movement by total distance.
5. Fix local journey-date handling. Do not depend on `toISOString().split('T')[0]` for local dates. Set a minimum date so past booking dates cannot be selected.
6. Validate booking payloads on the server. Reject invalid train IDs, classes, passenger counts, dates and seats.
7. Escape or safely render any dynamic values shown through `innerHTML`.
8. Persist demo bookings so My Bookings and PNR lookup survive a browser refresh.
9. Add consistent API error responses and frontend error states.
10. Remove framework/server routing patterns that are incompatible with the actual Express version.

## Step 3 — UI redesign based on reference image

Create a professional Live Train-style interface, not a rough admin dashboard.

Desktop layout:
- dark navy header with Live Train brand
- navigation: Home, Book Train, Live Tracking, Tourism, My Bookings
- hero section with scenic railway image/overlay and large heading
- white booking card over/inside hero
- Normal Train / Tourism Train tabs
- From, To, swap button, journey date, travel class, passengers
- clear Search Trains CTA
- feature strip below hero: Book Tickets, Live Tracking, Speed & ETA, Weather, Tourist Spots
- clean white/light content area for results
- strong dark-blue live tracking section
- tourist destination cards with photos
- My Bookings / PNR section

Mobile layout:
- compact header
- booking card must fit without horizontal overflow
- hero text scales correctly
- map and telemetry stack vertically
- cards are touch friendly
- sticky bottom navigation with Book / Track / Explore / Trips
- no clipped text or overflowing select/input controls at 360px–430px widths

Use CSS variables, consistent spacing, typography, radii, shadows and responsive breakpoints. Ensure focus states and reasonable accessibility labels.

## Step 4 — Train booking modes

Support two train types:
- Normal
- Tourism

The selected type must affect search results. Also add a way to show both types when useful.

Search inputs:
- From
- To
- swap
- journey date
- travel class
- passengers

Search results must show:
- train number/name
- Normal/Tourism badge
- departure/arrival
- duration
- fare
- class
- seat availability
- Book Now
- Live Track

If no exact train exists, show a useful empty state. Never silently substitute a different route.

## Step 5 — Tracking-first implementation

This is the most important section.

Add a dedicated live tracking module with:
- map using Leaflet + OpenStreetMap
- route polyline
- origin/destination/intermediate station markers
- animated/updating live train marker
- train marker bearing/direction when possible
- current speed km/h
- distance remaining
- current section (station A → station B)
- previous station
- next station
- ETA in minutes
- approximate arrival clock time
- platform
- delay/on-time status
- journey progress percentage
- route progress bar
- station timeline with completed/current/upcoming states
- last updated / connection state
- Recenter Train button

Prefer Server-Sent Events for the demo live stream so the backend pushes updates approximately every 2 seconds. Keep a simple polling fallback for environments without EventSource.

For the simulation:
- compute segment distance with Haversine
- calculate total route distance
- move by distance rather than equal segment time
- use a deterministic train-specific offset so different trains do not all share the same exact state
- do not pretend simulated data is real railway data
- keep the provider boundary easy to replace later

Add quick tracking:
- input accepts train number or demo PNR
- train number resolves directly to a train
- PNR resolves booking → train → live tracking

## Step 6 — Weather

Use the current train coordinates for en-route weather.

Show:
- temperature
- feels-like
- condition
- wind
- rain probability
- small hourly forecast tiles

Backend requirements:
- cache weather responses for approximately 10 minutes per rounded coordinate
- use a network timeout
- return a harmless demo fallback when the weather provider is unavailable

Frontend requirement:
- weather must not refresh more often than roughly once per minute while train location updates every few seconds

## Step 7 — Tourism

After selecting/searching a destination, show nearby tourist spots with:
- image
- place name
- city
- category
- rating
- distance from station
- latitude/longitude in data
- View on Map action

Add `Show spots on live map` so destination POIs appear as a separate Leaflet layer. Clear that layer cleanly when the destination changes.

Do not show unrelated fallback tourist places from another city when the selected city has none; show an empty state instead.

## Step 8 — Booking + seat selection

Add a clean booking modal:
- trip summary
- available classes for the selected train
- seat grid
- available / selected / booked visual states
- passenger count
- total demo fare
- Confirm Demo Booking button

Backend:
- generate a unique booking ID
- generate a 10-digit demo PNR
- validate all fields against server-side train data
- calculate fare on the server, not from a trusted client amount
- save demo bookings in local JSON persistence if no database currently exists
- expose booking history and PNR lookup endpoints

Do not claim this is a real railway booking or real payment flow.

## Step 9 — API shape

Provide or preserve equivalent endpoints:

- GET `/api/health`
- GET `/api/stations`
- GET `/api/trains/search?from=MAS&to=SBC&type=normal`
- GET `/api/trains/by-number/:number`
- GET `/api/trains/:id`
- GET `/api/trains/:id/live`
- GET `/api/trains/:id/live-stream`
- GET `/api/weather?lat=...&lng=...`
- GET `/api/tourist-spots?city=Bengaluru`
- GET `/api/bookings`
- GET `/api/bookings/pnr/:pnr`
- POST `/api/bookings`

Use sensible status codes and JSON error messages.

## Step 10 — Basic hardening

Without adding unnecessary dependencies:
- disable x-powered-by if Express is used
- JSON body size limit
- basic security response headers
- input validation
- centralized 404/error behavior
- URL-encode query values on the client
- avoid leaking secrets
- add `.env.example` for future provider credentials

Do not store raw payment card information.

## Step 11 — Demo data

Ensure the demo has useful routes, especially:
- Chennai (MAS) → Bengaluru (SBC), including Normal trains and at least one Tourism train
- Chennai → Coimbatore
- Chennai → Madurai
- Bengaluru → Mysuru tourism route
- Coimbatore → Ooty/Nilgiri tourism route

Include Bengaluru tourist examples such as Lalbagh, Bangalore Palace, Cubbon Park and Nandi Hills, plus destination examples for Chennai, Coimbatore, Mysuru, Madurai and Ooty.

Demo coordinates can be approximate, but keep station/order data internally consistent.

## Step 12 — Verification

After editing:

1. Run the project's dependency install if needed.
2. Run all available syntax/lint/test scripts.
3. At minimum verify JavaScript syntax for server and frontend.
4. Start the server and test the important endpoints.
5. Test these UI flows manually if browser tooling is available:
   - MAS → SBC Normal search
   - MAS → SBC Tourism search
   - no-route empty state
   - Book Now → class → seat → booking → generated PNR
   - refresh → booking still exists
   - Quick Track by train number
   - Quick Track by generated PNR
   - live marker moves without duplicate old layers
   - switching trains clears old route markers
   - weather is not requested every tracking tick
   - View Tourist Spot on Map
   - 390px mobile width
   - standard laptop width
6. Fix any error you discover before stopping.

## Deliverables

When finished, provide:
- updated working source code
- `README.md` with run instructions and production limitations
- `AUDIT.md` with issues found/fixed
- `.env.example`
- concise summary of files changed
- concise list of remaining production work

Important: prioritize correctness and live tracking over adding decorative features. Do not remove existing working functionality unless it is being replaced by a better implementation. Do not say “done” if tests or runtime checks are failing; report the exact failure and fix it if possible.
