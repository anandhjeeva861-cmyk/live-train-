import { stations, trains, trainByNumber, stationByCode, searchCatalog } from './shared/catalog.js';
import { routeTourism } from './shared/geography.js';
import { getWeatherData } from './shared/weather.js';
import { createAssistant, indiaDate, validDate } from './shared/assistant-core.js';
const buckets = new Map();
let photos;
async function readData(file) {
 const response = await fetch(new URL(`./data/${file}`, import.meta.url));
 if (!response.ok) throw new Error('Published data could not load. Please retry.');
 return response.json();
}
async function spots() { photos ||= readData('tourist-spots.json').catch(error => { photos = null; throw error; }); return photos; }
async function trainDetail(id) {
 const train = trainByNumber.get(id);
 if (!train) throw new Error('Train not found.');
 const prefix = train.number.slice(0,2);
 if (!buckets.has(prefix)) buckets.set(prefix, readData(`routes/${prefix}.json`).catch(error => { buckets.delete(prefix); throw error; }));
 const stops = (await buckets.get(prefix))[train.number];
 return { ...train, route: stops.map(s => ({ ...stationByCode.get(s.code), ...s })) };
}
const assistant = createAssistant({ getWeatherData, getCatalog: async () => ({ trains, touristSpots: await spots() }) });
export async function requestStatic(path, options = {}) {
 const url = new URL(path, 'https://railgo.invalid'), route = url.pathname, params = url.searchParams;
 const method = (options.method || 'GET').toUpperCase();
 if (method === 'POST' && route === '/api/assistant') {
  const body = JSON.parse(options.body || '{}');
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 800 || !['en-IN','ta-IN'].includes(body.language || 'en-IN')) throw new Error('Enter a message of 1–800 characters and a supported language.');
  return assistant({ message: body.message, language: body.language, context: body.context || {}, history: [] });
 }
 if (method !== 'GET') throw Object.assign(new Error('This action needs a connected service. Book valid railway tickets through IRCTC.'), { status: 503 });
 if (route === '/api/health') return { ok: true, mode: 'public-catalogue', currentServiceVerified: false };
 if (route === '/api/stations') { const q = (params.get('q') || '').toLowerCase(); return stations.filter(s => `${s.code} ${s.name} ${s.city}`.toLowerCase().includes(q)); }
 if (['/api/trains','/api/trains/search','/api/trains/catalog'].includes(route)) {
  const from = params.get('from'), to = params.get('to'), date = params.get('date');
  if ((from && !to) || (to && !from) || (from && (from === to || !stationByCode.has(from) || !stationByCode.has(to)))) throw new Error('Choose valid, different stations.');
  if (date && (!validDate(date) || date < indiaDate())) throw new Error('Choose today or a valid future date in India.');
  return searchCatalog(params);
 }
 if (route.startsWith('/api/trains/by-number/')) return trainDetail(decodeURIComponent(route.split('/').at(-1)));
 const train = route.match(/^\/api\/trains\/([^/]+)(?:\/(stops|classes|live))?$/);
 if (train) {
  if (train[2] === 'live') throw Object.assign(new Error('Live railway tracking provider is not configured. Check current status on NTES.'), { status: 503 });
  const detail = await trainDetail(decodeURIComponent(train[1]));
  return train[2] === 'classes' ? [] : train[2] === 'stops' ? detail.route : detail;
 }
 if (['/api/tourism','/api/tourist-spots'].includes(route)) {
  const stationCode = params.get('station');
  const routeStations = params.get('train') ? (await trainDetail(params.get('train'))).route : stations.filter(s => s.code === stationCode);
  const radiusKm = Number(params.get('radiusKm') || 30), offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 24);
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 100 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid tourism filters.');
  return routeTourism(await spots(), routeStations, { stationCode, radiusKm, offset, limit });
 }
 if (route === '/api/bookings') return [];
 if (route === '/api/weather') {
  const latitude = params.get('lat'), longitude = params.get('lon') ?? params.get('lng');
  const lat = Number(latitude), lng = Number(longitude);
  if (!latitude?.trim() || !longitude?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Valid weather coordinates are required.');
  return getWeatherData(lat,lng);
 }
 if (route === '/api/assistant/status') return { mode: 'commands', languages: ['ta-IN','en-IN'] };
 throw Object.assign(new Error('This feature needs a hosted backend.'), { status: 503 });
}
