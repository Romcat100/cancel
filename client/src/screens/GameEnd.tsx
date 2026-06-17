import { useState } from "react";
import { api } from "../api.js";
import { getIdentity } from "../identity.js";
import { useAppStore } from "../store.js";
import { Confetti, MusicToggle, RoundScoreTable, SEAT_TEXT_COLORS } from "../components.js";

export function GameEnd({ onLeave }: { onLeave: () => void }) {
  const state = useAppStore((s) => s.state)!;
  const setState = useAppStore((s) => s.setState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { publicState, selfPlayerId } = state;
  const isHost = publicState.hostId === selfPlayerId;
  const hostPlayer = publicState.players.find((p) => p.id === publicState.hostId);
  const hostName = hostPlayer?.name;
  const hostOffline = !!hostPlayer && hostPlayer.online === false;

  async function claimHost() {
    const id = getIdentity(publicState.roomCode);
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.claimHost(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
      <div className="absolute top-3 right-3 z-10">
        <MusicToggle />
      </div>
      <div className="text-center mb-6 animate-rise shrink-0">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">Game over</div>
        <div className="font-display text-5xl font-extrabold mt-2 [&_span]:[text-shadow:0_0_22px_currentColor]" data-testid="game-end-winner">
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

      <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
        <RoundScoreTable ranked={ranked} selfId={selfPlayerId} roundHistory={publicState.roundHistory} />
      </div>

      <div className="flex flex-col gap-3 mt-4 shrink-0">
        {isHost ? (
          <button className="btn-primary text-xl py-5" disabled={busy} onClick={playAgain} data-sfx="confirm" data-testid="game-end-play-again">
            {busy ? "Restarting…" : "Play again"}
          </button>
        ) : hostOffline ? (
          <button className="btn-primary text-xl py-5" disabled={busy} onClick={claimHost} data-sfx="confirm" data-testid="game-end-claim-host">
            {busy ? "…" : "Claim host to start a new game"}
          </button>
        ) : (
          <div className="text-center text-paper/50 font-mono text-sm py-4">
            Waiting for {hostName} to start a new game…
          </div>
        )}
        {err && (
          <div className="rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-3 text-sm" data-testid="game-end-error">{err}</div>
        )}
        <button className="btn-ghost text-sm py-3" onClick={onLeave} data-testid="game-end-leave">
          Leave room
        </button>
      </div>
    </div>
  );
}
