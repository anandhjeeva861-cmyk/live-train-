import { prisma } from '../backend/db.js';
import { stations, trains, touristSpots } from '../data/mockData.js';
import { getSchedule, getLiveState } from '../public/shared/tracking.js';

const names = { '2S': 'Second Sitting', CC: 'AC Chair Car', EC: 'Executive Chair', SL: 'Sleeper', '1A': 'First AC', '2A': 'Second AC', '3A': 'Third AC', EV: 'Vista Chair', PC: 'Premium Chair' };
try {
  for (const s of stations) await prisma.station.upsert({ where: { code: s.code }, update: {}, create: {
    id: s.code, code: s.code, name: s.name, city: s.city, latitude: s.lat, longitude: s.lng,
  } });
  // Idempotent: repeated dev starts never reset booked seats or user records.
  for (const t of trains) {
    const schedule = getSchedule(t);
    const minutes = Number(t.departure.slice(0, 2)) * 60 + Number(t.departure.slice(3));
    const clock = seconds => { const m = Math.floor(minutes + seconds / 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
    const endMinutes = Number(t.arrival.slice(0, 2)) * 60 + Number(t.arrival.slice(3));
    const tripSeconds = ((endMinutes - minutes + 1440) % 1440 || 1440) * 60;
    const stopData = t.route.map((s, i) => {
      const arrival = i === 0 ? 0 : schedule.stops[i].distance / schedule.totalKm * tripSeconds;
      return { stationId: s.code, stopOrder: i, arrivalTime: clock(arrival),
        departureTime: clock(arrival + (i > 0 && i < t.route.length - 1 ? 120 : 0)),
        platform: String(i % 6 + 1), distanceKm: schedule.stops[i].distance };
    });
    const existing = await prisma.train.findUnique({ where: { id: t.id }, include: { stops: true } });
    if (existing) {
      for (const stop of stopData) {
        const previous = existing.stops.find(s => s.stopOrder === stop.stopOrder);
        if (previous && (previous.arrivalTime !== stop.arrivalTime || previous.departureTime !== stop.departureTime)) await prisma.trainStop.update({ where: { id: previous.id }, data: { arrivalTime: stop.arrivalTime, departureTime: stop.departureTime } });
      }
      continue;
    }
    const live = getLiveState(t);
    await prisma.train.create({ data: {
      id: t.id, trainNumber: t.number, name: t.name, type: t.type,
      originStationId: t.from.code, destinationStationId: t.to.code,
      departureTime: t.departure, arrivalTime: t.arrival, duration: t.duration, rating: t.rating,
      stops: { create: stopData },
      classes: { create: Object.entries(t.fare).map(([classCode, fare]) => ({ classCode, className: names[classCode] || classCode, fare,
        totalSeats: t.seats[classCode], availableSeats: t.seats[classCode] })) },
      liveStatus: { create: { latitude: live.lat, longitude: live.lng, currentSpeed: live.speedKmph, averageSpeed: schedule.speed,
        nextStationId: live.nextStationCode, previousStationId: t.route[0].code,
        distanceRemaining: live.distanceRemainingKm, progressPercent: live.progress * 100,
        delayMinutes: live.delayMinutes, platform: live.platform, status: live.motionStatus } },
    } });
  }
  const images = { 3: '/assets/lalbagh.jpg', 4: '/assets/bangalore-palace.jpg', 5: '/assets/lalbagh.jpg', 6: '/assets/nandi-hills.jpg' };
  for (const s of touristSpots) await prisma.touristSpot.upsert({ where: { id: s.id }, update: {}, create: {
    id: s.id, stationId: stations.find(st => st.city === s.city).code,
    name: s.name, description: `Explore ${s.name} near ${s.city}. Demo distance from the station: ${s.distanceKm} km.`,
    category: s.category, imageUrl: images[s.id] || s.image,
    latitude: s.lat, longitude: s.lng, distanceKm: s.distanceKm, rating: s.rating,
  } });
  console.log(`Seed verified: ${await prisma.station.count()} stations, ${await prisma.train.count()} trains, ${await prisma.touristSpot.count()} tourist spots.`);
} finally { await prisma.$disconnect(); }
