import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requestStatic } from '../public/static-api.js';
test('static catalogue returns real stop times and never creates synthetic tickets or positions', async t => {
 const original = globalThis.fetch;
 globalThis.fetch = async url => new Response(await readFile(url),{ status:200,headers:{'Content-Type':'application/json'} });
 t.after(() => { globalThis.fetch = original; });
 const fleet = await requestStatic('/api/trains/catalog'); assert.ok(fleet.total >= 10000);
 const train = await requestStatic('/api/trains/12639'); assert.equal(train.number,'12639'); assert.ok(train.route[1].arrivalTime); assert.equal(train.liveAvailable,false);
 const spots = await requestStatic('/api/tourist-spots?train=12639&radiusKm=30'); assert.ok(spots.count > 0);
 await assert.rejects(requestStatic('/api/trains/12639/live'), e => e.status === 503);
 await assert.rejects(requestStatic('/api/bookings',{method:'POST',body:'{}'}),e => e.status === 503);
 assert.deepEqual(await requestStatic('/api/bookings'),[]);
 await assert.rejects(requestStatic('/api/trains/search?from=MAS&to=MAS'));
 await assert.rejects(requestStatic('/api/tourist-spots?train=12639&radiusKm=1000'));
});
