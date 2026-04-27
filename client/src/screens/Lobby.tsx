import { useState } from "react";
import { api } from "../api.js";
import { useAppStore } from "../store.js";
import { getIdentity } from "../identity.js";
import { Rules } from "../components.js";

const SEAT_COLORS = ["bg-accent", "bg-cool", "bg-gold", "bg-emerald-500", "bg-fuchsia-500", "bg-cyan-400", "bg-orange-300", "bg-rose-400"];

export function Lobby({ onLeave }: { onLeave: () => void }) {
  const state = useAppStore((s) => s.state)!;
  const setState = useAppStore((s) => s.setState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  const { publicState, selfPlayerId } = state;
  const me = publicState.players.find((p) => p.id === selfPlayerId);
  const isHost = publicState.hostId === selfPlayerId;
  const id = getIdentity(publicState.roomCode);
  const powerUpsOn = publicState.config.powerUps !== false;

  async function togglePowerUps() {
    if (!id || !isHost) return;
    setErr(null);
    try {
      const res = await api.setConfig(publicState.roomCode, id.claimToken, { powerUps: !powerUpsOn });
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function start() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await api.startGame(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(publicState.roomCode);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col px-6 pt-10 pb-8 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button className="btn-ghost text-xs px-3 py-2" onClick={onLeave}>
          ← Leave
        </button>
        <button className="btn-ghost text-xs px-3 py-2" onClick={() => setShowRules(true)}>
          Rules
        </button>
      </div>

      <div className="mb-6 text-center">
        <div className="text-paper/50 text-xs uppercase tracking-[0.3em] font-mono">Room code</div>
        <button
          onClick={copyCode}
          className="mt-2 group inline-flex items-baseline gap-3 active:scale-[.97] transition"
          aria-label="copy room code"
        >
          <span className="font-mono font-bold text-6xl tracking-[0.2em] text-accent">{publicState.roomCode}</span>
          <span className="text-paper/30 text-sm group-hover:text-paper/60 font-mono">tap to copy</span>
        </button>
      </div>

      <div className="text-paper/50 text-xs uppercase tracking-[0.3em] font-mono mb-3">
        Players · {publicState.players.length}
      </div>
      <div className="flex flex-col gap-2">
        {publicState.players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-2xl bg-paper/5 px-3 py-2 animate-rise"
          >
            <div
              className={`${SEAT_COLORS[p.seat % SEAT_COLORS.length]} text-ink font-bold w-10 h-10 rounded-xl flex items-center justify-center font-display`}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 font-bold">{p.name}</div>
            <div className="flex items-center gap-2 text-xs">
              {p.id === publicState.hostId && <span className="chip bg-gold/20 text-gold">host</span>}
              {p.id === selfPlayerId && <span className="chip">you</span>}
              <span className={`w-2 h-2 rounded-full ${p.online ? "bg-emerald-400" : "bg-paper/20"}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-10 flex flex-col gap-3">
        <div className="rounded-2xl bg-paper/5 px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-bold text-sm">Power-ups</span>
            <span className="text-paper/50 text-xs font-mono">
              {powerUpsOn ? "on" : "off"}
            </span>
          </div>
          {isHost ? (
            <button
              type="button"
              role="switch"
              aria-checked={powerUpsOn}
              onClick={togglePowerUps}
              className={`relative w-12 h-7 rounded-full transition shrink-0 ${
                powerUpsOn ? "bg-accent" : "bg-paper/20"
              }`}
            >
              <span
                className={`absolute top-0.5 ${powerUpsOn ? "left-[22px]" : "left-0.5"} w-6 h-6 rounded-full bg-paper transition-all`}
              />
            </button>
          ) : (
            <span className={`chip ${powerUpsOn ? "bg-accent/20 text-accent" : "bg-paper/15 text-paper/60"}`}>
              {powerUpsOn ? "on" : "off"}
            </span>
          )}
        </div>
        {isHost ? (
          <>
            <button
              className="btn-primary text-xl py-5"
              disabled={busy || publicState.players.length < 2}
              onClick={start}
            >
              {publicState.players.length < 2 ? "Waiting for players…" : busy ? "Starting…" : "Start game"}
            </button>
            <p className="text-paper/40 text-xs text-center font-mono">
              {publicState.players.length + 2} cards each · {publicState.config.rounds} rounds
            </p>
          </>
        ) : (
          <div className="text-center text-paper/50 font-mono text-sm py-4">
            Waiting for {publicState.players.find((p) => p.id === publicState.hostId)?.name} to start the game…
          </div>
        )}
        {err && (
          <div className="rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-3 text-sm">{err}</div>
        )}
      </div>

      {showRules && <Rules onClose={() => setShowRules(false)} includePowerUps={powerUpsOn} />}
    </div>
  );
}
