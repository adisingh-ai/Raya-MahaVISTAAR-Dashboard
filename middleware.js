import { NextResponse } from 'next/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export function middleware(request) {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS });
  }
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(CORS)) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
