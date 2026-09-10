import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { trains, stations, touristSpots } from './data/mockData.js';
import dotenv from 'dotenv';
import { registerAssistant } from './assistant.js';

dotenv.config({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

const app = express();
const PORT = Number(process.env.PORT) || 4173;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOOKINGS_FILE = path.join(__dirname, 'data', 'bookings.json');
const weatherCache = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

const toRad = deg => (deg * Math.PI) / 180;
const toDeg = rad => (rad * 180) / Math.PI;

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

function bearingDeg(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function interpolate(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

function routeMetrics(route) {
  const segmentKm = [];
  let totalKm = 0;
  for (let i = 0; i < route.length - 1; i += 1) {
    const km = haversineKm(route[i], route[i + 1]);
    segmentKm.push(km);
    totalKm += km;
  }
  return { segmentKm, totalKm };
}

function numericSeed(text) {
  return [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function getLiveState(train) {
  const metrics = routeMetrics(train.route);
  const cycleSeconds = 48 * 60;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const offset = numericSeed(train.id) * 19;
  const progress = ((nowSeconds + offset) % cycleSeconds) / cycleSeconds;
  const distanceTravelledKm = Math.min(metrics.totalKm * progress, Math.max(metrics.totalKm - 0.01, 0));

  let remainingOnRoute = distanceTravelledKm;
  let leg = 0;
  while (leg < metrics.segmentKm.length - 1 && remainingOnRoute > metrics.segmentKm[leg]) {
    remainingOnRoute -= metrics.segmentKm[leg];
    leg += 1;
  }

  const legDistance = metrics.segmentKm[leg] || 1;
  const legProgress = Math.min(1, remainingOnRoute / legDistance);
  const fromPoint = train.route[leg];
  const toPoint = train.route[Math.min(leg + 1, train.route.length - 1)];
  const position = interpolate(fromPoint, toPoint, legProgress);
  const speedKmph = Math.round(66 + 24 * Math.sin((nowSeconds + offset) / 31) + 8 * Math.sin((nowSeconds + offset) / 7));
  const safeSpeed = Math.max(38, speedKmph);
  const distanceRemainingKm = Math.max(0, metrics.totalKm - distanceTravelledKm);
  const etaMinutes = Math.max(1, Math.round((distanceRemainingKm / safeSpeed) * 60));
  const delayMinutes = Math.max(0, Math.round(7 * Math.sin((nowSeconds + offset) / 97)));
  const arrivalAt = new Date(Date.now() + etaMinutes * 60_000).toISOString();

  return {
    trainId: train.id,
    trainNo: train.number,
    trainName: train.name,
    lat: Number(position.lat.toFixed(6)),
    lng: Number(position.lng.toFixed(6)),
    bearing: Number(bearingDeg(fromPoint, toPoint).toFixed(1)),
    speedKmph: safeSpeed,
    progress: Number(progress.toFixed(4)),
    segmentProgress: Number(legProgress.toFixed(4)),
    currentSection: `${fromPoint.code} → ${toPoint.code}`,
    previousStation: fromPoint.name,
    nextStation: toPoint.name,
    nextStationCode: toPoint.code,
    etaMinutes,
    arrivalAt,
    distanceRemainingKm: Number(distanceRemainingKm.toFixed(1)),
    delayMinutes,
    runningStatus: delayMinutes <= 2 ? 'ON_TIME' : 'DELAYED',
    platform: String(((numericSeed(toPoint.code) + leg) % 6) + 1),
    updatedAt: new Date().toISOString()
  };
}

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

async function getWeatherData(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.time < 10 * 60_000) return { ...cached.data, cached: true };

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=2`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Weather provider status ${response.status}`);
    const data = await response.json();
    weatherCache.set(key, { time: Date.now(), data });
    return data;
  } catch {
    return {
      current: { temperature_2m: 29, apparent_temperature: 31, weather_code: 2, wind_speed_10m: 13 },
      hourly: {
        temperature_2m: [29, 29, 28, 28, 27, 27],
        weather_code: [2, 2, 3, 61, 61, 3],
        precipitation_probability: [16, 18, 25, 42, 38, 22]
      },
      fallback: true
    };
  }
}

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
