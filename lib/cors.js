import { NextResponse } from 'next/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export function handleOptions() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function json(_request, body, init = {}) {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return NextResponse.json(body, { ...init, headers });
}

/** Vercel only hosts the UI. Call processing stays on the machine running `npm run backend`. */
export function frontendOnlyBlock(request) {
  if (!process.env.VERCEL) return null;
  return json(
    request,
    {
      error:
        'This Vercel deploy is the UI only. Run the API on your machine and set NEXT_PUBLIC_API_BASE to its public URL, then redeploy.',
    },
    { status: 503 },
  );
}
