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
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

const schedules = new WeakMap();
export function getSchedule(train) {
  if (schedules.has(train)) return schedules.get(train);
  const metrics = routeMetrics(train.route);
  const seed = numericSeed(train.id);
  const speed = train.type === 'tourism' ? 48 + seed % 18 : 72 + seed % 35;
  let seconds = 0, distance = 0;
  const stops = [{ arrival: 0, departure: 90, distance: 0 }];
  seconds = 90;
  metrics.segmentKm.forEach((km, index) => {
    seconds += km / speed * 3600;
    distance += km;
    const arrival = seconds;
    seconds += index === metrics.segmentKm.length - 1 ? 120 : 60 + (seed + index) % 120;
    stops.push({arrival, departure: seconds, distance});
  });
  const schedule = {...metrics, speed, stops, duration: seconds, seed};
  schedules.set(train, schedule);
  return schedule;
}

export function getLiveState(train, now = Date.now()) {
  const m = getSchedule(train);
  const clock = now / 1000 + m.seed % 86400;
  const elapsed = ((clock % m.duration) + m.duration) % m.duration;
  const cycleStart = now - elapsed * 1000;
  let leg = 0;
  while (leg < train.route.length - 2 && elapsed >= m.stops[leg + 1].arrival) leg++;
  const atDestination = elapsed >= m.stops.at(-1).arrival;
  const dwelling = atDestination || elapsed < m.stops[leg].departure;
  const fromPoint = train.route[leg], toPoint = train.route[leg + 1];
  const legProgress = atDestination ? 1 : Math.max(0, Math.min(1,
    (elapsed - m.stops[leg].departure) / (m.stops[leg + 1].arrival - m.stops[leg].departure)));
  const position = interpolate(fromPoint, toPoint, legProgress);
  const travelled = m.stops[leg].distance + m.segmentKm[leg] * legProgress;
  const delayMinutes = m.seed % 7 === 0 ? 5 + m.seed % 16 : 0;
  const nextSeconds = Math.max(0, m.stops[leg + 1].arrival - elapsed);
  const remaining = Math.max(0, m.stops.at(-1).arrival - elapsed);
  return {
    trainId: train.id, trainNo: train.number, trainName: train.name,
    lat: +position.lat.toFixed(6), lng: +position.lng.toFixed(6),
    bearing: +bearingDeg(fromPoint, toPoint).toFixed(1), speedKmph: dwelling ? 0 : m.speed,
    progress: +(travelled / m.totalKm).toFixed(6), segmentProgress: +legProgress.toFixed(6),
    currentSection: `${fromPoint.code} \u2192 ${toPoint.code}`, previousStation: fromPoint.name,
    nextStation: toPoint.name, nextStationCode: toPoint.code,
    etaMinutes: Math.ceil(remaining / 60), arrivalAt: new Date(now + remaining * 1000).toISOString(),
    nextStationEtaMinutes: Math.ceil(nextSeconds / 60), nextStationDistanceKm: +(m.segmentKm[leg] * (1 - legProgress)).toFixed(1),
    distanceRemainingKm: +(m.totalKm - travelled).toFixed(1), distanceTravelledKm: +travelled.toFixed(1),
    totalDistanceKm: +m.totalKm.toFixed(1), delayMinutes,
    runningStatus: delayMinutes ? 'DELAYED' : 'ON_TIME',
    motionStatus: atDestination ? 'ARRIVED' : dwelling ? 'AT_STATION' : 'RUNNING',
    currentStation: dwelling ? (atDestination ? toPoint.name : fromPoint.name) : null,
    platform: String((numericSeed(toPoint.code) + leg) % 6 + 1),
    updatedAt: new Date(now).toISOString(), simulated: true,
    journeyId: `${train.id}:${Math.floor(cycleStart / 1000)}`,
    stops: train.route.map((station, index) => ({code: station.code,
      status: elapsed >= m.stops[index].departure ? 'departed' : elapsed >= m.stops[index].arrival ? 'at-station' : 'upcoming',
      arrivalAt: new Date(cycleStart + m.stops[index].arrival * 1000).toISOString(),
      departureAt: new Date(cycleStart + m.stops[index].departure * 1000).toISOString()
    }))
  };
}
