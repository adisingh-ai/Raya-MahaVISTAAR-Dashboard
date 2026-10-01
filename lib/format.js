// Display helpers. Everything is shown in IST, whatever the viewer's own timezone.

const intFmt = new Intl.NumberFormat('en-IN');
const compactFmt = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });

export const fmtInt = (n) => (n === null || n === undefined ? '—' : intFmt.format(Math.round(n)));
export const fmtCompact = (n) => (n === null || n === undefined ? '—' : compactFmt.format(n));
export const fmtPct = (r, digits = 1) => (r === null || r === undefined ? '—' : `${(r * 100).toFixed(digits)}%`);
export const fmtDateTime = (ms) => dateTimeFmt.format(ms);
export const fmtDate = (ms) => dateFmt.format(ms);
export const fmtTime = (ms) => timeFmt.format(ms);

export function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h) return `${h}h ${m}m`;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

export function fmtClock(seconds) {
  const s = Math.round(seconds ?? 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function fmtAgo(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function fmtCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Change vs previous period. goodWhenUp: true / false / null (neutral). */
export function delta(current, previous, { goodWhenUp = true } = {}) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (previous === 0) return null;
  const value = (current - previous) / previous;
  if (Math.abs(value) < 0.0005) return { text: '0%', tone: 'neutral', arrow: '→' };
  const text = `${Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`;
  const up = value > 0;
  const tone = goodWhenUp === null ? 'neutral' : up === goodWhenUp ? 'good' : 'bad';
  return { text, tone, arrow: up ? '↑' : '↓' };
}
