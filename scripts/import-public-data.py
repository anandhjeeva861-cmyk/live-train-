"""Rebuild the attributed public timetable snapshot; Python standard library only.

Raw downloads stay in ignored data/sources. No schedules, fares, seats, platforms,
ratings or missing coordinates are invented. Source publication dates are not
represented as operational verification dates.
"""
import collections
import hashlib
import json
import pathlib
import re
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'sources'
OUT = ROOT / 'public' / 'data'
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'routes').mkdir(exist_ok=True)

def download(name, url):
    target = RAW / name
    if not target.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'RailGo-public-data-import/3.0'})
        with urllib.request.urlopen(request, timeout=90) as response:
            target.write_bytes(response.read())
    return target

def read(name):
    return json.loads((RAW / name).read_text(encoding='utf-8'))

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

def clock(value):
    return str(value)[:5] if re.fullmatch(r'\d{2}:\d{2}(:\d{2})?', str(value)) else None

def minutes(value):
    return int(value[:2]) * 60 + int(value[3:5]) if value else None

commit = 'e0c538a1e41ae5eace454d2818902e1065608e16'
for name in ['trains.json', 'stations.json', 'schedules.json']:
    download('datameet-' + name, f'https://raw.githubusercontent.com/datameet/railways/{commit}/{name}')
archive = download('indian-express-train-dataset.zip', 'https://www.kaggle.com/api/v1/datasets/download/rohan26x/indian-express-train-dataset?datasetVersionNumber=2')
if hashlib.sha256(archive.read_bytes()).hexdigest() != 'c515d737acd528ab9a99ecf0f6c9f647471ee110be8b90cdf36d0bedce8c2762':
    raise ValueError('Kaggle source differs from reviewed version 2. Review its date, license and contents before updating the pinned hash.')
sources = {
    'kaggle-2025': {'name': 'Rohan — Indian Trains Schedule & Routes', 'url': 'https://www.kaggle.com/datasets/rohan26x/indian-express-train-dataset', 'publishedAt': '2025-09-15', 'license': 'MIT (dataset publisher)', 'currentServiceVerified': False},
    'datameet-2016': {'name': 'DataMeet Indian Railways', 'url': 'https://github.com/datameet/railways/tree/' + commit, 'publishedAt': '2016-08-08', 'license': 'CC0-1.0', 'currentServiceVerified': False},
}
stations = {}
for feature in read('datameet-stations.json')['features']:
    row = feature['properties']; code = row.get('code')
    if not code: continue
    coordinates = (feature.get('geometry') or {}).get('coordinates')
    valid = coordinates and len(coordinates) == 2 and 6 <= coordinates[1] <= 38 and 67 <= coordinates[0] <= 98
    stations[code] = {'code': code, 'name': row.get('name') or code, 'city': row.get('name') or code,
                      'state': row.get('state'), 'lat': coordinates[1] if valid else None,
                      'lng': coordinates[0] if valid else None, 'coordinateSource': 'datameet-2016' if valid else None}

def station(code, name):
    if code not in stations:
        stations[code] = {'code': code, 'name': name or code, 'city': name or code, 'state': None, 'lat': None, 'lng': None, 'coordinateSource': None}
    return stations[code]

services, routes = {}, {}
rejected = []

def add(number, name, stops, source, category, days=None, distance=None):
    number = str(number).strip()
    if not re.fullmatch(r'\d{5}', number) or len(stops) < 2:
        rejected.append({'number': number, 'reason': 'invalid number or incomplete route'}); return
    # Keep true station sequence, including repeated stops on circular journeys.
    start, end = stops[0], stops[-1]
    departure, arrival = start['departureTime'], end['arrivalTime']
    duration = None
    if departure and arrival and start['day'] is not None and end['day'] is not None:
        elapsed = (end['day'] - start['day']) * 1440 + minutes(arrival) - minutes(departure)
        if elapsed >= 0: duration = f'{elapsed // 60}h {elapsed % 60:02d}m'
    services[number] = {'id': number, 'number': number, 'name': str(name or '').strip() or f'Train {number} (name unavailable)', 'type': 'normal', 'category': category,
                        'fromCode': start['code'], 'toCode': end['code'], 'departure': departure, 'arrival': arrival,
                        'duration': duration, 'distanceKm': distance, 'runningDays': days, 'sourceId': source,
                        'sourceDate': sources[source]['publishedAt'], 'historical': source == 'datameet-2016',
                        'routeCodes': [s['code'] for s in stops]}
    routes[number] = stops

