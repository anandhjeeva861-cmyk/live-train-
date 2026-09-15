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
