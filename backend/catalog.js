import { prisma } from './db.js';
import { fail } from './auth.js';
import { z } from 'zod';
import { indiaDate, validDate } from '../public/shared/assistant-core.js';

export const trainInclude = { originStation: true, destinationStation: true, stops: { include: { station: true }, orderBy: { stopOrder: 'asc' } }, classes: true };
export async function loadTrains(where = { active: true }, offset = 0, limit = null) {
  const rows = [];
  // Bound relation query parameters for SQLite's driver limit.
  do {
    const take = limit === null ? 100 : Math.min(100, limit - rows.length);
    if (!take) break;
    const page = await prisma.train.findMany({ where, include: trainInclude, orderBy: { trainNumber: 'asc' }, skip: offset + rows.length, take });
    rows.push(...page);
    if (page.length < take) break;
  } while (limit === null || rows.length < limit);
  return rows;
}
export const stationDto = s => ({ ...s, lat: s.latitude, lng: s.longitude });
export function trainDto(t) {
  return { ...t, number: t.trainNumber, from: stationDto(t.originStation), to: stationDto(t.destinationStation),
    departure: t.departureTime, arrival: t.arrivalTime,
    fare: Object.fromEntries(t.classes.map(c => [c.classCode, c.fare])),
    seats: Object.fromEntries(t.classes.map(c => [c.classCode, c.availableSeats])),
    route: t.stops.map(s => ({ ...stationDto(s.station), stopOrder: s.stopOrder, arrivalTime: s.arrivalTime, departureTime: s.departureTime, platform: s.platform, distanceKm: s.distanceKm })),
  };
}
export const journeyDate = z.string().refine(value => validDate(value) && value >= indiaDate(), 'Choose today or a valid future date in India.');
export async function findTrain(number, db = prisma) {
  const t = await db.train.findFirst({ where: { active: true, OR: [{ id: number }, { trainNumber: String(number).toUpperCase() }] }, include: trainInclude });
  if (!t) throw fail(404, 'Train not found.');
  return t;
}
export const spotDto = s => ({ ...s, city: s.station.city, image: s.imageUrl, lat: s.latitude, lng: s.longitude, distance: s.distanceKm });

export function registerCatalog(app) {
  app.get('/api/stations', async (req, res) => {
    const q = z.string().max(100).parse(req.query.q || '');
    res.json((await prisma.station.findMany({ where: q ? { OR: [{ code: { contains: q } }, { city: { contains: q } }, { name: { contains: q } }] } : {}, orderBy: { code: 'asc' } })).map(stationDto));
  });
  app.get(['/api/trains', '/api/trains/search', '/api/trains/catalog'], async (req, res) => {
    const query = z.object({ from: z.string().max(10).optional(), to: z.string().max(10).optional(), date: journeyDate.optional(),
      type: z.enum(['all', 'normal', 'tourism']).default('all'), class: z.string().max(10).optional(), q: z.string().max(100).default(''),
      offset: z.coerce.number().int().min(0).max(100000).default(0), limit: z.coerce.number().int().min(1).max(50).default(12) }).parse(req.query);
    const directory = req.path.endsWith('/catalog');
    if ((query.from && !query.to) || (!query.from && query.to) || (query.from && query.from === query.to)) throw fail(400, 'Choose different origin and destination stations.');
    const where = { active: true, ...(query.type !== 'all' && { type: query.type }),
      ...(query.from && { originStationId: query.from.toUpperCase(), destinationStationId: query.to.toUpperCase() }),
      ...(query.class && { classes: { some: { classCode: query.class.toUpperCase() } } }),
      ...(query.q && { OR: [{ trainNumber: { contains: query.q } }, { name: { contains: query.q } }, { stops: { some: { station: { OR: [{ city: { contains: query.q } }, { code: { contains: query.q } }] } } } }] }),
    };
    const [count, total, rows] = await Promise.all([prisma.train.count({ where }), prisma.train.count({ where: { active: true } }), loadTrains(where, directory ? query.offset : 0, directory ? query.limit : null)]);
    if (query.date) {
      const inventories = await prisma.journeyInventory.findMany({ where: { journeyDate: query.date } });
      for (const t of rows) for (const c of t.classes) c.availableSeats = inventories.find(i => i.trainClassId === c.id)?.availableSeats ?? c.totalSeats;
    }
    res.json({ count, total, offset: query.offset, limit: query.limit, trains: rows.map(trainDto) });
  });
  app.get('/api/trains/by-number/:number', async (req, res) => res.json(trainDto(await findTrain(req.params.number))));
  app.get('/api/trains/:number/stops', async (req, res) => res.json(trainDto(await findTrain(req.params.number)).route));
  app.get('/api/trains/:number/classes', async (req, res) => {
    const train = await findTrain(req.params.number);
    const date = journeyDate.parse(req.query.date || indiaDate());
    const inventories = await prisma.journeyInventory.findMany({ where: { journeyDate: date, trainClassId: { in: train.classes.map(c => c.id) } }, include: { reservations: true } });
    res.json(train.classes.map(c => { const inv = inventories.find(i => i.trainClassId === c.id); return { ...c, availableSeats: inv?.availableSeats ?? c.totalSeats, bookedSeats: inv?.reservations.map(s => s.seatNumber) || [] }; }));
  });
  app.get('/api/trains/:number', async (req, res) => res.json(trainDto(await findTrain(req.params.number))));
  app.get(['/api/tourism', '/api/tourist-spots'], async (req, res) => {
    const query = z.object({ station: z.string().max(10).optional(), city: z.string().max(100).optional() }).parse(req.query);
    const spots = await prisma.touristSpot.findMany({ where: { ...(query.station && { stationId: query.station.toUpperCase() }) }, include: { station: true } });
    res.json(spots.filter(s => !query.city || s.station.city.toLowerCase() === query.city.toLowerCase()).map(spotDto));
  });
  app.get('/api/tourism/:id', async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const s = await prisma.touristSpot.findUnique({ where: { id }, include: { station: true } });
    if (!s) throw fail(404, 'Tourist spot not found.');
    res.json(spotDto(s));
  });
}
