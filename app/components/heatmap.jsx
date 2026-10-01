'use client';

import { useState } from 'react';
import { fmtInt } from '../../lib/format';

const hourName = (h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
const DAYS = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

// One-hue sequential scale: empty cells sit close to the surface,
// busy cells go to full accent blue.
function cellColor(v, max) {
  if (!v) return 'var(--hover-wash)';
  const a = 0.12 + 0.88 * Math.sqrt(v / max);
  return `rgba(var(--heat), ${a.toFixed(3)})`;
}

export default function Heatmap({ heatmap }) {
  const [tip, setTip] = useState(null);
  const max = Math.max(1, ...heatmap.cells.flat());

  const show = (e, day, h, v) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.top, day, h, v });
  };

  return (
    <section className="card" aria-label="Calls by hour and weekday">
      <div className="card-head">
        <div>
          <h2 className="card-title">Busiest times</h2>
          <p className="card-sub">Calls by hour of day and weekday, IST</p>
        </div>
      </div>
      <div className="heatmap" onMouseLeave={() => setTip(null)}>
        {heatmap.rows.map((day, d) => (
          <Row key={day} day={day} values={heatmap.cells[d]} max={max} onShow={show} onHide={() => setTip(null)} />
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="col-label">
            {h % 3 === 0 ? hourName(h) : ''}
          </span>
        ))}
      </div>
      <div className="heat-scale">
        <span>Fewer</span>
        <span className="ramp" style={{ background: 'linear-gradient(90deg, rgba(var(--heat),0.12), rgba(var(--heat),1))' }} />
        <span>More (max {fmtInt(max)} in one slot)</span>
      </div>
      {tip && (
        <div className="float-tip tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="tooltip-title">
            {DAYS[tip.day]}, {hourName(tip.h)} – {hourName((tip.h + 1) % 24)}
          </div>
          <div className="tooltip-row">
            <span className="key">Calls</span>
            <b>{fmtInt(tip.v)}</b>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ day, values, max, onShow, onHide }) {
  return (
    <>
      <span className="row-label">{day}</span>
      {values.map((v, h) => (
        <span
          key={h}
          className="heat-cell"
          tabIndex={0}
          role="img"
          aria-label={`${DAYS[day]} ${hourName(h)}: ${v} calls`}
          style={{ background: cellColor(v, max) }}
          onMouseEnter={(e) => onShow(e, day, h, v)}
          onFocus={(e) => onShow(e, day, h, v)}
          onBlur={onHide}
        />
      ))}
    </>
  );
}
