import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import { createLimiter } from './backend/rate-limit.js';
import { z } from 'zod';
import { prisma } from './backend/db.js';
import { authMiddleware, registerAuth, requireAuth, production, fail } from './backend/auth.js';
import { emailSetupIssues } from './backend/email.js';
import { serverOrigins, validateProduction } from './backend/deployment.js';
import { registerCatalog, publicSpots } from './backend/catalog.js';
import { trains } from './public/shared/catalog.js';
import { registerBookings } from './backend/bookings.js';
import { registerTracking, closeStreams, streams, liveSnapshot } from './backend/tracking.js';
import { registerAssistant } from './assistant.js';
import { getWeatherData } from './public/shared/weather.js';

export const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4173;
validateProduction();
const origins = serverOrigins();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true' || process.env.VERCEL === '1') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: ["'self'", ...origins], upgradeInsecureRequests: production ? [] : null,
} }, crossOriginEmbedderPolicy: false, strictTransportSecurity: production ? undefined : false }));
app.use(cors({ origin: (value, cb) => cb(null, !value || origins.has(value)), credentials: true, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] }));
app.use(express.json({ limit: '64kb' }));
app.use('/api', (req, _res, next) => {
  const source = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (source ? !origins.has(source) : req.get('sec-fetch-site') === 'cross-site')) throw fail(403, 'Request origin is not allowed.');
  next();
});
app.use('/api', createLimiter('api', { windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Try again in a minute.' } }));
app.use(authMiddleware());
app.get('/api/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', database: 'connected', ok: true }); }
  catch { res.status(503).json({ status: 'error', database: 'disconnected' }); }
});
app.post('/api/auth/logout', (req, _res, next) => { for (const entry of streams.values()) for (const client of entry.clients) if (client.authSession === req.sessionID) client.end(); next(); });
registerAuth(app);
registerCatalog(app);
registerBookings(app);
registerTracking(app);
app.get('/api/weather', async (req, res) => {
  const coordinate = (value, max) => z.string().trim().min(1).pipe(z.coerce.number().min(-max).max(max)).parse(value);
  if (req.query.lat === undefined || (req.query.lon === undefined && req.query.lng === undefined) || req.query.lat === '' || req.query.lon === '' || req.query.lng === '') throw fail(400, 'lat and lon are required.');
  res.json(await getWeatherData(coordinate(req.query.lat, 90), coordinate(req.query.lon ?? req.query.lng, 180)));
});
registerAssistant(app, { getLiveState: liveSnapshot, getWeatherData, getCatalog: async () => ({
  trains,
  touristSpots: publicSpots,
}) });
// The app served by Node always uses its own origin, even if a branch-based
// Pages deployment has a public backend URL checked into public/config.js.
app.get('/config.js', (_req, res) => res.type('js').set('Cache-Control', 'no-store').send('window.LIVE_TRAIN_CONFIG = { apiBase: "" };\n'));
app.use(express.static(path.join(root, 'public')));
app.get(['/', '/profile', '/login', '/dashboard', '/book', '/tracking', '/bookings'], (_req, res) => res.sendFile(path.join(root, 'public/index.html')));
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((error, _req, res, _next) => {
  if (res.headersSent) return res.end();
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
  const conflict = ['P2002', 'P2034', 'P2028'].includes(error.code);
  const status = error.status || (conflict ? 409 : 500);
  if (status === 500) console.error('Request failed with an internal error.');
  res.status(status).json({ error: status === 500 ? 'Unexpected server error.' : conflict ? 'Data changed during this request. Refresh and retry.' : error.message });
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missingEmail = emailSetupIssues();
  if (missingEmail.length) console.warn('Email login unavailable: configure ' + missingEmail.join(', ') + ' on this backend. See AUTH_SETUP.md.');
  const server = app.listen(port, error => { if (error) { console.error(`Could not listen on port ${port}. Stop the previous server or change PORT.`); process.exit(1); } console.log(`Live Train v2 running on http://localhost:${port}`); });
  const shutdown = () => { closeStreams(); server.close(async () => { await prisma.$disconnect(); process.exit(0); }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
