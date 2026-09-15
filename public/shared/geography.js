export const hasCoordinates = point => point != null && Number.isFinite(point.lat ?? point.latitude) && Number.isFinite(point.lng ?? point.longitude);
export function distanceKm(a, b) {
 if (!hasCoordinates(a) || !hasCoordinates(b)) return null;
 const rad = n => n * Math.PI / 180;
 const lat1 = rad(a.lat ?? a.latitude), lat2 = rad(b.lat ?? b.latitude);
 const dlat = lat2 - lat1, dlng = rad((b.lng ?? b.longitude) - (a.lng ?? a.longitude));
 const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
 return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function googleMapsUrl(place, { directions = false, origin } = {}) {
 const location = hasCoordinates(place) ? `${place.lat ?? place.latitude},${place.lng ?? place.longitude}` : `${place.name || place.code}, India`;
 const params = new URLSearchParams({ api: '1', [directions ? 'destination' : 'query']: location });
 if (directions && hasCoordinates(origin)) params.set('origin', `${origin.lat ?? origin.latitude},${origin.lng ?? origin.longitude}`);
 return `https://www.google.com/maps/${directions ? 'dir' : 'search'}/?${params}`;
}
export function routeTourism(spots, route, { radiusKm = 30, stationCode = null, offset = 0, limit = 24 } = {}) {
 const stations = route.map((s, i) => ({ ...s, routeOrder: i })).filter(s => !stationCode || s.code === stationCode);
 const coverage = stations.map(s => ({ code: s.code, name: s.name, coordinatesAvailable: hasCoordinates(s), count: 0 }));
 const matches = [];
 for (const spot of spots) {
  let nearest = null, best = Infinity;
  stations.forEach((station, i) => {
   const distance = distanceKm(spot, station);
   if (distance !== null && distance <= radiusKm) {
    coverage[i].count++;
    if (distance < best) { best = distance; nearest = station; }
   }
  });
  if (nearest) matches.push({ ...spot, image: spot.imageUrl, lat: spot.latitude, lng: spot.longitude,
   stationCode: nearest.code, stationName: nearest.name, city: nearest.name, routeOrder: nearest.routeOrder,
   distanceKm: Math.round(best * 10) / 10, distanceType: 'straight-line', mapsUrl: googleMapsUrl(spot), directionsUrl: googleMapsUrl(spot, { directions: true, origin: nearest }) });
 }
 matches.sort((a, b) => a.routeOrder - b.routeOrder || a.distanceKm - b.distanceKm || a.id - b.id);
 return { count: matches.length, offset, limit, radiusKm, spots: matches.slice(offset, offset + limit), stationCoverage: coverage };
}
