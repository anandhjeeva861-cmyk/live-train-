import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from './backend/db.js';
import { authMiddleware, registerAuth, requireAuth, production, fail } from './backend/auth.js';
import { registerCatalog, loadTrains, trainDto, spotDto } from './backend/catalog.js';
import { registerBookings } from './backend/bookings.js';
import { registerTracking, closeStreams, streams, liveSnapshot } from './backend/tracking.js';
import { registerAssistant } from './assistant.js';
import { getWeatherData } from './public/shared/weather.js';

export const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 4173;
const origin = process.env.FRONTEND_URL || `http://localhost:${port}`;
const origins = new Set([origin, ...(!production ? [`http://localhost:${port}`, `http://127.0.0.1:${port}`] : []), ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)]);
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: ["'self'", ...origins], upgradeInsecureRequests: production ? [] : null,
} }, crossOriginEmbedderPolicy: false, strictTransportSecurity: production ? undefined : false }));
app.use(cors({ origin: (value, cb) => cb(null, !value || origins.has(value)), credentials: true, methods: ['GET', 'POST', 'PATCH', 'OPTIONS'] }));
app.use(express.json({ limit: '64kb' }));
app.use('/api', (req, _res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && ((req.get('origin') && !origins.has(req.get('origin'))) || req.get('sec-fetch-site') === 'cross-site')) throw fail(403, 'Request origin is not allowed.');
  next();
});
app.use('/api', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Try again in a minute.' } }));
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
  const coordinate = (value, max) => z.coerce.number().min(-max).max(max).parse(value);
  if (req.query.lat === undefined || (req.query.lon === undefined && req.query.lng === undefined) || req.query.lat === '' || req.query.lon === '' || req.query.lng === '') throw fail(400, 'lat and lon are required.');
  res.json(await getWeatherData(coordinate(req.query.lat, 90), coordinate(req.query.lon ?? req.query.lng, 180)));
});
app.use('/api/assistant', requireAuth);
registerAssistant(app, { getLiveState: liveSnapshot, getWeatherData, getCatalog: async () => ({
  trains: (await loadTrains()).map(trainDto),
  touristSpots: (await prisma.touristSpot.findMany({ include: { station: true } })).map(spotDto),
}) });
app.get(['/dashboard', '/book', '/tracking', '/bookings'], async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try { await requireAuth(req, res, next); }
  catch (error) { if (error.status === 401) return res.redirect('/login'); throw error; }
});
app.use(express.static(path.join(root, 'public')));
app.get(['/', '/login', '/dashboard', '/book', '/tracking', '/bookings'], (_req, res) => res.sendFile(path.join(root, 'public/index.html')));
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
  const server = app.listen(port, error => { if (error) { console.error(`Could not listen on port ${port}. Stop the previous server or change PORT.`); process.exit(1); } console.log(`Live Train v2 running on http://localhost:${port}`); });
  const shutdown = () => { closeStreams(); server.close(async () => { await prisma.$disconnect(); process.exit(0); }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
