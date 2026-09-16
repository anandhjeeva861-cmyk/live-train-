// Kept dependency-free so hosted frontend builds can validate origins without
// loading email providers, Prisma or any private backend configuration.
export function allowedOrigin(value, production = false) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Origins must be complete HTTP(S) origins, without paths or wildcards.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*') || (production && !local && url.protocol !== 'https:')) {
    throw new Error('Origins must use HTTPS (HTTP is allowed for localhost), without credentials, paths, queries or wildcards.');
  }
  return url.origin;
}
