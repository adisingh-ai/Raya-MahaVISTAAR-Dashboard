import { fmtDateTime, fmtDuration, fmtInt, fmtPct } from '../../lib/format';

const BUSIEST = { day: 'Busiest day', week: 'Busiest week' };

export default function Insights({ data }) {
  const { kpis, busiestWeekday, busiestBucket } = data;
  // On hourly ranges the busiest hour is already on the hour-of-day chart.
  const showBusiest = busiestBucket?.granularity !== 'hour';
  const items = [
    showBusiest && {
      label: busiestBucket ? BUSIEST[busiestBucket.granularity] : 'Busiest day',
      value: busiestBucket?.label ?? '—',
      foot: busiestBucket ? `${fmtInt(busiestBucket.count)} calls` : null,
    },
    {
      label: 'Busiest weekday',
      value: busiestWeekday?.label ?? '—',
      foot: busiestWeekday ? `${fmtInt(busiestWeekday.count)} calls` : null,
    },
    {
      label: 'Very short calls',
      value: fmtPct(kpis.shortCallShare, 0),
      foot: `${fmtInt(kpis.shortCalls)} answered calls under 15s`,
    },
    {
      label: 'Longest call',
      value: fmtDuration(kpis.longestCall?.dur),
      foot: kpis.longestCall ? fmtDateTime(kpis.longestCall.at) : null,
    },
  ].filter(Boolean);

  return (
    <section className="grid insights" aria-label="Highlights">
      {items.map((it) => (
        <div className="card insight" key={it.label}>
          <div className="stat-label">{it.label}</div>
          <div className="stat-value">{it.value}</div>
          {it.foot && <div className="stat-foot">{it.foot}</div>}
        </div>
      ))}
    </section>
  );
}
