(() => {
  let offset = 0, requestId = 0, debounce;
  async function loadFleet() {
    const request = ++requestId;
    $('#fleetCount').textContent = 'Searching…';
    try {
      const params = new URLSearchParams({q: $('#fleetQuery').value, type: $('#fleetType').value, offset, limit: 8});
      const result = await fetchJson(`/api/trains/catalog?${params}`);
      if (request !== requestId) return;
      $('#fleetCount').textContent = `${result.count.toLocaleString()} matches · ${result.total.toLocaleString()} demo trains${result.count ? ` · ${offset + 1}–${Math.min(offset + 8, result.count)}` : ''}`;
      $('#fleetPrev').disabled = offset === 0;
      $('#fleetNext').disabled = offset + 8 >= result.count;
      $('#fleetResults').innerHTML = result.trains.length ? result.trains.map(train => `<button class="fleet-train" data-fleet-id="${escapeHtml(train.id)}" aria-pressed="${state.selectedTrain?.id === train.id}"><span class="fleet-number">${escapeHtml(train.number)} <small>${train.type === 'tourism' ? 'TOURISM' : 'EXPRESS'}</small></span><b>${escapeHtml(train.name)}</b><span>${escapeHtml(train.from.city)} → ${escapeHtml(train.to.city)}</span><small>${train.route.length} stations · Track journey ↗</small></button>`).join('') : '<p class="fleet-empty">No trains match. Try a city such as Mumbai or train number 70000.</p>';
      $$('.fleet-train').forEach(button => button.onclick = () => {
        selectTrackingTrain(result.trains.find(t => t.id === button.dataset.fleetId));
        $('#trackingTrainName').scrollIntoView({behavior: 'smooth', block: 'start'});
      });
    } catch (error) {
      if (request !== requestId) return;
      $('#fleetCount').textContent = error.message;
      $('#fleetResults').innerHTML = '<button id="retryFleet" class="secondary-button">Retry train directory</button>';
      $('#retryFleet').onclick = loadFleet;
    }
  }
  $('#fleetQuery').oninput = () => { if ($('#fleetDirectory').hidden) $('#fleetToggle').click(); clearTimeout(debounce); offset = 0; debounce = setTimeout(loadFleet, 200); };
  $('#fleetType').onchange = () => {offset = 0; loadFleet();};
  $('#fleetPrev').onclick = () => {offset = Math.max(0, offset - 8); loadFleet();};
  $('#fleetNext').onclick = () => {offset += 8; loadFleet();};
  $('#fleetToggle').onclick = () => {
    const hidden = !$('#fleetDirectory').hidden;
    $('#fleetDirectory').hidden = hidden;
    $('#fleetToggle').textContent = hidden ? 'Browse trains' : 'Hide trains';
    $('#fleetToggle').setAttribute('aria-expanded', String(!hidden));
  };
  function setFollow(active) {
    state.followTrain = active;
    $('#followTrain').setAttribute('aria-pressed', String(active));
    $('#followTrain').textContent = active ? '● Following train' : 'Follow train';
  }
  $('#followTrain').onclick = () => {
    setFollow(!state.followTrain);
    if (state.followTrain && state.trainMarker) state.map.setView(state.trainMarker.getLatLng(), 11);
  };
  $('#fitRoute').onclick = () => {
    setFollow(false);
    if (state.map && state.selectedTrain) state.map.fitBounds(state.selectedTrain.route.map(p => [p.lat,p.lng]), {padding:[45,65]});
  };
  $('#expandMap').onclick = () => {
    const expanded = $('#tracking').classList.toggle('expanded-map');
    $('#expandMap').textContent = expanded ? 'Exit expanded map' : 'Expand map';
    $('#expandMap').setAttribute('aria-pressed', String(expanded));
    state.map?.invalidateSize();
  };
  document.addEventListener('keydown', e => {if(e.key === 'Escape' && $('#tracking').classList.contains('expanded-map')) $('#expandMap').click();});
  document.addEventListener('train-selected', event => {
    $$('.fleet-train').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fleetId === event.detail.id)));
    $('#nextArrival').textContent = 'Connecting to simulation…';
    $('#motionStatus').textContent = '';
    if (state.map && !state.map.followBound) {
      state.map.on('dragstart', () => setFollow(false));
      state.map.followBound = true;
    }
  });
  document.addEventListener('train-telemetry', event => {
    const live = event.detail;
    $('#nextArrival').textContent = `${live.nextStationDistanceKm} km away · ${live.nextStationEtaMinutes} min to next stop`;
    $('#motionStatus').textContent = live.motionStatus === 'RUNNING' ? `${live.distanceTravelledKm} of ${live.totalDistanceKm} km travelled` : `${live.motionStatus === 'ARRIVED' ? 'Arrived at' : 'Stopped at'} ${live.currentStation}`;
  });
  setInterval(() => {
    if (!state.lastLive) return;
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(state.lastLive.updatedAt)) / 1000));
    $('#updatedAgo').textContent = seconds < 2 ? 'just now' : `${seconds}s ago`;
    if (seconds > 10) {
      $('#connectionBadge').textContent = '● Signal stale · reconnecting';
      $('#connectionBadge').className = 'connection-badge offline';
    } else if (LiveTrainAPI.isStatic) {
      $('#connectionBadge').textContent = '● Browser simulation';
      $('#connectionBadge').className = 'connection-badge online';
    }
  }, 1000);
  loadFleet();
})();
