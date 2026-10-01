import { getCalls, getStatus } from '../../../lib/raya-sync';
import { callsInRange, maskNumber, resolveRange } from '../../../lib/analytics';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['Completed', 'Pending']);

// GET /api/calls?range=30d&page=1&pageSize=20&status=Completed&q=351
// Reads from the cache only; /api/metrics is what keeps the cache fresh.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const range = resolveRange(params, getStatus().oldestLoaded);
  const pageSize = Math.min(100, Math.max(5, Number(params.get('pageSize')) || 20));
  const status = params.get('status');
  const q = (params.get('q') ?? '').replace(/\D/g, '');
  const showFull = process.env.SHOW_FULL_NUMBERS === 'true';

  let rows = callsInRange(getCalls(), range.from, range.to);
  if (STATUSES.has(status)) rows = rows.filter((c) => c.outcome === status);
  if (q.length >= 3) rows = rows.filter((c) => c.caller && String(c.caller).includes(q));
  rows.sort((a, b) => (b.start ?? b.created) - (a.start ?? a.created));

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1));
  const slice = rows.slice((page - 1) * pageSize, page * pageSize).map((c) => ({
    id: c.id,
    caller: showFull ? c.caller : maskNumber(c.caller),
    outcome: c.outcome,
    duration: c.dur,
    at: c.start ?? c.created,
  }));

  return Response.json({ rows: slice, page, pages, total: rows.length });
}
