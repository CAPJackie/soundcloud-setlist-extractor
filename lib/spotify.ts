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
  localStorage.setItem("spotify_verifier", verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    show_dialog: "true",
  });

  localStorage.removeItem("spotify_auth_result");

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

    const onStorage = (e: StorageEvent) => {
      if (e.key !== "spotify_auth_result") return;
      const result = JSON.parse(e.newValue ?? "{}");
      cleanup();
      if (result.token) resolve(result.token);
      else reject(new Error(result.error ?? "Auth failed"));
    };

    const timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Auth window closed"));
      }
    }, 500);

    const cleanup = () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      localStorage.removeItem("spotify_auth_result");
    };

    window.addEventListener("storage", onStorage);
  });
}

export async function exchangeCode(code: string): Promise<string> {
  const verifier = localStorage.getItem("spotify_verifier");
  if (!verifier) throw new Error("No code verifier found");

  console.log('test')

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
  console.log("[spotify] granted scopes:", data.scope);
  localStorage.removeItem("spotify_verifier");
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
