'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '../../lib/api-base';
import { fmtClock, fmtDateTime, fmtInt } from '../../lib/format';

const STATUS = {
  Completed: { label: 'Answered', color: 'var(--status-good)' },
  Pending: { label: 'Ongoing', color: 'var(--status-pending)' },
};

const FILTERS = [
  ['', 'All'],
  ['Completed', 'Answered'],
  ['Pending', 'Ongoing'],
];

export default function CallsTable({ query, version }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);

  // Debounce the phone search.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [query, status]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(query);
    params.set('page', page);
    params.set('pageSize', 20);
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    fetch(apiUrl(`/api/calls?${params}`), { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => !cancelled && setResult(json))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query, status, q, page, version]);

  return (
    <section className="card" style={{ marginTop: 16 }} aria-label="Calls">
      <div className="card-head">
        <div>
          <h2 className="card-title">Calls</h2>
          <p className="card-sub">{result ? `${fmtInt(result.total)} in this range · newest first` : 'Loading…'}</p>
        </div>
        <div className="table-tools">
          <div className="segmented">
            {FILTERS.map(([key, label]) => (
              <button key={label} aria-pressed={status === key} onClick={() => setStatus(key)}>
                {label}
              </button>
            ))}
          </div>
          <input
            className="search"
            type="search"
            inputMode="numeric"
            placeholder="Search phone digits…"
            aria-label="Search by phone number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date &amp; time (IST)</th>
              <th>Caller</th>
              <th>Status</th>
              <th className="num">Duration</th>
              <th>Call ID</th>
            </tr>
          </thead>
          <tbody>
            {result?.rows.map((r) => {
              const s = STATUS[r.outcome] ?? STATUS.Pending;
              return (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.at)}</td>
                  <td>{r.caller}</td>
                  <td>
                    <span className="badge">
                      <i style={{ background: s.color }} />
                      {s.label}
                    </span>
                  </td>
                  <td className="num">{fmtClock(r.duration)}</td>
                  <td className="mono" title={r.id}>
                    {r.id.slice(0, 8)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {result && result.rows.length === 0 && <div className="empty">No calls match.</div>}
      </div>

      {result && result.pages > 1 && (
        <div className="pager">
          <span>
            Page {page} of {fmtInt(result.pages)}
          </span>
          <div className="btns">
            <button className="btn" onClick={() => setPage(1)} disabled={page === 1} aria-label="First page">
              «
            </button>
            <button className="btn" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Previous
            </button>
            <button className="btn" onClick={() => setPage((p) => p + 1)} disabled={page >= result.pages}>
              Next
            </button>
            <button className="btn" onClick={() => setPage(result.pages)} disabled={page >= result.pages} aria-label="Last page">
              »
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
