import { useState } from "react";
import { api } from "../api.js";
import { connectSocket, disconnectSocket } from "../socket.js";
import { clearIdentity, saveIdentity } from "../identity.js";
import { useAppStore } from "../store.js";

type Mode = "menu" | "create" | "join";

export function Home() {
  const setState = useAppStore((s) => s.setState);
  const reset = useAppStore((s) => s.reset);
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function buildHandlers(roomCode: string) {
    return {
      onRoomState: setState,
      onRoomAbandoned: () => {
        clearIdentity(roomCode);
        disconnectSocket();
        reset();
      },
    };
  }

  async function handleCreate() {
    if (!name.trim()) return setErr("enter a name");
    setBusy(true);
    setErr(null);
    try {
      const res = await api.createRoom(name.trim());
      saveIdentity({ roomCode: res.roomCode, claimToken: res.claimToken, playerId: res.playerId, name: name.trim() });
      setState(res.state);
      connectSocket(res.roomCode, res.claimToken, buildHandlers(res.roomCode));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setErr("enter a name");
    if (!code.trim()) return setErr("enter a room code");
    setBusy(true);
    setErr(null);
    try {
      const roomCode = code.trim().toUpperCase();
      const res = await api.joinRoom(roomCode, name.trim());
      saveIdentity({ roomCode, claimToken: res.claimToken, playerId: res.playerId, name: name.trim() });
      setState(res.state);
      connectSocket(roomCode, res.claimToken, buildHandlers(roomCode));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-stretch px-6 pt-12 pb-8 max-w-md mx-auto">
      <header className="mb-12 text-center select-none animate-rise">
        <div className="font-display text-7xl tracking-tighter leading-none">
          <span className="text-paper">CAN</span>
          <span className="text-accent">CEL</span>
        </div>
        <div className="mt-3 text-paper/50 font-mono text-xs uppercase tracking-[0.3em]">a number-picking party game</div>
      </header>

      {mode === "menu" && (
        <div className="flex flex-col gap-3 animate-rise">
          <button className="btn-primary text-xl py-5" onClick={() => setMode("create")}>
            New game
          </button>
          <button className="btn-ghost text-xl py-5" onClick={() => setMode("join")}>
            Join with code
          </button>
        </div>
      )}

      {mode === "create" && (
        <div className="flex flex-col gap-3 animate-rise">
          <label className="text-paper/60 text-xs uppercase tracking-widest font-mono">Your name</label>
          <input
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex"
            maxLength={16}
          />
          <button className="btn-primary text-xl py-5 mt-4" disabled={busy} onClick={handleCreate}>
            {busy ? "Creating…" : "Create room"}
          </button>
          <button className="btn-ghost mt-2" onClick={() => setMode("menu")}>
            Back
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className="flex flex-col gap-3 animate-rise">
          <label className="text-paper/60 text-xs uppercase tracking-widest font-mono">Room code</label>
          <input
            className="input font-mono uppercase tracking-[0.3em] text-center"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD"
            maxLength={4}
          />
          <label className="text-paper/60 text-xs uppercase tracking-widest font-mono mt-2">Your name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sam"
            maxLength={16}
          />
          <button className="btn-primary text-xl py-5 mt-4" disabled={busy} onClick={handleJoin}>
            {busy ? "Joining…" : "Join"}
          </button>
          <button className="btn-ghost mt-2" onClick={() => setMode("menu")}>
            Back
          </button>
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-3 text-sm">
          {err}
        </div>
      )}

      <div className="mt-auto pt-12 text-center text-paper/40 text-xs font-mono uppercase tracking-widest">
        play together · live or async
      </div>
    </div>
  );
}
