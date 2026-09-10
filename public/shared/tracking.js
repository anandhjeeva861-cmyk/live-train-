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

export function getLiveState(train) {
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

