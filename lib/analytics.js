// All numbers here are calculated in IST. India has no daylight saving,
// so IST is always UTC + 5:30 and a fixed offset is exact.
const IST_OFFSET_MS = 330 * 60 * 1000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const SHORT_CALL_SECONDS = 15;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PRESETS = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

// Shifts a UTC timestamp so its UTC getters read IST wall-clock values.
const ist = (ms) => new Date(ms + IST_OFFSET_MS);
const istMidnight = (ms) => {
  const d = ist(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET_MS;
};
const weekdayIndex = (ms) => (ist(ms).getUTCDay() + 6) % 7; // Monday = 0
const callTime = (c) => c.start ?? c.created;

function dayLabel(ms, withYear) {
  const d = ist(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
}

function hourLabel(h) {
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

function parseIstDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) - IST_OFFSET_MS : null;
}

/**
 * Turns ?range=30d or ?from=2026-09-01&to=2026-09-15 (IST dates, inclusive)
 * into a [from, to) window in UTC milliseconds.
 */
export function resolveRange(params, oldestLoaded, now = Date.now()) {
  const from = parseIstDate(params.get('from'));
  const to = parseIstDate(params.get('to'));
  if (from !== null && to !== null && to >= from) {
    const end = Math.min(to + DAY, now);
    return {
      key: 'custom',
      label: `${dayLabel(from, true)} – ${dayLabel(to, true)}`,
      from,
      to: end,
    };
  }

  const key = PRESETS[params.get('range')] ? params.get('range') : '30d';
  const start = {
    today: istMidnight(now),
    '7d': now - 7 * DAY,
    '30d': now - 30 * DAY,
    '90d': now - 90 * DAY,
    all: oldestLoaded ?? now - 30 * DAY,
  }[key];
  return { key, label: PRESETS[key], from: start, to: now };
}

function granularityFor(span) {
  if (span <= 2 * DAY) return 'hour';
  if (span <= 120 * DAY) return 'day';
  return 'week';
}

function bucketStart(ms, granularity) {
  // IST is on a half-hour offset, so hour boundaries have to be found in IST.
  if (granularity === 'hour') return Math.floor((ms + IST_OFFSET_MS) / HOUR) * HOUR - IST_OFFSET_MS;
  const midnight = istMidnight(ms);
  if (granularity === 'day') return midnight;
  return midnight - weekdayIndex(ms) * DAY;
}

function nextBucket(ms, granularity) {
  if (granularity === 'hour') return ms + HOUR;
  return ms + (granularity === 'day' ? DAY : 7 * DAY);
}

function bucketLabel(ms, granularity, multiYear) {
  if (granularity === 'hour') return hourLabel(ist(ms).getUTCHours());
  if (granularity === 'week') return `Wk of ${dayLabel(ms, multiYear)}`;
  return dayLabel(ms, multiYear);
}

// RAYA's "Total minutes" rounds every call up to the next whole minute
// (a 1m 10s call counts as 2), so we do the same to match its numbers.
const billed = (seconds) => Math.ceil(seconds / 60);

function median(sorted) {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(calls) {
  let completed = 0;
  let pending = 0;
  let totalSeconds = 0;
  let billedMinutes = 0;
  let shortCalls = 0;
  let longest = null;
  const completedDurations = [];
  const perCaller = new Map();

  for (const c of calls) {
    totalSeconds += c.dur;
    billedMinutes += billed(c.dur);
    if (c.outcome === 'Completed') {
      completed++;
      completedDurations.push(c.dur);
      if (c.dur < SHORT_CALL_SECONDS) shortCalls++;
      if (!longest || c.dur > longest.dur) longest = c;
    } else pending++;
    if (c.caller) perCaller.set(c.caller, (perCaller.get(c.caller) ?? 0) + 1);
  }

  completedDurations.sort((a, b) => a - b);
  let repeatCallers = 0;
  let callsFromRepeatCallers = 0;
  for (const n of perCaller.values()) {
    if (n > 1) {
      repeatCallers++;
      callsFromRepeatCallers += n;
    }
  }

  return {
    total: calls.length,
    completed,
    pending,
    totalSeconds,
    billedMinutes,
    avgDuration: completed ? completedDurations.reduce((a, b) => a + b, 0) / completed : null,
    medianDuration: median(completedDurations),
    shortCalls,
    shortCallShare: completed ? shortCalls / completed : null,
    uniqueCallers: perCaller.size,
    repeatCallers,
    repeatCallShare: calls.length ? callsFromRepeatCallers / calls.length : null,
    callsPerCaller: perCaller.size ? calls.length / perCaller.size : null,
    longestCall: longest ? { dur: longest.dur, at: callTime(longest) } : null,
  };
}

const DURATION_BUCKETS = [
  { label: '< 15s', max: 15 },
  { label: '15–30s', max: 30 },
  { label: '30s–1m', max: 60 },
  { label: '1–2m', max: 120 },
  { label: '2–3m', max: 180 },
  { label: '3–5m', max: 300 },
  { label: '5–10m', max: 600 },
  { label: '10m +', max: Infinity },
];

// Calls that never connected (RAYA's Failure/Failed/Unknown: no audio, 0s) are
// left out of the dashboard entirely.
export function callsInRange(allCalls, from, to) {
  const out = [];
  for (const c of allCalls.values()) {
    if (c.outcome === 'Failure') continue;
    const t = callTime(c);
    if (t >= from && t < to) out.push(c);
  }
  return out;
}

export function buildMetrics(allCalls, range, { oldestLoaded }) {
  const { from, to } = range;
  const calls = callsInRange(allCalls, from, to);
  const span = to - from;
  const granularity = granularityFor(span);
  const multiYear = ist(from).getUTCFullYear() !== ist(to).getUTCFullYear();

  // Trend buckets, including empty ones so gaps show as zero.
  const buckets = new Map();
  for (let b = bucketStart(from, granularity); b < to; b = nextBucket(b, granularity)) {
    buckets.set(b, { t: b, label: bucketLabel(b, granularity, multiYear), completed: 0, pending: 0, minutes: 0, completedSeconds: 0 });
  }

  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  const durationCounts = new Array(DURATION_BUCKETS.length).fill(0);

  for (const c of calls) {
    const t = callTime(c);
    const b = buckets.get(bucketStart(t, granularity));
    if (b) {
      b.minutes += billed(c.dur);
      if (c.outcome === 'Completed') {
        b.completed++;
        b.completedSeconds += c.dur;
      } else b.pending++;
    }
    const h = ist(t).getUTCHours();
    const wd = weekdayIndex(t);
    heatmap[wd][h]++;
    byHour[h]++;
    byWeekday[wd]++;
    if (c.outcome === 'Completed') {
      durationCounts[DURATION_BUCKETS.findIndex((d) => c.dur < d.max)]++;
    }
  }

  const trend = [...buckets.values()].map((b) => ({
    t: b.t,
    label: b.label,
    completed: b.completed,
    pending: b.pending,
    total: b.completed + b.pending,
    minutes: b.minutes,
    avgDuration: b.completed ? Math.round(b.completedSeconds / b.completed) : null,
  }));

  const peakHourIdx = byHour.indexOf(Math.max(...byHour));
  const busiestBucket = trend.reduce((best, b) => (b.total > (best?.total ?? -1) ? b : best), null);
  const days = Math.max(1, span / DAY);

  // Same-length window just before this one, for the "vs previous" deltas.
  const prevFrom = from - span;
  const previousCovered = oldestLoaded !== null && prevFrom >= oldestLoaded;
  const previous = previousCovered ? summarize(callsInRange(allCalls, prevFrom, from)) : null;

  return {
    range: { ...range, granularity },
    coverage: {
      complete: oldestLoaded !== null && from >= oldestLoaded,
      oldestLoaded,
    },
    kpis: { ...summarize(calls), callsPerDay: calls.length / days },
    previous,
    trend,
    heatmap: { rows: WEEKDAYS, cells: heatmap },
    durations: DURATION_BUCKETS.map((d, i) => ({ label: d.label, count: durationCounts[i] })),
    peakHour: calls.length ? { hour: peakHourIdx, label: `${hourLabel(peakHourIdx)} – ${hourLabel((peakHourIdx + 1) % 24)}`, count: byHour[peakHourIdx] } : null,
    busiestWeekday: calls.length ? { label: WEEKDAYS[byWeekday.indexOf(Math.max(...byWeekday))], count: Math.max(...byWeekday) } : null,
    busiestBucket: busiestBucket && busiestBucket.total > 0 ? { label: busiestBucket.label, count: busiestBucket.total, granularity } : null,
  };
}

export function maskNumber(n) {
  if (!n) return '—';
  const s = String(n);
  if (s.length <= 5) return s;
  return `${s.slice(0, 2)}${'•'.repeat(s.length - 5)}${s.slice(-3)}`;
}
