import { useEffect, useRef, useState, type ReactElement } from "react";
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
      <HostChangeToast />
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

// Shows "You are now the host." to the player the host role just moved onto
// (host left, or they were picked by removePlayer). Watches hostId across
// state updates; syncing the refs on a room change keeps join/create/rejoin
// silent. Mounted at the App level so it covers Lobby, Game, and GameEnd.
function HostChangeToast() {
  const state = useAppStore((s) => s.state);
  const [visible, setVisible] = useState(false);
  const prevRoom = useRef<string | null>(null);
  const prevHost = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roomCode = state?.publicState.roomCode ?? null;
  const hostId = state?.publicState.hostId ?? null;
  const selfId = state?.selfPlayerId ?? null;

  useEffect(() => {
    if (roomCode !== prevRoom.current) {
      prevRoom.current = roomCode;
      prevHost.current = hostId;
      return;
    }
    if (hostId === prevHost.current) return;
    const wasHost = prevHost.current;
    prevHost.current = hostId;
    if (wasHost !== null && selfId !== null && hostId === selfId) {
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), 6000);
    }
  }, [roomCode, hostId, selfId]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!visible) return null;
  // Centering lives on the wrapper: animate-rise animates `transform` (fill
  // both), which would override a -translate-x-1/2 on the button itself.
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center">
      <button
        data-testid="host-change-toast"
        onClick={() => setVisible(false)}
        className="pointer-events-auto animate-rise rounded-full bg-gold px-4 py-2 font-mono text-sm font-bold text-ink shadow-lg"
      >
        You are now the host.
      </button>
    </div>
  );
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
