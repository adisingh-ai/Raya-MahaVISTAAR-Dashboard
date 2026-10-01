'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtAgo, fmtCountdown, fmtDate, fmtInt, fmtTime } from '../lib/format';
import KpiRow from './components/kpi-row';
import TrendChart from './components/trend-chart';
import Heatmap from './components/heatmap';
import DurationChart from './components/duration-chart';
import Insights from './components/insights';
import CallsTable from './components/calls-table';

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const BACKFILL_POLL_MS = 4000;

const PRESETS = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['30d', '30 days'],
  ['90d', '90 days'],
  ['all', 'All time'],
  ['custom', 'Custom'],
];

function rangeQuery(range, custom) {
  if (range === 'custom' && custom.from && custom.to) return `from=${custom.from}&to=${custom.to}`;
  return `range=${range === 'custom' ? '30d' : range}`;
}

export default function Dashboard() {
  const [range, setRange] = useState('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [tableVersion, setTableVersion] = useState(0);
  const nextAutoAt = useRef(Date.now() + AUTO_REFRESH_MS);
  const queryRef = useRef(rangeQuery(range, custom));
  const inFlight = useRef(0);

  const query = rangeQuery(range, custom);
  queryRef.current = query;

  const load = useCallback(async ({ refresh = false } = {}) => {
    const q = queryRef.current;
    const id = ++inFlight.current;
    setLoading(true);
    if (refresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/metrics?${q}${refresh ? '&refresh=1' : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Request failed (${res.status})`);
      if (id !== inFlight.current) return; // a newer request superseded this one
      setData(json);
      setError(json.status?.error || null);
      setLastFetched(Date.now());
      setTableVersion((v) => v + 1);
    } catch (err) {
      if (id === inFlight.current) setError(err.message);
    } finally {
      if (id === inFlight.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    nextAutoAt.current = Date.now() + AUTO_REFRESH_MS;
    return load({ refresh: true });
  }, [load]);

  // Reload whenever the range changes.
  useEffect(() => {
    if (range === 'custom' && !(custom.from && custom.to)) return;
    load();
  }, [query, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // One-second clock drives the countdown and the 5-minute auto refresh.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= nextAutoAt.current && !document.hidden) refresh();
    }, 1000);
    const onVisible = () => {
      if (!document.hidden && Date.now() >= nextAutoAt.current) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // While the history download is running, poll for progress.
  const backfilling = data && !data.status.backfillDone;
  useEffect(() => {
    if (!backfilling) return;
    const t = setInterval(() => load(), BACKFILL_POLL_MS);
    return () => clearInterval(t);
  }, [backfilling, load]);

  const status = data?.status;
  const progress = status?.apiTotal ? Math.min(1, status.backfillOffset / status.apiTotal) : 0;
  // A full cache that's being re-read (e.g. after an update) vs a first download.
  const rechecking = status && status.apiTotal && status.stored >= status.apiTotal * 0.98;

  return (
    <div className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">RAYA · Voice AI</p>
          <h1 className="title">MahaVISTAAR call analytics</h1>
          <p className="subtitle">Live from the RAYA calls API · all times in IST</p>
        </div>
        <div className="sync">
          <div className="sync-meta">
            <div>{lastFetched ? `Updated ${fmtAgo(status?.lastSyncAt ?? lastFetched, now)}` : 'Connecting to RAYA…'}</div>
            <div className="muted">Auto refresh in {fmtCountdown(nextAutoAt.current - now)}</div>
          </div>
          <button className="btn btn-primary" onClick={refresh} disabled={refreshing} aria-label="Refresh data from RAYA">
            <RefreshIcon spinning={refreshing} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="filters" role="toolbar" aria-label="Date range">
        <div className="segmented">
          {PRESETS.map(([key, label]) => (
            <button key={key} aria-pressed={range === key} onClick={() => setRange(key)}>
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="custom-range">
            <input
              type="date"
              aria-label="From date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
            <span>to</span>
            <input
              type="date"
              aria-label="To date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </div>
        )}
        {data && (
          <span className="range-caption">
            {fmtDate(data.range.from)}, {fmtTime(data.range.from)} → {fmtDate(data.range.to)}, {fmtTime(data.range.to)}
          </span>
        )}
      </div>

      {backfilling && (
        <div className="banner" role="status">
          <div className="grow">
            {rechecking ? (
              <>
                <strong>Re-checking call history with RAYA</strong> · {fmtInt(status.backfillOffset)} of {fmtInt(status.apiTotal)} calls
                <div className="card-sub">Older numbers may shift slightly as each call&apos;s latest status comes in.</div>
              </>
            ) : (
              <>
                <strong>Downloading call history from RAYA</strong> · {fmtInt(status.stored)} of {fmtInt(status.apiTotal)} calls
                {status.oldestLoaded && <> · back to {fmtDate(status.oldestLoaded)}</>}
              </>
            )}
            {!rechecking && !data.coverage.complete && (
              <div className="card-sub">This range goes back further than what&apos;s loaded so far, so its numbers will keep growing.</div>
            )}
          </div>
          <div className="progress" aria-hidden>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="banner error" role="alert">
          <div className="grow">
            <strong>Couldn&apos;t reach RAYA.</strong> {error}
            {data && ' Showing the last data that loaded.'}
          </div>
          <button className="btn" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {!data && !error && <div className="empty">Loading calls from RAYA…</div>}

      {data && (
        <div className={`content${loading ? ' refetching' : ''}`}>
          <KpiRow kpis={data.kpis} previous={data.previous} rangeKey={data.range.key} />
          <TrendChart trend={data.trend} granularity={data.range.granularity} />
          <div className="grid two-col">
            <Heatmap heatmap={data.heatmap} />
            <DurationChart durations={data.durations} completed={data.kpis.completed} />
          </div>
          <Insights data={data} />
          <CallsTable query={query} version={tableVersion} />
          <p className="footer">
            {fmtInt(status.stored)} calls cached locally
            {status.apiTotal ? ` · RAYA reports ${fmtInt(status.apiTotal)} for this agent` : ''} · Data refreshes every 5
            minutes
          </p>
        </div>
      )}
    </div>
  );
}

function RefreshIcon({ spinning }) {
  return (
    <svg className={spinning ? 'spin' : undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
