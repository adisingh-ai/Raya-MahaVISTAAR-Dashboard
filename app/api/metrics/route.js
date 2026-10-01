import { sync, getCalls, getStatus } from '../../../lib/raya-sync';
import { buildMetrics, resolveRange } from '../../../lib/analytics';

export const dynamic = 'force-dynamic';

// GET /api/metrics?range=30d            (today | 7d | 30d | 90d | all)
// GET /api/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD   (IST dates, inclusive)
// Add &refresh=1 to pull the latest calls from RAYA first.
export async function GET(request) {
  const params = new URL(request.url).searchParams;

  try {
    await sync({ force: params.get('refresh') === '1' });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  const status = getStatus();
  const range = resolveRange(params, status.oldestLoaded);
  const metrics = buildMetrics(getCalls(), range, { oldestLoaded: status.oldestLoaded });

  return Response.json({ ...metrics, status, generatedAt: Date.now() });
}
