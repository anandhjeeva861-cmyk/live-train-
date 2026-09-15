import { stationRows, trainRows } from '../data/catalog-index.js';
export const stations = stationRows;
export const stationByCode = new Map(stations.map(s => [s.code, s]));
export const trains = trainRows.map(t => ({ ...t, from: stationByCode.get(t.fromCode), to: stationByCode.get(t.toCode),
 route: t.routeCodes.map(code => stationByCode.get(code)), fare: {}, seats: {}, rating: null, bookingAvailable: false, liveAvailable: false }));
export const trainByNumber = new Map(trains.map(t => [t.number, t]));
export const touristSpots = [];
export function searchCatalog(params, catalog = trains) {
 const get = key => params instanceof URLSearchParams ? params.get(key) : params[key];
 const from = String(get('from') || '').toUpperCase(), to = String(get('to') || '').toUpperCase();
 const q = String(get('q') || '').trim().toLowerCase();
 const offset = Math.max(0, Number(get('offset')) || 0), limit = Math.min(50, Math.max(1, Number(get('limit')) || 12));
 const source = get('source');
 const matches = catalog.filter(t => {
  const codes = t.routeCodes || t.route.map(s => s.code);
  if (from && (!codes.includes(from) || !codes.slice(codes.indexOf(from) + 1).includes(to))) return false;
  if (source && t.sourceId !== source) return false;
  return !q || `${t.number} ${t.name} ${t.route.map(s => `${s.code} ${s.name}`).join(' ')}`.toLowerCase().includes(q);
 }).sort((a, b) => Number(Boolean(a.historical)) - Number(Boolean(b.historical)) || a.number.localeCompare(b.number));
 return { count: matches.length, total: catalog.length, offset, limit, trains: matches.slice(offset, offset + limit), currentServiceVerified: false };
}
