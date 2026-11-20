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

    log(
      `code=${code ? "present" : "null"} verifier=${verifier ? "present" : "null"} relayKey=${relayKey ? "present" : "null"}`,
    );

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
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="flex w-full max-w-lg flex-col items-center gap-4 text-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        <p className="text-sm text-zinc-200">{message}</p>
        <pre className="w-full overflow-auto rounded bg-zinc-900 p-3 text-left text-[10px] whitespace-pre-wrap text-zinc-400">
          {debug.join("\n")}
        </pre>
        <button
          onClick={() => window.close()}
          className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:text-white"
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
