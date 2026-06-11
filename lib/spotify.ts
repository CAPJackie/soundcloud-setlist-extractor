const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI!;
const SCOPES = "playlist-modify-public playlist-modify-private";

function generateCodeVerifier(): string {
  const array = new Uint8Array(96);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function openSpotifyAuthPopup(): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const relayKey = generateCodeVerifier(); // separate opaque key for the server relay

  // The popup passes through a third-party origin (accounts.spotify.com), and
  // browsers partition the resulting context: localStorage, BroadcastChannel,
  // and window.opener.postMessage all silently fail to reach this window.
  // We work around this with a server-side relay (POST + GET on /api/spotify-token).
  //
  // We pass BOTH the PKCE verifier and the relay key through OAuth `state`, so
  // the popup can read them from its URL (no shared storage needed).
  const stateObj = { v: verifier, k: relayKey };
  const state = btoa(JSON.stringify(stateObj));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    show_dialog: "true",
  });

  return new Promise((resolve, reject) => {
    const popup = window.open(
      `https://accounts.spotify.com/authorize?${params}`,
      "spotify-auth",
      "width=500,height=700,left=200,top=100"
    );

    if (!popup) {
      reject(new Error("Popup blocked — please allow popups for this site"));
      return;
    }

    let settled = false;
    const settle = (result: { token?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      if (result.token) resolve(result.token);
      else reject(new Error(result.error ?? "Auth failed"));
    };

    // Poll the server relay for the token. The popup POSTs its result there.
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/spotify-token?key=${encodeURIComponent(relayKey)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.token) return settle({ token: data.token });
          if (data.error) return settle({ error: data.error });
        }
      } catch {}
      if (popup.closed) settle({ error: "Auth window closed" });
    }, 500);
  });
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) throw new Error("Token exchange failed");
  const data = await res.json();
  return data.access_token as string;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem("spotify_token");
}

export function storeToken(token: string): void {
  sessionStorage.setItem("spotify_token", token);
}

export function clearToken(): void {
  sessionStorage.removeItem("spotify_token");
}

export async function searchTrack(token: string, artist: string, title: string): Promise<string | null> {
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const res = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.tracks?.items?.[0]?.uri as string) ?? null;
}


export async function createPlaylist(token: string, name: string): Promise<{ id: string; url: string }> {
  const res = await fetch(`https://api.spotify.com/v1/me/playlists`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, public: true }),
  });
  if (!res.ok) throw new Error(`Failed to create playlist ${res.status}`);
  const data = await res.json();
  return { id: data.id, url: data.external_urls.spotify };
}

export async function addTracksToPlaylist(token: string, playlistId: string, uris: string[]): Promise<void> {
  // Verify we can read the playlist first
  const check = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkBody = await check.json();
  console.log("[spotify] playlist owner:", checkBody.owner?.id, "collaborative:", checkBody.collaborative, "public:", checkBody.public);

  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    console.log("[spotify] token prefix:", token.slice(0, 20), "playlistId:", playlistId);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
      method: i === 0 ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: batch }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Failed to add tracks (${res.status}): ${JSON.stringify(body)}`);
    }
  }
}
