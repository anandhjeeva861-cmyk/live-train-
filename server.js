import { searchFleet } from './public/shared/fleet-search.js';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { trains, stations, touristSpots } from './data/mockData.js';
import dotenv from 'dotenv';
import { registerAssistant } from './assistant.js';
import { getLiveState } from './public/shared/tracking.js';
import { getWeatherData } from './public/shared/weather.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

const app = express();
const PORT = Number(process.env.PORT) || 4173;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOOKINGS_FILE = path.join(__dirname, 'data', 'bookings.json');

app.disable('x-powered-by');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean);
app.use('/api', (req, res, next) => {
  const origin = req.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function parseType(value) {
  const type = String(value || 'all').toLowerCase();
  return ['all', 'normal', 'tourism'].includes(type) ? type : null;
}

async function readBookings() {
  try {
    const raw = await fs.readFile(BOOKINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBookings(bookings) {
  const temp = `${BOOKINGS_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(bookings, null, 2));
  await fs.rename(temp, BOOKINGS_FILE);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'live-train', time: new Date().toISOString() }));

app.get('/api/stations', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const result = q
    ? stations.filter(s => `${s.name} ${s.code} ${s.city}`.toLowerCase().includes(q)).slice(0, 12)
    : stations;
  res.json(result);
});

app.get('/api/trains/catalog', (req, res) => res.json(searchFleet(new URL(req.originalUrl, 'http://localhost').searchParams)));

app.get('/api/trains/search', (req, res) => {
  const from = String(req.query.from || '').trim().toUpperCase();
  const to = String(req.query.to || '').trim().toUpperCase();
  const type = parseType(req.query.type);
  const travelClass = String(req.query.class || '').trim().toUpperCase();

  if (!type) return res.status(400).json({ error: 'Invalid train type' });
  if (!stations.some(s => s.code === from) || !stations.some(s => s.code === to)) return res.status(400).json({ error: 'Valid from and to stations are required' });
  if (from === to) return res.status(400).json({ error: 'From and To stations must be different' });

  let result = trains.filter(t => t.from.code === from && t.to.code === to);
  if (type !== 'all') result = result.filter(t => t.type === type);
  if (travelClass) result = result.filter(t => Object.hasOwn(t.fare, travelClass));
  res.json({ count: result.length, trains: result });
});

app.get('/api/trains/by-number/:number', (req, res) => {
  const train = trains.find(t => t.number.toLowerCase() === String(req.params.number).toLowerCase());
  if (!train) return res.status(404).json({ error: 'Train not found' });
  res.json(train);
});

app.get('/api/trains/:id/live', (req, res) => {
  const train = trains.find(t => t.id === req.params.id);
  if (!train) return res.status(404).json({ error: 'Train not found' });
  res.json(getLiveState(train));
});

app.get('/api/trains/:id/live-stream', (req, res) => {
  const train = trains.find(t => t.id === req.params.id);
  if (!train) return res.status(404).json({ error: 'Train not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = () => res.write(`event: live\ndata: ${JSON.stringify(getLiveState(train))}\n\n`);
  send();
  const timer = setInterval(send, 2000);
  req.on('close', () => clearInterval(timer));
});

app.get('/api/trains/:id', (req, res) => {
  const train = trains.find(t => t.id === req.params.id);
  if (!train) return res.status(404).json({ error: 'Train not found' });
  res.json(train);
});

app.get('/api/tourist-spots', (req, res) => {
  const city = String(req.query.city || '').trim().toLowerCase();
  const list = city ? touristSpots.filter(s => s.city.toLowerCase() === city) : touristSpots;
  res.json(list.slice(0, 12));
});

app.get('/api/weather', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng are required' });
  res.json(await getWeatherData(lat, lng));
});

registerAssistant(app, { getLiveState, getWeatherData });

app.get('/api/bookings', async (_req, res) => {
  const bookings = await readBookings();
  res.json(bookings.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
});

app.get('/api/bookings/pnr/:pnr', async (req, res) => {
  const bookings = await readBookings();
  const booking = bookings.find(b => b.pnr === String(req.params.pnr));
  if (!booking) return res.status(404).json({ error: 'PNR not found' });
  res.json(booking);
});

app.post('/api/bookings', async (req, res) => {
  const train = trains.find(t => t.id === req.body?.trainId);
  if (!train) return res.status(400).json({ error: 'Invalid train' });

  const travelClass = String(req.body?.travelClass || '').toUpperCase();
  if (!Object.hasOwn(train.fare, travelClass)) return res.status(400).json({ error: 'Invalid class for selected train' });

  const passengers = Number(req.body?.passengers);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 6) return res.status(400).json({ error: 'Passengers must be between 1 and 6' });

  const seat = String(req.body?.seat || '').trim();
  if (!/^S?\d{1,2}$/i.test(seat)) return res.status(400).json({ error: 'Select a valid seat' });

  const journeyDate = String(req.body?.journeyDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) return res.status(400).json({ error: 'Invalid journey date' });

  const booking = {
    id: crypto.randomUUID(),
    pnr: String(crypto.randomInt(1_000_000_000, 9_999_999_999)),
    status: 'CONFIRMED',
    trainId: train.id,
    trainNo: train.number,
    trainName: train.name,
    type: train.type,
    from: train.from,
    to: train.to,
    journeyDate,
    travelClass,
    passengers,
    seat: seat.toUpperCase(),
    coach: travelClass === '1A' ? 'H1' : travelClass === '2A' ? 'A2' : travelClass === '3A' ? 'B4' : travelClass === 'SL' ? 'S6' : 'C2',
    fare: train.fare[travelClass] * passengers,
    paymentStatus: 'DEMO_SUCCESS',
    createdAt: new Date().toISOString()
  };

  const bookings = await readBookings();
  bookings.push(booking);
  await writeBookings(bookings);
  res.status(201).json(booking);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'API endpoint not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

app.listen(PORT, () => console.log(`Live Train v2 running on http://localhost:${PORT}`));
