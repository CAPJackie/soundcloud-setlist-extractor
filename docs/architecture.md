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
       ├─ Comments: track IDs listeners posted ("6:20 Artist - Title"), free, always checked
       └─ Tier 2: audio fingerprinting via ACRCloud
            ├─ resolve HLS m3u8 → adaptive probes (lib/sampling-plan.ts decides each next offset)
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
  explore/page.tsx          Explore: taste, similar sets, artist/track/label recommendations (sections stream via <Suspense>)
  api/track-links/route.ts  POST — direct Spotify/Apple Music links for tracks
  spotify/
    callback/page.tsx       OAuth callback — exchanges PKCE code, writes token to localStorage, closes popup

lib/
  soundcloud.ts             SoundCloud page scraping (no official API)
  tracklist-parser.ts       Regex-based description parser
  comment-ids.ts            Track IDs from SoundCloud comments (pure parser)
  track-order.ts            timestampToSecs / sortTracksByTime (pure, used by server + client)
  hls-chunks.ts             HLS m3u8 parsing + segment sampling
  acrcloud.ts               ACRCloud identify API client (HMAC-SHA1 signed)
  setlist-cache.ts          MongoDB read/write helpers
  db.ts                     MongoDB connection singleton (survives Next.js hot reloads)
  spotify.ts                Spotify PKCE auth + Web API helpers (search, create playlist, add items)
  explore.ts                Explore data loading (DB, SoundCloud related, Last.fm), React cache() per request
  explore-logic.ts          Explore recommendation logic (pure, testable)
  labels.ts                 Record labels per track: ACR → Discogs → MusicBrainz, cached in track_meta
  corroboration.ts          Same-artist confirmation + artistKeys()
  track-links.ts            Spotify / Apple Music link lookup + cache

components/
  URLInput.tsx              Controlled URL form, disabled during loading
  TrackList.tsx             Renders track list + "Copy all" + "Export to Spotify" + admin-only "Reset cache"
  ResumeProgress.tsx        Amber incomplete notice: progress + "Resume search" button
  IncompleteBadge.tsx       "Incomplete · 5:00 / 1:58:00" pill for set lists
  TrackLinks.tsx            Spotify + Apple Music + Bandcamp icons per track (full color = direct link, faded = search)
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

### `lib/comment-ids.ts` (comment track IDs)

- `fetchSoundCloudComments(trackId, clientId)` in `lib/soundcloud.ts` pages through `api-v2.soundcloud.com/tracks/{id}/comments` (needs the hydration `id` and the scraped `client_id`). Never throws.
- `parseCommentIds()` keeps only lines that look like `Artist - Title` after stripping @mentions, emojis, URLs and prefixes (`Track ID:`, `it's`, `this is`…). Lines with `?` are questions → ignored. Reaction words (`legend`, `banger`, `set`…) and the uploader's own name as artist → ignored.
- A time written in the comment (`6:20 …`, `1:23:45 …`) wins over where the comment is pinned.
- **Trust:** an ID from the DJ of the set is confirmed. A listener's ID is `lowConfidence: true` until a 2nd distinct listener posts it or ACR matches the same title.
- **Who is the DJ** (`isSetArtist()`): the uploader's account id, or a commenter whose username/permalink matches the uploader's name (spacing aside: `jary_mane` = `JARYMANE`) or appears in the set title (club/label uploads: "Ben Klock @ Berghain"). Names are cleaned with `nameKey()` (brackets, emojis, `official` removed). Names made only of generic words (`techno`, `berlin`, `dj`, `music`…) or shorter than 4 letters never count.
- "Uploader - …" from a listener is dropped as a reaction; from the DJ it's kept (can be their own track).
- Runs after the description step and before fingerprinting, also on resume (deduped by `normalizeTitle`). Doesn't count toward the "≥3 tracks → skip audio" rule: comments are partial.
- Comment IDs arrive before audio matches, so the saved list (and the UI on `done`) is sorted by timestamp when every track has one.

### `lib/hls-chunks.ts`

