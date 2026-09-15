import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { trains, stations, searchCatalog } from '../public/shared/catalog.js';
import { hasCoordinates, distanceKm, routeTourism, googleMapsUrl } from '../public/shared/geography.js';
const read = file => JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), 'utf8'));
const spots = read('tourist-spots.json');

test('10,000+ unique sourced trains and every published route entry are internally consistent', () => {
 const manifest = read('manifest.json');
 assert.equal(trains.length, manifest.uniqueTrains); assert.ok(trains.length >= 10000);
 assert.equal(new Set(trains.map(t => t.number)).size, trains.length);
 const numbers = new Map(trains.map(t => [t.number,t])); const codes = new Set(stations.map(s => s.code));
 let routeCount = 0, entries = 0;
 for (const file of readdirSync(new URL('../public/data/routes/', import.meta.url))) for (const [number, route] of Object.entries(read(`routes/${file}`))) {
  const train = numbers.get(number); assert.ok(train);
  assert.match(number, /^\d{5}$/); assert.equal(route[0].code, train.from.code); assert.equal(route.at(-1).code, train.to.code);
  assert.deepEqual(route.map(s => s.code), train.routeCodes);
  const orders = new Set();
  let knownDay = 0;
  for (const stop of route) { assert.ok(codes.has(stop.code)); assert.ok(!orders.has(stop.stopOrder)); orders.add(stop.stopOrder); assert.equal(stop.platform,null); assert.ok(stop.day === null || stop.day >= 1); }
  for (const stop of route) if (stop.day !== null) { assert.ok(stop.day >= knownDay, `Source day sequence for ${number}`); knownDay = stop.day; }
  assert.ok(['kaggle-2025','datameet-2016'].includes(train.sourceId));
  assert.equal(train.bookingAvailable,false); assert.equal(train.liveAvailable,false); assert.deepEqual(train.fare,{}); assert.equal(train.rating,null);
  routeCount++; entries += route.length;
 }
 assert.equal(routeCount,trains.length); assert.equal(entries,manifest.routeEntries);
 assert.equal(stations.filter(s => !hasCoordinates(s)).length,manifest.stationsWithoutCoordinates);
});
test('route searches include intermediate stations only in forward order, with stable pagination and source filters', () => {
 const result = searchCatalog(new URLSearchParams({ from: 'KPD', to: 'SBC', limit: '50' }));
 assert.ok(result.trains.some(t => t.number === '12639'));
 assert.ok(!searchCatalog(new URLSearchParams({ from:'SBC',to:'KPD',q:'12639' })).count);
 const first = searchCatalog(new URLSearchParams({ limit:'8' })), next = searchCatalog(new URLSearchParams({ offset:'8',limit:'8' }));
 assert.equal(first.trains.length,8); assert.ok(!first.trains.some(t => next.trains.includes(t)));
 assert.equal(searchCatalog(new URLSearchParams({ source:'kaggle-2025' })).count,8490);
 assert.equal(searchCatalog(new URLSearchParams({ source:'datameet-2016' })).count,2026);
});
test('real attractions have individual photo attribution and safe HTTPS source links', () => {
 assert.ok(spots.length > 300); assert.equal(new Set(spots.map(s => s.id)).size,spots.length);
 for (const spot of spots) {
  assert.ok(hasCoordinates(spot)); assert.ok(spot.photoAuthor); assert.ok(spot.photoLicense);
  assert.match(spot.sourceUrl,/^https:\/\/www.wikidata.org\/wiki\/Q\d+$/);
  assert.ok(['upload.wikimedia.org','thumb.wikimedia.org'].includes(new URL(spot.imageUrl).hostname));
  for (const key of ['photoPage','photoLicenseUrl','imageUrl']) assert.equal(new URL(spot[key]).protocol,'https:');
 }
});
test('nearby places are matched along the route, deduplicated, bounded and paginated', () => {
 const train = trains.find(t => t.number === '12639');
 const result = routeTourism(spots, train.route, { radiusKm:30, limit:50 });
 assert.ok(result.count > 0); assert.equal(result.stationCoverage.length,train.route.length);
 assert.equal(new Set(result.spots.map(s => s.id)).size,result.spots.length);
 for (const spot of result.spots) {
  const station = train.route.find(s => s.code === spot.stationCode); assert.ok(station);
  assert.ok(distanceKm(spot,station) <= 30);
  const maps = new URL(spot.mapsUrl); assert.equal(maps.origin,'https://www.google.com'); assert.equal(maps.searchParams.get('api'),'1');
  assert.equal(maps.searchParams.get('query'),`${spot.latitude},${spot.longitude}`);
  assert.equal(new URL(spot.directionsUrl).searchParams.get('origin'),`${station.lat},${station.lng}`);
 }
 const single = routeTourism(spots,train.route,{ stationCode:'KPD', radiusKm:100 });
 assert.ok(single.spots.every(s => s.stationCode === 'KPD'));
 assert.equal(routeTourism(spots,[{ code:'UNKNOWN',lat:null,lng:null }]).count,0);
 assert.equal(distanceKm({lat:null,lng:null},{lat:0,lng:0}),null);
 assert.ok(!googleMapsUrl({name:'Unknown',lat:null,lng:null}).includes('0%2C0'));
});
