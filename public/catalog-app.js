const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { stations: [], trains: [], selectedTrain: null, spots: [], type: 'all', map: null, routeLayer: null, poiLayer: null, searchRequest: 0, routeRequest: 0, spotsRequest: 0, searchOffset: 0, spotOffset: 0 };
const geography = import('./shared/geography.js');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fetchJson = (url, options) => LiveTrainAPI.request(url, options);
const formatLocalDate = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
function closeLiveConnection() {} // No connection is opened without a live-data provider.
function showToast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4500); }
function scrollToId(id) {
 const target = id === 'book' ? 'results' : id === 'dashboard' ? 'home' : id;
 document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
 $$('[data-scroll]').forEach(b => { b.classList.toggle('active', b.dataset.scroll === target); b.removeAttribute('aria-current'); if (b.dataset.scroll === target) b.setAttribute('aria-current', 'page'); });
 $('.desktop-nav').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
}
function setType(type) { state.type = type; }
function sourceLink(train) { return train.sourceId === 'datameet-2016' ? 'https://github.com/datameet/railways' : 'https://www.kaggle.com/datasets/rohan26x/indian-express-train-dataset'; }
function trainCard(train) {
 return `<article class="train-card"><div class="train-main"><div class="train-name"><div class="train-symbol">🚆</div><div><h3>${escapeHtml(train.number)} · ${escapeHtml(train.name)}</h3><small>${escapeHtml(train.category || 'Train')} · ${train.route.length} route stations</small><span class="type-pill">${train.historical ? '2016 archive' : '2025 dataset'}</span></div></div><div class="route-time"><div class="time-block"><b>${escapeHtml(train.departure || '—')}</b><small>${escapeHtml(train.from.code)}</small></div><div class="route-line"></div><div class="time-block right"><b>${escapeHtml(train.arrival || '—')}</b><small>${escapeHtml(train.to.code)}</small></div></div><div class="fare-box"><b>${escapeHtml(train.duration || 'Duration unknown')}</b><small>Endpoint timetable · IST</small></div></div><p class="catalog-note">${escapeHtml(train.from.name)} → ${escapeHtml(train.to.name)}<br><a href="${sourceLink(train)}" target="_blank" rel="noopener noreferrer">Source published ${escapeHtml(train.sourceDate)}</a> · Current operation unverified</p><div class="train-actions"><button class="track-button" data-track="${escapeHtml(train.id)}">Route & tourist spots</button><a class="book-button" href="https://www.irctc.co.in/nget/train-search" target="_blank" rel="noopener noreferrer">Book on IRCTC ↗</a></div></article>`;
}
function bindTrainButtons(root, trains) { root.querySelectorAll('[data-track]').forEach(b => b.onclick = () => { selectTrackingTrain(trains.find(t => t.id === b.dataset.track)); scrollToId('tracking'); }); }
async function loadStations() {
 state.stations = await fetchJson('/api/stations');
 const options = state.stations.map(s => `<option value="${escapeHtml(s.code)}" data-city="${escapeHtml(s.city)}">${escapeHtml(s.name)} (${escapeHtml(s.code)})</option>`).join('');
 $('#fromStation').innerHTML = $('#toStation').innerHTML = options;
 $('#fromStation').value = 'MAS'; $('#toStation').value = 'SBC';
}
async function searchTrains({ autoTrack = true, offset = 0 } = {}) {
 const request = ++state.searchRequest;
 $('#searchError').textContent = '';
 const from = $('#fromStation').value, to = $('#toStation').value;
 if (!from || !to || from === to) { $('#searchError').textContent = 'Choose different departure and arrival stations.'; return; }
 const params = new URLSearchParams({ from, to, date: $('#journeyDate').value, offset, limit: 12 });
 $('#trainList').innerHTML = '<p class="empty-card">Searching published routes…</p>';
 try {
  const result = await fetchJson(`/api/trains/search?${params}`);
  if (request !== state.searchRequest) return;
  state.trains = result.trains; state.searchOffset = offset;
  $('#searchSummary').textContent = `${from} → ${to} · ${result.count} published routes · Verify current services on NTES. Times below are for the train’s full route.`;
  $('#trainList').innerHTML = result.trains.map(trainCard).join('') || '<p class="empty-card">No published route connects these stations in this direction.</p>';
  bindTrainButtons($('#trainList'), result.trains);
  $('#searchPrev').disabled = offset === 0; $('#searchNext').disabled = offset + 12 >= result.count;
  if (autoTrack && result.trains[0]) await selectTrackingTrain(result.trains[0]);
  else if (autoTrack) {
   state.routeRequest++; state.selectedTrain = null; state.routeLayer?.remove(); state.poiLayer?.remove();
   $('#trackingTrainName').textContent = 'No published route selected'; $('#trackingRouteText').textContent = 'Choose another route or look up a train number.';
   $('#stationTimeline').innerHTML = '<p class="empty-note">No route selected.</p>'; $('#connectionBadge').textContent = 'Waiting';
   $('#spotStation').innerHTML = '<option value="">Selected destination</option>'; $('#heroTrain').textContent = 'Explore a published route';
   $('#heroNext').textContent = 'Choose a train'; $('#heroRoute').textContent = '';
   $('#coordinateNotice').textContent = ''; $('#overviewMap').innerHTML = '<p class="empty-card">Choose a train to see its route.</p>';
   for (const id of ['distanceValue','nextStation','tempValue','feelsValue','windValue','rainValue']) $('#' + id).textContent = '—';
   $('#weatherLabel').textContent = 'Select a route for destination weather'; $('#nextArrival').textContent = ''; $('#routePercent').textContent = '0 stations';
   await loadSpots();
  }
 } catch (error) { if (request !== state.searchRequest) return; state.trains = []; $('#searchError').textContent = error.message; $('#trainList').innerHTML = ''; }
}
async function selectTrackingTrain(summary) {
 if (!summary) return;
 const request = ++state.routeRequest;
 $('#connectionBadge').textContent = 'Loading timetable';
 try {
  const train = await fetchJson(`/api/trains/${encodeURIComponent(summary.id)}`);
  const { googleMapsUrl } = await geography;
  if (request !== state.routeRequest) return;
  state.selectedTrain = train;
  $('#trackingTrainName').textContent = `${train.number} · ${train.name}`;
  $('#trackingRouteText').textContent = `${train.from.name} → ${train.to.name} · Source published ${train.sourceDate} · ${train.runningDays?.join(', ').toUpperCase() || 'Running days unknown'} · Times in IST`;
  $('#connectionBadge').textContent = 'Published timetable';
  $('#updatedAgo').textContent = train.sourceDate;
  $('#mapSection').textContent = 'Lines connect station coordinates; actual rail alignment may differ.';
  $('#routePercent').textContent = `${train.route.length} stations`;
  $('#routeProgressFill').style.width = '0%';
  $('#stationTimeline').innerHTML = train.route.map(s => `<div class="catalog-stop"><span>Day ${escapeHtml(s.day ?? '?')}</span><div><b>${escapeHtml(s.name)} (${escapeHtml(s.code)})</b><small>Arrival ${escapeHtml(s.arrivalTime || '—')} · Departure ${escapeHtml(s.departureTime || '—')}${s.isHalt === null ? ' · Halt status unverified' : ''} · <a href="${googleMapsUrl(s)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></small></div></div>`).join('');
  $('#heroTrain').textContent = train.number + ' · ' + train.name; $('#heroNext').textContent = train.to.name;
  $('#heroStatus').textContent = 'Timetable'; $('#heroEta').textContent = 'Source: ' + train.sourceDate;
  $('#heroRoute').textContent = `${train.from.code} → ${train.to.code}`;
  $('#distanceValue').textContent = Number.isFinite(train.distanceKm) ? train.distanceKm : '—';
  $('#currentSection').textContent = 'Full route distance in source';
  $('#nextStation').textContent = train.to.name;
  $('#nextArrival').textContent = `Published arrival: ${train.arrival || 'unknown'} IST`;
  $('#runningStatus').textContent = 'Unavailable';
  $('#motionStatus').textContent = 'Live location, delays, platforms and arrival predictions require a live railway provider.';
  $('#spotStation').innerHTML = '<option value="">All route stations</option>' + [...new Map(train.route.map(s => [s.code,s])).values()].map(s => `<option value="${escapeHtml(s.code)}">${escapeHtml(s.name)} (${escapeHtml(s.code)})</option>`).join('');
  state.spotOffset = 0;
  await drawRoute(train);
  if (request !== state.routeRequest) return;
  await loadSpots();
  loadWeather(train.to, request);
 } catch (error) { if (request === state.routeRequest) { $('#connectionBadge').textContent = 'Could not load route'; showToast(error.message); } }
}
async function drawRoute(train) {
 const { hasCoordinates, googleMapsUrl } = await geography;
 const stations = train.route.filter(hasCoordinates);
 if (!state.map) {
  if (!globalThis.L) { showToast('Map library unavailable. Google Maps links are still available.'); return; }
  state.map = L.map('map').setView([22.5, 79], 5);
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 18 }).addTo(state.map);
  tiles.on('tileerror', () => { $('#mapSection').textContent = 'Map tiles could not load. Use the Google Maps links at each station.'; });
 }
 state.routeLayer?.remove(); state.poiLayer?.remove(); state.routeLayer = L.featureGroup().addTo(state.map);
 // Keep gaps where a station has no coordinates instead of inventing a path through it.
 let segment = [];
 const line = () => { if (segment.length > 1) L.polyline(segment, { color: '#1675e7', weight: 4, dashArray: '8 6' }).addTo(state.routeLayer); segment = []; };
 for (const s of train.route) {
  if (!hasCoordinates(s)) { line(); continue; }
  segment.push([s.lat, s.lng]);
  L.circleMarker([s.lat,s.lng], { radius: 4, color: '#164877' }).bindPopup(`<b>${escapeHtml(s.name)}</b><br><a target="_blank" rel="noopener noreferrer" href="${googleMapsUrl(s)}">View in Google Maps ↗</a>`).addTo(state.routeLayer);
 }
 line();
 if (stations.length) state.map.fitBounds(state.routeLayer.getBounds(), { padding: [25,25], maxZoom: 12 });
 $('#coordinateNotice').textContent = `${stations.length} of ${train.route.length} route stations have source coordinates. Missing coordinates are omitted from the map.`;
 $('#overviewMap').innerHTML = `<div class="route-overview"><b>${escapeHtml(train.from.name)}</b><span>↓ ${train.route.length} route stations</span><b>${escapeHtml(train.to.name)}</b><small>Published ${escapeHtml(train.sourceDate)} · Current service unverified</small></div>`;
 requestAnimationFrame(() => state.map.invalidateSize());
}
function fitRoute() { if (state.routeLayer?.getLayers().length) state.map.fitBounds(state.routeLayer.getBounds(), { padding: [25,25], maxZoom: 12 }); }
async function loadWeather(station, request = state.routeRequest) {
 const { hasCoordinates } = await geography;
 $('#weatherPlace').textContent = station.name;
 for (const id of ['tempValue','feelsValue','windValue','rainValue']) $('#' + id).textContent = '—';
 $('#forecastRow').innerHTML = '';
 if (!hasCoordinates(station)) { $('#weatherLabel').textContent = 'Station coordinates unavailable'; return; }
 $('#weatherLabel').textContent = 'Loading destination weather…';
 try {
  const data = await fetchJson(`/api/weather?${new URLSearchParams({ lat: station.lat, lng: station.lng })}`);
  if (request !== state.routeRequest) return;
  if (!data.current || data.fallback) throw new Error('Weather temporarily unavailable');
  $('#tempValue').textContent = Math.round(data.current.temperature_2m);
  $('#feelsValue').textContent = Math.round(data.current.apparent_temperature) + '°C';
  $('#windValue').textContent = data.current.wind_speed_10m + ' km/h';
  $('#weatherLabel').textContent = `Open-Meteo · ${data.current.time || 'current reading'}`;
 } catch (error) { if (request === state.routeRequest) $('#weatherLabel').textContent = error.message; }
}
function photoCredit(s) { return `<small class="photo-credit">Photo: ${escapeHtml(s.photoAuthor)} · <a href="${escapeHtml(s.photoLicenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.photoLicense)}</a> · <a href="${escapeHtml(s.photoPage)}" target="_blank" rel="noopener noreferrer">Original</a></small>`; }
function spotCard(s) { return `<article class="spot-card"><img loading="lazy" decoding="async" src="${escapeHtml(s.image)}" alt="${escapeHtml(s.name)}"><div class="spot-body"><span class="type-pill">${escapeHtml(s.category)}</span><h3>${escapeHtml(s.name)}</h3><p>${s.distanceKm} km straight-line from ${escapeHtml(s.stationName)} (${escapeHtml(s.stationCode)})</p>${photoCredit(s)}<div class="spot-actions"><a class="secondary-button" href="${escapeHtml(s.mapsUrl)}" target="_blank" rel="noopener noreferrer">View in Google Maps ↗</a><a href="${escapeHtml(s.directionsUrl)}" target="_blank" rel="noopener noreferrer">Directions from station ↗</a><a href="${escapeHtml(s.sourceUrl)}" target="_blank" rel="noopener noreferrer">Place source</a></div></div></article>`; }
async function loadSpots({ offset = 0, stationOnly = false } = {}) {
 const request = ++state.spotsRequest;
 const params = new URLSearchParams({ radiusKm: $('#spotRadius').value, offset, limit: 12 });
 if (state.selectedTrain && !stationOnly) params.set('train', state.selectedTrain.number);
 const station = stationOnly ? $('#toStation').value : $('#spotStation').value;
 if (station || !params.has('train')) params.set('station', station || $('#toStation').value);
 $('#spotGrid').innerHTML = '<p class="empty-card">Finding photographed places near route stations…</p>';
 try {
  const result = await fetchJson(`/api/tourist-spots?${params}`);
  const { googleMapsUrl } = await geography;
  if (request !== state.spotsRequest) return;
  state.spots = result.spots; state.spotOffset = offset;
  $('#tourismSummary').textContent = `${result.count} photographed places within ${result.radiusKm} km of ${params.has('train') ? 'this train’s route stations' : 'the selected station'}. Distances are straight-line; check travel time in Google Maps.`;
  $('#spotGrid').innerHTML = result.spots.map(spotCard).join('') || '<p class="empty-card">No attributed photographs found in this radius. Try 50 or 100 km, or explore the station area in Google Maps.</p>';
  $('#spotPrev').disabled = offset === 0; $('#spotNext').disabled = offset + 12 >= result.count;
  $('#stationCoverage').innerHTML = result.stationCoverage.map(s => `<li><b>${escapeHtml(s.code)}</b> — ${!s.coordinatesAvailable ? 'Coordinates unavailable' : `${s.count} photographed places`} · <a href="${googleMapsUrl({ name: `Tourist attractions near ${s.name} railway station` })}" target="_blank" rel="noopener noreferrer">Explore area in Google Maps ↗</a></li>`).join('');
  $('#destinationTitle').textContent = 'Places along your route';
  $('#destinationPreview').innerHTML = result.spots.slice(0,3).map(s => `<article class="preview-spot"><img loading="lazy" src="${escapeHtml(s.image)}" alt="${escapeHtml(s.name)}"><div><a href="${escapeHtml(s.mapsUrl)}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(s.name)} ↗</b></a><small>${s.distanceKm} km from ${escapeHtml(s.stationCode)}</small>${photoCredit(s)}</div></article>`).join('') || '<p class="empty-note">Choose another radius to explore nearby places.</p>';
 } catch (error) { if (request === state.spotsRequest) { state.spots = []; state.poiLayer?.remove(); $('#spotGrid').innerHTML = `<p class="empty-card">${escapeHtml(error.message)}</p>`; $('#destinationPreview').innerHTML = '<p class="empty-note">Places could not load. Retry by changing the radius.</p>'; } }
}
async function showSpotsOnMap() {
 if (!state.map) return;
 state.poiLayer?.remove(); state.poiLayer = L.featureGroup().addTo(state.map);
 for (const s of state.spots) L.marker([s.lat,s.lng]).bindPopup(`<b>${escapeHtml(s.name)}</b><br><a href="${escapeHtml(s.mapsUrl)}" target="_blank" rel="noopener noreferrer">View in Google Maps ↗</a>`).addTo(state.poiLayer);
 if (state.spots.length) state.map.fitBounds(state.poiLayer.getBounds(), { padding: [35,35], maxZoom: 13 });
 scrollToId('tracking');
}
async function loadBookings() {
 $('#bookingList').innerHTML = '<p class="empty-card">RailGo does not issue railway tickets. Book and manage valid tickets through <a href="https://www.irctc.co.in/nget/train-search" target="_blank" rel="noopener noreferrer">IRCTC ↗</a>.</p>';
 $('#upcomingJourneys').innerHTML = '<div class="empty-card">Plan with public route data.<br>Check current fares, availability and bookings on <a href="https://www.irctc.co.in/nget/train-search" target="_blank" rel="noopener noreferrer">IRCTC ↗</a>.</div>';
}
async function quickTrack() {
 const value = $('#quickTrackInput').value.trim(); $('#quickTrackError').textContent = '';
 if (!/^\d{5}$/.test(value)) { $('#quickTrackError').textContent = 'Enter a five-digit train number. PNR enquiries are available on the official railway website.'; return; }
 try { await selectTrackingTrain(await fetchJson(`/api/trains/by-number/${value}`)); scrollToId('tracking'); }
 catch (error) { $('#quickTrackError').textContent = error.message; }
}
document.addEventListener('error', event => {
 const img = event.target;
 if (!(img instanceof HTMLImageElement) || !img.closest('.spot-card,.preview-spot') || img.dataset.failed) return;
 img.dataset.failed = 'true'; img.hidden = true;
 const message = document.createElement('p'); message.className = 'photo-unavailable'; message.textContent = 'Photo could not load. Open the original photograph using the credit link.'; img.after(message);
}, true);
$$('[data-scroll]').forEach(b => b.onclick = () => scrollToId(b.dataset.scroll));
$('#searchBtn').onclick = () => { searchTrains(); scrollToId('results'); };
$('#swapBtn').onclick = () => { const from = $('#fromStation').value; $('#fromStation').value = $('#toStation').value; $('#toStation').value = from; };
$('#quickTrackBtn').onclick = quickTrack;
$('#quickTrackInput').addEventListener('keydown', e => { if (e.key === 'Enter') quickTrack(); });
$('#searchPrev').onclick = () => searchTrains({ autoTrack: false, offset: Math.max(0,state.searchOffset - 12) });
$('#searchNext').onclick = () => searchTrains({ autoTrack: false, offset: state.searchOffset + 12 });
$('#spotPrev').onclick = () => loadSpots({ offset: Math.max(0,state.spotOffset - 12) });
$('#spotNext').onclick = () => loadSpots({ offset: state.spotOffset + 12 });
$('#spotRadius').onchange = $('#spotStation').onchange = () => loadSpots();
$('#showSpotsOnMapBtn').onclick = showSpotsOnMap;
$('#fitRoute').onclick = $('#recenterBtn').onclick = fitRoute;
$('#expandMap').onclick = () => { const expanded = $('.map-card').classList.toggle('expanded'); $('#expandMap').setAttribute('aria-pressed', expanded); setTimeout(() => state.map?.invalidateSize(), 200); };
$('#refreshBookingsBtn').onclick = loadBookings;
$('#menuBtn').onclick = () => { const open = $('.desktop-nav').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', open); };
$('#helpBtn').onclick = () => { $('#modalTitle').textContent = 'Explore trains and nearby places'; $('#modalBody').innerHTML = '<p>Search a five-digit train number or two stations. Open a route to see its published timetable and photographed places near every mapped station. Choose a station or increase the radius to explore further.</p><p>View in Google Maps opens the actual place. Directions use Google Maps travel modes; allow enough time to leave the station and return.</p><p>Sources were published in 2025 and 2016. Check current train operation on NTES and make bookings through IRCTC. Email login requires a configured delivery service.</p><a href="./data-sources.html">Read data sources and coverage</a>'; $('#bookingModal').hidden = false; };
$('#modalClose').onclick = () => { $('#bookingModal').hidden = true; };
$('#bookingModal').addEventListener('click', e => { if (e.target === $('#bookingModal')) $('#bookingModal').hidden = true; });
$('#journeyDate').value = $('#journeyDate').min = formatLocalDate(new Date());
loadBookings();
loadStations().then(() => searchTrains()).catch(error => { $('#searchError').textContent = error.message; });
