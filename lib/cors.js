const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export function json(_request, body, init = {}) {
  const res = Response.json(body, init);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}
