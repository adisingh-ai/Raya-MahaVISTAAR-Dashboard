/** Browser API origin. Empty = same-origin (local). Set on Vercel to your tunnel URL. */
export function apiUrl(path) {
  const base = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
