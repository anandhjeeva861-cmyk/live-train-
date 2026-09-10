import { prisma } from './db.js';
import { findTrain, trainDto } from './catalog.js';
import { getLiveState, getSchedule } from '../public/shared/tracking.js';
import { fail, production, requireAuth } from './auth.js';

export const streams = new Map();
const snapshotTimes = new Map();
export async function liveSnapshot(train) {
  if (production) throw fail(503, 'Live railway tracking provider is not configured.');
  const live = getLiveState(train);
  const previousIndex = train.route.findIndex(s => s.code === live.nextStationCode) - 1;
  const result = { ...live, trainNumber: live.trainNo, latitude: live.lat, longitude: live.lng,
    currentSpeed: live.speedKmph, averageSpeed: getSchedule(train).speed,
    destination: train.to.name, distanceTravelled: live.distanceTravelledKm, distanceRemaining: live.distanceRemainingKm,
    progressPercent: +(live.progress * 100).toFixed(3), expectedArrival: live.arrivalAt, lastUpdated: live.updatedAt };
  if (Date.now() - (snapshotTimes.get(train.id) || 0) > 10_000) {
    if (snapshotTimes.size > 1500) snapshotTimes.clear();
    snapshotTimes.set(train.id, Date.now());
    const data = { latitude: live.lat, longitude: live.lng, currentSpeed: live.speedKmph, averageSpeed: result.averageSpeed,
      nextStationId: live.nextStationCode, previousStationId: train.route[Math.max(0, previousIndex)].code,
      distanceRemaining: live.distanceRemainingKm, progressPercent: result.progressPercent, delayMinutes: live.delayMinutes, platform: live.platform, status: live.motionStatus };
    await prisma.liveTrainStatus.upsert({ where: { trainId: train.id }, create: { trainId: train.id, ...data }, update: data });
  }
  return result;
}
export function closeStreams() { for (const entry of streams.values()) { clearInterval(entry.timer); for (const client of entry.clients) client.end(); } streams.clear(); }
export function registerTracking(app) {
  app.get(['/api/tracking/:number', '/api/trains/:number/live'], requireAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await liveSnapshot(trainDto(await findTrain(req.params.number))));
  });
  app.get(['/api/tracking/:number/stream', '/api/trains/:number/live-stream'], requireAuth, async (req, res) => {
    const train = trainDto(await findTrain(req.params.number));
    const first = await liveSnapshot(train);
    const viewerCount = [...streams.values()].reduce((sum, s) => sum + [...s.clients].filter(c => c.viewer === req.user.id).length, 0);
    if (viewerCount >= 5) throw fail(429, 'Too many tracking streams. Close another tab.');
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`retry: 3000\nevent: live\ndata: ${JSON.stringify(first)}\n\n`);
    let entry = streams.get(train.id);
    if (!entry) {
      entry = { clients: new Set(), busy: false };
      entry.timer = setInterval(async () => {
        if (entry.busy) return;
        entry.busy = true;
        try {
          const value = await liveSnapshot(train);
          for (const client of entry.clients) {
            if (client.writableLength > 65536 || client.sessionExpires < Date.now()) { client.end(); continue; }
            client.write(`event: live\ndata: ${JSON.stringify(value)}\n\n`);
          }
        } catch { for (const client of entry.clients) client.end(); }
        finally { entry.busy = false; }
      }, 2500);
      streams.set(train.id, entry);
    }
    res.viewer = req.user.id;
    res.authSession = req.sessionID;
    res.sessionExpires = new Date(req.session.cookie.expires).getTime();
    entry.clients.add(res);
    res.on('close', () => { entry.clients.delete(res); if (!entry.clients.size) { clearInterval(entry.timer); streams.delete(train.id); } });
  });
}
