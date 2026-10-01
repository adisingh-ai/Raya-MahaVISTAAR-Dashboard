import { fmtDateTime, fmtDuration, fmtInt, fmtPct } from '../../lib/format';

const BUSIEST = { hour: 'Busiest hour', day: 'Busiest day', week: 'Busiest week' };

export default function Insights({ data }) {
  const { kpis, peakHour, busiestWeekday, busiestBucket } = data;
  const items = [
    {
      label: 'Peak hour (IST)',
      value: peakHour?.label ?? '—',
      foot: peakHour ? `${fmtInt(peakHour.count)} calls` : null,
    },
    {
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
  ];

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
