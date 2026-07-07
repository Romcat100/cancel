import { useEffect, useState, type ReactElement } from "react";
import { useAppStore } from "./store.js";
import { Home } from "./screens/Home.js";
import { Lobby } from "./screens/Lobby.js";
import { Game } from "./screens/Game.js";
import { connectSocket, disconnectSocket } from "./socket.js";
import { clearIdentity, listIdentities } from "./identity.js";
import { api } from "./api.js";
import { initMusic } from "./music.js";
import { initSfx } from "./sfx.js";
import { pollHealth, setStaleHandler } from "./version.js";
import { applyRoundTheme } from "./theme.js";
import { WaveDefs } from "./wave.js";

export function App() {
  const state = useAppStore((s) => s.state);
  const setState = useAppStore((s) => s.setState);
  const reset = useAppStore((s) => s.reset);
  const [bootstrap, setBootstrap] = useState<"loading" | "ready">("loading");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    initMusic();
    initSfx();
  }, []);

  // Each round gets its own color theme (background + accent families; seat
  // colors are pinned and never shift). No round (Home/Lobby, or after leaving)
  // restores the default indigo. The snap happens behind the round-end summary,
  // so there's no mid-play flash.
  const roundIndex = state?.publicState.round?.index ?? null;
  useEffect(() => {
    applyRoundTheme(roundIndex);
  }, [roundIndex]);

  // Watch for a newer client build deploying while this tab is open. The socket auth ack catches a
  // redeploy on reconnect (a server restart drops every socket); these polls catch backgrounded and
  // bfcache-restored tabs that may not have reconnected. On a mismatch we surface a refresh banner.
  useEffect(() => {
    setStaleHandler(() => setStale(true));
    void pollHealth();
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollHealth();
    };
    const onPageShow = () => void pollHealth();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const ids = listIdentities();
      const recent = ids[0];
      if (recent && Date.now() - recent.lastSeenAt < 1000 * 60 * 60 * 24 * 14) {
        try {
          const res = await api.fetchState(recent.roomCode, recent.claimToken);
          // Stay in the room even at game_end: the host's "Play again" recycles
          // this same room back to the lobby, and a connected socket is what
          // snaps every returning player there. Leaving is explicit (the Leave
          // button on GameEnd clears identity via onRoomAbandoned/onAbandoned).
          setState(res.state);
          connectSocket(recent.roomCode, recent.claimToken, {
            onRoomState: setState,
            onRoomAbandoned: () => {
              clearIdentity(recent.roomCode);
              disconnectSocket();
              reset();
            },
          });
        } catch {
          // fall through to home
        }
      }
      setBootstrap("ready");
    })();
    return () => disconnectSocket();
  }, [setState, reset]);

  const withBanner = (content: ReactElement) => (
    <>
      <WaveDefs />
      {stale && <UpdateBanner />}
      {content}
    </>
  );

  if (bootstrap === "loading") {
    return withBanner(
      <div className="flex min-h-screen items-center justify-center bg-ink text-paper/50 font-mono">loading…</div>,
    );
  }

  if (!state) return withBanner(<Home />);

  const leaveRoom = () => {
    disconnectSocket();
    reset();
  };
  const abandonLocal = () => {
    clearIdentity(state.publicState.roomCode);
    disconnectSocket();
    reset();
  };

  const phase = state.publicState.phase;
  if (phase === "lobby") {
    return withBanner(<Lobby onLeave={leaveRoom} />);
  }
  return withBanner(<Game onLeave={leaveRoom} onAbandoned={abandonLocal} />);
}

function UpdateBanner() {
  return (
    <div
      data-testid="version-refresh-banner"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-gold px-4 py-2 font-mono text-sm text-ink shadow-lg"
    >
      <span>A new version is available.</span>
      <button
        data-testid="version-refresh-button"
        onClick={() => location.reload()}
        className="rounded bg-ink px-3 py-1 font-bold text-paper"
      >
        Refresh
      </button>
    </div>
  );
}
