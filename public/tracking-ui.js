(() => {
 let offset = 0, requestId = 0, debounce;
 async function loadFleet() {
  const request = ++requestId;
  $('#fleetCount').textContent = 'Searching…';
  try {
   const params = new URLSearchParams({ q: $('#fleetQuery').value, offset, limit: 8 });
   if ($('#fleetType').value) params.set('source', $('#fleetType').value);
   const result = await fetchJson(`/api/trains/catalog?${params}`);
   if (request !== requestId) return;
   $('#fleetCount').textContent = `${result.count.toLocaleString()} matches · ${result.total.toLocaleString()} published train numbers${result.count ? ` · ${offset + 1}–${Math.min(offset + 8,result.count)}` : ''}`;
   $('#fleetPrev').disabled = offset === 0; $('#fleetNext').disabled = offset + 8 >= result.count;
   $('#fleetResults').innerHTML = result.trains.map(t => `<button class="fleet-train" data-fleet-id="${escapeHtml(t.id)}"><span class="fleet-number">${escapeHtml(t.number)} <small>${escapeHtml(t.category)}</small></span><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.from.name)} → ${escapeHtml(t.to.name)}</span><small>${t.route.length} stations · Source ${escapeHtml(t.sourceDate)}</small></button>`).join('') || '<p class="fleet-empty">No trains match this number, name or station.</p>';
   $$('[data-fleet-id]').forEach(b => b.onclick = () => selectTrackingTrain(result.trains.find(t => t.id === b.dataset.fleetId)));
  } catch (error) { if (request === requestId) $('#fleetCount').textContent = error.message; }
 }
 $('#fleetToggle').onclick = () => { const hidden = !$('#fleetDirectory').hidden; $('#fleetDirectory').hidden = hidden; $('#fleetToggle').setAttribute('aria-expanded', !hidden); if (!hidden) loadFleet(); };
 $('#fleetQuery').oninput = () => { clearTimeout(debounce); $('#fleetDirectory').hidden = false; $('#fleetToggle').setAttribute('aria-expanded', 'true'); offset = 0; debounce = setTimeout(loadFleet, 250); };
 $('#fleetType').onchange = () => { offset = 0; loadFleet(); };
 $('#fleetPrev').onclick = () => { offset = Math.max(0,offset - 8); loadFleet(); };
 $('#fleetNext').onclick = () => { offset += 8; loadFleet(); };
 document.addEventListener('keydown', event => { if (event.key === 'Escape') { $('.map-card').classList.remove('expanded'); $('#expandMap').setAttribute('aria-pressed', 'false'); state.map?.invalidateSize(); } });
})();