- `fetchM3u8Segments` — handles both master playlists (picks first variant) and media playlists, returns `{url, offsetSecs}[]`.
- `downloadProbeBytes` — joins ~3 consecutive segments (~30s) into one sample; prepends the fMP4 init segment for AAC streams.
- `downloadSegmentBytes` — returns a raw `Buffer` of the `.ts` segment.

### `lib/sampling-plan.ts`

Pure logic deciding where the next probe goes (no I/O; easy to test).

- After a match, ACRCloud's `play_offset_ms` / `duration_ms` give the song's remaining time. It's an **upper bound only**: the jump is `remaining − 90s outro margin`, clamped to 30–180s. Metadata can only shorten the jump vs. the old fixed 180s, never lengthen it.
- Once a song is confirmed (2nd match of the same title), jump straight to its estimated end instead of re-confirming every 30s.
- Two matches of the same song give the real playback rate (pitch/tempo), measured only over ≥90s of mix (ACR's position-in-song is ±15s noisy). Rate outside 0.85–1.15, or a >45s drift over shorter gaps = hot cue or loop → song length ignored for that song; re-check every 60s.
- Same-song / dedupe key is `normalizeTitle()`: strips "Original/Extended Mix", "Radio Edit", "Remastered" but keeps remix names.
- **Mix mode** (`mixMode()`), judged on the last 20 probes (not the whole set — long sets alternate stretches of known tracks and long stretches of IDs):
  - `dense` (default, and until 8 probes exist): layered 3+ deck mixing. No retry; miss → +150s.
  - `clean` (≥35% recent probes recognized): retry +25s once; single miss with no retry → +90s; both miss → +180s.
  - `sparse` (<10% recognized): no retry; miss → +180s.
- **Retries are self-checking:** after 8 retries, if <15% of them recognized something, retries are off for the rest of the run (`retriesWorthIt()`). With 3-deck mixing the same blend lasts minutes, so +25s rarely helps.
- **Hysteresis:** leaving a mode needs a clearer signal than entering it (sparse: enter <10%, leave ≥15%; clean: enter ≥35%, leave <25%), so one hit entering/leaving the window doesn't flip modes.
- `[plan] mode: …` and `[plan] retries off …` log lines show these switches.

### `lib/corroboration.ts` (same-artist confirmation)

- DJs often play several tracks by one artist. A doubtful track (`lowConfidence`) whose artist appears on another track of the set is confirmed; two doubtful tracks by the same artist confirm each other.
- `artistKeys()` splits collaborations (`,` `&` `feat.` `vs` `x`…) so "Hertz Collision, Sera J" shares an artist with "Sera J". Placeholders (`Unknown`, `Various Artists`, `ID`) never match.
- Runs on every new audio match, and once over all tracks before fingerprinting (comment IDs + tracks saved by an earlier run). Emits `confirm` events; logs `[extract] same artist as another track: …`.
- `[plan] next probe at … (reason)` log lines explain every decision.

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
- **Incomplete runs:** if fingerprinting stops early (ACR daily limit `3003`, per-session call cap, client disconnect), the setlist is saved with `incomplete: true` + `resumeFromSecs`. Our limits (ACR `3003`, call cap) are **not** charged; a client disconnect after ACR calls **is** charged (prevents abort-and-resume to get sets free) and stores `prepaidBy`, so that user's later resume is free. Max one charge per user per set. The next lookup of that URL emits the saved tracks, then continues fingerprinting from `resumeFromSecs` (skips description parsing); that run is billed normally. If quota/budget blocks the resume, the partial result is shown with a warning instead of an error. `done` carries `incomplete: true` + `resumeFromSecs` + `durationSecs` (mix length, also saved on the doc). `ResumeProgress` shows "Analyzed up to X of Y" + a progress bar + a "Resume search" button (home results and `/sets/[id]`, which links to `/?url=…` — the home page auto-starts from that param). `/sets` and `/my-sets` show an `IncompleteBadge`. Sets saved before `durationSecs` existed show only the stop time.

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

Optional: `SPOTIFY_CLIENT_SECRET` (direct Spotify links; never `NEXT_PUBLIC_`), `LASTFM_API_KEY` (Explore similar artists), `DISCOGS_TOKEN` (Explore label lookups).

See `.env.example` for the full list, including auth (`AUTH_*`), `ADMIN_EMAILS`, `RESEND_API_KEY`, Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`), and metering overrides (`FREE_MONTHLY_LIMIT`, `PRO_MONTHLY_LIMIT`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECS`, `ACR_DAILY_BUDGET`).

