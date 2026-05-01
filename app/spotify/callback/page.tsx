"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { exchangeCode } from "@/lib/spotify";

function CallbackHandler() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Connecting to Spotify...");

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");

    if (error || !code) {
      const msg = error ?? "No authorization code received";
      setMessage("Authorization failed.");
      localStorage.setItem("spotify_auth_result", JSON.stringify({ error: msg }));
      setTimeout(() => window.close(), 1500);
      return;
    }

    exchangeCode(code)
      .then((token) => {
        setMessage("Connected! You can close this window.");
        localStorage.setItem("spotify_auth_result", JSON.stringify({ token }));
        setTimeout(() => window.close(), 800);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Auth failed";
        setMessage("Failed to connect.");
        localStorage.setItem("spotify_auth_result", JSON.stringify({ error: msg }));
        setTimeout(() => window.close(), 1500);
      });
  }, [params]);

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <div className="w-5 h-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
        <p className="text-sm text-zinc-400">{message}</p>
      </div>
    </main>
  );
}

export default function SpotifyCallback() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
