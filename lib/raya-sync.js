import { promises as fs } from 'node:fs';
import path from 'node:path';

// Pulls calls from RAYA's "List agent calls" endpoint into a local cache.
//
// - The first run downloads the agent's full history, newest first, 100 calls
//   per request (the API maximum). Recent weeks are available within a minute;
//   the rest keeps loading in the background.
// - Every refresh after that only re-reads the newest pages, going back far
//   enough to pick up calls that were still "Pending" last time.
// - Requests are spaced to respect RAYA's 1 request/second limit.
// - The cache is saved to .data/calls.json so a restart doesn't re-download.

const API_BASE = 'https://v1.getraya.app/api';
const PAGE_SIZE = 100;
const MIN_REQUEST_GAP_MS = 1100;
const OVERLAP_MS = 30 * 60 * 1000;
const PENDING_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MIN_AUTO_SYNC_GAP_MS = 20 * 1000;
const RECHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const DATA_FILE = path.join(process.cwd(), '.data', 'calls.json');

const OUTCOMES = ['Completed', 'Failure', 'Pending'];

// Bump when the way calls are read from RAYA changes. An older cache is kept
// on screen but re-checked against RAYA in the background.
const CACHE_VERSION = 2;

// RAYA's docs list "Completed" / "Failure" / "Pending", but the API also
// returns "Failed" for calls that never connected. Map every spelling we know
// of, and log anything new rather than guessing.
const seenUnknownOutcomes = new Set();
function normalizeOutcome(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'completed') return 'Completed';
  if (v === 'failure' || v === 'failed') return 'Failure';
  if (v === 'pending' || v === 'ongoing' || v === 'in progress' || v === 'dialing' || v === 'ringing') return 'Pending';
  if (!seenUnknownOutcomes.has(v)) {
    seenUnknownOutcomes.add(v);
    console.warn(`Unrecognised RAYA call outcome "${value}", counting it as failed`);
  }
  return 'Failure';
}

// Kept on globalThis so dev-mode hot reloads share one cache and one queue.
const state = (globalThis.__rayaSync ??= {
  loaded: false,
  calls: new Map(), // uuid -> { id, caller, start, end, dur, created, outcome }
  apiTotal: null,
  backfill: { done: false, nextOffset: 0, running: false, error: null },
  lastSyncStartedAt: null,
  lastSyncAt: null,
  lastError: null,
  syncPromise: null,
  queue: Promise.resolve(),
  lastRequestAt: 0,
  persistTimer: null,
  recheckRunning: false,
  pendingCheckedAt: new Map(), // uuid -> when we last looked it up directly
});
state.pendingCheckedAt ??= new Map();

function config() {
  const apiKey = process.env.RAYA_API_KEY;
  const agentId = process.env.RAYA_AGENT_ID;
  if (!apiKey || !agentId) {
    throw new Error('RAYA_API_KEY and RAYA_AGENT_ID must be set in .env.local');
  }
  return { apiKey, agentId };
}

// ---------- cache on disk ----------

async function load() {
  if (state.loaded) return;
  state.loaded = true;
  try {
    const raw = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    for (const row of raw.calls) {
      const [id, caller, start, end, dur, created, o] = row;
      state.calls.set(id, { id, caller, start, end, dur, created, outcome: OUTCOMES[o] });
    }
    state.apiTotal = raw.apiTotal ?? null;
    const current = raw.version === CACHE_VERSION;
    state.backfill.done = current && !!raw.backfill?.done;
    state.backfill.nextOffset = current ? raw.backfill?.nextOffset ?? 0 : 0;
    state.lastSyncStartedAt = raw.lastSyncStartedAt ?? null;
    state.lastSyncAt = raw.lastSyncAt ?? null;
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not read call cache, starting fresh:', err);
  }
}

