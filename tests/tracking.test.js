import test from 'node:test';
import assert from 'node:assert/strict';
import { trains, stations } from '../public/shared/catalog.js';
import { getLiveState, getSchedule } from '../public/shared/tracking.js';
import { searchFleet } from '../public/shared/fleet-search.js';

test('fleet contains 1,209 unique, complete and trackable services', () => {
  assert.equal(trains.length, 1209);
  assert.equal(new Set(trains.map(t => t.id)).size, trains.length);
  assert.equal(new Set(trains.map(t => t.number)).size, trains.length);
  for (const train of trains) {
    assert.equal(train.route[0].code, train.from.code);
    assert.equal(train.route.at(-1).code, train.to.code);
    for (const point of train.route) assert.ok(stations.some(s => s.code === point.code));
    const live = getLiveState(train, 1800000000000);
    assert.ok(Number.isFinite(live.lat) && Number.isFinite(live.lng));
    assert.ok(live.progress >= 0 && live.progress <= 1);
    assert.ok(live.speedKmph >= 0 && live.speedKmph <= 130);
    assert.ok(Math.abs(live.distanceTravelledKm + live.distanceRemainingKm - live.totalDistanceKm) < 0.2);
    assert.equal(live.stops.length, train.route.length);
  }
});
test('movement, dwell, next stop and destination ETAs share one clock', () => {
  for (const train of [trains[0], trains[9], trains.at(-1)]) {
    const schedule = getSchedule(train);
    const epoch = (Math.ceil((1800000000 + schedule.seed % 86400) / schedule.duration) * schedule.duration - schedule.seed % 86400) * 1000;
    const movingTime = epoch + (schedule.stops[0].departure + 60) * 1000;
    const a = getLiveState(train, movingTime), b = getLiveState(train, movingTime + 10000);
    assert.equal(a.motionStatus, 'RUNNING');
    assert.ok(b.progress > a.progress);
    assert.ok(Math.abs((b.progress - a.progress) * schedule.totalKm - a.speedKmph / 360) < 0.01);
    assert.ok(Math.abs(Date.parse(a.arrivalAt) - Date.parse(b.arrivalAt)) <= 1);
    const stopped = getLiveState(train, epoch + (schedule.stops[1].arrival + 1) * 1000);
    assert.equal(stopped.speedKmph, 0);
    assert.equal(stopped.currentStation, train.route[1].name);
    const arrived = getLiveState(train, epoch + (schedule.stops.at(-1).arrival + 1) * 1000);
    assert.equal(arrived.motionStatus, 'ARRIVED');
    assert.equal(arrived.etaMinutes, 0);
    assert.equal(arrived.progress, 1);
    assert.deepEqual(getLiveState(train, movingTime), a);
  }
});
test('fleet search supports number, city, type and bounded pages', () => {
  assert.equal(searchFleet(new URLSearchParams('q=70000')).trains[0].id, 'mock-1');
  assert.ok(searchFleet(new URLSearchParams('q=Mumbai')).count > 100);
  assert.equal(searchFleet(new URLSearchParams('q=no-such-train')).count, 0);
  const first = searchFleet(new URLSearchParams('limit=8'));
  const next = searchFleet(new URLSearchParams('limit=8&offset=8'));
  assert.equal(first.trains.length, 8);
  assert.ok(!next.trains.some(t => first.trains.some(f => f.id === t.id)));
  assert.equal(searchFleet(new URLSearchParams('limit=999999')).trains.length, 50);
  assert.ok(searchFleet(new URLSearchParams('type=tourism')).trains.every(t => t.type === 'tourism'));
});
