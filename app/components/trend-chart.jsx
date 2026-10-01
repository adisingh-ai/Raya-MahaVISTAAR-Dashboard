'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtDuration, fmtInt } from '../../lib/format';

const STACK = [
  { key: 'completed', name: 'Answered', color: 'var(--series-answered)' },
  { key: 'pending', name: 'Ongoing', color: 'var(--series-ongoing)' },
];

const VIEWS = [
  ['calls', 'Calls'],
  ['minutes', 'Minutes'],
  ['avg', 'Avg duration'],
  ['table', 'Table'],
];

const GRAN = { hour: 'per hour', day: 'per day', week: 'per week' };

// Bars: 4px rounded end on the top segment only, square at the baseline,
// and a 2px surface gap between stacked segments.
function stackShape(key) {
  return function StackSegment(props) {
    const { x, y, width, height, payload, fill } = props;
    if (!height || height <= 0) return null;
    const order = STACK.map((s) => s.key);
    const above = order.slice(order.indexOf(key) + 1).some((k) => payload[k] > 0);
    const gap = above ? 2 : 0;
    const h = Math.max(0, height - gap);
    const top = y + gap;
    if (h <= 0) return null;
    return <path d={roundedTop(x, top, width, h, above ? 0 : 4)} fill={fill} />;
  };
}

function roundedTop(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function SingleBar(props) {
  const { x, y, width, height, fill } = props;
  if (!height || height <= 0) return null;
  return <path d={roundedTop(x, y, width, height, 4)} fill={fill} />;
}

function TipBox({ active, payload, label, rows }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{label}</div>
      {rows(d).map((r) => (
        <div className="tooltip-row" key={r.name}>
          <span className="key">
            {r.color && <i style={{ background: r.color }} />}
            {r.name}
          </span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  tickLine: false,
  axisLine: { stroke: 'var(--axis)' },
  tick: { fontSize: 11.5 },
};

export default function TrendChart({ trend, granularity }) {
  const [view, setView] = useState('calls');
  const hasPending = trend.some((t) => t.pending > 0);
  const series = STACK.filter((s) => s.key === 'completed' || hasPending);
  const tickGap = trend.length > 40 ? 24 : 12;

  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <XAxis dataKey="label" {...axisProps} minTickGap={tickGap} interval="preserveStartEnd" />
    </>
  );

  return (
    <section className="card" aria-label="Trend">
      <div className="card-head">
        <div>
          <h2 className="card-title">
            {view === 'minutes' ? 'Minutes' : view === 'avg' ? 'Average answered call duration' : 'Calls'} {GRAN[granularity]}
          </h2>
          {view === 'calls' && (
            <div className="legend" style={{ marginTop: 6 }}>
              {series.map((s) => (
                <span key={s.key}>
                  <span className="swatch" style={{ background: s.color }} />
                  {s.name}
                </span>
              ))}
            </div>
          )}
          {view !== 'calls' && <p className="card-sub">{view === 'minutes' ? 'Each call rounded up to the next minute, as in RAYA' : 'Answered calls only'}</p>}
        </div>
        <div className="segmented" role="tablist" aria-label="Chart view">
          {VIEWS.map(([key, label]) => (
            <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <TrendTable trend={trend} />
      ) : (
        <div className="chart-box">
          <ResponsiveContainer>
            {view === 'avg' ? (
              <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                {common}
                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtDuration(v)} width={56} />
                <Tooltip
                  cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
                  content={<TipBox rows={(d) => [{ name: 'Avg duration', value: fmtDuration(d.avgDuration), color: 'var(--series-answered)' }, { name: 'Answered calls', value: fmtInt(d.completed) }]} />}
                />
                <Line
                  type="monotone"
                  dataKey="avgDuration"
                  stroke="var(--series-answered)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            ) : (
              <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="18%">
                {common}
                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtInt(v)} allowDecimals={false} width={56} />
                <Tooltip
                  cursor={{ fill: 'var(--hover-wash)' }}
                  content={
                    <TipBox
                      rows={(d) =>
                        view === 'minutes'
                          ? [{ name: 'Minutes', value: fmtInt(d.minutes), color: 'var(--series-answered)' }, { name: 'Calls', value: fmtInt(d.total) }]
                          : [
                              ...series.map((s) => ({ name: s.name, value: fmtInt(d[s.key]), color: s.color })),
                              { name: 'Total', value: fmtInt(d.total) },
                            ]
                      }
                    />
                  }
                />
                {view === 'minutes' ? (
                  <Bar dataKey="minutes" fill="var(--series-answered)" maxBarSize={24} shape={SingleBar} isAnimationActive={false} />
                ) : (
                  series.map((s) => (
                    <Bar key={s.key} dataKey={s.key} stackId="calls" fill={s.color} maxBarSize={24} shape={stackShape(s.key)} isAnimationActive={false} />
                  ))
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function TrendTable({ trend }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
      <table className="data-table-small">
        <thead>
          <tr>
            <th>Period</th>
            <th className="num">Calls</th>
            <th className="num">Answered</th>
            <th className="num">Ongoing</th>
            <th className="num">Minutes</th>
            <th className="num">Avg duration</th>
          </tr>
        </thead>
        <tbody>
          {[...trend].reverse().map((t) => (
            <tr key={t.t}>
              <td>{t.label}</td>
              <td className="num">{fmtInt(t.total)}</td>
              <td className="num">{fmtInt(t.completed)}</td>
              <td className="num">{fmtInt(t.pending)}</td>
              <td className="num">{fmtInt(t.minutes)}</td>
              <td className="num">{fmtDuration(t.avgDuration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
