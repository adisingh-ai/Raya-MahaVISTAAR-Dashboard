'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtInt, fmtPct } from '../../lib/format';

function Column(props) {
  const { x, y, width, height, fill } = props;
  if (!height || height <= 0) return null;
  const r = Math.min(4, width / 2, height);
  return <path d={`M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`} fill={fill} />;
}

function Tip({ active, payload, completed }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-title">{d.label}</div>
      <div className="tooltip-row">
        <span className="key">
          <i style={{ background: 'var(--series-answered)' }} />
          Answered calls
        </span>
        <b>{fmtInt(d.count)}</b>
      </div>
      <div className="tooltip-row">
        <span className="key">Share</span>
        <b>{completed ? fmtPct(d.count / completed) : '—'}</b>
      </div>
    </div>
  );
}

export default function DurationChart({ durations, completed }) {
  const data = durations.map((d) => ({ ...d, share: completed ? d.count / completed : 0 }));
  return (
    <section className="card" aria-label="Call length distribution">
      <div className="card-head">
        <div>
          <h2 className="card-title">How long answered calls last</h2>
          <p className="card-sub">Share of answered calls by length</p>
        </div>
      </div>
      <div className="chart-box short">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} interval={0} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => fmtInt(v)} allowDecimals={false} width={44} />
            <Tooltip cursor={{ fill: 'var(--hover-wash)' }} content={<Tip completed={completed} />} />
            <Bar dataKey="count" fill="var(--series-answered)" maxBarSize={24} shape={Column} isAnimationActive={false}>
              <LabelList
                dataKey="share"
                position="top"
                formatter={(v) => (v >= 0.005 ? `${Math.round(v * 100)}%` : '')}
                style={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
