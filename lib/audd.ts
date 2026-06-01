export interface AuddMatch {
  artist: string;
  title: string;
  album?: string;
}

interface AuddResponse {
  status: string;
  result?: {
    artist: string;
    title: string;
    album?: string;
  } | null;
}

export const AUDD_MAX_CALLS_PER_SESSION = 5;

export async function identifyWithAudd(audioBytes: Buffer): Promise<AuddMatch | null> {
  const apiToken = process.env.AUDD_API_TOKEN;
  if (!apiToken) return null;

  const form = new FormData();
  form.append("api_token", apiToken);
  form.append(
    "audio",
    new Blob([new Uint8Array(audioBytes)], { type: "audio/mpeg" }),
    "segment.mp3"
  );

  try {
    console.log(`[audd] fallback identify`);
    const res = await fetch("https://api.audd.io/", { method: "POST", body: form });
    if (!res.ok) return null;
    const json = (await res.json()) as AuddResponse;
    if (json.status !== "success" || !json.result) {
      console.log(`[audd] no match`);
      return null;
    }
    console.log(`[audd] matched: "${json.result.title}" by ${json.result.artist}`);
    return {
      artist: json.result.artist,
      title: json.result.title,
      album: json.result.album,
    };
  } catch {
    return null;
  }
}
