"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { exchangeCode } from "@/lib/spotify";

function CallbackHandler() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Connecting to Spotify...");
  const [debug, setDebug] = useState<string[]>([]);
  const ran = useRef(false);

  const log = (s: string) => {
    console.log("[callback]", s);
    setDebug((d) => [...d, s]);
  };

  useEffect(() => {
    if (ran.current) return; // StrictMode guard — auth codes are one-time use
    ran.current = true;

    const code = params.get("code");
    const rawState = params.get("state");
    const error = params.get("error");

    let verifier: string | undefined;
    let relayKey: string | undefined;
    try {
      const decoded = JSON.parse(atob(rawState ?? ""));
      verifier = decoded.v;
      relayKey = decoded.k;
    } catch {}

    log(`code=${code ? "present" : "null"} verifier=${verifier ? "present" : "null"} relayKey=${relayKey ? "present" : "null"}`);

    const relay = async (result: { token?: string; error?: string }) => {
      if (!relayKey) {
        log(`relay skipped: no relay key`);
        return;
      }
      try {
        const res = await fetch("/api/spotify-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: relayKey, ...result }),
        });
        log(`relay POST: ${res.status}`);
      } catch (e) {
        log(`relay POST failed: ${String(e)}`);
      }
    };

    if (error || !code || !verifier || !relayKey) {
      const msg = error ?? "Missing code/state";
      setMessage("Authorization failed.");
      relay({ error: msg }).finally(() => setTimeout(() => window.close(), 1500));
      return;
    }

    exchangeCode(code, verifier)
      .then(async (token) => {
        log(`token received (len=${token.length})`);
        await relay({ token });
        setMessage("Connected! Closing window...");
        setTimeout(() => window.close(), 400);
      })
      .catch(async (err) => {
        const msg = err instanceof Error ? err.message : "Auth failed";
        log(`exchangeCode failed: ${msg}`);
        await relay({ error: msg });
        setMessage("Failed to connect.");
        setTimeout(() => window.close(), 1500);
      });
  }, [params]);

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center max-w-lg w-full">
        <div className="w-5 h-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
        <p className="text-sm text-zinc-200">{message}</p>
        <pre className="text-[10px] text-left text-zinc-400 bg-zinc-900 rounded p-3 w-full overflow-auto whitespace-pre-wrap">
{debug.join("\n")}
        </pre>
        <button
          onClick={() => window.close()}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded px-3 py-1"
        >
          Close window
        </button>
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
