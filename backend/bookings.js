import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma, writeTransaction } from './db.js';
import { requireAuth, fail } from './auth.js';
import { findTrain, trainInclude, stationDto, journeyDate } from './catalog.js';

const include = { passengers: true, train: { include: trainInclude } };
export function bookingDto(b) {
  return { ...b, passengerDetails: b.passengers, passengers: b.passengers.length, status: b.bookingStatus,
    trainNo: b.train.trainNumber, trainName: b.train.name, type: b.train.type,
    from: stationDto(b.train.originStation), to: stationDto(b.train.destinationStation),
    travelClass: b.classCode, fare: b.totalFare, coach: b.passengers[0]?.coach,
    seat: b.passengers.map(p => `S${p.seatNumber}`).join(', '), paymentStatus: 'DEMO_SUCCESS' };
}
const passenger = z.object({ name: z.string().trim().min(2).max(80), age: z.number().int().min(1).max(120), gender: z.enum(['male', 'female', 'other']) });
const schema = z.object({ trainId: z.string().min(1).max(80).optional(), trainNumber: z.string().max(12).optional(), journeyDate,
  classCode: z.string().max(10).optional(), travelClass: z.string().max(10).optional(),
  passengers: z.array(passenger).min(1).max(6), seat: z.string().regex(/^S?\d{1,3}$/).optional() });

export function registerBookings(app) {
  app.use('/api/bookings', requireAuth, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.post('/api/bookings', async (req, res) => {
    const input = schema.parse(req.body);
    if (!input.trainId && !input.trainNumber) throw fail(400, 'Choose a train.');
    const result = await writeTransaction(async tx => {
      const t = await findTrain(input.trainId || input.trainNumber, tx);
      const c = t.classes.find(c => c.classCode === (input.classCode || input.travelClass || '').toUpperCase());
      if (!c) throw fail(400, 'Invalid class for selected train.');
      const inventory = await tx.journeyInventory.upsert({ where: { trainClassId_journeyDate: { trainClassId: c.id, journeyDate: input.journeyDate } },
        create: { trainClassId: c.id, journeyDate: input.journeyDate, availableSeats: c.totalSeats }, update: {}, include: { reservations: true } });
      const count = input.passengers.length;
      const claimed = await tx.journeyInventory.updateMany({ where: { id: inventory.id, availableSeats: { gte: count } }, data: { availableSeats: { decrement: count } } });
      if (!claimed.count) throw fail(409, 'Not enough seats for this journey. Choose another class or date.');
      const taken = new Set(inventory.reservations.map(s => s.seatNumber));
      const seats = [];
      if (input.seat) {
        const preferred = Number(input.seat.replace('S', ''));
        if (preferred < 1 || preferred > c.totalSeats || taken.has(preferred)) throw fail(409, 'Selected seat is unavailable. Refresh the seat map.');
        seats.push(preferred); taken.add(preferred);
      }
      for (let n = 1; seats.length < count && n <= c.totalSeats; n++) if (!taken.has(n)) seats.push(n);
      if (seats.length !== count) throw fail(409, 'Seat inventory changed. Please retry.');
      const coach = ({ '1A': 'H1', '2A': 'A1', '3A': 'B1', SL: 'S1' })[c.classCode] || 'C1';
      let pnr;
      do { pnr = String(crypto.randomInt(1_000_000_000, 10_000_000_000)); } while (await tx.booking.findUnique({ where: { pnr } }));
      return tx.booking.create({ data: { pnr, userId: req.user.id, trainId: t.id, journeyDate: input.journeyDate, classCode: c.classCode,
        totalFare: c.fare * count,
        passengers: { create: input.passengers.map((p, i) => ({ ...p, coach, seatNumber: seats[i] })) },
        reservations: { create: seats.map(seatNumber => ({ inventoryId: inventory.id, seatNumber })) },
      }, include });
    });
    res.status(201).json(bookingDto(result));
  });
  app.get('/api/bookings', async (req, res) => res.json((await prisma.booking.findMany({ where: { userId: req.user.id }, include, orderBy: { createdAt: 'desc' } })).map(bookingDto)));
  app.get(['/api/bookings/pnr/:pnr', '/api/bookings/:pnr'], async (req, res) => {
    const pnr = z.string().regex(/^\d{10}$/).parse(req.params.pnr);
    const b = await prisma.booking.findFirst({ where: { pnr, userId: req.user.id }, include });
    if (!b) throw fail(404, 'PNR not found.');
    res.json(bookingDto(b));
  });
  app.patch('/api/bookings/:pnr/cancel', async (req, res) => {
    const pnr = z.string().regex(/^\d{10}$/).parse(req.params.pnr);
    const booking = await writeTransaction(async tx => {
      const b = await tx.booking.findFirst({ where: { pnr, userId: req.user.id }, include: { ...include, reservations: true } });
      if (!b) throw fail(404, 'PNR not found.');
      if (b.bookingStatus === 'CANCELLED') return b;
      const changed = await tx.booking.updateMany({ where: { id: b.id, bookingStatus: 'CONFIRMED' }, data: { bookingStatus: 'CANCELLED' } });
      if (changed.count) {
        const inventoryId = b.reservations[0]?.inventoryId;
        if (inventoryId) await tx.journeyInventory.update({ where: { id: inventoryId }, data: { availableSeats: { increment: b.reservations.length } } });
        await tx.seatReservation.deleteMany({ where: { bookingId: b.id } });
      }
      return { ...b, bookingStatus: 'CANCELLED' };
    });
    res.json(bookingDto(booking));
  });
}
