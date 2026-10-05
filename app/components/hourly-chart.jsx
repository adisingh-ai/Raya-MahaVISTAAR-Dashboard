'use client';

import { useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtInt } from '../../lib/format';

const hourName = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
const hourSpan = (from, to) => `${hourName(from)} – ${hourName(to % 24)}`;
const fmtAvg = (v) => (v === null || v === undefined ? '—' : v >= 10 ? fmtInt(v) : v.toFixed(1));
const fmtChange = (cur, prev) => {
  if (!prev) return '—';
  const d = cur / prev - 1;
  return `${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)}%`;
};
const sum = (values, from, to) => values.slice(from, to).reduce((a, v) => a + (v ?? 0), 0);
const argmax = (values) => values.reduce((best, v, i) => (v !== null && v > (values[best] ?? -1) ? i : best), 0);

const CURRENT = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', all: 'All time' };
const PRIOR = { '7d': 'prior 7 days', '30d': 'prior 30 days', '90d': 'prior 90 days' };

// The shortest run of consecutive hours that holds at least 85% of calls
// (ties go to the run holding more).
const BUSY_SHARE = 0.85;
function busyWindow(counts) {
  const total = sum(counts, 0, 24);
  let best = null;
  for (let from = 0; from < 24; from++) {
    for (let to = from + 1; to <= 24; to++) {
      const n = sum(counts, from, to);
      if (n < total * BUSY_SHARE) continue;
      if (!best || to - from < best.to - best.from || (to - from === best.to - best.from && n > best.n)) best = { from, to, n };
      break;
    }
  }
  return { ...best, share: best.n / total };
}

// The 6-hour stretch (wrapping past midnight) with the fewest calls, using only hours that have happened.
function quietWindow(values) {
  let best = null;
  for (let s = 0; s < 24; s++) {
    const hours = Array.from({ length: 6 }, (_, i) => values[(s + i) % 24]);
    if (hours.some((v) => v === null)) continue;
    const total = hours.reduce((a, v) => a + v, 0);
    if (!best || total < best.total) best = { from: s, total };
  }
  return best;
}

function Tip({ active, payload, compare, labels }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows = [{ name: compare ? labels.current : labels.unit, value: d.value, color: 'var(--series-answered)' }];
  if (compare) rows.push({ name: labels.prior, value: d.compare, color: 'var(--series-compare)' });
  return (
    <div className="tooltip">
      <div className="tooltip-title">{hourSpan(d.hour, d.hour + 1)} IST</div>
      {rows.map((r) => (
        <div className="tooltip-row" key={r.name}>
          <span className="key">
            <i style={{ background: r.color }} />
            {r.name}
          </span>
          <b>{fmtAvg(r.value)}</b>
        </div>
      ))}
      {compare && d.value !== null && (
        <div className="tooltip-row">
          <span className="key">Change</span>
          <b>{fmtChange(d.value, d.compare)}</b>
        </div>
      )}
    </div>
  );
}

function summaryStats({ values, counts, compare, perDay, peak, typical, vsText, showCompare }) {
  const perUnit = perDay ? ' a day' : '';
  const approx = perDay ? '~' : '';
  const fmtCalls = (v) => (perDay ? fmtAvg(v) : fmtInt(v));
  const busy = busyWindow(counts);

  if (!showCompare) {
    const quiet = quietWindow(values);
    return [
      { label: 'Busiest hour', value: hourSpan(peak, peak + 1), foot: `${approx}${fmtCalls(values[peak])} calls${perUnit}` },
      { label: 'Busy window', value: hourSpan(busy.from, busy.to), foot: `${Math.round(busy.share * 100)}% of calls` },
      quiet && {
        label: 'Quietest',
        value: hourSpan(quiet.from, quiet.from + 6),
        foot: quiet.total < 1 ? `under 1 call${perUnit}` : `${approx}${fmtCalls(quiet.total)} calls${perUnit}`,
      },
    ].filter(Boolean);
  }

  const prior = compare.values;
  const priorPeak = argmax(prior);
  // Only compare busy-window hours that have happened (matters for today).
  const hours = Array.from({ length: busy.to - busy.from }, (_, i) => busy.from + i).filter((h) => values[h] !== null);
  const now = hours.reduce((a, h) => a + values[h], 0);
  const before = hours.reduce((a, h) => a + prior[h], 0);
  return [
    {
      label: 'Busiest hour',
      value: hourSpan(peak, peak + 1),
      foot: priorPeak === peak ? (typical ? 'same as a typical day' : 'same as before') : `${typical ? 'typically' : 'was'} ${hourSpan(priorPeak, priorPeak + 1)}`,
    },
    {
      label: 'Calls at peak',
      value: `${approx}${fmtCalls(values[peak])}${perDay ? ' a day' : ' calls'}`,
      foot: typical ? `typical day peaks at ~${fmtAvg(prior[priorPeak])}` : `was ~${fmtAvg(prior[priorPeak])} a day`,
    },
    { label: 'Busy window', value: fmtChange(now, before), foot: `${hourSpan(busy.from, busy.to)}, ${vsText}` },
  ];
}

