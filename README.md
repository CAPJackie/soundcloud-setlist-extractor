# SoundCloud Setlist Extractor

Extract full tracklists from SoundCloud mixes automatically. Parses the mix description first (instant), then falls back to audio fingerprinting via ACRCloud for sets without a posted tracklist. Results are cached in MongoDB so repeated lookups are free.

## How it works

1. **Paste a SoundCloud mix URL** — any public track or DJ set
2. **Description parsing** — if the DJ posted a tracklist in the description, it's extracted immediately via regex
3. **Audio fingerprinting** — if no tracklist is found, the HLS audio stream is sampled every ~80 seconds and each chunk is identified via the ACRCloud API
4. **Tracks stream in real time** via Server-Sent Events as they're identified
5. **Results are cached in MongoDB** — second lookup for the same URL returns instantly with no API calls

## Stack

- **Next.js 16** + **React 19** + **TypeScript**
- **Tailwind CSS v4**
- **ACRCloud** — audio fingerprinting API
- **MongoDB Atlas** — result caching

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root:

```env
# MongoDB — get a free cluster at https://cloud.mongodb.com
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/

# ACRCloud — create a free "Music Recognition" project at https://console.acrcloud.com
# Select "Line-in Audio" and "Audio Fingerprinting" when creating the project
ACRCLOUD_HOST=identify-eu-west-1.acrcloud.com
ACRCLOUD_ACCESS_KEY=your_access_key
ACRCLOUD_ACCESS_SECRET=your_access_secret
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste any SoundCloud mix URL.

## Usage

1. Go to `http://localhost:3000`
2. Paste a SoundCloud URL (e.g. `https://soundcloud.com/artist/mix-name`)
3. Click **Extract** — tracks appear as they're identified
4. Use **Copy all** to copy the full tracklist as plain text

In development mode, a **Reset cache** button appears next to the track count — use it to clear the MongoDB cache for a URL and re-run extraction.

## ACRCloud free tier

The free tier includes 20,000 requests at no cost. At the default 80-second sampling interval, a 2-hour mix uses ~90 requests — giving you roughly **200+ full sets** before any charges apply.

## Project structure

```
app/
  page.tsx                  # Main UI
  api/
    extract/route.ts        # SSE streaming endpoint — description parse + fingerprinting
    cache/route.ts          # DELETE endpoint to reset MongoDB cache (dev only)
lib/
  soundcloud.ts             # Page scraping, client_id extraction, stream URL resolution
  tracklist-parser.ts       # Regex-based description tracklist parser
  hls-chunks.ts             # HLS m3u8 segment sampling
  acrcloud.ts               # ACRCloud identify API client
  setlist-cache.ts          # MongoDB read/write helpers
  db.ts                     # MongoDB connection singleton
components/
  URLInput.tsx              # URL input form
  TrackList.tsx             # Streaming results list
  TrackCard.tsx             # Individual track row
```
