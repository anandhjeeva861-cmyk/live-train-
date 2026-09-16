import { allowedOrigin } from '../backend/deployment.js';

// This check never requests an OTP or reads private provider configuration.
// Its temporary session is revoked after checking cookie retention.
export async function verifyBackend(value, frontendOrigins = [], fetcher = fetch) {
  const backend = allowedOrigin(value, true);
  const origins = [...new Set(frontendOrigins.map(origin => allowedOrigin(origin, true)))];
  const secure = backend.startsWith('https:');
  async function request(route, { origin, headers, ...options } = {}) {
    let response;
    try {
      response = await fetcher(backend + route, { ...options, redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { ...(origin && { Origin: origin }), ...headers } });
    } catch { throw new Error(`Backend connection failed at ${route}.`); }
    if (!response.ok) throw new Error(`Backend returned HTTP ${response.status} at ${route}.`);
    if (origin && (response.headers.get('access-control-allow-origin') !== origin || response.headers.get('access-control-allow-credentials') !== 'true')) {
      throw new Error(`Credentialed CORS is not enabled for ${origin} at ${route}. Check ALLOWED_ORIGINS.`);
    }
    return response;
  }
  async function json(route, options) {
    const response = await request(route, options);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`Expected JSON at ${route}. Use the Node backend origin, not the static frontend.`);
    try { return await response.json(); }
    catch { throw new Error(`Invalid JSON at ${route}.`); }
  }
  const health = await json('/api/health');
  if (health.status !== 'ok' || health.database !== 'connected') throw new Error('Backend database is not healthy. Check migrations and the persistent disk.');
  const config = await json('/api/auth/config');
  if (config.configured !== true) throw new Error('Backend email settings are missing or invalid. Set them privately on that server and restart it.');
  for (const origin of origins.length ? origins : [undefined]) {
    if (origin) {
      await json('/api/auth/config', { origin });
      for (const route of ['/api/auth/email/send', '/api/auth/email/verify']) {
        const response = await request(route, { origin, method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
        if (!response.headers.get('access-control-allow-methods')?.split(/\s*,\s*/).includes('POST') || !response.headers.get('access-control-allow-headers')?.toLowerCase().split(/\s*,\s*/).includes('content-type')) {
          throw new Error(`OTP preflight does not allow JSON POST requests for ${origin}.`);
        }
      }
    }
    const probe = await request('/api/auth/session', { origin, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const setCookie = probe.headers.getSetCookie().find(cookie => cookie.startsWith('railgo.sid='));
    if (!setCookie) throw new Error('Backend did not set a session cookie. Check HTTPS and TRUST_PROXY.');
    const headers = { Cookie: setCookie.split(';')[0], 'Content-Type': 'application/json' };
    try {
      if (!/;\s*HttpOnly(?:;|$)/i.test(setCookie) || (secure && !/;\s*Secure(?:;|$)/i.test(setCookie)) || (secure && origin && origin !== backend && !/;\s*SameSite=None(?:;|$)/i.test(setCookie))) {
        throw new Error('Backend session cookie flags do not support this deployment. Check SESSION_SAME_SITE and production HTTPS.');
      }
      if ((await json('/api/auth/session', { origin, headers })).ready !== true) throw new Error('Backend could not resume its session cookie. Check the session store and signing secret.');
    } finally {
      await request('/api/auth/logout', { origin, method: 'POST', headers, body: '{}' });
    }
  }
  return { backend, origins };
}
