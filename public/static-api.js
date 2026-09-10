import { stations, trains, touristSpots } from './shared/catalog.js';
import { getLiveState } from './shared/tracking.js';
import { getWeatherData } from './shared/weather.js';
import { createAssistant, indiaDate } from './shared/assistant-core.js';

const storageKey = `live-train-bookings:${new URL('.', import.meta.url).pathname}`;
const assistant = createAssistant({ getLiveState, getWeatherData });
function readBookings() {
  let raw;
  try { raw = localStorage.getItem(storageKey); }
  catch { throw new Error('Browser storage is unavailable. Allow site storage to save or view demo tickets.'); }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.filter(b => b && typeof b.pnr === 'string' && trains.some(t => t.id === b.trainId) && b.from?.code && b.to?.code);
  } catch { throw new Error('Saved ticket data is unreadable. Clear this site’s browser storage to start again.'); }
}
function requireTrain(id) {
  const train = trains.find(t => t.id === id);
  if (!train) throw new Error('Train not found');
  return train;
}
function book(body) {
  const train = requireTrain(body.trainId);
  const travelClass = String(body.travelClass || '').toUpperCase();
  if (!Object.hasOwn(train.fare, travelClass)) throw new Error('Invalid travel class');
  const passengers = Number(body.passengers);
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 6) throw new Error('Passengers must be between 1 and 6');
  const journeyDate = String(body.journeyDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(journeyDate) || Number.isNaN(Date.parse(journeyDate)) || new Date(journeyDate).toISOString().slice(0, 10) !== journeyDate || journeyDate < indiaDate()) throw new Error('Choose today or a valid future journey date');
  const seat = String(body.seat || '').toUpperCase();
  if (!/^S(?:[1-9]|[12]\d|3[0-6])$/.test(seat)) throw new Error('Select an available seat');
  const bookings = readBookings();
  if (bookings.some(b => b.trainId === train.id && b.journeyDate === journeyDate && b.travelClass === travelClass && b.seat === seat)) throw new Error('This seat is already booked on this device. Choose another seat.');
  let pnr;
  do { pnr = String(1000000000 + crypto.getRandomValues(new Uint32Array(1))[0] % 9000000000); } while (bookings.some(b => b.pnr === pnr));
  const booking = {
    id: crypto.randomUUID(), pnr, status: 'CONFIRMED', trainId: train.id, trainNo: train.number,
    trainName: train.name, type: train.type, from: train.from, to: train.to,
    journeyDate, travelClass, passengers, seat,
    coach: ({ '1A': 'H1', '2A': 'A2', '3A': 'B4', SL: 'S6' })[travelClass] || 'C2',
    fare: train.fare[travelClass] * passengers, paymentStatus: 'DEMO_SUCCESS', createdAt: new Date().toISOString()
  };
  try { localStorage.setItem(storageKey, JSON.stringify([...bookings, booking])); }
  catch { throw new Error('Could not save your ticket. Browser storage is blocked or full.'); }
  return booking;
}

export async function requestDemo(path, options = {}) {
  const url = new URL(path, location.origin), route = url.pathname, params = url.searchParams;
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'POST') {
    let body;
    try { body = JSON.parse(options.body || '{}'); } catch { throw new Error('Invalid request data'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request data');
    if (route === '/api/bookings') return book(body);
    if (route === '/api/assistant') {
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 800 || !['en-IN', 'ta-IN'].includes(body.language || 'en-IN')) throw new Error('Enter a message of 1–800 characters and a supported language');
      return assistant({ message: body.message, language: body.language, context: body.context || {}, history: [] });
    }
    throw new Error('This action is unavailable in the browser demo');
  }
  if (method !== 'GET') throw new Error('Unsupported request method');
  if (route === '/api/health') return { ok: true, service: 'live-train', mode: 'browser-demo' };
  if (route === '/api/stations') { const q = (params.get('q') || '').toLowerCase(); return stations.filter(s => `${s.name} ${s.code} ${s.city}`.toLowerCase().includes(q)); }
  if (route === '/api/trains/search') {
    const from = params.get('from'), to = params.get('to'), type = params.get('type') || 'all', travelClass = params.get('class');
    if (!stations.some(s => s.code === from) || !stations.some(s => s.code === to) || from === to) throw new Error('Choose valid, different departure and arrival stations');
    if (!['normal', 'tourism', 'all'].includes(type)) throw new Error('Invalid train type');
    const matches = trains.filter(t => t.from.code === from && t.to.code === to && (type === 'all' || t.type === type) && (!travelClass || Object.hasOwn(t.fare, travelClass)));
    return { count: matches.length, trains: matches };
  }
  if (route.startsWith('/api/trains/by-number/')) {
    const number = decodeURIComponent(route.split('/').at(-1)).toUpperCase();
    const train = trains.find(t => t.number.toUpperCase() === number);
    if (!train) throw new Error('Train not found');
    return train;
  }
  const trainRoute = route.match(/^\/api\/trains\/([^/]+)(\/live)?$/);
  if (trainRoute) { const train = requireTrain(decodeURIComponent(trainRoute[1])); return trainRoute[2] ? getLiveState(train) : train; }
  if (route === '/api/tourist-spots') return touristSpots.filter(s => !params.get('city') || s.city.toLowerCase() === params.get('city').toLowerCase()).slice(0, 12);
  if (route === '/api/bookings') return readBookings().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (route.startsWith('/api/bookings/pnr/')) {
    const booking = readBookings().find(b => b.pnr === route.split('/').at(-1));
    if (!booking) throw new Error('PNR not found on this device. Create a demo booking first.');
    return booking;
  }
  if (route === '/api/weather') {
    const lat = Number(params.get('lat')), lng = Number(params.get('lng'));
    if (!params.has('lat') || !params.has('lng') || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Valid weather coordinates are required');
    return getWeatherData(lat, lng);
  }
  if (route === '/api/assistant/status') return { mode: 'commands', languages: ['ta-IN', 'en-IN'] };
  throw new Error('This feature needs a hosted backend');
}
