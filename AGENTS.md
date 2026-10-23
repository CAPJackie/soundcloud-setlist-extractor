# Project: SoundCloud Setlist Extractor

## Next.js version note
This project uses **Next.js 16.2.4** with the App Router. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

---

## Architecture overview

Two-tier extraction strategy, results stream to the browser in real time via Server-Sent Events:

```
Browser
  └─ fetch(/api/extract?url=...) → ReadableStream reader (SSE)
       ├─ Tier 1: parse mix description with regex (instant)
       │    └─ if ≥3 tracks found → save to MongoDB → done
       └─ Tier 2: audio fingerprinting via ACRCloud
            ├─ resolve HLS m3u8 → sample one segment every SAMPLE_INTERVAL_SECS seconds
            ├─ POST each segment to ACRCloud → identify {artist, title}
            └─ save all found tracks to MongoDB → done
Second lookup for same URL: MongoDB cache hit → skip all extraction, stream instantly
```

---

## File map

```
app/
  page.tsx                  Client component — URL input form + SSE consumer + track list render
  layout.tsx                Root layout, sets <title>
  globals.css               Tailwind v4 import only
  api/
    extract/route.ts        GET — SSE streaming endpoint, orchestrates both tiers
    cache/route.ts          DELETE — clears MongoDB cache for a URL (admin-only, returns 403 for non-admins)
  spotify/
    callback/page.tsx       OAuth callback — exchanges PKCE code, writes token to localStorage, closes popup

lib/
  soundcloud.ts             SoundCloud page scraping (no official API)
  tracklist-parser.ts       Regex-based description parser
  hls-chunks.ts             HLS m3u8 parsing + segment sampling
  acrcloud.ts               ACRCloud identify API client (HMAC-SHA1 signed)
  setlist-cache.ts          MongoDB read/write helpers
  db.ts                     MongoDB connection singleton (survives Next.js hot reloads)
  spotify.ts                Spotify PKCE auth + Web API helpers (search, create playlist, add items)

components/
  URLInput.tsx              Controlled URL form, disabled during loading
  TrackList.tsx             Renders track list + "Copy all" + "Export to Spotify" + admin-only "Reset cache"
  TrackCard.tsx             Single track row: number (red if not found on Spotify), timestamp, title, artist
```

---

## Key implementation details

### `lib/soundcloud.ts`
- Fetches the SoundCloud page HTML and parses the `window.__sc_hydration` JSON blob embedded in a `<script>` tag. The entry with `hydratable: "sound"` contains title, description, duration, transcodings, username, and publishedAt.
- `extractClientId(html)` — SoundCloud embeds `client_id` in one of the JS bundles hosted on `a-v2.sndcdn.com`. The function fetches all bundle URLs in parallel via `Promise.allSettled` and returns the first match. Do **not** add a `slice()` limit; the client_id can be in any bundle.
- `getHlsTranscodings()` — returns HLS transcodings sorted by preference: `audio/mpeg` first (mp3 segments — works), `audio/mp4` second, `audio/mpegurl` last (returns 404 in practice). The route tries each in order until one resolves.
- `resolveStreamUrl(transcodingUrl, clientId)` — hits the transcoding URL with `?client_id=` appended to get the signed time-limited m3u8 URL.

### `lib/tracklist-parser.ts`
Regex patterns (in priority order):
- `00:00 Artist - Track` (timestamped)
- `1. Artist - Track` (numbered list)
- `Artist "Track"` (quoted title)
- `Artist - Track` (plain dash separator)

Strips junk (URLs, social handles, "FREE DOWNLOAD"), deduplicates results.

### `lib/hls-chunks.ts`
- `SAMPLE_INTERVAL_SECS = 80` — one audio sample every 80 seconds of mix time. Adjust here to trade ACRCloud request count vs. coverage.
- `fetchM3u8Segments` — handles both master playlists (picks first variant) and media playlists, returns `{url, offsetSecs}[]`.
- `sampleSegments` — picks one segment per `intervalSecs` window.
- `downloadSegmentBytes` — returns a raw `Buffer` of the `.ts` segment.

### `lib/acrcloud.ts`
- Endpoint: `https://{ACRCLOUD_HOST}/v1/identify`
- Auth: HMAC-SHA1 signature over `method\nuri\naccess_key\ndata_type\nsignature_version\ntimestamp`.
- Audio bytes must be wrapped as `new Uint8Array(buffer)` before passing to `new Blob()` (TypeScript compatibility).
- Returns `{artist, title, album, offsetSecs}` or `null` on no-match/error.

### `app/api/extract/route.ts`
- `export const maxDuration = 300` — required for long-running Vercel functions.
- SSE guard: `let closed = false` + `close()` helper prevents `controller.close()` being called twice (race between normal finish and `finally` block).
- Cache hit path: emits all cached tracks immediately, skips both extraction tiers.
- Description parse threshold: `< 3` tracks triggers audio fingerprinting fallback.

### MongoDB / caching
- `lib/db.ts` uses `global._mongoClient` to survive Next.js hot reloads in dev without spawning multiple connections.
- Database: `soundcloud_setlist`, collection: `setlists`, indexed on `url`.
- Cache documents include `cachedAt` (Date) so the UI can display when results were cached.

---

## Environment variables (`.env.local`)

```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/
ACRCLOUD_HOST=identify-us-west-2.acrcloud.com   # match your ACRCloud project region
ACRCLOUD_ACCESS_KEY=...
ACRCLOUD_ACCESS_SECRET=...
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=...
NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/spotify/callback
```

