(() => {
  const scriptBase = new URL('.', document.currentScript.src);
  const configuredBase = String(window.LIVE_TRAIN_CONFIG?.apiBase || '').replace(/\/$/, '');
  let movingToBackend = false;
  if (configuredBase) {
    const url = new URL(configuredBase);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid Live Train backend URL');
    // The Express app serves the same frontend. Keep browser session
    // cookies on that origin instead of depending on third-party cookies.
    if (url.origin !== location.origin) {
      movingToBackend = true;
      const route = location.pathname.replace(/\/$/, '').split('/').pop();
      const destination = ['dashboard', 'book', 'bookings', 'tracking'].includes(route) && location.hash !== '#login' ? route : 'login';
      location.replace(`${url.origin}/${destination}`);
    }
  }
  const isStatic = !configuredBase && (document.documentElement.dataset.hosting === 'static' || location.hostname.endsWith('.github.io'));
  let staticModule;
  function apiUrl(path) {
    if (!path.startsWith('/api/')) throw new Error('Invalid API path');
    return `${configuredBase || location.origin}${path}`;
  }
  async function request(path, options = {}) {
    if (movingToBackend) return new Promise(() => {}); // Navigation owns the next page.
    if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    if (isStatic) {
      staticModule ||= import(new URL('./static-api.js', scriptBase).href);
      const { requestStatic } = await staticModule;
      if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      const result = await requestStatic(path, options);
      if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      return result;
    }
    const response = await fetch(apiUrl(path), { credentials: 'include', ...options, signal: options.signal || AbortSignal.timeout(20000) });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('The backend returned a web page instead of data. Check the backend URL.'); }
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('railgo-auth-required'));
      throw Object.assign(new Error(payload.error || `Request failed (${response.status})`), { status: response.status });
    }
    return payload;
  }
  window.LiveTrainAPI = Object.freeze({ request, apiUrl, isStatic });
  document.addEventListener('DOMContentLoaded', () => {
    if (!isStatic) return;
    const note = document.createElement('p'); note.className = 'hosting-note';
    note.textContent = 'Public timetable snapshot · Email login needs a hosted backend';
    document.querySelector('.topbar').after(note);
  });
})();
