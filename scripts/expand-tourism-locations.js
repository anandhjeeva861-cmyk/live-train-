import { readFile, writeFile } from 'node:fs/promises';
const raw = 'data/sources';
const original = JSON.parse(await readFile(`${raw}/wikidata-tourism.json`,'utf8'));
const queries = original.queries || [];
const groups = [['Q40080','Q167346','Q46169'],['Q35509','Q23397','Q12323'],['Q839954','Q207694'],['Q8502','Q4421','Q54050']];
let added = 0;
for (const [i,kinds] of groups.entries()) {
 const query = `SELECT ?place ?placeLabel ?coord ?image ?kindLabel WHERE {
 { SELECT DISTINCT ?place ?coord ?image ?kind WHERE {
 VALUES ?kind { ${kinds.map(k=>'wd:'+k).join(' ')} }
 ?place wdt:P17 wd:Q668; wdt:P31 ?kind; wdt:P625 ?coord; wdt:P18 ?image.
 } LIMIT 5000 }
 SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
 }`;
 try {
  let data;
  try {data=JSON.parse(await readFile(`${raw}/wikidata-extra-${i}.json`,'utf8'));}
  catch {
   const r = await fetch('https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'}),{headers:{'User-Agent':'RailGo/3.0 (public tourism catalogue)'},signal:AbortSignal.timeout(85000)});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   data=await r.json();await writeFile(`${raw}/wikidata-extra-${i}.json`,JSON.stringify(data));
  }
  original.results.bindings.push(...data.results.bindings); added+=data.results.bindings.length;
  queries.push(query); console.log(`Additional category group ${i+1}: ${data.results.bindings.length} source rows`);
 }catch(e){console.warn(`Category group ${i+1} unavailable: ${e.message}`);}
}
if(added){
 original.results.bindings = [...new Map(original.results.bindings.map(row => [`${row.place.value}|${row.image.value}|${row.kindLabel.value}`,row])).values()];
 original.queries=[...new Set(queries)];await writeFile(`${raw}/wikidata-tourism.json`,JSON.stringify(original));
}
console.log(`Added ${added} source rows; duplicate places will be deduplicated during import.`);