ACRCloud free tier: 20,000 requests. At 80s sampling a 2-hour mix ≈ 90 requests → ~220 full sets before any charges.

See `.env.example` for the full list, including auth (`AUTH_*`), `ADMIN_EMAILS`, `RESEND_API_KEY`, Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`), and metering overrides (`FREE_MONTHLY_LIMIT`, `PRO_MONTHLY_LIMIT`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECS`, `ACR_DAILY_BUDGET`).

---

## Monetization, roles & metering

Extraction (`/api/extract`) is authenticated and metered. The gate order in `route.ts` is:
auth (401) → per-user burst rate limit (429, `lib/rate-limit.ts`) → cache check (free, never metered) →
on cache miss only: monthly quota (`lib/usage.ts`) + global daily ACRCloud budget kill-switch
(`lib/budget.ts`). Usage is incremented only on a successful (uncached) extraction; ACRCloud calls are
recorded against the daily budget after the fingerprinting loop.

- **Plans:** `users.plan` = `free | pro` (default free). Free = `FREE_MONTHLY_LIMIT` (5) extractions/month;
  Pro = `PRO_MONTHLY_LIMIT` (100). `GET /api/usage` returns the current quota for the UI (`UsageBanner`).
- **Billing (Stripe):** `POST /api/billing/checkout` (subscription Checkout), `POST /api/billing/portal`
  (manage/cancel), `POST /api/billing/webhook` (flips `users.plan` on subscription events — excluded from
  auth middleware in `proxy.ts`, needs the raw body for signature verification). Helpers in `lib/stripe.ts`.
- **Collections:** `usage` (`{_id:"email:yyyymm", extractions}`), `rate_events` (TTL), `budget`
  (`{_id:"acr:yyyymmdd", count}`) — all MongoDB, no extra infra.
- **Roles:** admins via `ADMIN_EMAILS`; `isAdmin()` in `lib/roles.ts`, `requireAdmin()` in
  `lib/require-admin.ts`. `/pricing`, `/terms`, `/privacy` are public (excluded in `proxy.ts`).
- **Registration:** open by default; set `EMAIL_WHITELIST` to restrict to a closed beta
  (`isRegistrationAllowed` in `lib/whitelist.ts`).

---

## Dev workflow

```bash
npm run dev        # start dev server on :3000
```

- Access the app at `http://127.0.0.1:3000` (not `localhost`) — Spotify's redirect URI policy requires an explicit loopback IP, not the `localhost` hostname.
- The "Reset cache" button next to the track count is **admin-only** — it calls `DELETE /api/cache?url=...` and clears the MongoDB document so you can re-run extraction on the same URL.
- Admin access is controlled by `ADMIN_EMAILS` (comma-separated env). `isAdmin()` lives in `lib/roles.ts`; the auth-aware `requireAdmin()` (used by `/api/cache`) lives in `lib/require-admin.ts`. The session exposes `session.user.isAdmin` (set in `auth.ts`), which `TrackList.tsx` uses to gate the button render.

---

## SSE event schema

All events are `data: <JSON>\n\n` lines on the `/api/extract` response stream:

| `type`   | Extra fields                              | Meaning                        |
|----------|-------------------------------------------|--------------------------------|
| `status` | `message: string`                         | Progress update                |
| `track`  | `data: {artist, title, timestamp?}`       | One identified track           |
| `error`  | `message: string`                         | Fatal error, stream ends       |
| `done`   | `total: number, cached?: boolean, title?: string` | Extraction complete     |

---

## Known gotchas

- **`client_id` location** — SoundCloud rotates which JS bundle contains the `client_id`. Always fetch all bundles in parallel; never hardcode an index.
- **HLS transcoding quality** — `audio/mpegurl` transcodings return 404. Always try `audio/mpeg` first.
- **SSE via `fetch` not `EventSource`** — the frontend uses `fetch` + `ReadableStream` reader instead of `EventSource` to avoid CORS pre-flight issues with query params.
- **Buffer → Blob** — Node.js `Buffer` is not directly assignable to `BlobPart` in TypeScript strict mode; wrap with `new Uint8Array(buffer)`.

---

## Spotify export

After extraction, a green "Export to Spotify" button appears. Clicking it opens a popup for Spotify OAuth (PKCE, no client secret needed), then searches each track and creates a playlist named after the mix.

### Auth flow
- `lib/spotify.ts` handles PKCE: generates verifier + challenge, stores verifier in `localStorage` (shared across windows), opens popup to `accounts.spotify.com/authorize`.
- Popup navigates through Spotify and back to `app/spotify/callback/page.tsx`, which exchanges the code and writes `{ token }` to `localStorage.spotify_auth_result`.
- Main window listens via the `storage` event (not `postMessage` — `window.opener` is nullified by browsers when a popup crosses origins).
- **`useSearchParams` requires `<Suspense>`** in the callback page (Next.js App Router requirement).

### Scopes
`playlist-modify-public playlist-modify-private`

### Spotify API notes
- **Add tracks endpoint (Feb 2026 change):** `POST /playlists/{id}/items` — the old `/playlists/{id}/tracks` path returns 403.
- Playlist creation: `POST /me/playlists`
- Track search: `GET /search?q=track:{title}+artist:{artist}&type=track&limit=1`
- Tracks not found on Spotify are shown with their index number in red in `TrackCard`.
- Every "Export to Spotify" click forces a fresh auth (`show_dialog=true`) to ensure scopes are always granted.