async function persist() {
  const calls = [];
  for (const c of state.calls.values()) {
    calls.push([c.id, c.caller, c.start, c.end, c.dur, c.created, OUTCOMES.indexOf(c.outcome)]);
  }
  const body = JSON.stringify({
    version: CACHE_VERSION,
    apiTotal: state.apiTotal,
    backfill: { done: state.backfill.done, nextOffset: state.backfill.nextOffset },
    lastSyncStartedAt: state.lastSyncStartedAt,
    lastSyncAt: state.lastSyncAt,
    calls,
  });
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, DATA_FILE);
  } catch (err) {
    // Read-only filesystems (e.g. serverless) just keep the in-memory cache.
    console.error('Could not save call cache:', err.message);
  }
}

function schedulePersist() {
  if (state.persistTimer) return;
  state.persistTimer = setTimeout(() => {
    state.persistTimer = null;
    persist();
  }, 2000);
}

// ---------- RAYA API ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every request goes through one queue so the whole app stays under the
// rate limit, no matter how many refreshes or viewers are active.
// Resolves to null on 404.
function rayaGet(pathAndQuery) {
  const run = async () => {
    const { apiKey } = config();
    const url = `${API_BASE}${pathAndQuery}`;

    for (let attempt = 0; ; attempt++) {
      const wait = state.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      state.lastRequestAt = Date.now();

      let res;
      try {
        res = await fetch(url, { headers: { 'X-API-Key': apiKey }, cache: 'no-store' });
      } catch (err) {
        if (attempt >= 4) throw err;
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (res.ok) return res.json();
      if (res.status === 404) return null;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      const text = await res.text().catch(() => '');
      throw new Error(`RAYA API ${res.status}: ${text.slice(0, 200)}`);
    }
  };
  const p = state.queue.then(run, run);
  state.queue = p.catch(() => {});
  return p;
}

const fetchPage = (offset) =>
  rayaGet(`/call?agent_id=${config().agentId}&limit=${PAGE_SIZE}&offset=${offset}&sort=desc`).then((d) => d ?? { calls: [] });

function upsert(apiCalls) {
  for (const c of apiCalls) {
    if (!c?.uuid) continue;
    state.calls.set(c.uuid, {
      id: c.uuid,
      caller: c.caller_no ?? null,
      start: c.call_start_time ? Date.parse(c.call_start_time) : null,
      end: c.call_end_time ? Date.parse(c.call_end_time) : null,
      dur: Number(c.call_duration) || 0,
      created: Date.parse(c.created_at ?? c.call_start_time),
      outcome: normalizeOutcome(c.outcome),
    });
  }
}

const oldestCreated = (calls) => Math.min(...calls.map((c) => Date.parse(c.created_at ?? c.call_start_time)));

// ---------- sync ----------

// Walks backwards through history until it reaches the oldest call.
// Safe to resume after a restart: new calls only push older ones to higher
// offsets, so resuming at the saved offset can repeat calls but never skip them.
async function runBackfill() {
  if (state.backfill.done || state.backfill.running) return;
  state.backfill.running = true;
  state.backfill.error = null;
  state.lastSyncStartedAt ??= Date.now();
  try {
    let pages = 0;
    while (!state.backfill.done) {
      const data = await fetchPage(state.backfill.nextOffset);
      const calls = data.calls ?? [];
      upsert(calls);
      state.apiTotal = data.total ?? state.apiTotal;
      state.backfill.nextOffset += calls.length;
      if (calls.length < PAGE_SIZE) state.backfill.done = true;
      state.lastSyncAt ??= Date.now();
      if (++pages % 10 === 0) schedulePersist();
    }
  } catch (err) {
    console.error('History download paused:', err);
    state.backfill.error = err.message;
  } finally {
    state.backfill.running = false;
    await persist();
  }
}

// Re-reads the newest pages until it's past everything that could have
// changed since the last sync.
async function runIncremental() {
  const startedAt = Date.now();
  let cutoff = (state.lastSyncStartedAt ?? startedAt) - OVERLAP_MS;
  for (const c of state.calls.values()) {
    if (c.outcome === 'Pending' && c.created > startedAt - PENDING_LOOKBACK_MS && c.created < cutoff) {
      cutoff = c.created;
    }
  }
  cutoff -= 60 * 1000;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const data = await fetchPage(offset);
    const calls = data.calls ?? [];
    upsert(calls);
    state.apiTotal = data.total ?? state.apiTotal;
    if (calls.length < PAGE_SIZE || oldestCreated(calls) < cutoff) break;
  }
  state.lastSyncStartedAt = startedAt;
  state.lastSyncAt = Date.now();
  schedulePersist();
}

