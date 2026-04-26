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
    cache/route.ts          DELETE — clears MongoDB cache for a URL (dev only, returns 403 in prod)

lib/
  soundcloud.ts             SoundCloud page scraping (no official API)
  tracklist-parser.ts       Regex-based description parser
  hls-chunks.ts             HLS m3u8 parsing + segment sampling
  acrcloud.ts               ACRCloud identify API client (HMAC-SHA1 signed)
  setlist-cache.ts          MongoDB read/write helpers
  db.ts                     MongoDB connection singleton (survives Next.js hot reloads)

components/
  URLInput.tsx              Controlled URL form, disabled during loading
  TrackList.tsx             Renders track list + "Copy all" + dev-only "Reset cache" button
  TrackCard.tsx             Single track row: number, optional timestamp, title, artist
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
```

ACRCloud free tier: 20,000 requests. At 80s sampling a 2-hour mix ≈ 90 requests → ~220 full sets before any charges.

---

## Dev workflow

```bash
npm run dev        # start dev server on :3000
```

- The "Reset cache" button next to the track count is **dev-only** — it calls `DELETE /api/cache?url=...` and clears the MongoDB document so you can re-run extraction on the same URL.
- `NODE_ENV === 'development'` guard is in both the button render (`TrackList.tsx`) and the route handler (`cache/route.ts`).

---

## SSE event schema

All events are `data: <JSON>\n\n` lines on the `/api/extract` response stream:

| `type`   | Extra fields                              | Meaning                        |
|----------|-------------------------------------------|--------------------------------|
| `status` | `message: string`                         | Progress update                |
| `track`  | `data: {artist, title, timestamp?}`       | One identified track           |
| `error`  | `message: string`                         | Fatal error, stream ends       |
| `done`   | `total: number, cached?: boolean`         | Extraction complete            |

---

## Known gotchas

- **`client_id` location** — SoundCloud rotates which JS bundle contains the `client_id`. Always fetch all bundles in parallel; never hardcode an index.
- **HLS transcoding quality** — `audio/mpegurl` transcodings return 404. Always try `audio/mpeg` first.
- **SSE via `fetch` not `EventSource`** — the frontend uses `fetch` + `ReadableStream` reader instead of `EventSource` to avoid CORS pre-flight issues with query params.
- **Buffer → Blob** — Node.js `Buffer` is not directly assignable to `BlobPart` in TypeScript strict mode; wrap with `new Uint8Array(buffer)`.
