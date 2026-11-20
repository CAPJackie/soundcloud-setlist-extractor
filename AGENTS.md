# SoundCloud Setlist Extractor

Next.js 16 App Router — APIs may differ from training data; read `node_modules/next/dist/docs/`
before writing Next code.

**Full reference: `docs/architecture.md`.** Read the matching section before touching a module
(sampling plan, ACRCloud, comments/corroboration, caching/incomplete runs, metering, Explore,
track links, Spotify export, SSE schema). Update it when behavior changes.

## What it does

Paste a SoundCloud mix URL → tracklist streamed to the browser via SSE (`/api/extract`):

1. **Tier 1** — regex parse of the mix description (`lib/tracklist-parser.ts`); ≥3 tracks → done.
2. **Comments** — listener track IDs (`lib/comment-ids.ts`), always checked, free.
3. **Tier 2** — HLS audio probes fingerprinted with ACRCloud (`lib/hls-chunks.ts`,
   `lib/sampling-plan.ts` picks each next offset, `lib/acrcloud.ts`).
   Results cached in MongoDB (`lib/setlist-cache.ts`); repeat lookups stream from cache.
   Also: `/explore` recommendations, Spotify playlist export (PKCE), track links, labels.

## Commands

```bash
npm run dev        # use http://127.0.0.1:3000 (not localhost — Spotify redirect policy)
npm run dev:log    # also writes dev.log; read it instead of terminal output for long runs
npm run validate   # lint + typecheck + build — runs automatically on git push (husky)
```

Env: see `.env.example` (Mongo, ACRCloud, Spotify, `AUTH_*`, `ADMIN_EMAILS`, Stripe, Resend…).
`SPOTIFY_CLIENT_SECRET` must never be `NEXT_PUBLIC_`.

## Request pipeline (`/api/extract`)

auth (401) → per-user rate limit (429, `lib/rate-limit.ts`) → cache check (never metered) →
on miss: monthly quota (`lib/usage.ts`) + global daily ACR budget (`lib/budget.ts`).
Usage increments only on successful uncached extraction. Admins = `ADMIN_EMAILS`
(`lib/roles.ts`, `lib/require-admin.ts`, `session.user.isAdmin` from `auth.ts`).
Public routes are excluded in `proxy.ts`.

## Gotchas

- SoundCloud `client_id` can be in any JS bundle: fetch all in parallel, never slice/hardcode.
- HLS: prefer `audio/mpeg`; `audio/mpegurl` 404s. AAC-only (fMP4) needs the `#EXT-X-MAP`
  `init.mp4` prepended or ACRCloud returns `2004`.
- Frontend uses `fetch` + `ReadableStream`, not `EventSource`.
- `Buffer` → `new Uint8Array(buffer)` before `new Blob()`.
- Incomplete runs (ACR limit `3003`, caps, disconnect) save `incomplete: true` + `resumeFromSecs`.
- Keep parsers/logic pure and testable (`*-logic.ts`, `track-order.ts`, `comment-ids.ts`).