---

## Monetization, roles & metering

Extraction (`/api/extract`) is authenticated and metered. The gate order in `route.ts` is:
auth (401) → per-user burst rate limit (429, `lib/rate-limit.ts`) → cache check (free, never metered) →
on cache miss only: monthly quota (`lib/usage.ts`) + global daily ACRCloud budget kill-switch
(`lib/budget.ts`). Usage is incremented only on a successful (uncached) extraction; ACRCloud calls are
recorded against the daily budget after the fingerprinting loop.

- **Plans:** `users.plan` = `free | pro` (default free). Free = `FREE_MONTHLY_LIMIT` (5) extractions/month;
  Pro = `PRO_MONTHLY_LIMIT` (100). Admins (`ADMIN_EMAILS`) are treated as Pro with no monthly cap (`getQuota` returns `admin: true`, `allowed: true`) and `UsageBanner` is hidden for them; rate limit and ACR daily budget still apply. `GET /api/usage` returns the current quota for the UI (`UsageBanner`).
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
npm run dev:log    # same, but also writes all output to dev.log (gitignored) — no terminal scrollback limit
```

- For long extractions (8h sets → thousands of log lines) use `npm run dev:log` and read `dev.log` instead of copying from the terminal.

- Access the app at `http://127.0.0.1:3000` (not `localhost`) — Spotify's redirect URI policy requires an explicit loopback IP, not the `localhost` hostname.
- The "Reset cache" button next to the track count is **admin-only** — it calls `DELETE /api/cache?url=...` and clears the MongoDB document so you can re-run extraction on the same URL.
- Admin access is controlled by `ADMIN_EMAILS` (comma-separated env). `isAdmin()` lives in `lib/roles.ts`; the auth-aware `requireAdmin()` (used by `/api/cache`) lives in `lib/require-admin.ts`. The session exposes `session.user.isAdmin` (set in `auth.ts`), which `TrackList.tsx` uses to gate the button render.

---

## SSE event schema

All events are `data: <JSON>\n\n` lines on the `/api/extract` response stream:

| `type`    | Extra fields                                                            | Meaning                                                            |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `status`  | `message: string`                                                       | Progress update                                                    |
| `track`   | `data: {artist, title, timestamp?, lowConfidence?}`                     | One identified track. `lowConfidence` = ACR score < 60, heard once |
| `confirm` | `index: number`                                                         | Track at `index` was heard again → clear its `lowConfidence`       |
| `error`   | `message: string`                                                       | Fatal error, stream ends                                           |
| `done`    | `total: number, cached?: boolean, title?: string, incomplete?: boolean` | Extraction finished (`incomplete` = stopped early, resumable)      |

---

## Known gotchas

- **`client_id` location** — SoundCloud rotates which JS bundle contains the `client_id`. Always fetch all bundles in parallel; never hardcode an index.
- **HLS transcoding quality** — `audio/mpegurl` transcodings return 404. Always try `audio/mpeg` first.
- **AAC-only tracks (fMP4)** — many tracks now only offer `audio/mp4` (aac_160k/aac_96k). Their `.m4s` fragments are undecodable without the `#EXT-X-MAP` `init.mp4`; `downloadProbeBytes` prepends it. Without it ACRCloud returns `2004: Can't generate fingerprint` on every call (0 tracks for the whole set).
- **SSE via `fetch` not `EventSource`** — the frontend uses `fetch` + `ReadableStream` reader instead of `EventSource` to avoid CORS pre-flight issues with query params.
- **Buffer → Blob** — Node.js `Buffer` is not directly assignable to `BlobPart` in TypeScript strict mode; wrap with `new Uint8Array(buffer)`.

---

## Explore (`/explore`)

Recommendations from the sets the user searched or liked. Spotify can't help here: for new apps it blocks related-artists (403), recommendations (404) and even hides artist genres/popularity and album labels.

