import { useState } from "react";
import { api } from "../api.js";
import { getIdentity } from "../identity.js";
import { useAppStore } from "../store.js";
import { Confetti, SEAT_COLORS, SEAT_TEXT_COLORS } from "../components.js";

export function GameEnd({ onLeave }: { onLeave: () => void }) {
  const state = useAppStore((s) => s.state)!;
  const setState = useAppStore((s) => s.setState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { publicState, selfPlayerId } = state;
  const isHost = publicState.hostId === selfPlayerId;
  const hostName = publicState.players.find((p) => p.id === publicState.hostId)?.name;

  async function playAgain() {
    const id = getIdentity(publicState.roomCode);
    if (!id || !isHost) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.playAgain(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  const ranked = [...publicState.players].sort((a, b) => b.totalScore - a.totalScore);
  const topScore = ranked[0]?.totalScore;
  const leaders = ranked.filter((p) => p.totalScore === topScore);
  const isTie = leaders.length > 1;
  const selfIsLeader = leaders.some((p) => p.id === selfPlayerId);

  return (
    <div className="h-[100dvh] flex flex-col px-6 pt-10 pb-6 max-w-md mx-auto relative overflow-hidden">
      {!isTie && selfIsLeader && <Confetti />}
      <div className="text-center mb-6 animate-rise shrink-0">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">Game over</div>
        <div className="font-display text-5xl font-bold mt-2">
          {isTie ? (
            selfIsLeader ? (
              <>
                You <span className="text-gold">tied.</span>
              </>
            ) : (
              <span className="text-gold">Tie game.</span>
            )
          ) : selfIsLeader ? (
            <>
              You <span className="text-accent">won.</span>
            </>
          ) : (
            <>
              <span className={SEAT_TEXT_COLORS[leaders[0].seat % SEAT_TEXT_COLORS.length]}>
                {leaders[0].name}
              </span>{" "}
              wins.
            </>
          )}
        </div>
        {isTie && (
          <div className="mt-3 text-paper/70 text-sm">
            {leaders.map((p, i) => (
              <span key={p.id}>
                <span className={`font-bold ${SEAT_TEXT_COLORS[p.seat % SEAT_TEXT_COLORS.length]}`}>
                  {p.name}
                </span>
                {i < leaders.length - 2 ? ", " : i === leaders.length - 2 ? " & " : ""}
              </span>
            ))}{" "}
            share the lead at <span className="font-mono font-bold text-paper">{topScore}</span>.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
        {ranked.map((p) => {
          const rank = 1 + ranked.filter((other) => other.totalScore > p.totalScore).length;
          const isLeader = p.totalScore === topScore;
          return (
            <div
              key={p.id}
              className={`rounded-2xl px-4 py-4 flex items-center gap-3 ${
                isLeader ? "bg-gold/15 border border-gold/40" : "bg-paper/5"
              }`}
            >
              <span className="font-mono text-paper/50 w-6 text-right">{rank}</span>
              <span className={`${SEAT_COLORS[p.seat % SEAT_COLORS.length]} w-3 h-3 rounded-full`} />
              <span className="font-bold flex-1">{p.name}</span>
              <span className="font-mono text-2xl font-bold">{p.totalScore}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 mt-4 shrink-0">
        {isHost ? (
          <button className="btn-primary text-xl py-5" disabled={busy} onClick={playAgain}>
            {busy ? "Restarting…" : "Play again"}
          </button>
        ) : (
          <div className="text-center text-paper/50 font-mono text-sm py-4">
            Waiting for {hostName} to start a new game…
          </div>
        )}
        {err && (
          <div className="rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-3 text-sm">{err}</div>
        )}
        <button className="btn-ghost text-sm py-3" onClick={onLeave}>
          Leave room
        </button>
      </div>
    </div>
  );
}
