import { trains } from './catalog.js';

export function searchFleet(params) {
  const q = String(params.get('q') || '').trim().toLowerCase().slice(0, 100);
  const type = params.get('type') || 'all';
  const offset = Math.max(0, Math.floor(Number(params.get('offset')) || 0));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(params.get('limit')) || 12)));
  const matches = trains.filter(t => (type === 'all' || t.type === type) &&
    `${t.number} ${t.name} ${t.route.map(s => `${s.code} ${s.city}`).join(' ')}`.toLowerCase().includes(q));
  return { total: trains.length, count: matches.length, offset, limit,
    trains: matches.slice(offset, offset + limit) };
}
