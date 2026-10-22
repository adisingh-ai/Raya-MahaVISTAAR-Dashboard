/** Browser API origin. Empty = same-origin (local). Set on Vercel to your tunnel URL. */
export function apiUrl(path) {
  const base = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function apiFetch(path, init = {}) {
  const headers = new Headers(init.headers);
  // ngrok's free tunnel otherwise answers browsers with an HTML warning page and no CORS header.
  headers.set('ngrok-skip-browser-warning', 'true');
  return fetch(apiUrl(path), { ...init, headers, cache: 'no-store' });
}
