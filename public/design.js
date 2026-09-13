const iconPaths = {
 train:'<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M9 3V1h6v2M5 11h14M12 5v6M8 21l2-3m6 3-2-3M3 23h18"/><path d="M8 15h1m6 0h1"/>',
 home:'<path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>',
 ticket:'<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 11h7M9 15h7M9 18h5"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 weather:'<path d="M7 18a4 4 0 1 1 1-8 5 5 0 0 1 9 2 3 3 0 1 1 1 6ZM12 2v2m8 0-2 2M3 5l2 2m16 2h2"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
 user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/>',
 bell:'<path d="M6 8a6 6 0 0 1 12 0c0 8 3 8 3 10H3c0-2 3-2 3-10m4 13h4"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[el.dataset.icon]||iconPaths.train}</svg>`;});}
paintIcons();
let overviewMap, overviewRoute, overviewMarker;
function updateOverview(){
 const live=state.lastLive, train=state.selectedTrain;
 if(!train)return;
 $('#heroTrain').textContent=train.name;
 if(live){$('#heroSpeed').textContent=live.speedKmph;$('#heroNext').textContent=`${live.nextStation} (${live.nextStationCode})`;$('#heroEta').textContent=`Destination in ${live.etaMinutes} min`;$('#heroStatus').textContent=live.runningStatus==='ON_TIME'?'● Running On Time':`+${live.delayMinutes} min delay`;}
 $('#heroRoute').innerHTML=train.route.map((s,i)=>`<span class="${live&&i/(train.route.length-1)<=live.progress?'passed':''}">${escapeHtml(s.city||s.name)}<br>(${escapeHtml(s.code)})</span>`).join('');
 if(window.L){
  if(!overviewMap){overviewMap=L.map('overviewMap',{zoomControl:false,scrollWheelZoom:false,dragging:false}).setView([12.8,78.7],7);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(overviewMap);}
  if(overviewMap.currentTrain!==train.id){if(overviewRoute)overviewRoute.remove();overviewRoute=L.featureGroup().addTo(overviewMap);const points=train.route.map(s=>[s.lat,s.lng]);L.polyline(points,{color:'#0096e6',weight:4}).addTo(overviewRoute);train.route.forEach(s=>L.circleMarker([s.lat,s.lng],{radius:5,color:'#06a85a',fillColor:'white',fillOpacity:1,weight:3}).bindTooltip(s.city||s.name).addTo(overviewRoute));overviewMap.fitBounds(points,{padding:[25,25]});overviewMap.currentTrain=train.id;}
  if(live){if(!overviewMarker)overviewMarker=L.circleMarker([live.lat,live.lng],{radius:7,color:'white',weight:3,fillColor:'#0061ff',fillOpacity:1}).addTo(overviewMap);overviewMarker.setLatLng([live.lat,live.lng]);overviewMarker.bindTooltip(`${escapeHtml(train.name)} · ${live.speedKmph} km/h`);}
 }
}
let journeyRequest=0;
async function updateJourneyPreview(){
 const request=++journeyRequest;
 if(!LiveTrainAPI.isStatic && !RailGoAuth.user){$('#upcomingJourneys').innerHTML='<div class="empty-card">Sign in with your email to load your upcoming journeys.</div>';return;}
 try{const bookings=(await fetchJson('/api/bookings')).filter(b=>b.status==='CONFIRMED' && b.journeyDate>=formatLocalDate(new Date())).sort((a,b)=>a.journeyDate.localeCompare(b.journeyDate));if(request!==journeyRequest)return;$('#upcomingJourneys').innerHTML=bookings.length?bookings.slice(0,2).map(b=>`<article class="journey-preview"><img src="./assets/railgo-hero.png" alt="Train journey"><div><h3>${escapeHtml(b.trainNo)} - ${escapeHtml(b.trainName)}</h3><p>${escapeHtml(b.from.city)} (${escapeHtml(b.from.code)}) → ${escapeHtml(b.to.city)} (${escapeHtml(b.to.code)})</p><p>${escapeHtml(b.journeyDate)} · ${escapeHtml(b.passengers)} Passenger(s)</p><footer><span class="on-time">✓ ${escapeHtml(b.status)}</span><button data-ticket="${escapeHtml(b.pnr)}">View Ticket</button></footer></div></article>`).join(''):'<div class="empty-card">Your next adventure starts here.<br><button class="auth-link" id="findUpcomingTrain">Find your train →</button></div>';if($('#findUpcomingTrain'))$('#findUpcomingTrain').onclick=()=>scrollToId('home');$$('[data-ticket]').forEach(button=>button.onclick=()=>{const b=bookings.find(b=>b.pnr===button.dataset.ticket);$('#modalTitle').textContent='Your journey ticket';$('#modalBody').innerHTML=`<div class="checkout-summary"><div><small>TRAIN</small><b>${escapeHtml(b.trainName)}</b></div><div><small>PNR</small><b>${escapeHtml(b.pnr)}</b></div><div><small>DATE</small><b>${escapeHtml(b.journeyDate)}</b></div><div><small>SEAT</small><b>${escapeHtml(b.coach)} / ${escapeHtml(b.seat)}</b></div></div><p>${escapeHtml(b.from.city)} → ${escapeHtml(b.to.city)}</p><p>${escapeHtml(b.status)} · ${escapeHtml(b.travelClass)} · ₹${escapeHtml(b.fare)}</p><small>Demo ticket — not valid for travel.</small>`;$('#bookingModal').hidden=false;});}catch{$('#upcomingJourneys').innerHTML='<p class="empty-card">Journeys are temporarily unavailable.</p>';}
}
function updateDestinationPreview(){
 const city=$('#toStation').selectedOptions[0]?.dataset.city||'your destination';$('#destinationTitle').textContent=`Top Tourist Spots Near ${city}`;
 const spots=[...state.spots].sort((a,b)=>(a.name==='Nandi Hills'?-1:b.name==='Nandi Hills'?1:0)).slice(0,3);
 $('#destinationPreview').innerHTML=spots.map(s=>`<button class="preview-spot" data-preview-spot="${s.id}"><img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.name)}"><div><b>${escapeHtml(s.name)}</b><small>${s.distanceKm} km from station</small><em>★ ${s.rating}</em></div></button>`).join('')||'<p class="empty-note">No destinations available for this route.</p>';
 $$('[data-preview-spot]').forEach(b=>b.onclick=()=>showSpotOnMap(Number(b.dataset.previewSpot)));
}
new MutationObserver(updateDestinationPreview).observe($('#spotGrid'),{childList:true});
new MutationObserver(updateJourneyPreview).observe($('#bookingList'),{childList:true});
new MutationObserver(updateOverview).observe($('#speedValue'),{childList:true});
$('#menuBtn').onclick=()=>{const open=$('.desktop-nav').classList.toggle('open');$('#menuBtn').setAttribute('aria-expanded',open);};
$$('[data-scroll]').forEach(b=>b.addEventListener('click',()=>{$$('.desktop-nav button,.mobile-nav button').forEach(n=>n.classList.toggle('active',n.dataset.scroll===b.dataset.scroll));$('.desktop-nav').classList.remove('open');$('#menuBtn').setAttribute('aria-expanded','false');scrollToId(b.dataset.scroll);}));
$('#helpBtn').onclick=()=>{$('#modalTitle').textContent='How can we help?';$('#modalBody').innerHTML='<p>Choose your stations and travel date, then search for a normal or tourism train. Select Book Now to choose a seat and create a demo ticket.</p><p>Use Live Tracking to follow a simulated journey, see station progress and check route weather. You can also track a train number or your booking PNR.</p><p>This is a demo experience. Tickets and tracking are for preview purposes.</p>';$('#bookingModal').hidden=false;};
RailGoAuth.ready.then(() => { updateJourneyPreview();updateDestinationPreview();updateOverview(); });
