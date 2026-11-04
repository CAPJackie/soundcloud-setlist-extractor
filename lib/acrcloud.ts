import crypto from "crypto";
import { audioFileInfo } from "./hls-chunks";

export const ACR_MAX_CALLS_PER_SESSION = 200;

export class AcrRateLimitError extends Error {
  constructor() {
    super("ACRCloud daily request limit reached");
    this.name = "AcrRateLimitError";
  }
}

export interface AcrMatch {
  artist: string;
  title: string;
  album?: string;
  offsetSecs?: number;
  score?: number;
  /** Position of the sample inside the original song. */
  playOffsetSecs?: number;
  /** Length of the original song. */
  durationSecs?: number;
}

interface AcrResponse {
  status: { code: number; msg: string };
  metadata?: {
    music?: Array<{
      title: string;
      artists?: Array<{ name: string }>;
      album?: { name: string };
      score?: number;
      play_offset_ms?: number;
      duration_ms?: number;
    }>;
  };
}

export async function identifyAudio(
  audioBytes: Buffer,
  offsetSecs: number
): Promise<AcrMatch | null> {
  const host = process.env.ACRCLOUD_HOST;
  const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
  const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;

  if (!host || !accessKey || !accessSecret) {
    throw new Error("ACRCloud env vars not set (ACRCLOUD_HOST, ACRCLOUD_ACCESS_KEY, ACRCLOUD_ACCESS_SECRET)");
  }

  const httpMethod = "POST";
  const httpUri = "/v1/identify";
  const dataType = "audio";
  const signatureVersion = "1";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const stringToSign = [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join(
    "\n"
  );
  const signature = crypto
    .createHmac("sha1", accessSecret)
    .update(stringToSign)
    .digest("base64");

  const form = new FormData();
  form.append("access_key", accessKey);
  form.append("data_type", dataType);
  form.append("signature_version", signatureVersion);
  form.append("signature", signature);
  form.append("timestamp", timestamp);
  form.append("sample_bytes", audioBytes.length.toString());
  const { mime, filename } = audioFileInfo(audioBytes);
  form.append("sample", new Blob([new Uint8Array(audioBytes)], { type: mime }), filename);

  console.log(`[acr] identify at ${Math.floor(offsetSecs / 60)}:${String(Math.floor(offsetSecs % 60)).padStart(2, "0")}`);

  const res = await fetch(`https://${host}${httpUri}`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) return null;

  const json = (await res.json()) as AcrResponse;
  if (json.status.code === 3003) {
    console.error(`[acr] daily rate limit hit (3003)`);
    throw new AcrRateLimitError();
  }
  if (json.status.code !== 0) {
    console.log(`[acr] no match (code ${json.status.code}: ${json.status.msg})`);
    return null;
  }

  const music = json.metadata?.music?.[0];
  if (!music) return null;

  const artist = music.artists?.map((a) => a.name).join(", ") ?? "Unknown Artist";
  console.log(
    `[acr] matched: "${music.title}" by ${artist} (score: ${music.score ?? "?"}, ` +
      `at ${music.play_offset_ms != null ? Math.round(music.play_offset_ms / 1000) + "s" : "?"} of ` +
      `${music.duration_ms != null ? Math.round(music.duration_ms / 1000) + "s" : "?"})`
  );

  return {
    artist,
    title: music.title ?? "Unknown Title",
    album: music.album?.name,
    offsetSecs,
    score: music.score,
    playOffsetSecs: typeof music.play_offset_ms === "number" ? music.play_offset_ms / 1000 : undefined,
    durationSecs: typeof music.duration_ms === "number" ? music.duration_ms / 1000 : undefined,
  };
}
