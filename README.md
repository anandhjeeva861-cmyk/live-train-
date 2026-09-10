# Live Train v2 — Tracking-First Full-stack Train App

This is the upgraded version of the earlier RailVista starter. It keeps the simple Express + HTML/CSS/JavaScript architecture, but makes live tracking the highest-priority product area and fixes several correctness and UX problems from v1.

## What is included

- Normal vs Tourism train booking search
- From / To / date / class / passenger search
- Exact-route search (no misleading fallback trains)
- Responsive desktop, tablet and mobile UI inspired by the supplied reference
- Train results with fares and availability
- Seat-selection demo checkout
- Server-persisted demo bookings and 10-digit PNR
- PNR / train-number quick tracking
- **Server-Sent Events (SSE) live tracking stream every 2 seconds**
- Distance-weighted route interpolation
- Live speed, current section, next/previous station, distance remaining, ETA, arrival clock, platform and delay
- Route progress bar + station timeline
- Leaflet + OpenStreetMap tracking map
- Route-layer cleanup when switching trains
- Tourist spots with images, distance and coordinates
- Tourist spot markers on the live map
- Open-Meteo current weather + mini hourly forecast
- 10-minute server-side weather cache and 60-second client refresh throttle
- Input validation, basic security headers and API error handling
- Local JSON booking persistence for demo use

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:4173`

Node.js 18+ is required.

## GitHub Pages deployment

The repository root now contains a generated `index.html` and `.nojekyll`, so GitHub Pages serves the app instead of turning this README into the homepage. Relative asset URLs and the entry page's `./public/` base support project URLs such as `https://anandhjeeva861-cmyk.github.io/live-train-/`.

Keep **Settings → Pages → Deploy from a branch → main → / (root)**. No backend, build service or API key is needed for the browser demo. After editing `public/index.html`, run `npm run build:pages` and commit the generated root `index.html` alongside the source changes. Normal pushes to `main` then use GitHub's existing Pages deployment.

On GitHub Pages, the app clearly labels **Browser demo**. Train search, seat selection, demo PNR lookup, simulated tracking, destination cards and basic Tamil/English voice commands work in the browser. Tickets are saved only in this browser on this device and are not synchronized with server bookings or other devices. Weather still uses Open-Meteo when reachable; browser speech support and device voice availability still apply. Free-form OpenAI conversation requires a hosted Node.js backend: [GitHub Pages hosts static files](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), not this application's Express server.

To connect an independently hosted backend later:

1. Run this repository as a Node.js service with `npm ci --omit=dev` and `npm start`.
2. Set `ALLOWED_ORIGINS=https://anandhjeeva861-cmyk.github.io` on that server. Keep `OPENAI_API_KEY` on the server only. Provision persistent storage for server bookings if needed.
3. Set `apiBase` in `public/config.js` to the backend's HTTPS origin and push the change. This switches the frontend to server APIs and SSE. It does not silently switch back to browser bookings if the backend is down.

`npm run test:pages` serves the repository under `/live-train-/` with **no API backend** and checks styling/assets, search, booking and persistence, PNR lookup, simulated telemetry, assistant commands, navigation and mobile widths. `npm run test:browser` verifies the separate Express mode. Shared catalog, telemetry, weather and command logic live in `public/shared/`; server credentials and provider calls stay in `assistant.js` on the server.

## Useful endpoints

- `GET /api/health`
- `GET /api/stations`
- `GET /api/trains/search?from=MAS&to=SBC&type=normal`
- `GET /api/trains/by-number/12639`
- `GET /api/trains/:id`
- `GET /api/trains/:id/live`
- `GET /api/trains/:id/live-stream` (SSE)
- `GET /api/weather?lat=12.9&lng=77.5`
- `GET /api/tourist-spots?city=Bengaluru`
- `GET /api/bookings`
- `GET /api/bookings/pnr/:pnr`
- `POST /api/bookings`

## Production notes

This project is a full-stack demo/starter, not a real railway ticketing system. Before production:

1. Replace simulated live data with an authorized railway tracking provider.
2. Replace JSON booking storage with PostgreSQL/MySQL and transactional writes.
3. Add real authentication, authorization, sessions/JWT as appropriate, password hashing and account recovery.
4. Connect an approved payment gateway. Never store raw card details yourself.
5. Add provider-backed seat availability, booking confirmation, cancellation, refund and PNR APIs.
6. Add notification infrastructure (email/SMS/push), rate limiting, structured logging, monitoring and audit trails.
7. Add automated tests, accessibility testing, security review and deployment configuration.

