import { writeFile } from 'node:fs/promises';
import { trains, stations } from '../public/shared/catalog.js';
const destination = new URL('../data/train-fleet.json', import.meta.url);
await writeFile(destination, JSON.stringify({ simulated: true, description: 'Synthetic services and illustrative station-to-station routes. Not real schedules or GPS.', count: trains.length, stations, trains }, null, 2) + '\n');
console.log(`Exported ${trains.length} trains to data/train-fleet.json`);