with zipfile.ZipFile(archive) as z:
    for filename, category in [('EXP-TRAINS.json', 'Express'), ('PASS-TRAINS.json', 'Passenger'), ('SF-TRAINS.json', 'Superfast')]:
        for train in json.loads(z.read(filename)):
            stops = []
            for i, stop in enumerate(train['trainRoute']):
                match = re.match(r'^(.*)\s+-\s+([^\s]+)$', stop['stationName'])
                if not match: raise ValueError('Unrecognized station record: ' + stop['stationName'])
                name, code = match.groups(); station(code, name)
                distance = re.search(r'[\d.]+', str(stop.get('distance', '')))
                stops.append({'code': code, 'stopOrder': i, 'arrivalTime': clock(stop['arrives']), 'departureTime': clock(stop['departs']),
                              'day': int(stop['day']) if stop.get('day') else None, 'distanceKm': float(distance.group()) if distance else None,
                              'isHalt': True, 'platform': None})
            add(train['trainNumber'], train['trainName'], stops, 'kaggle-2025', category,
                [day.lower() for day, runs in train.get('runningDays', {}).items() if runs], stops[-1]['distanceKm'])

old_stops = collections.defaultdict(list)
for stop in read('datameet-schedules.json'):
    if stop['train_number'] not in services: old_stops[stop['train_number']].append(stop)
for feature in read('datameet-trains.json')['features']:
    train = feature['properties']; number = train['number']
    if number in services: continue
    stops = []
    for i, stop in enumerate(sorted(old_stops[number], key=lambda s: s['id'])):
        code = stop['station_code']; station(code, stop['station_name'])
        arrival, departure = clock(stop['arrival']), clock(stop['departure'])
        stops.append({'code': code, 'stopOrder': i, 'arrivalTime': arrival, 'departureTime': departure,
                      'day': int(stop['day']) if stop.get('day') is not None else None, 'distanceKm': None, 'platform': None,
                      'isHalt': None if arrival == departure else True})
    add(number, train['name'], stops, 'datameet-2016', train.get('type') or 'Unspecified', distance=train.get('distance'))

assert len(services) >= 10000, f'Only {len(services)} valid unique train numbers; minimum coverage not met'
used = {s['code'] for route in routes.values() for s in route}
station_rows = [stations[code] for code in sorted(used)]
train_rows = [services[number] for number in sorted(services)]
write('stations.json', station_rows)
write('trains.json', train_rows)
buckets = collections.defaultdict(dict)
for number, stops in routes.items(): buckets[number[:2]][number] = stops
for prefix, values in buckets.items(): write(f'routes/{prefix}.json', values)
write('sources.json', sources)
manifest = {'schemaVersion': 1, 'uniqueTrains': len(services), 'stations': len(station_rows), 'routeEntries': sum(map(len, routes.values())),
            'sourceCounts': dict(collections.Counter(t['sourceId'] for t in train_rows)), 'currentServiceVerified': False,
            'stationsWithoutCoordinates': sum(s['lat'] is None for s in station_rows), 'rejected': rejected,
            'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [archive, RAW / 'datameet-trains.json', RAW / 'datameet-stations.json', RAW / 'datameet-schedules.json']}}
manifest['routeEntriesWithoutDay'] = sum(stop['day'] is None for route in routes.values() for stop in route)
manifest['unnamedTrains'] = sum('(name unavailable)' in t['name'] for t in train_rows)
manifest['outputFiles'] = {name: hashlib.sha256((OUT / name).read_bytes()).hexdigest()
    for name in ['stations.json', 'trains.json'] + [f'routes/{prefix}.json' for prefix in sorted(buckets)]}
write('manifest.json', manifest)
# A compact ESM index lets the static host and server share the same identifiers.
(OUT / 'catalog-index.js').write_text('export const stationRows=' + json.dumps(station_rows, ensure_ascii=False, separators=(',', ':')) + ';\nexport const trainRows=' + json.dumps(train_rows, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
