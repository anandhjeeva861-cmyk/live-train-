const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

// A capture listener works with Helmet's script-src-attr policy. Inline image
// onerror attributes are blocked by that policy, so use registered listeners.
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.closest('.spot-card, .preview-spot') || image.dataset.fallbackApplied) return;
  image.dataset.fallbackApplied = 'true';
  image.src = './assets/lalbagh.jpg';
}, true);

// This site always opens on the booking home screen.  Without this, browsers can
// restore the previous scroll position (for example, the live-tracking section)
// after a refresh.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
function openHomeFirst() {
  if (!LiveTrainAPI.isStatic && ['/tracking', '/bookings', '/book'].includes(location.pathname)) return;
  // Use the numeric form for consistent behavior in Chrome, Edge and previews.
  window.scrollTo(0, 0);
  $$('.desktop-nav [data-scroll], .mobile-nav [data-scroll]').forEach(button => {
    const isHome = button.dataset.scroll === 'home';
    button.classList.toggle('active', isHome);
    if (isHome) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}
openHomeFirst();
window.addEventListener('pageshow', openHomeFirst);
window.addEventListener('load', () => {
  requestAnimationFrame(openHomeFirst);
  setTimeout(openHomeFirst, 250);
});

const state = {
  type: 'normal',
  stations: [],
  trains: [],
  selectedTrain: null,
  selectedSeat: null,
  map: null,
  routeLayer: null,
  poiLayer: null,
  trainMarker: null,
  eventSource: null,
  pollingTimer: null,
  pollingBusy: false,
  lastLive: null,
  lastWeatherAt: 0,
  spots: [],
  alertsEnabled: false,
  searchRequest: 0,
  spotsRequest: 0,
  bookingRequest: 0
};

const fallbackStations = [
  { code: 'MAS', name: 'MGR Chennai Central', city: 'Chennai' },
  { code: 'SBC', name: 'KSR Bengaluru City', city: 'Bengaluru' },
  { code: 'CBE', name: 'Coimbatore Junction', city: 'Coimbatore' },
  { code: 'MYS', name: 'Mysuru Junction', city: 'Mysuru' },
  { code: 'MDU', name: 'Madurai Junction', city: 'Madurai' },
  { code: 'UAM', name: 'Udhagamandalam', city: 'Ooty' }
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
}

function formatLocalDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function setDefaultDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const value = formatLocalDate(tomorrow);
  $('#journeyDate').value = value;
  $('#journeyDate').min = formatLocalDate(new Date());
}

function scrollToId(id) {
  if (!LiveTrainAPI.isStatic && ['dashboard', 'tracking', 'bookings', 'book'].includes(id) && !RailGoAuth.require()) return;
  const section = id === 'weather' ? 'tracking' : id === 'dashboard' ? 'home' : id;
  $$('.desktop-nav [data-scroll], .mobile-nav [data-scroll]').forEach(button => {
    const active = button.dataset.scroll === section;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function fetchJson(url, options) {
  return LiveTrainAPI.request(url, options);
}

async function loadStations() {
  try {
    state.stations = await fetchJson('/api/stations');
  } catch {
    state.stations = fallbackStations;
  }

  const options = state.stations.map(s => `<option value="${escapeHtml(s.code)}" data-city="${escapeHtml(s.city)}">${escapeHtml(s.city)} (${escapeHtml(s.code)})</option>`).join('');
  $('#fromStation').innerHTML = options;
  $('#toStation').innerHTML = options;
  $('#fromStation').value = state.stations.some(s => s.code === 'MAS') ? 'MAS' : state.stations[0]?.code;
  $('#toStation').value = state.stations.some(s => s.code === 'SBC') ? 'SBC' : state.stations[1]?.code;
}

function setType(type) {
  state.type = type;
  $$('.booking-tab').forEach(button => {
    const active = button.dataset.type === type;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('input[name="modeMirror"]').forEach(radio => { radio.checked = radio.value === type; });
}

function getSearchRouteText() {
  const from = state.stations.find(s => s.code === $('#fromStation').value);
  const to = state.stations.find(s => s.code === $('#toStation').value);
  return `${from?.city || $('#fromStation').value} (${from?.code || ''}) → ${to?.city || $('#toStation').value} (${to?.code || ''})`;
}

function trainCard(train) {
  const classPreference = $('#travelClass').value;
  const travelClass = classPreference && train.fare[classPreference] ? classPreference : Object.keys(train.fare)[0];
  const fare = train.fare[travelClass];
  return `<article class="train-card">
    <div class="train-main">
      <div class="train-name">
        <div class="train-symbol">${train.type === 'tourism' ? '🏞️' : '🚆'}</div>
        <div><h3>${escapeHtml(train.number)} · ${escapeHtml(train.name)}</h3><small>★ ${escapeHtml(train.rating)} · ${escapeHtml(train.duration)}</small><span class="type-pill ${train.type === 'tourism' ? 'tourism' : ''}">${train.type === 'tourism' ? 'Tourism' : 'Normal'}</span></div>
      </div>
      <div class="route-time">
        <div class="time-block"><b>${escapeHtml(train.departure)}</b><small>${escapeHtml(train.from.code)}</small></div>
        <div class="route-line"></div>
        <div class="time-block right"><b>${escapeHtml(train.arrival)}</b><small>${escapeHtml(train.to.code)}</small></div>
      </div>
      <div class="fare-box"><b>₹${escapeHtml(fare)}</b><small>${escapeHtml(travelClass)} · ${escapeHtml(train.seats[travelClass])} seats shown</small></div>
    </div>
    <div class="train-actions"><button class="track-button" data-track="${escapeHtml(train.id)}">Live Track</button><button class="book-button" data-book="${escapeHtml(train.id)}">Book Now</button></div>
  </article>`;
}

function bindTrainButtons() {
  $$('[data-track]').forEach(button => button.onclick = () => {
    const train = state.trains.find(t => t.id === button.dataset.track);
    if (train) {
      selectTrackingTrain(train);
      scrollToId('tracking');
    }
  });
  $$('[data-book]').forEach(button => button.onclick = () => openBooking(button.dataset.book));
}

async function searchTrains({ autoTrack = true } = {}) {
  const request = ++state.searchRequest;
  const error = $('#searchError');
  error.textContent = '';
  const from = $('#fromStation').value;
  const to = $('#toStation').value;
  if (!from || !to) return;
  if (from === to) {
    error.textContent = 'From and To stations must be different.';
    return;
  }

  const params = new URLSearchParams({ from, to, type: state.type, date: $('#journeyDate').value });
  if ($('#travelClass').value) params.set('class', $('#travelClass').value);
  $('#trainList').innerHTML = '<div class="empty-card">Searching trains…</div>';

  try {
    const result = await fetchJson(`/api/trains/search?${params}`);
    if (request !== state.searchRequest) return;
    state.trains = result.trains || [];
    $('#searchSummary').textContent = `${getSearchRouteText()} · ${state.type === 'all' ? 'All train types' : state.type === 'tourism' ? 'Tourism trains' : 'Normal trains'} · ${result.count} result${result.count === 1 ? '' : 's'}`;
    $('#trainList').innerHTML = state.trains.length
      ? state.trains.map(trainCard).join('')
      : `<div class="empty-card"><b>No exact trains found.</b><br><small>Try the other train type, remove the class filter, or choose another route.</small></div>`;
    bindTrainButtons();
    await loadSpots();
    if (request !== state.searchRequest) return;
    if (autoTrack && state.trains[0] && (LiveTrainAPI.isStatic || RailGoAuth.user)) selectTrackingTrain(state.trains[0]);
  } catch (err) {
    if (request !== state.searchRequest) return;
    state.trains = [];
    $('#trainList').innerHTML = `<div class="empty-card">${escapeHtml(err.message)}</div>`;
    error.textContent = err.message;
  }
}

function deterministicBookedSeats(trainId) {
  const seed = [...trainId].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return new Set(Array.from({ length: 30 }, (_, i) => i + 1).filter(n => ((n * 7 + seed) % 11) < 3));
}

function seatGridHtml(train) {
  const booked = deterministicBookedSeats(train.id);
  return Array.from({ length: 30 }, (_, index) => {
    const n = index + 1;
    const isBooked = booked.has(n);
    return `<button class="seat-button ${isBooked ? 'booked' : ''}" ${isBooked ? 'disabled' : ''} data-seat="S${n}">${n}</button>`;
  }).join('');
}

async function openBooking(id) {
  if (!RailGoAuth.require()) return;
  const bookingRequest = ++state.bookingRequest;
  const train = state.trains.find(t => t.id === id) || (state.selectedTrain?.id === id ? state.selectedTrain : null);
  if (!train) return;
  state.selectedSeat = null;

  const preferred = $('#travelClass').value;
  const initialClass = preferred && train.fare[preferred] ? preferred : Object.keys(train.fare)[0];
  const classOptions = Object.keys(train.fare).map(c => `<option value="${c}" ${c === initialClass ? 'selected' : ''}>${c} — ₹${train.fare[c]}</option>`).join('');
  $('#modalTitle').textContent = `${train.number} · ${train.name}`;
  $('#modalBody').innerHTML = `
    <div class="checkout-summary">
      <div><small>Route</small><b>${escapeHtml(train.from.city)} → ${escapeHtml(train.to.city)}</b></div>
      <div><small>Date</small><b>${escapeHtml($('#journeyDate').value)}</b></div>
      <div><small>Passengers</small><b>${escapeHtml($('#passengers').value)}</b></div>
      <div><small>Type</small><b>${train.type === 'tourism' ? 'Tourism' : 'Normal'}</b></div>
    </div>
    <label class="field"><span>Travel class</span><select id="modalTravelClass">${classOptions}</select></label>
    ${LiveTrainAPI.isStatic ? '' : `<div id="passengerForms">${Array.from({ length: Number($('#passengers').value) }, (_, i) => `<fieldset class="passenger-fields"><legend>Passenger ${i + 1}</legend><label class="field"><span>Name</span><input data-passenger-name maxlength="80" placeholder="Full name" required></label><label class="field"><span>Age</span><input data-passenger-age type="number" min="1" max="120" required></label><label class="field"><span>Gender</span><select data-passenger-gender><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></label></fieldset>`).join('')}</div>`}
    <h3 class="seat-title">Choose the first passenger's seat</h3>
    <div class="seat-grid">${seatGridHtml(train)}</div>
    <div class="seat-legend"><span>Available</span><span>Selected</span><span>Booked</span></div>
    <div class="checkout-total"><span>Demo total for ${escapeHtml($('#passengers').value)} passenger(s)</span><b id="checkoutTotal">₹${train.fare[initialClass] * Number($('#passengers').value)}</b></div>
    <p class="modal-error" id="modalError"></p>
    <button class="primary-button full" id="confirmBooking">Confirm demo booking</button>`;
  $('#bookingModal').hidden = false;

  $$('.seat-button:not(.booked)').forEach(button => button.onclick = () => {
    $$('.seat-button').forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');
    state.selectedSeat = button.dataset.seat;
    $('#modalError').textContent = '';
  });
  $('#modalTravelClass').onchange = event => {
    $('#checkoutTotal').textContent = `₹${train.fare[event.target.value] * Number($('#passengers').value)}`;
  };
  $('#confirmBooking').onclick = () => confirmBooking(train);
  if (!LiveTrainAPI.isStatic) {
    const refreshSeats = async () => {
      state.selectedSeat = null;
      $('#confirmBooking').disabled = true;
      const selectedClass = $('#modalTravelClass').value;
      $('.seat-grid').innerHTML = '<p>Loading available seats…</p>';
      try {
        const classes = await fetchJson(`/api/trains/${encodeURIComponent(train.id)}/classes?date=${encodeURIComponent($('#journeyDate').value)}`);
        if (bookingRequest !== state.bookingRequest || $('#bookingModal').hidden || $('#modalTravelClass')?.value !== selectedClass) return;
        const c = classes.find(c => c.classCode === selectedClass);
        $('.seat-grid').innerHTML = Array.from({ length: c.totalSeats }, (_, i) => `<button class="seat-button ${c.bookedSeats.includes(i + 1) ? 'booked' : ''}" ${c.bookedSeats.includes(i + 1) ? 'disabled' : ''} data-seat="S${i + 1}">${i + 1}</button>`).join('');
        $$('.seat-button:not(.booked)').forEach(button => button.onclick = () => { $$('.seat-button').forEach(b => b.classList.remove('selected')); button.classList.add('selected'); state.selectedSeat = button.dataset.seat; $('#modalError').textContent = ''; });
        $('#checkoutTotal').textContent = `₹${c.fare * Number($('#passengers').value)}`;
        $('#confirmBooking').disabled = c.availableSeats < Number($('#passengers').value);
        if ($('#confirmBooking').disabled) $('#modalError').textContent = 'Not enough seats in this class.';
      } catch (error) { if ($('#modalError')) $('#modalError').textContent = error.message; }
    };
    $('#modalTravelClass').onchange = refreshSeats;
    await refreshSeats();
  }
}

async function confirmBooking(train) {
  if (!state.selectedSeat) {
    $('#modalError').textContent = 'Select an available seat before booking.';
    return;
  }
  const button = $('#confirmBooking');
  const bookingRequest = state.bookingRequest;
  button.disabled = true;
  $$('#modalBody input, #modalBody select, #modalBody .seat-button').forEach(input => { input.disabled = true; });
  button.textContent = 'Creating booking…';
  try {
    const booking = await fetchJson('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trainId: train.id,
        journeyDate: $('#journeyDate').value,
        travelClass: $('#modalTravelClass').value,
        passengers: LiveTrainAPI.isStatic ? Number($('#passengers').value) : $$('.passenger-fields').map(row => ({ name: row.querySelector('[data-passenger-name]').value, age: Number(row.querySelector('[data-passenger-age]').value), gender: row.querySelector('[data-passenger-gender]').value })),
        seat: state.selectedSeat
      })
    });
    if (bookingRequest !== state.bookingRequest) { await loadBookings(); return; }
    $('#modalBody').innerHTML = `
      <div class="checkout-summary">
        <div><small>Status</small><b style="color:#13a857">✓ ${escapeHtml(booking.status)}</b></div>
        <div><small>PNR</small><b>${escapeHtml(booking.pnr)}</b></div>
        <div><small>Coach / Seat</small><b>${escapeHtml(booking.coach)} / ${escapeHtml(booking.seat)}</b></div>
        <div><small>Total</small><b>₹${escapeHtml(booking.fare)}</b></div>
      </div>
      <p style="font-size:11px;color:#66788f">${LiveTrainAPI.isStatic ? 'Demo booking saved in this browser on this device.' : 'Demo booking saved on the server.'} This is not a valid railway ticket.</p>
      <button class="primary-button full" id="trackBookedTrain">View live tracking</button>`;
    $('#trackBookedTrain').onclick = () => {
      $('#bookingModal').hidden = true;
      selectTrackingTrain(train);
      scrollToId('tracking');
    };
    await loadBookings();
    showToast(`Booking confirmed · PNR ${booking.pnr}`);
  } catch (err) {
    if (bookingRequest !== state.bookingRequest) return;
    $('#modalError').textContent = err.message;
    button.disabled = false;
    $$('#modalBody input, #modalBody select, #modalBody .seat-button:not(.booked)').forEach(input => { input.disabled = false; });
    button.textContent = 'Confirm demo booking';
  }
}

function setupMap() {
  if (!window.L) {
    $('#map').innerHTML = '<div class="empty-card">Map library could not load. Check internet access for the Leaflet CDN.</div>';
    return;
  }
  state.map = L.map('map', { zoomControl: true, scrollWheelZoom: true }).setView([12.3, 78.2], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(state.map);
  state.routeLayer = L.layerGroup().addTo(state.map);
  state.poiLayer = L.layerGroup().addTo(state.map);
}

function trainIcon(bearing = 0) {
  return L.divIcon({
    className: 'train-marker-wrap',
    html: `<div class="train-marker" style="transform:rotate(${Number(bearing)}deg)">➤</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });
}

function drawRoute(train) {
  if (!state.map || !window.L) return;
  cancelAnimationFrame(state.markerAnimation);
  state.routeLayer.clearLayers();
  state.poiLayer.clearLayers();
  state.trainMarker = null;
  const coordinates = train.route.map(point => [point.lat, point.lng]);
  L.polyline(coordinates, { color: '#1268e8', weight: 6, opacity: .9 }).addTo(state.routeLayer);
  state.travelledLayer = L.polyline([], { color: '#77899c', weight: 6, opacity: .95 }).addTo(state.routeLayer);
  L.polyline(coordinates, { color: '#9ed0ff', weight: 10, opacity: .2 }).addTo(state.routeLayer);
  train.route.forEach((point, index) => {
    L.circleMarker([point.lat, point.lng], {
      radius: index === 0 || index === train.route.length - 1 ? 7 : 5,
      color: '#ffffff', weight: 3, fillColor: index === 0 ? '#11a858' : index === train.route.length - 1 ? '#e84b4b' : '#1268e8', fillOpacity: 1
    }).bindTooltip(`${escapeHtml(point.name)} (${escapeHtml(point.code)})`, { className: 'route-tooltip' }).addTo(state.routeLayer);
  });
  state.map.fitBounds(L.latLngBounds(coordinates), { padding: [42, 42] });
  setTimeout(() => state.map?.invalidateSize(), 100);
}

function renderStationTimeline(train, live = null) {
  const nextIndex = live ? train.route.findIndex(point => point.code === live.nextStationCode) : -1;
  $('#stationTimeline').innerHTML = train.route.map((point, index) => {
    const cls = nextIndex === -1 ? '' : index < nextIndex ? 'done' : index === nextIndex ? 'active' : '';
    const stop = live?.stops?.[index];
    const label = stop ? `${stop.status === 'departed' ? 'Departed' : stop.status === 'at-station' ? 'At station' : 'Expected'} \u00b7 ${new Date(stop.arrivalAt).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Kolkata'})} IST` : index === 0 ? 'Origin' : index === train.route.length - 1 ? 'Destination' : 'Stop';
    return `<div class="station-node ${cls}"><b>${escapeHtml(point.code)} · ${escapeHtml(point.city || point.name)}</b><small>${label}</small></div>`;
  }).join('');
}

function closeLiveConnection() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  cancelAnimationFrame(state.markerAnimation);
  clearInterval(state.pollingTimer);
  state.pollingTimer = null;
}

async function selectTrackingTrain(train) {
  if (!RailGoAuth.require()) return;
  closeLiveConnection();
  state.selectedTrain = train;
  state.lastLive = null;
  state.trackingSpots = [];
  document.dispatchEvent(new CustomEvent('train-selected', { detail: train }));
  state.lastWeatherAt = 0;
  $('#trackingTrainName').textContent = `${train.number} · ${train.name}`;
  $('#trackingRouteText').textContent = `${train.from.name} → ${train.to.name}`;
  $('#mapSection').textContent = `${train.from.code} → ${train.to.code}`;
  renderStationTimeline(train);
  drawRoute(train);
  connectLiveStream(train);
  const selectedId = train.id;
  try {
    const spots = await fetchJson(`/api/tourist-spots?city=${encodeURIComponent(train.to.city)}`);
    if (state.selectedTrain?.id !== selectedId) return;
    state.trackingSpots = spots;
    addSpotMarkers({ spots });
  } catch { /* Tracking continues without destination spots. */ }
}

function connectLiveStream(train) {
  const badge = $('#connectionBadge');
  badge.textContent = '● Connecting';
  badge.className = 'connection-badge offline';

  if (LiveTrainAPI.isStatic) {
    badge.textContent = '● Browser simulation';
    badge.className = 'connection-badge online';
    updateLiveOnce();
    state.pollingTimer = setInterval(updateLiveOnce, 2000);
    return;
  }

  if ('EventSource' in window) {
    const source = new EventSource(LiveTrainAPI.apiUrl(`/api/trains/${encodeURIComponent(train.id)}/live-stream`), { withCredentials: true });
    state.eventSource = source;
    source.addEventListener('live', event => {
      try { applyLiveState(JSON.parse(event.data)); } catch { /* ignore malformed demo event */ }
    });
    source.onopen = () => {
      clearInterval(state.pollingTimer); state.pollingTimer = null;
      badge.textContent = '● Live stream';
      badge.className = 'connection-badge online';
    };
    source.onerror = () => {
      if (state.eventSource !== source) return;
      if (!state.pollingTimer) { updateLiveOnce(); state.pollingTimer = setInterval(updateLiveOnce, 3000); }
      badge.textContent = '● Reconnecting';
      badge.className = 'connection-badge offline';
    };
    return;
  }

  badge.textContent = '● Polling fallback';
  badge.className = 'connection-badge offline';
  updateLiveOnce();
  state.pollingTimer = setInterval(updateLiveOnce, 3000);
}

async function updateLiveOnce() {
  if (!state.selectedTrain || state.pollingBusy) return;
  state.pollingBusy = true;
  try {
    const live = await fetchJson(`/api/trains/${encodeURIComponent(state.selectedTrain.id)}/live`);
    applyLiveState(live);
  } catch { /* transient network error */ }
  finally { state.pollingBusy = false; }
}

function formatArrival(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'ETA unavailable';
  return `Approx. ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function applyLiveState(live) {
  if (!state.selectedTrain || live.trainId !== state.selectedTrain.id) return;
  if (state.lastLive && Date.parse(live.updatedAt) < Date.parse(state.lastLive.updatedAt)) return;
  $('#connectionBadge').textContent = LiveTrainAPI.isStatic ? '● Browser simulation' : '● Simulation stream';
  $('#connectionBadge').className = 'connection-badge online';
  const previousLive = state.lastLive;
  state.lastLive = live;
  if (state.alertsEnabled && previousLive && previousLive.nextStationCode !== live.nextStationCode) showToast(`Station update: ${live.previousStation}`);
  document.dispatchEvent(new CustomEvent('train-telemetry', { detail: live }));
  $('#speedValue').textContent = live.speedKmph;
  $('#speedBar').style.width = `${Math.min(100, Math.round((live.speedKmph / 130) * 100))}%`;
  $('#distanceValue').textContent = live.distanceRemainingKm;
  $('#etaValue').textContent = live.etaMinutes;
  $('#arrivalClock').textContent = formatArrival(live.arrivalAt);
  $('#nextStation').textContent = `${live.nextStation} (${live.nextStationCode})`;
  $('#previousStation').textContent = live.previousStation;
  $('#currentSection').textContent = live.currentSection;
  $('#platformValue').textContent = live.platform;
  $('#delayValue').textContent = live.delayMinutes <= 2 ? 'On time' : `+${live.delayMinutes} min`;
  $('#runningStatus').textContent = live.runningStatus === 'ON_TIME' ? 'On time' : 'Delayed';
  $('#runningStatus').style.color = live.runningStatus === 'ON_TIME' ? '#178d4b' : '#c77b00';
  $('#routePercent').textContent = `${Math.round(live.progress * 100)}%`;
  $('#routeProgressFill').style.width = `${Math.round(live.progress * 100)}%`;
  $('#mapSection').textContent = `${live.currentSection} · ${live.speedKmph} km/h`;
  $('#updatedAgo').textContent = 'just now';
  renderStationTimeline(state.selectedTrain, live);

  if (state.map && window.L) {
    const latLng = [live.lat, live.lng];
    if (!state.trainMarker) {
      state.trainMarker = L.marker(latLng, { icon: trainIcon(live.bearing), zIndexOffset: 1000 }).addTo(state.routeLayer);
    } else {
      animateTrainMarker(latLng, live);
      state.trainMarker.setIcon(trainIcon(live.bearing));
    }
    state.trainMarker.bindTooltip(`${escapeHtml(live.trainNo)} · ${live.speedKmph} km/h`, { className: 'route-tooltip', direction: 'top' });
  }

  if (state.travelledLayer) {
    const leg = state.selectedTrain.route.findIndex(p => p.code === live.nextStationCode);
    state.travelledLayer.setLatLngs([...state.selectedTrain.route.slice(0, leg).map(p => [p.lat, p.lng]), [live.lat, live.lng]]);
  }

  if (Date.now() - state.lastWeatherAt > 600_000) {
    state.lastWeatherAt = Date.now();
    loadWeather(live.lat, live.lng);
  }
}

function weatherDescriptor(code) {
  if (code === 0) return ['☀️', 'Clear'];
  if ([1, 2].includes(code)) return ['🌤️', 'Partly cloudy'];
  if (code === 3) return ['☁️', 'Cloudy'];
  if ([45, 48].includes(code)) return ['🌫️', 'Fog'];
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return ['🌧️', 'Rain possible'];
  if ([95, 96, 99].includes(code)) return ['⛈️', 'Thunderstorm'];
  return ['☁️', 'Cloudy'];
}

async function loadWeather(lat, lng) {
  const trainId = state.selectedTrain?.id;
  try {
    const weather = await fetchJson(`/api/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    if (state.selectedTrain?.id !== trainId) return;
    if (weather.fallback) throw new Error('Weather unavailable');
    const current = weather.current || {};
    const [icon, label] = weatherDescriptor(current.weather_code);
    $('#weatherIcon').textContent = icon;
    $('#weatherLabel').textContent = label + (weather.fallback ? ' · demo fallback' : '');
    const metric = (value, suffix = '') => Number.isFinite(value) ? `${Math.round(value)}${suffix}` : '—';
    $('#tempValue').textContent = metric(current.temperature_2m);
    $('#feelsValue').textContent = metric(current.apparent_temperature, '°');
    $('#windValue').textContent = metric(current.wind_speed_10m, ' km/h');
    $('#weatherPlace').textContent = state.lastLive?.currentSection || 'Current train location';

    const hourIndex = (weather.hourly?.time || []).findIndex(time => time > current.time);
    const nextHour = hourIndex < 0 ? (weather.hourly?.time || []).length : hourIndex;
    const temperatures = (weather.hourly?.temperature_2m || []).slice(nextHour);
    const codes = (weather.hourly?.weather_code || []).slice(nextHour);
    const rain = (weather.hourly?.precipitation_probability || []).slice(nextHour);
    $('#rainValue').textContent = rain[0] === undefined ? '—' : `${rain[0]}%`;
    $('#forecastRow').innerHTML = Array.from({ length: 5 }, (_, index) => {
      const [, labelText] = weatherDescriptor(codes[index] ?? current.weather_code);
      const [forecastIcon] = weatherDescriptor(codes[index] ?? current.weather_code);
      return `<div class="forecast-item"><b>+${index + 1}h</b><span title="${escapeHtml(labelText)}">${forecastIcon}</span><small>${metric(temperatures[index], '°')} · ${metric(rain[index], '%')}</small></div>`;
    }).join('');
  } catch {
    if (state.selectedTrain?.id !== trainId) return;
    $('#weatherLabel').textContent = 'Weather temporarily unavailable';
    for (const id of ['tempValue', 'feelsValue', 'windValue', 'rainValue']) $(`#${id}`).textContent = '—';
    $('#forecastRow').innerHTML = '';
  }
}

async function loadSpots() {
  const request = ++state.spotsRequest;
  const selected = $('#toStation').selectedOptions[0];
  const city = selected?.dataset.city || '';
  try {
    const spots = await fetchJson(`/api/tourist-spots?city=${encodeURIComponent(city)}`);
    if (request !== state.spotsRequest) return;
    state.spots = spots;
    const localImages = { 3: './assets/lalbagh.jpg', 4: './assets/bangalore-palace.jpg', 6: './assets/nandi-hills.jpg' };
    state.spots = state.spots.map(spot => ({ ...spot, image: localImages[spot.id] || spot.image }));
    $('#spotGrid').innerHTML = state.spots.length ? state.spots.map(spot => `
      <article class="spot-card">
        <img src="${escapeHtml(spot.image)}" alt="${escapeHtml(spot.name)}" loading="lazy">
        <div class="spot-body">
          <h3>${escapeHtml(spot.name)}</h3>
          <p>📍 ${escapeHtml(spot.city)} · ${escapeHtml(spot.distanceKm)} km from station</p>
          <div class="spot-footer"><div class="spot-badges"><span>${escapeHtml(spot.category)}</span><span>★ ${escapeHtml(spot.rating)}</span></div><button class="spot-map-btn" data-spot="${escapeHtml(spot.id)}">View on map</button></div>
        </div>
      </article>`).join('') : '<div class="empty-card">No curated tourist spots are available for this destination yet.</div>';
    $$('[data-spot]').forEach(button => button.onclick = () => showSpotOnMap(Number(button.dataset.spot)));
  } catch {
    if (request !== state.spotsRequest) return;
    state.spots = [];
    $('#spotGrid').innerHTML = '<div class="empty-card">Tourist spot data is unavailable.</div>';
  }
}

function addSpotMarkers({ fit = false, focusId = null, spots = state.spots } = {}) {
  if (!state.map || !window.L) return;
  state.poiLayer.clearLayers();
  const bounds = [];
  spots.forEach(spot => {
    const marker = L.marker([spot.lat, spot.lng], {
      icon: L.divIcon({ className: '', html: '<div class="poi-marker">★</div>', iconSize: [26, 26], iconAnchor: [13, 13] })
    }).bindTooltip(`${escapeHtml(spot.name)} · ${spot.distanceKm} km`, { className: 'route-tooltip' }).addTo(state.poiLayer);
    bounds.push([spot.lat, spot.lng]);
    if (spot.id === focusId) {
      state.map.setView([spot.lat, spot.lng], 13);
      marker.openTooltip();
    }
  });
  if (fit && bounds.length) state.map.fitBounds(L.latLngBounds(bounds), { padding: [42, 42] });
}

function showSpotOnMap(id) {
  addSpotMarkers({ focusId: id });
  scrollToId('tracking');
  showToast('Tourist spot shown on the tracking map');
}

async function quickTrack() {
  const value = $('#quickTrackInput').value.trim();
  const error = $('#quickTrackError');
  error.textContent = '';
  if (!value) {
    error.textContent = 'Enter a train number or PNR.';
    return;
  }
  try {
    let train;
    if (/^\d{10}$/.test(value)) {
      const booking = await fetchJson(`/api/bookings/pnr/${encodeURIComponent(value)}`);
      train = await fetchJson(`/api/trains/${encodeURIComponent(booking.trainId)}`);
    } else {
      train = await fetchJson(`/api/trains/by-number/${encodeURIComponent(value)}`);
    }
    selectTrackingTrain(train);
    scrollToId('tracking');
  } catch (err) {
    error.textContent = err.message;
  }
}

async function loadBookings() {
  if (!LiveTrainAPI.isStatic && !RailGoAuth.user) { $('#bookingList').innerHTML = '<div class="empty-card">Sign in to view your bookings.</div>'; return; }
  try {
    const bookings = await fetchJson('/api/bookings');
    $('#bookingList').innerHTML = bookings.length ? bookings.map(booking => `
      <article class="booking-item">
        <div>
          <span class="eyebrow ${booking.status === 'CONFIRMED' ? 'status-confirmed' : ''}">${escapeHtml(booking.status)}</span>
          <h3>${escapeHtml(booking.trainNo)} · ${escapeHtml(booking.trainName)}</h3>
          <p>PNR ${escapeHtml(booking.pnr)} · ${escapeHtml(booking.from.city)} → ${escapeHtml(booking.to.city)} · ${escapeHtml(booking.journeyDate)}</p>
          <div class="booking-meta"><span>${escapeHtml(booking.travelClass)}</span><span>${escapeHtml(booking.coach)} / ${escapeHtml(booking.seat)}</span><span>${escapeHtml(booking.passengers)} passenger(s)</span><span>₹${escapeHtml(booking.fare)}</span></div>
        </div>
        <div class="booking-actions"><button class="track-button" data-booking-track="${escapeHtml(booking.trainId)}">Live Track</button>${!LiveTrainAPI.isStatic && booking.status === 'CONFIRMED' ? `<button class="secondary-button" data-cancel-pnr="${booking.pnr}">Cancel demo ticket</button>` : ''}</div>
      </article>`).join('') : '<div class="empty-card">No demo bookings yet. Book a train to generate a PNR.</div>';
    $$('[data-cancel-pnr]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await fetchJson(`/api/bookings/${button.dataset.cancelPnr}/cancel`, { method: 'PATCH' }); await loadBookings(); showToast('Demo booking cancelled. Seats restored.'); }
      catch (error) { showToast(error.message); button.disabled = false; }
    });
    $$('[data-booking-track]').forEach(button => button.onclick = async () => {
      try {
        const train = await fetchJson(`/api/trains/${encodeURIComponent(button.dataset.bookingTrack)}`);
        selectTrackingTrain(train);
        scrollToId('tracking');
      } catch (err) { showToast(err.message); }
    });
  } catch {
    $('#bookingList').innerHTML = '<div class="empty-card">Booking history could not be loaded.</div>';
  }
}

function bindEvents() {
  $('.brand').addEventListener('click', event => { event.preventDefault(); scrollToId('home'); });
  $$('.booking-tab').forEach(button => button.onclick = () => {
    setType(button.dataset.type);
    searchTrains();
  });
  $$('input[name="modeMirror"]').forEach(radio => radio.onchange = () => {
    setType(radio.value);
    searchTrains();
  });
  $('#swapBtn').onclick = () => {
    const from = $('#fromStation').value;
    $('#fromStation').value = $('#toStation').value;
    $('#toStation').value = from;
    loadSpots();
  };
  $('#searchBtn').onclick = () => {
    searchTrains();
    scrollToId('results');
  };
  $('#showAllTypesBtn').onclick = () => {
    state.type = 'all';
    $$('.booking-tab').forEach(button => button.classList.remove('active'));
    $$('input[name="modeMirror"]').forEach(radio => { radio.checked = false; });
    searchTrains();
  };
  $('#toStation').onchange = loadSpots;
  $('#quickTrackBtn').onclick = quickTrack;
  $('#quickTrackInput').onkeydown = event => { if (event.key === 'Enter') quickTrack(); };
  $('#recenterBtn').onclick = () => {
    if (state.map && state.trainMarker) state.map.panTo(state.trainMarker.getLatLng());
  };
  $('#showSpotsOnMapBtn').onclick = () => {
    addSpotMarkers({ fit: true });
    scrollToId('tracking');
    showToast(state.spots.length ? 'Destination spots added to the map' : 'No spots to show for this destination');
  };
  $('#notifyBtn').onclick = () => {
    state.alertsEnabled = !state.alertsEnabled;
    $('#notifyBtn').textContent = state.alertsEnabled ? '🔔 Trip alerts enabled' : '🔔 Enable trip alerts';
    showToast(state.alertsEnabled ? 'Demo trip alerts enabled' : 'Trip alerts disabled');
  };
  $('#alertsBtn').onclick = () => scrollToId('tracking');
  $('#refreshBookingsBtn').onclick = loadBookings;
  $('#modalClose').onclick = () => { $('#bookingModal').hidden = true; };
  $('#bookingModal').onclick = event => { if (event.target.id === 'bookingModal') $('#bookingModal').hidden = true; };
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $('#bookingModal').hidden = true; });
  $$('[data-scroll]').forEach(button => button.onclick = () => scrollToId(button.dataset.scroll));
  window.addEventListener('beforeunload', closeLiveConnection);
}

(async function init() {
  await RailGoAuth.ready;
  setDefaultDate();
  await loadStations();
  setupMap();
  bindEvents();
  await Promise.all([searchTrains(), loadBookings()]);
  openHomeFirst();
  const section = ({ '/tracking': 'tracking', '/bookings': 'bookings', '/book': 'results' })[location.pathname];
  if (section) setTimeout(() => scrollToId(section), 300);
})();

function animateTrainMarker(target, live) {
  cancelAnimationFrame(state.markerAnimation);
  const marker = state.trainMarker, start = marker.getLatLng(), began = performance.now();
  const jump = Math.abs(start.lat - target[0]) + Math.abs(start.lng - target[1]) > 0.2;
  const duration = jump || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1900;
  function frame(now) {
    if (marker !== state.trainMarker) return;
    const fraction = duration ? Math.min(1, (now - began) / duration) : 1;
    marker.setLatLng([start.lat + (target[0] - start.lat) * fraction, start.lng + (target[1] - start.lng) * fraction]);
    if (fraction < 1) state.markerAnimation = requestAnimationFrame(frame);
    else if (state.followTrain) state.map.panTo(target, {animate: true, duration: 0.5});
  }
  state.markerAnimation = requestAnimationFrame(frame);
}