See `AUDIT.md` for the v1 issues that were found and addressed.

## Reference UI update

The dashboard now follows the supplied Live Train reference: navy navigation, a locally stored train hero, compact booking form, live route overview, upcoming tickets, destination cards, and mobile bottom navigation. Detailed booking, tracking and weather sections remain connected to the existing Express API.

Use **Sign in** (or **Profile** on mobile) to preview the mobile-number → OTP → Google option → success screens. Any valid-format Indian mobile number works with demo OTP `123456`. No SMS is sent and Google OAuth is not configured. The Google button explains this; the mobile demo option completes the preview. Only a demo-profile flag is saved in browser storage.

Visual styles are in `public/reference.css`; dashboard and login interactions are in `public/design.js`. Local imagery is in `public/assets`, with attribution at `/photo-credits.html`. Run `npm run check` for syntax validation.

## Live Train voice assistant

Click **Ask Live Train** at the bottom right. Select **தமிழ்** or **English**, click the microphone and allow microphone access. A final recognized sentence is sent automatically. You can also type, edit an interim transcript and press **Send**. Replies appear in chat and are read aloud when **Voice on** is enabled. **Stop** cancels a pending answer or speech; closing the panel stops the microphone and playback. **Clear** removes the in-memory conversation.

Try:

- `Chennai to Bangalore tomorrow for two passengers`
- `சென்னை முதல் பெங்களூரு நாளை ரயில்`
- `chennai to bangalore naalaikku train venum`
- `Track 12639` / `12639 ரயில் எங்கே?`
- `Weather in Bengaluru` / `பெங்களூரு வானிலை`
- `Tourist spots near Mysuru`
- `Show my bookings` / `என் டிக்கெட்டுகள்`

Search commands populate the form and fetch matching trains. Tracking commands select the train and read server telemetry. **View in Live Train** opens the matching section. The assistant can look up demo PNRs but does not purchase, cancel or pay for tickets. Weather answers use the existing provider; sample fallback weather is identified as unavailable rather than presented as live data.

### AI connection

Without `OPENAI_API_KEY`, the panel clearly shows **Basic commands**. This uses a deterministic Tamil/English/Tanglish command parser, not an LLM. It supports the examples above, ISO dates (`YYYY-MM-DD`), today/tomorrow and one to six passengers. It cannot interpret every phrasing; the general AI mode handles broader natural language and conversational follow-ups.

To enable AI, put your own OpenAI API key into the project-root `.env` file locally (never paste it in chat or put it in `public/`):

```dotenv
PORT=4173
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

If `.env` does not exist, copy `.env.example` first. Restart `npm run dev` after changing the key. Open the assistant again; it will show **AI connected** when a key is configured. Successful replies are labelled AI; a provider error returns an explicit fallback notice and **Basic commands**. A configured key alone does not verify provider access or billing.

The server calls the [OpenAI Responses API with structured output](https://developers.openai.com/api/docs/guides/structured-outputs), validates the intent and performs only allowed application actions. The default configurable model is [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini). `store: false` is sent with each request. API credentials stay on the server. The assistant sends the current message, up to six recent messages and the current route/selected train context; it does not automatically send booking history. Messages are not persisted by Live Train. Requests have input limits, timeouts and a per-IP rate limit. This remains the existing unauthenticated demo app; use authenticated user sessions and per-user quotas before publicly exposing a funded AI endpoint.

### Voice compatibility and verification

Voice input uses the browser's [SpeechRecognition API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), whose support varies by browser and which may use an online recognition service. Use a supported browser on **localhost or HTTPS**. Text chat stays available when recognition is unsupported or permission is denied. Spoken output uses [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis); Tamil playback requires a Tamil voice installed/available on the device. If one is missing, the assistant displays the Tamil reply and explains the limitation. Live Train does not record or upload audio files itself.

```bash
npm run check
npm test
npm run test:browser
```

Browser tests use installed Chrome/Edge on Windows, `BROWSER_PATH` if set, or Playwright Chromium elsewhere (`npx playwright install chromium`). They launch an isolated test server on port 4187 and save desktop/mobile previews in `test-results/`. Tests cover train actions, Tamil/English parsing, unsupported routes, validation, weather fallback, AI errors, rate limits, microphone lifecycle, permission errors, text fallback and responsive layouts. Provider responses and speech events are mocked; actual microphone recognition, device voices and a live OpenAI call require manual testing with a microphone and configured API key.

Implementation: `assistant.js` (server), `public/assistant.js` (chat and voice), `public/assistant.css` (responsive panel).
