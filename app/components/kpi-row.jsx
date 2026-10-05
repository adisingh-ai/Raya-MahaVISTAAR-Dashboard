import { delta, fmtDuration, fmtInt } from '../../lib/format';

const VS = {
  today: 'vs yesterday',
  '7d': 'vs prior 7 days',
  '30d': 'vs prior 30 days',
  '90d': 'vs prior 90 days',
  custom: 'vs prior period',
};

function Delta({ d, vs }) {
  if (!d) return null;
  return (
    <>
      <span className={`delta ${d.tone}`}>
        {d.arrow} {d.text}
      </span>
      <span>{vs}</span>
    </>
  );
}

function Stat({ label, value, unit, foot, d, vs }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="stat-foot">
        <Delta d={d} vs={vs} />
        {foot && <span>{foot}</span>}
      </div>
    </div>
  );
}

export default function KpiRow({ kpis, previous, rangeKey }) {
  const p = previous ?? {};
  const vs = VS[rangeKey] ?? '';

  return (
    <section className="grid kpis" aria-label="Key numbers">
      <div className="card hero">
        <div className="stat-label">Total calls</div>
        <div className="stat-value">{fmtInt(kpis.total)}</div>
        <div className="stat-foot">
          <Delta d={previous && delta(kpis.total, p.total)} vs={vs} />
          <span>{fmtInt(kpis.callsPerDay)} a day on average</span>
        </div>
        <div className="hero-split">
          <div>
            <span className="swatch" style={{ background: 'var(--series-answered)' }} /> Answered <b>{fmtInt(kpis.completed)}</b>
          </div>
          <div>
            <span className="swatch" style={{ background: 'var(--series-ongoing)' }} /> Ongoing <b>{fmtInt(kpis.pending)}</b>
          </div>
        </div>
      </div>

      <div className="kpi-stack">
        <Stat
          label="Total minutes"
          value={fmtInt(kpis.billedMinutes)}
          unit="min"
          d={previous && delta(kpis.billedMinutes, p.billedMinutes)}
          vs={vs}
          foot="Rounded up per call, as in RAYA"
        />
        <Stat
          label="Avg duration · answered calls"
          value={fmtDuration(kpis.avgDuration)}
          d={previous && delta(kpis.avgDuration, p.avgDuration, { goodWhenUp: null })}
          vs={vs}
        />
        <Stat
          label="Unique callers"
          value={fmtInt(kpis.uniqueCallers)}
          d={previous && delta(kpis.uniqueCallers, p.uniqueCallers)}
          vs={vs}
          foot={kpis.callsPerCaller ? `${kpis.callsPerCaller.toFixed(1)} calls per caller on average` : null}
        />
      </div>
    </section>
  );
}
