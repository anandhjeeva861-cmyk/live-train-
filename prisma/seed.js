import 'dotenv/config';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

if (process.env.NODE_ENV === 'test' && process.env.RAILGO_TEST_FIXTURES === 'true') {
 await import('../tests/fixtures/seed.js');
} else {
 const filename = (process.env.DATABASE_URL || 'file:./prisma/dev.db').replace(/^file:/, '');
 const db = new Database(filename);
 db.pragma('foreign_keys = ON');
 db.pragma('busy_timeout = 15000');
 const read = file => JSON.parse(readFileSync(`public/data/${file}`, 'utf8'));
 const stations = read('stations.json'), trains = read('trains.json'), spots = read('tourist-spots.json');
 const fingerprint = createHash('sha256').update(readFileSync('public/data/manifest.json')).update(readFileSync('public/data/tourist-spots.json')).digest('hex');
 db.exec('CREATE TABLE IF NOT EXISTS CatalogImport (id TEXT NOT NULL PRIMARY KEY, fingerprint TEXT NOT NULL)');
 if (db.prepare('SELECT fingerprint FROM CatalogImport WHERE id = ?').get('public')?.fingerprint !== fingerprint) {
  mkdirSync('test-results', { recursive: true });
  await db.backup(path.resolve(`test-results/catalog-backup-${Date.now()}.db`));
  const stationInsert = db.prepare(`INSERT INTO Station (id,code,name,city,latitude,longitude,state,coordinateSource) VALUES (@code,@code,@name,@city,@lat,@lng,@state,@coordinateSource)
   ON CONFLICT(code) DO UPDATE SET name=excluded.name,city=excluded.city,latitude=excluded.latitude,longitude=excluded.longitude,state=excluded.state,coordinateSource=excluded.coordinateSource`);
  const trainInsert = db.prepare(`INSERT INTO Train (id,trainNumber,name,type,originStationId,destinationStationId,departureTime,arrivalTime,duration,sourceId,sourceDate,historical,category,runningDays,distanceKm,active)
   VALUES (@id,@number,@name,@type,@fromCode,@toCode,@departure,@arrival,@duration,@sourceId,@sourceDate,@historical,@category,@runningDays,@distanceKm,1)
   ON CONFLICT(trainNumber) DO UPDATE SET name=excluded.name,type=excluded.type,originStationId=excluded.originStationId,destinationStationId=excluded.destinationStationId,
   departureTime=excluded.departureTime,arrivalTime=excluded.arrivalTime,duration=excluded.duration,sourceId=excluded.sourceId,sourceDate=excluded.sourceDate,historical=excluded.historical,category=excluded.category,runningDays=excluded.runningDays,distanceKm=excluded.distanceKm,rating=NULL,active=1`);
  const stopInsert = db.prepare('INSERT INTO TrainStop (id,trainId,stationId,stopOrder,arrivalTime,departureTime,platform,distanceKm,day,isHalt) VALUES (@id,@trainId,@code,@stopOrder,@arrivalTime,@departureTime,NULL,@distanceKm,@day,@isHalt)');
  const photoInsert = db.prepare(`INSERT INTO TouristSpot (id,name,description,category,imageUrl,latitude,longitude,sourceUrl,photoPage,photoAuthor,photoLicense,photoLicenseUrl) VALUES (@id,@name,@description,@category,@imageUrl,@latitude,@longitude,@sourceUrl,@photoPage,@photoAuthor,@photoLicense,@photoLicenseUrl)`);
  db.transaction(() => {
   db.exec(`DELETE FROM LiveTrainStatus;
    DELETE FROM Train WHERE sourceId IS NULL AND id NOT IN (SELECT trainId FROM Booking);
    UPDATE Train SET active=0 WHERE sourceId IS NULL;
    DELETE FROM TouristSpot;`);
   for (const station of stations) stationInsert.run(station);
   for (const t of trains) trainInsert.run({ ...t, historical: Number(t.historical), runningDays: t.runningDays ? JSON.stringify(t.runningDays) : null });
   const ids = new Map(db.prepare('SELECT id,trainNumber FROM Train WHERE sourceId IS NOT NULL').all().map(t => [t.trainNumber,t.id]));
   db.exec('DELETE FROM TrainStop WHERE trainId IN (SELECT id FROM Train WHERE sourceId IS NOT NULL)');
   for (const file of readdirSync('public/data/routes')) for (const [number, stops] of Object.entries(read(`routes/${file}`))) {
    const trainId = ids.get(number);
    for (const stop of stops) stopInsert.run({ ...stop, id: `${trainId}:${stop.stopOrder}`, trainId, isHalt: stop.isHalt === null ? null : Number(stop.isHalt) });
   }
   for (const spot of spots) photoInsert.run(spot);
   db.prepare('INSERT OR REPLACE INTO CatalogImport VALUES (?,?)').run('public', fingerprint);
  })();
 }
 console.log(`Public catalogue ready: ${db.prepare('SELECT count(*) AS n FROM Train WHERE active=1').get().n} trains, ${db.prepare('SELECT count(*) AS n FROM TouristSpot').get().n} photographed places.`);
 db.close();
}
