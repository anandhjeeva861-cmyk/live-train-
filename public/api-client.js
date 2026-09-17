(() => {
  const scriptBase = new URL('.', document.currentScript.src);
  const configuredBase = String(window.LIVE_TRAIN_CONFIG?.apiBase || '').replace(/\/$/, '');
  let isRemote = false, sessionCheck;
  if (configuredBase) {
    const url = new URL(configuredBase);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid Live Train backend URL');
    if (url.origin !== location.origin && url.protocol !== 'https:') throw new Error('A hosted backend must use HTTPS.');
    isRemote = url.origin !== location.origin;
  }
  const isStatic = !configuredBase && (document.documentElement.dataset.hosting === 'static' || location.hostname.endsWith('.github.io'));
  let staticModule;
  function apiUrl(path) {
    if (!path.startsWith('/api/')) throw new Error('Invalid API path');
    return `${configuredBase || location.origin}${path}`;
  }
  async function remoteRequest(path, options = {}) {
    const response = await fetch(apiUrl(path), { ...options, credentials: 'include', signal: options.signal || AbortSignal.timeout(30000) });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('The backend returned a web page instead of data. Check the backend URL.'); }
    if (!response.ok) {
      if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('railgo-auth-required'));
      throw Object.assign(new Error(payload.error || `Request failed (${response.status})`), { status: response.status });
    }
    return payload;
  }
  async function checkSession() {
    await remoteRequest('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const result = await remoteRequest('/api/auth/session');
    if (!result.ready) throw Object.assign(new Error('Your browser blocks the cookie needed for email verification on this site. Continue on the secure Live Train backend to verify your email.'), { code: 'SESSION_COOKIE_BLOCKED' });
  }
  async function request(path, options = {}) {
    if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
    const catalogueRequest = window.LIVE_TRAIN_CONFIG?.catalogueStatic && /^\/api\/(stations|trains|tourism|tourist-spots|weather|assistant)(?:[/?]|$)/.test(path);
    if (isStatic || catalogueRequest) {
      staticModule ||= import(new URL('./static-api.js', scriptBase).href);
      const { requestStatic } = await staticModule;
      if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      const result = await requestStatic(path, options);
      if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
      return result;
    }
    if (isRemote && (path === '/api/auth/config' || path.startsWith('/api/auth/email/'))) {
      // Share concurrent probes only. Cookie settings/expiry can change while
      // the page stays open, so a successful probe is not valid forever.
      sessionCheck ||= checkSession().finally(() => { sessionCheck = null; });
      await sessionCheck;
    }
    const result = await remoteRequest(path, options);
    if (path === '/api/auth/logout') sessionCheck = null;
    return result;
  }
  window.LiveTrainAPI = Object.freeze({ request, apiUrl, isStatic, backendProfileUrl: isRemote ? `${configuredBase}/profile` : null });
  document.addEventListener('DOMContentLoaded', () => {
    if (!isStatic) return;
    const note = document.createElement('p'); note.className = 'hosting-note';
    note.textContent = 'Public timetable snapshot · Email login needs a hosted backend';
    document.querySelector('.topbar').after(note);
  });
})();
