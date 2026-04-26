import { useEffect, useState } from "react";
import { useAppStore } from "./store.js";
import { Home } from "./screens/Home.js";
import { Lobby } from "./screens/Lobby.js";
import { Game } from "./screens/Game.js";
import { connectSocket, disconnectSocket } from "./socket.js";
import { clearIdentity, listIdentities } from "./identity.js";
import { api } from "./api.js";

export function App() {
  const state = useAppStore((s) => s.state);
  const setState = useAppStore((s) => s.setState);
  const reset = useAppStore((s) => s.reset);
  const [bootstrap, setBootstrap] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    (async () => {
      const ids = listIdentities();
      const recent = ids[0];
      if (recent && Date.now() - recent.lastSeenAt < 1000 * 60 * 60 * 24 * 14) {
        try {
          const res = await api.fetchState(recent.roomCode, recent.claimToken);
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

  if (bootstrap === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink text-paper/50 font-mono">loading…</div>
    );
  }

  if (!state) return <Home />;

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
    return <Lobby onLeave={leaveRoom} />;
  }
  return <Game onLeave={leaveRoom} onAbandoned={abandonLocal} />;
}
