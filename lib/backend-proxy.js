/** On Vercel, forward /api/* to the machine running the real API. The browser stays on the Vercel origin, so ngrok's browser warning and CORS never apply. */
export async function proxyToBackend(request, path) {
  if (!process.env.VERCEL) return null;
  const target = (process.env.API_PROXY_TARGET || '').replace(/\/$/, '');
  if (!target) return null;

  const incoming = new URL(request.url);
  let upstream;
  try {
    upstream = await fetch(`${target}${path}${incoming.search}`, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      cache: 'no-store',
    });
  } catch (err) {
    return Response.json(
      { error: `Couldn't reach the API machine (${err.message}). Is npm run backend and the tunnel still running?` },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const type = upstream.headers.get('content-type');
  if (type) headers.set('content-type', type);
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers });
}
