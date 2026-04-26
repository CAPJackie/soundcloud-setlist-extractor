export const SAMPLE_INTERVAL_SECS = 80;

export interface HlsSegment {
  url: string;
  offsetSecs: number;
}

export async function fetchM3u8Segments(m3u8Url: string): Promise<HlsSegment[]> {
  const res = await fetch(m3u8Url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch m3u8: ${res.status}`);
  const text = await res.text();

  // Handle master playlist → pick first variant stream
  if (text.includes("#EXT-X-STREAM-INF")) {
    const variantUrl = extractFirstVariantUrl(text, m3u8Url);
    if (variantUrl) return fetchM3u8Segments(variantUrl);
  }

  return parseSegments(text, m3u8Url);
}

function parseSegments(text: string, baseUrl: string): HlsSegment[] {
  const lines = text.split("\n").map((l) => l.trim());
  const segments: HlsSegment[] = [];
  let offsetSecs = 0;
  let pendingDuration = 0;

  const base = new URL(baseUrl);

  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      const dur = parseFloat(line.slice(8).split(",")[0]);
      pendingDuration = isNaN(dur) ? 10 : dur;
    } else if (line && !line.startsWith("#")) {
      const segUrl = line.startsWith("http") ? line : new URL(line, base).toString();
      segments.push({ url: segUrl, offsetSecs });
      offsetSecs += pendingDuration;
      pendingDuration = 0;
    }
  }

  return segments;
}

function extractFirstVariantUrl(text: string, baseUrl: string): string | null {
  const lines = text.split("\n").map((l) => l.trim());
  let nextIsUrl = false;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      nextIsUrl = true;
    } else if (nextIsUrl && line && !line.startsWith("#")) {
      return line.startsWith("http") ? line : new URL(line, new URL(baseUrl)).toString();
    }
  }
  return null;
}

// Returns one segment per intervalSecs across the full duration
export function sampleSegments(
  segments: HlsSegment[],
  intervalSecs = 300
): HlsSegment[] {
  if (segments.length === 0) return [];
  const sampled: HlsSegment[] = [];
  let nextTarget = 0;

  for (const seg of segments) {
    if (seg.offsetSecs >= nextTarget) {
      sampled.push(seg);
      nextTarget = seg.offsetSecs + intervalSecs;
    }
  }

  return sampled;
}

export async function downloadSegmentBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Segment download failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
