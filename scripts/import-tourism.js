import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';

const raw = 'data/sources';
await mkdir(raw, { recursive: true });
const agent = 'RailGo/3.0 (public railway and tourism catalogue)';
const query = `SELECT DISTINCT ?place ?placeLabel ?coord ?image ?kindLabel WHERE {
 VALUES ?kind { wd:Q33506 wd:Q23413 wd:Q44539 wd:Q842402 wd:Q16560 wd:Q22698 wd:Q34038 wd:Q473972 wd:Q16970 wd:Q4989906 wd:Q179700 wd:Q570116 wd:Q43501 wd:Q641226 wd:Q2977 wd:Q57821 }
 ?place wdt:P31 ?kind; wdt:P17 wd:Q668; wdt:P625 ?coord; wdt:P18 ?image.
 SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 15000`;
let data;
try { if (process.argv.includes('--refresh-locations')) throw new Error('Refresh requested'); data = JSON.parse(await readFile(`${raw}/wikidata-tourism.json`, 'utf8')); }
catch {
 const response = await fetch('https://query.wikidata.org/sparql?' + new URLSearchParams({ query, format: 'json' }), { headers: { 'User-Agent': agent }, signal: AbortSignal.timeout(180000) });
 if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
 data = await response.json();
 await writeFile(`${raw}/wikidata-tourism.json`, JSON.stringify(data));
}
if (process.argv.includes('--expand')) { await import('./expand-tourism-locations.js'); data = JSON.parse(await readFile(`${raw}/wikidata-tourism.json`, 'utf8')); }
const clean = value => String(value || '').replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").trim();
const candidates = new Map();
for (const row of data.results.bindings) {
 const id = Number(row.place.value.split('/Q')[1]);
 const coords = row.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
 const file = 'File:' + decodeURIComponent(row.image.value.split('Special:FilePath/')[1] || '').replaceAll('_', ' ');
 if (!coords || !id || candidates.has(id) || /^Q\d+$/.test(row.placeLabel.value) || !/\.(jpe?g|png|webp|tiff?)$/i.test(file) || /\b(map|logo|drawing|painting|sketch|plan)\b/i.test(file)) continue;
 const [, longitude, latitude] = coords.map(Number);
 if (latitude < 6 || latitude > 38 || longitude < 67 || longitude > 98) continue;
 candidates.set(id, { id, name: row.placeLabel.value, category: row.kindLabel.value, latitude, longitude,
  sourceUrl: `https://www.wikidata.org/wiki/Q${id}`, file });
}
let cache = {};
try { cache = JSON.parse(await readFile(`${raw}/commons-image-info.json`, 'utf8')); } catch {}
const files = [...new Set([...candidates.values()].map(s => s.file))].filter(file => !cache[file]);
const batches = Array.from({ length: Math.ceil(files.length / 35) }, (_, i) => files.slice(i * 35, i * 35 + 35));
let cursor = 0, done = 0;
await Promise.all(Array.from({ length: 1 }, async () => {
 while (cursor < batches.length) {
  const batch = batches[cursor++];
  await pause(2500);
  try {
   const response = await fetch('https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', titles: batch.join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|mediatype', iiurlwidth: '640', iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl' }), { headers: { 'User-Agent': agent }, signal: AbortSignal.timeout(30000) });
   if (response.status === 429) {
    console.warn('Wikimedia requested slower access; saving progress and pausing before one retry.');
    await writeFile(`${raw}/commons-image-info.json`, JSON.stringify(cache));
    await pause(Math.max(60000, Math.min(300000, Number(response.headers.get('retry-after') || 60) * 1000)));
    cursor--;
    if (batch.retried) break;
    batch.retried = true;
    continue;
   }
   if (!response.ok) throw new Error(`HTTP ${response.status}`);
   const payload = await response.json();
   for (const page of Object.values(payload.query?.pages || {})) if (page.imageinfo?.[0]) cache[page.title.replaceAll('_', ' ')] = page.imageinfo[0];
  } catch (error) { console.warn(`Photo metadata batch skipped: ${error.message}`); }
  if (++done % 10 === 0) { await writeFile(`${raw}/commons-image-info.json`, JSON.stringify(cache)); console.log(`Photo metadata: ${done}/${batches.length} batches`); }
 }
}));
await writeFile(`${raw}/commons-image-info.json`, JSON.stringify(cache));
const spots = [];
for (const { file, ...spot } of candidates.values()) {
 const info = cache[file];
 const license = clean(info?.extmetadata?.LicenseShortName?.value);
 const author = clean(info?.extmetadata?.Artist?.value);
 if (info?.mediatype !== 'BITMAP' || !info.thumburl || !author || !/^(CC BY(?:-SA)? [\d.]+|CC0|Public domain)$/i.test(license)) continue;
 spots.push({ ...spot, description: `${spot.name} — ${spot.category}. Location from Wikidata; photograph from Wikimedia Commons.`,
  imageUrl: info.thumburl, photoPage: info.descriptionurl, photoAuthor: author, photoLicense: license,
  photoLicenseUrl: info.extmetadata?.LicenseUrl?.value?.replace(/^http:/, 'https:') || 'https://commons.wikimedia.org/wiki/Commons:Public_domain' });
}
if (spots.length < 100) throw new Error('Too few attributed photographs; existing published data was retained.');
await writeFile('public/data/tourist-spots.json', JSON.stringify(spots));
await writeFile('public/data/tourism-source.json', JSON.stringify({ retrievedAt: new Date().toISOString(), count: spots.length,
 source: 'https://www.wikidata.org/', coordinatesLicense: 'CC0', photoSource: 'https://commons.wikimedia.org/', query, supplementaryQueries: data.queries || [],
 coverage: 'Selected photographed attractions in India. Not an exhaustive list. Photo credits and licenses accompany each record.' }, null, 2));
console.log(`Published ${spots.length} places with attributed Commons photographs.`);
