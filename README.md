# MahaVISTAAR call analytics

A dashboard for the MahaVISTAAR Voice AI agent on RAYA. It reads calls from
RAYA's **List agent calls** API, refreshes every 5 minutes (or when you press
**Refresh**), and shows every number in IST.

## Run it

```
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

For a long-running copy, use `npm run build && npm start` instead.

| Variable | What it is |
|---|---|
| `RAYA_API_KEY` | RAYA API key (sent as `X-API-Key`). Server-side only, never reaches the browser. |
| `RAYA_AGENT_ID` | UUID of the agent to report on |
| `SHOW_FULL_NUMBERS` | Optional. `true` shows full caller numbers; by default they are masked (`93•••••468`). |
| `NEXT_PUBLIC_API_BASE` | Optional. On Vercel, set to your tunnel URL so the UI calls your machine's API. Empty locally. |
| `CORS_ORIGINS` | Optional. On the API machine, comma-separated Vercel origins allowed to call the API. |

## How the data stays fresh

- **First start:** the app downloads the agent's entire call history, newest
  first, 100 calls per request. The API allows about 1 request per second, so
  ~34k calls take ~6 minutes. Recent ranges (today, 7 or 30 days) are ready
  within the first minute; a banner shows progress for the rest.
- **After that:** each refresh re-reads only the newest pages, going back far
  enough to update calls that were still "Ongoing" last time. Usually 1–2
  requests.
- **Cache:** calls are saved in `.data/calls.json`, so restarting the server
  doesn't re-download history. Delete that file to force a full re-download.

## What the numbers mean

- **Total minutes** rounds each call up to the next whole minute, the same way
  RAYA's Calls page does (a 1m 10s call counts as 2).
- **Unique callers** counts distinct phone numbers in the range; "calls per
  caller" is total calls ÷ unique callers.
- **Calls by hour of day** is a line of the average calls per day in each IST
  hour, so ranges of any length compare. A single day (e.g. Today) shows plain
  counts and the line stops at the current hour. "Compare" overlays the
  previous period of the same length, or for a single day, a typical day
  (average of the 30 days before it). The boxes underneath show the busiest
  hour, the busy window (the shortest run of hours holding 85% of calls) and
  the quietest 6 hours.
- **Calls that never connected are left out of every number.** RAYA marks
  these `Failure`, `Failed` or `Unknown`: the caller reached the line but the
  agent never spoke, so there's no audio and 0 seconds of talk time. They are
  still stored in the cache, just not shown. A call still "Pending" a day
  later is looked up individually on RAYA's call-details endpoint to get its
  final status.
- **Avg duration** and the duration chart use answered calls only.
- **Last 7/30/90 days** are rolling windows ending now, like RAYA's "Past 30
  days". "Today" starts at midnight IST.
- Charts group by IST hour, day or week depending on how long the range is.

## Files

- `lib/raya-sync.js`: fetching, rate limiting, the history download and the cache
- `lib/analytics.js`: every metric, calculated in IST
- `app/api/metrics`, `app/api/calls`: JSON the page reads
- `app/dashboard.jsx`, `app/components/`: the page itself

## Deploying

The cache lives on local disk, so the API must run on one always-on machine
(`npm run build && npm start`). You can still put the **UI on Vercel** and keep
sync + cache on your machine:

1. On your machine: run the app, then expose it with a tunnel (Cloudflare Tunnel
   or ngrok) so it has a public HTTPS URL.
2. In that machine's `.env.local`, set `CORS_ORIGINS` to your Vercel URL
   (e.g. `https://your-app.vercel.app`). Keep `RAYA_*` here only.
3. On Vercel: deploy this repo and set `NEXT_PUBLIC_API_BASE` to the tunnel URL.
   Do **not** put `RAYA_*` on Vercel — the browser talks straight to your machine
   for `/api/metrics` and `/api/calls`.

Locally, leave `NEXT_PUBLIC_API_BASE` empty so the UI uses same-origin APIs.

Moving the cache into a database (e.g. Postgres) would let the whole stack run
on serverless later; that is a larger change.