// Calls still "Pending" a day later are almost certainly finished; the
// newest-pages sync no longer reaches them, so look each one up directly.
// Runs in the background, and at most every few hours per call, so calls that
// are genuinely stuck in RAYA don't use up requests on every refresh.
async function recheckStalePending() {
  if (state.recheckRunning) return;
  state.recheckRunning = true;
  let changed = 0;
  try {
    const now = Date.now();
    const stale = [...state.calls.values()].filter(
      (c) =>
        c.outcome === 'Pending' &&
        c.created < now - PENDING_LOOKBACK_MS &&
        now - (state.pendingCheckedAt.get(c.id) ?? 0) > RECHECK_EVERY_MS,
    );
    for (const c of stale) {
      const detail = await rayaGet(`/call/${c.id}`);
      state.pendingCheckedAt.set(c.id, Date.now());
      if (detail?.outcome) {
        // Keep our key even if this endpoint formats the uuid differently.
        upsert([{ ...detail, uuid: c.id }]);
        if (state.calls.get(c.id).outcome !== 'Pending' && ++changed % 20 === 0) schedulePersist();
      }
    }
  } catch (err) {
    console.error('Re-checking old pending calls paused:', err.message);
  } finally {
    state.recheckRunning = false;
    if (changed) schedulePersist();
  }
}

/**
 * Makes sure the cache is up to date.
 * force: the user pressed Refresh (skips the "synced very recently" shortcut).
 * Returns once the newest data is in; history download continues in the background.
 */
export async function sync({ force = false } = {}) {
  await load();
  state.lastError = null;

  if (state.calls.size === 0 || !state.backfill.done) {
    // First page arrives quickly; wait for it so the first render has data.
    if (!state.backfill.running) runBackfill();
    const t0 = Date.now();
    while (state.calls.size === 0 && state.backfill.running && Date.now() - t0 < 15000) {
      await sleep(250);
    }
    if (state.calls.size === 0) {
      if (state.backfill.error) state.lastError = state.backfill.error;
      return;
    }
    // During the history download, refreshes still pick up brand-new calls.
  }

  if (state.backfill.done) recheckStalePending();
  if (!force && state.lastSyncAt && Date.now() - state.lastSyncAt < MIN_AUTO_SYNC_GAP_MS) return;
  await syncNewest();
}

async function syncNewest() {
  if (!state.syncPromise) {
    state.syncPromise = runIncremental()
      .catch((err) => {
        console.error('Sync failed:', err);
        state.lastError = err.message;
      })
      .finally(() => {
        state.syncPromise = null;
      });
  }
  await state.syncPromise;
}

export function getCalls() {
  return state.calls;
}

export function getStatus() {
  let oldest = null;
  for (const c of state.calls.values()) if (oldest === null || c.created < oldest) oldest = c.created;
  return {
    stored: state.calls.size,
    apiTotal: state.apiTotal,
    backfillDone: state.backfill.done,
    backfillRunning: state.backfill.running,
    backfillError: state.backfill.error,
    backfillOffset: state.backfill.nextOffset,
    oldestLoaded: oldest,
    lastSyncAt: state.lastSyncAt,
    error: state.lastError,
  };
}