// Calls by hour of day (IST) as a line. Over more than a day each point is
// the average per day, so ranges of any length compare; a single day shows
// plain counts and stops at the current hour.
export default function HourlyChart({ hourly, rangeKey }) {
  const [comparing, setComparing] = useState(false);
  const { perDay, values, counts, compare } = hourly;
  const showCompare = comparing && compare !== null;
  const hasCalls = counts.some((n) => n > 0);
  const peak = argmax(values);
  const typical = compare?.kind === 'typical';
  const prior = PRIOR[rangeKey] ?? 'prior period';

  const labels = {
    current: CURRENT[rangeKey] ?? (perDay ? 'Selected period' : 'Selected day'),
    prior: typical ? 'Typical day' : prior[0].toUpperCase() + prior.slice(1),
    unit: perDay ? 'Avg calls a day' : 'Calls',
  };
  const vsText = typical ? 'vs a typical day (last 30 days)' : `vs ${prior}`;
  const stats = hasCalls ? summaryStats({ values, counts, compare, perDay, peak, typical, vsText, showCompare }) : [];
  const data = values.map((value, hour) => ({ hour, value, compare: compare?.values[hour] ?? null }));

  return (
    <section className="card hourly-card" aria-label="Calls by hour of day">
      <div className="card-head">
        <div>
          <h2 className="card-title">Calls by hour of day</h2>
          <p className="card-sub">
            {perDay ? 'Average calls a day in each hour, IST' : 'Calls in each hour, IST'}
            {hasCalls && ` · busiest ${hourSpan(peak, peak + 1)}`}
          </p>
        </div>
        {compare && (
          <label className="toggle">
            <input type="checkbox" checked={comparing} onChange={(e) => setComparing(e.target.checked)} />
            {typical ? 'Compare to a typical day' : `Compare to ${prior}`}
          </label>
        )}
      </div>
      {showCompare && (
        <div className="legend" style={{ marginBottom: 6 }}>
          <span>
            <span className="swatch" style={{ background: 'var(--series-answered)' }} />
            {labels.current}
          </span>
          <span>
            <svg width="18" height="10" aria-hidden>
              <line x1="0" y1="5" x2="18" y2="5" stroke="var(--series-compare)" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            {labels.prior}
          </span>
        </div>
      )}
      <div className="chart-box short">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="hour" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={{ fontSize: 11 }} interval={2} tickFormatter={hourName} />
            <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={perDay} tickFormatter={(v) => (Number.isInteger(v) ? fmtInt(v) : v.toFixed(1))} />
            <Tooltip cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }} content={<Tip compare={showCompare} labels={labels} />} />
            {showCompare && (
              <Line
                type="monotone"
                dataKey="compare"
                stroke="var(--series-compare)"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--series-compare)', stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--series-answered)"
              strokeWidth={2}
              fill="var(--series-answered)"
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--series-answered)', stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {hasCalls && <ReferenceDot x={peak} y={values[peak]} r={5} fill="var(--series-answered)" stroke="var(--surface)" strokeWidth={2} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {stats.length > 0 && (
        <div className="mini-stats">
          {stats.map((s) => (
            <div className="mini-stat" key={s.label}>
              <div className="stat-label">{s.label}</div>
              <div className="mini-value">{s.value}</div>
              <div className="stat-foot">{s.foot}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
