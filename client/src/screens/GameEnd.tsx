import { useAppStore } from "../store.js";
import { Confetti, SEAT_COLORS } from "../components.js";

export function GameEnd({ onLeave }: { onLeave: () => void }) {
  const state = useAppStore((s) => s.state)!;
  const { publicState, selfPlayerId } = state;
  const ranked = [...publicState.players].sort((a, b) => b.totalScore - a.totalScore);
  const winner = ranked[0];
  const isWinner = winner?.id === selfPlayerId;

  return (
    <div className="h-[100dvh] flex flex-col px-6 pt-10 pb-6 max-w-md mx-auto relative overflow-hidden">
      <Confetti />
      <div className="text-center mb-6 animate-rise shrink-0">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">Game over</div>
        <div className="font-display text-5xl font-bold mt-2">
          {isWinner ? (
            <>
              You <span className="text-accent">won.</span>
            </>
          ) : (
            <>
              <span className={`${SEAT_COLORS[winner.seat % SEAT_COLORS.length].replace("bg-", "text-")}`}>
                {winner.name}
              </span>{" "}
              wins.
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
        {ranked.map((p, i) => (
          <div
            key={p.id}
            className={`rounded-2xl px-4 py-4 flex items-center gap-3 ${
              i === 0 ? "bg-gold/15 border border-gold/40" : "bg-paper/5"
            }`}
          >
            <span className="font-mono text-paper/50 w-6 text-right">{i + 1}</span>
            <span className={`${SEAT_COLORS[p.seat % SEAT_COLORS.length]} w-3 h-3 rounded-full`} />
            <span className="font-bold flex-1">{p.name}</span>
            <span className="font-mono text-2xl font-bold">{p.totalScore}</span>
          </div>
        ))}
      </div>

      <button className="btn-primary text-xl py-5 mt-4 shrink-0" onClick={onLeave}>
        Done
      </button>
    </div>
  );
}