| Section                | Source                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your taste             | Artists/labels counted across the user's sets (number of sets each appears in). `lowConfidence` tracks never count.                                                                                                                                                                                                                                             |
| Similar sets           | (1) Sets in our DB sharing ≥2 of the user's artists (tracklist ready, free). (2) SoundCloud `api-v2 /tracks/{id}/related` for the user's 8 most recent sets, merged: related to more of the user's sets → first. Only ≥30 min (sets, not single tracks). Button goes to `/sets/{id}` if the tracklist exists, else `/?url=…` (uses an extraction).              |
| Artists you might like | Co-occurrence in other users' sets (a set must share ≥2 artists once the user has ≥5, so one overlap with an eclectic set isn't noise) + Last.fm `artist.getsimilar` for the top 10 artists (needs `LASTFM_API_KEY`). Each signal normalized 0–1; found by both → +0.5.                                                                                         |
| Tracks to dig          | Tracks by the user's artists found in other sets but not in the user's. Rows use `useTrackLinks` (client) for Spotify/Apple/Bandcamp icons.                                                                                                                                                                                                                     |
| Labels to explore      | Discogs labels of the user's top 15 artists + top 12 recommended artists (`artist_labels`). Score: 2 per user artist on the label + 1 per recommended artist + 0.5 per track in other users' sets. Labels already in ≥3 of the user's sets are excluded; needs 2+ artists (or 3+ releases / 2+ tracks). Works without other users' sets. Needs `DISCOGS_TOKEN`. |

- **Labels** (`lib/labels.ts`): ACRCloud's `label` is saved on new tracks at extraction. Missing labels are looked up in the background with `after()` (extract route: 120s budget; Explore page: 25s, after artist labels) via Discogs (`DISCOGS_TOKEN`, much better for techno) then MusicBrainz (free, 1 req/s, found 2/8 in a test). Cached in `track_meta`; not-found retried after 30 days. Label sections fill in over a few visits.
- `scTrackId` is saved on setlists at extraction (and backfilled by Explore) so related sets don't need a page fetch.
- **Artist labels** (`enrichArtistLabels` / `getArtistLabels` in `lib/labels.ts`): one Discogs release search per artist; only a release's first label counts (later ones are often distributors/pressing plants), formats of one release count once, results credited to a different artist are dropped (`Various` compilations kept), `Not On Label`/self-released ignored. The section looks up uncached artists for up to 15s while it streams, `after()` continues for 25s. Refreshed after 60 days, empty results retried after 30.
- **Rate limits:** Discogs calls go through `discogsGet` (1s spacing, slows down when `x-discogs-ratelimit-remaining` is low, waits and retries on 429); MusicBrainz retries 503s. A lookup run only stops when still rate limited after retries or after 3 errors in a row (a single odd error skips that item).
- Mongo caches: `sc_related` (24h), `lastfm_similar` (7 days), `track_meta`, `artist_labels`.

## Track links (Spotify / Apple Music icons)

Every track row (home results via `TrackCard`, set page via `SetPlayer`) shows Spotify, Apple Music and Bandcamp icons.

- Bandcamp has no public search API → always a track search link (`bandcamp.com/search?q=…&item_type=t`), built client-side, always faded.
- Rendered instantly as **search links**; `useTrackLinks()` then calls `POST /api/track-links` once the list is final (after `done` on the home page, on mount on the set page) and swaps in **direct links** where found. Direct = full-color icon; search = faded.
- `lib/track-links.ts`: Apple via the public iTunes Search API (no key, ~20 req/min per IP → lookups are sequential and stop for the batch on 403/429); Spotify via client-credentials search, only when `SPOTIFY_CLIENT_SECRET` is set.
- `isSameTrack()` guards against wrong songs: title must match (apostrophes ignored; ours may only be longer if the extra isn't a version tag, so "Track (X Remix)" ≠ "Track") and an artist must overlap (`artistKeys()`).
- Cached in MongoDB `track_links` (`_id` = normalized `artist|title`). Found links are kept; "not found" is retried after 14 days; rate-limited lookups aren't cached.

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
