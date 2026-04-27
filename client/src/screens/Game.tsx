import { useEffect, useMemo, useRef, useState } from "react";
import { POWER_UPS, type PowerUpId, type RevealedTurn } from "../../../shared/types.js";
import { api } from "../api.js";
import { getIdentity, hasSeenPreviewLocal, markPreviewSeenLocal } from "../identity.js";
import { useAppStore } from "../store.js";
import { NumberCard, PlayerChip, PowerDescription, PowerUpCard, PowerUpChip, SEAT_COLORS } from "../components.js";
import { GameEnd } from "./GameEnd.js";

export function Game({ onLeave, onAbandoned }: { onLeave: () => void; onAbandoned: () => void }) {
  const state = useAppStore((s) => s.state)!;
  const setState = useAppStore((s) => s.setState);
  const { publicState, privateState, selfPlayerId } = state;
  const round = publicState.round!;
  const phase = publicState.phase;
  const id = getIdentity(publicState.roomCode);

  const me = publicState.players.find((p) => p.id === selfPlayerId)!;
  const picker = publicState.players.find((p) => p.id === publicState.currentPickerId);
  const handSize = publicState.players.length + 2;

  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [selectedPower, setSelectedPower] = useState<PowerUpId | null>(null);
  const [powerTarget, setPowerTarget] = useState<string | null>(null);
  const [sabotageNumber, setSabotageNumber] = useState<number | null>(null);
  const [previewingPower, setPreviewingPower] = useState<PowerUpId | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [showPreview, setShowPreview] = useState(false);
  const [revealOverlay, setRevealOverlay] = useState<RevealedTurn | null>(null);

  const lastRevealKey = useRef<number | null>(null);

  useEffect(() => {
    setSelectedNumber(null);
    setSelectedPower(null);
    setPowerTarget(null);
    setSabotageNumber(null);
    setPreviewingPower(null);
    setErr(null);
  }, [publicState.currentTurnIndex, round.index, phase]);

  useEffect(() => {
    if (phase === "lobby" || phase === "game_end") return;
    if (hasSeenPreviewLocal(publicState.roomCode, round.index)) return;
    setShowPreview(true);
  }, [round.index, publicState.roomCode, phase]);

  useEffect(() => {
    const r = publicState.lastReveal;
    if (!r) return;
    const key = r.roundIndex * 1000 + r.turnIndex;
    if (lastRevealKey.current === key) return;
    lastRevealKey.current = key;
    if (phase !== "turn_peek_review") setRevealOverlay(r);
  }, [publicState.lastReveal, phase]);

  function dismissPreview() {
    setShowPreview(false);
    markPreviewSeenLocal(publicState.roomCode, round.index);
  }

  async function ackRound() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await api.ackRoundEnd(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    if (!id) return;
    if (!window.confirm("End this game for everyone? This can't be undone.")) return;
    setBusy(true);
    try {
      await api.abandonRoom(publicState.roomCode, id.claimToken);
      onAbandoned();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  async function submit() {
    if (!id || selectedNumber == null) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.submitTurn(publicState.roomCode, id.claimToken, {
        number: selectedNumber,
        powerUp: phase === "turn_peek_review" ? undefined : selectedPower ?? undefined,
        powerUpTarget: phase === "turn_peek_review" ? undefined : powerTarget ?? undefined,
        sabotageNumber:
          phase === "turn_peek_review" || selectedPower !== "sabotage"
            ? undefined
            : sabotageNumber ?? undefined,
      });
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlock() {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.unsubmitTurn(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isPicker = privateState.isPicker;
  const isPeekReview = phase === "turn_peek_review" && !!privateState.peekReveal;
  const blockedByPeek = phase === "turn_peek_review" && privateState.blockedByOthers;
  const poolForPicker = isPicker && phase === "turn_submitting" ? round.poolRemaining : undefined;
  const needsTarget = selectedPower ? POWER_UPS[selectedPower].needsTarget : false;
  const needsSabotageNumber = selectedPower === "sabotage";

  const canSubmit =
    phase === "turn_peek_review"
      ? isPeekReview && selectedNumber != null
      : !privateState.hasSubmittedThisTurn &&
        selectedNumber != null &&
        (!isPicker || (poolForPicker?.length ?? 0) === 0 || selectedPower) &&
        (!needsTarget || powerTarget) &&
        (!needsSabotageNumber || sabotageNumber != null);

  const playerById = useMemo(() => new Map(publicState.players.map((p) => [p.id, p])), [publicState.players]);
  const isHost = publicState.hostId === selfPlayerId;

  if (phase === "game_end" && !revealOverlay) {
    return <GameEnd onLeave={onAbandoned} />;
  }

  return (
    <div className="min-h-screen flex flex-col px-4 pt-4 pb-6 max-w-md mx-auto relative">
      <header className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono font-bold text-paper">
            R{round.index + 1}
            <span className="text-paper/30">/{publicState.config.rounds}</span>
          </span>
          <span className="text-paper/30 font-mono">·</span>
          <span className="font-mono font-bold text-paper/70">
            T{Math.min(publicState.currentTurnIndex, handSize - 1) + 1}
            <span className="text-paper/30">/{handSize}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-paper/60 text-sm tracking-widest">{publicState.roomCode}</span>
          {isHost && (
            <button
              onClick={abandon}
              disabled={busy}
              className="text-[10px] uppercase tracking-widest font-mono text-paper/50 hover:text-accent border border-paper/15 hover:border-accent/50 rounded-lg px-2 py-1 transition"
              title="End the game for everyone"
            >
              End game
            </button>
          )}
        </div>
      </header>

      <Scoreboard players={publicState.players} selfId={selfPlayerId} />

      <div className="mt-4 mb-3">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] font-mono text-paper/50 mb-2">
          <span>Power-ups remaining</span>
          <span>
            {round.poolRemaining.length} / {round.poolFull.length}
          </span>
        </div>
        <Pool
          remaining={round.poolRemaining}
          isPicker={isPicker && phase === "turn_submitting" && !privateState.hasSubmittedThisTurn}
          selected={selectedPower}
          onSelect={(p) => {
            setPreviewingPower(p);
            setSelectedPower((cur) => (cur === p ? null : p));
            if (selectedPower !== p) {
              setPowerTarget(null);
              setSabotageNumber(null);
            }
          }}
        />
        {previewingPower && isPicker && (
          <div className="mt-2">
            <PowerDescription id={previewingPower} />
          </div>
        )}
      </div>

      <div className="text-xs uppercase tracking-[0.3em] font-mono text-paper/50 mt-1 mb-2">
        Players · picker:&nbsp;
        <span className="text-paper">{picker?.name ?? "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {publicState.players.map((p) => (
          <PlayerChip
            key={p.id}
            name={p.name}
            seat={p.seat}
            online={p.online}
            isSelf={p.id === selfPlayerId}
            isPicker={p.id === publicState.currentPickerId}
            submitted={publicState.currentSubmissions.find((s) => s.playerId === p.id)?.submitted}
            hand={p.hand}
            small
          />
        ))}
      </div>

      {isPeekReview && privateState.peekReveal && (
        <div className="rounded-2xl bg-cyan-400/15 border border-cyan-400/40 px-4 py-3 text-cyan-200 text-sm font-mono mb-3 animate-rise">
          ◎ {playerById.get(privateState.peekReveal.targetPlayerId)?.name} played a{" "}
          <span className="font-bold text-cyan-50 text-base">{privateState.peekReveal.revealedNumber}</span>.
          You first chose <span className="text-paper">{privateState.peekReveal.originalNumber}</span> — pick again now.
        </div>
      )}
      {blockedByPeek && (
        <div className="rounded-2xl bg-cyan-400/10 border border-cyan-400/30 px-4 py-3 text-cyan-200 text-sm font-mono mb-3 animate-rise">
          ◎ Peek played. Waiting for {playerById.get(publicState.currentPickerId ?? "")?.name ?? "the picker"} to choose
          again…
        </div>
      )}

      {needsTarget && selectedPower && phase === "turn_submitting" && (
        <div className="rounded-2xl bg-paper/10 px-4 py-3 mb-3 animate-rise">
          <div className="text-xs uppercase tracking-widest font-mono text-paper/50 mb-2">
            Choose a target for {POWER_UPS[selectedPower].name}
          </div>
          <div className="flex flex-wrap gap-2">
            {publicState.players
              .filter((p) => p.id !== selfPlayerId)
              .map((p) => (
                <button
                  key={p.id}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition ${
                    powerTarget === p.id ? "bg-paper text-ink" : "bg-paper/10 text-paper"
                  }`}
                  onClick={() => {
                    setPowerTarget(p.id);
                    setSabotageNumber(null);
                  }}
                >
                  {p.name}
                </button>
              ))}
          </div>
          {needsSabotageNumber && powerTarget && (() => {
            const target = playerById.get(powerTarget);
            const targetHand = target?.hand ?? [];
            return (
              <div className="mt-3 pt-3 border-t border-paper/10">
                <div className="text-xs uppercase tracking-widest font-mono text-paper/50 mb-2">
                  Force {target?.name} to play
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {targetHand.map((n) => (
                    <NumberCard
                      key={n}
                      n={n}
                      size="sm"
                      state={sabotageNumber === n ? "selected" : "idle"}
                      onClick={() => setSabotageNumber(n === sabotageNumber ? null : n)}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="mt-auto pt-2">
        <div className="text-xs uppercase tracking-[0.3em] font-mono text-paper/50 mb-4">Your hand</div>
        <div className="flex flex-wrap gap-2 justify-center">
          {Array.from({ length: handSize }, (_, i) => i).map((n) => {
            const inHand = privateState.hand.includes(n);
            if (!inHand) return <NumberCard key={n} n={n} state="ghost" />;
            return (
              <NumberCard
                key={n}
                n={n}
                state={selectedNumber === n ? "selected" : "idle"}
                onClick={
                  blockedByPeek || (phase === "turn_submitting" && privateState.hasSubmittedThisTurn)
                    ? undefined
                    : () => setSelectedNumber(n === selectedNumber ? null : n)
                }
              />
            );
          })}
        </div>
        {err && (
          <div className="mt-3 rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-2 text-sm">
            {err}
          </div>
        )}
        {phase === "turn_submitting" && privateState.hasSubmittedThisTurn ? (
          <button
            className="btn-ghost w-full text-base py-4 mt-4 border border-paper/20"
            disabled={busy}
            onClick={unlock}
          >
            {busy ? "Unlocking…" : "Locked in — tap to unlock"}
          </button>
        ) : (
          <button
            className={`btn-primary w-full text-xl py-5 mt-4 ${canSubmit ? "" : "opacity-40 cursor-not-allowed shadow-none"}`}
            disabled={!canSubmit || busy}
            onClick={submit}
          >
            {phase === "turn_peek_review" && !isPeekReview
              ? "Waiting on the peeker…"
              : phase === "turn_peek_review"
              ? selectedNumber == null
                ? "Pick a new number"
                : "Lock it in"
              : busy
              ? "Submitting…"
              : selectedNumber == null
              ? "Pick a number"
              : isPicker && (poolForPicker?.length ?? 0) > 0 && !selectedPower
              ? "Pick a power-up"
              : needsTarget && !powerTarget
              ? "Pick a target"
              : needsSabotageNumber && sabotageNumber == null
              ? "Pick their number"
              : "Lock it in"}
          </button>
        )}
      </div>

      {showPreview && phase !== "round_end" && (
        <PoolPreview pool={round.poolFull} onDismiss={dismissPreview} roundIndex={round.index} />
      )}
      {revealOverlay && (
        <RevealView reveal={revealOverlay} players={publicState.players} onClose={() => setRevealOverlay(null)} />
      )}
      {phase === "round_end" && !revealOverlay && (
        <RoundEnd
          players={publicState.players}
          selfId={selfPlayerId}
          roundIndex={round.index}
          totalRounds={publicState.config.rounds}
          roundScores={round.roundScores}
          acks={round.endAcksBy}
          onAck={ackRound}
          alreadyAcked={round.endAcksBy.includes(selfPlayerId)}
          busy={busy}
        />
      )}
    </div>
  );
}

function Scoreboard({
  players,
  selfId,
}: {
  players: { id: string; name: string; seat: number; totalScore: number }[];
  selfId: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((p) => (
        <div
          key={p.id}
          className={`rounded-2xl px-3 py-2 flex items-center justify-between ${
            p.id === selfId ? "bg-paper/15" : "bg-paper/5"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`${SEAT_COLORS[p.seat % SEAT_COLORS.length]} w-2.5 h-2.5 rounded-full`} />
            <span className="text-sm font-bold text-paper">{p.name}</span>
          </div>
          <span className="font-mono text-xl font-bold text-paper">{p.totalScore}</span>
        </div>
      ))}
    </div>
  );
}

function Pool({
  remaining,
  isPicker,
  selected,
  onSelect,
}: {
  remaining: PowerUpId[];
  isPicker: boolean;
  selected: PowerUpId | null;
  onSelect: (p: PowerUpId) => void;
}) {
  if (remaining.length === 0) {
    return <div className="text-paper/40 font-mono text-xs">pool empty for this round</div>;
  }
  const counts = new Map<PowerUpId, number>();
  for (const p of remaining) counts.set(p, (counts.get(p) ?? 0) + 1);
  const ordered = Array.from(counts.keys());

  if (!isPicker) {
    return (
      <div className="rounded-2xl px-2 py-2 bg-paper/[.04] border border-paper/10">
        <div className="flex flex-wrap gap-1.5 justify-center">
          {ordered.map((p) => (
            <PowerUpChip key={p} id={p} count={counts.get(p)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl px-2 py-2 bg-gold/10 border border-gold/30">
      <div className="text-[10px] font-mono uppercase tracking-widest text-gold mb-1 text-center">
        Your turn — tap to select
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {ordered.map((p) => (
          <div key={p} className="relative">
            <PowerUpCard id={p} state={selected === p ? "selected" : "idle"} onClick={() => onSelect(p)} />
            {(counts.get(p) ?? 0) > 1 && (
              <span className="absolute -top-1 -right-1 bg-paper text-ink text-[10px] font-bold rounded-full px-1.5 py-0.5">
                ×{counts.get(p)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PoolPreview({
  pool,
  onDismiss,
  roundIndex,
}: {
  pool: PowerUpId[];
  onDismiss: () => void;
  roundIndex: number;
}) {
  const [tapped, setTapped] = useState<PowerUpId | null>(null);
  return (
    <div className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-rise overflow-y-auto">
      <div className="text-center mb-4">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">Round {roundIndex + 1}</div>
        <div className="font-display text-3xl font-bold text-gold mt-2">This round's powers</div>
        <div className="text-paper/50 text-sm mt-1">Tap any card to read what it does.</div>
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-sm">
        {pool.map((p, i) => (
          <PowerUpCard
            key={i}
            id={p}
            state={tapped === p ? "selected" : "idle"}
            onClick={() => setTapped(tapped === p ? null : p)}
          />
        ))}
      </div>
      {tapped && (
        <div className="mt-4 max-w-sm w-full">
          <PowerDescription id={tapped} />
        </div>
      )}
      <button className="btn-primary mt-6 px-8 py-4 text-lg" onClick={onDismiss}>
        Let's play
      </button>
    </div>
  );
}

function zeroReason(notes: string[]): "cancel" | "tie" | null {
  if (notes.some((n) => n.startsWith("Tied"))) return "tie";
  if (notes.some((n) => n.startsWith("Cancelled by") || n.includes("cancel suppressed"))) return "cancel";
  return null;
}

function RevealView({
  reveal,
  players,
  onClose,
}: {
  reveal: RevealedTurn;
  players: { id: string; name: string; seat: number }[];
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"flip" | "score">("flip");
  useEffect(() => {
    const t = setTimeout(() => setPhase("score"), 900);
    return () => clearTimeout(t);
  }, []);
  const playerById = new Map(players.map((p) => [p.id, p]));
  const power = reveal.submissions.find((s) => s.powerUp);
  const sortedSubs = [...reveal.submissions].sort((a, b) => {
    const sa = playerById.get(a.playerId)?.seat ?? 0;
    const sb = playerById.get(b.playerId)?.seat ?? 0;
    return sa - sb;
  });
  return (
    <div className="fixed inset-0 z-40 bg-ink/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50 mb-3">
        Turn {reveal.turnIndex + 1} reveal
      </div>
      {power?.powerUp && (
        <div className="mb-4 flex flex-col items-center">
          <span className="text-xs font-mono uppercase tracking-widest text-paper/50 mb-1">
            {playerById.get(power.playerId)?.name} played
          </span>
          <PowerUpCard id={power.powerUp} />
          {power.powerUpTarget && (
            <span className="mt-1 text-xs font-mono text-paper/50">
              → {playerById.get(power.powerUpTarget)?.name}
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 max-w-sm">
        {sortedSubs.map((s, i) => {
          const score = reveal.scoring.find((l) => l.playerId === s.playerId);
          const player = playerById.get(s.playerId)!;
          return (
            <div
              key={s.playerId}
              className="flex flex-col items-center gap-1"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="text-[10px] font-mono uppercase tracking-widest text-paper/50">{player.name}</div>
              <div className={phase === "flip" ? "animate-flip" : ""}>
                <NumberCard n={s.number} state="played" />
              </div>
              {(() => {
                const delta = score?.delta ?? 0;
                const reason = delta === 0 ? zeroReason(score?.notes ?? []) : null;
                const animCls = phase === "score" ? "animate-rise" : "opacity-0";
                if (reason === "tie") {
                  return (
                    <div className={`mt-1 flex flex-col items-center ${animCls}`}>
                      <div className="font-mono font-bold text-xl leading-none text-rose-400">✕</div>
                      <div className="mt-0.5 text-[9px] font-mono uppercase tracking-widest text-rose-400/80">Tied</div>
                    </div>
                  );
                }
                if (reason === "cancel") {
                  return (
                    <div className={`mt-1 flex flex-col items-center ${animCls}`}>
                      <div className="font-mono font-bold text-lg leading-none text-rose-400">0</div>
                      <div className="mt-0.5 text-[9px] font-mono uppercase tracking-widest text-rose-400/80">Cancelled</div>
                    </div>
                  );
                }
                return (
                  <div
                    className={`mt-1 font-mono font-bold text-lg ${animCls} ${
                      delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-paper/40"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
      {reveal.peekUsed && (
        <div className="mt-4 text-cyan-200 text-sm font-mono text-center">
          ◎ {playerById.get(reveal.peekUsed.peekerId)?.name} peeked at{" "}
          {playerById.get(reveal.peekUsed.targetId)?.name} ({reveal.peekUsed.revealedNumber}); switched from{" "}
          <span className="text-paper/60">{reveal.peekUsed.originalNumber}</span> to{" "}
          <span className="text-paper">
            {reveal.submissions.find((s) => s.playerId === reveal.peekUsed!.peekerId)?.number}
          </span>
        </div>
      )}
      {reveal.sabotageUsed && (
        <div className="mt-4 text-rose-200 text-sm font-mono text-center">
          ✖ {playerById.get(reveal.sabotageUsed.sabotagerId)?.name} sabotaged{" "}
          {playerById.get(reveal.sabotageUsed.targetId)?.name}: forced{" "}
          <span className="text-paper">{reveal.sabotageUsed.forcedNumber}</span>
          {reveal.sabotageUsed.forcedNumber !== reveal.sabotageUsed.originalNumber && (
            <>
              {" "}
              over their pick of <span className="text-paper/60">{reveal.sabotageUsed.originalNumber}</span>
            </>
          )}
        </div>
      )}
      <button className="btn-primary mt-6 px-8 py-3" onClick={onClose}>
        Continue
      </button>
    </div>
  );
}

function RoundEnd({
  players,
  selfId,
  roundIndex,
  totalRounds,
  roundScores,
  acks,
  onAck,
  alreadyAcked,
  busy,
}: {
  players: { id: string; name: string; seat: number; totalScore: number }[];
  selfId: string;
  roundIndex: number;
  totalRounds: number;
  roundScores: { [playerId: string]: number };
  acks: string[];
  onAck: () => void;
  alreadyAcked: boolean;
  busy: boolean;
}) {
  const ranked = [...players].sort((a, b) => (roundScores[b.id] ?? 0) - (roundScores[a.id] ?? 0));
  const isLast = roundIndex + 1 >= totalRounds;
  return (
    <div className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-md flex flex-col items-center justify-start p-6 overflow-y-auto animate-rise">
      <div className="text-center mb-4 mt-4">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">
          Round {roundIndex + 1} / {totalRounds} complete
        </div>
        <div className="font-display text-4xl font-bold text-paper mt-2">
          {isLast ? "Final tally" : "Round results"}
        </div>
      </div>
      <div className="w-full max-w-sm flex flex-col gap-2">
        {ranked.map((p, i) => {
          const round = roundScores[p.id] ?? 0;
          return (
            <div
              key={p.id}
              className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${
                i === 0 ? "bg-gold/15 border border-gold/40" : "bg-paper/5 border border-paper/10"
              }`}
            >
              <span className="font-mono text-paper/40 w-5 text-right text-sm">{i + 1}</span>
              <span className={`${SEAT_COLORS[p.seat % SEAT_COLORS.length]} w-3 h-3 rounded-full`} />
              <span className="font-bold flex-1 text-sm">
                {p.name}
                {p.id === selfId && <span className="ml-1 text-paper/40 font-mono text-[10px]">(you)</span>}
              </span>
              <span
                className={`font-mono text-base font-bold ${
                  round > 0 ? "text-emerald-300" : round < 0 ? "text-rose-300" : "text-paper/40"
                }`}
              >
                {round > 0 ? "+" : ""}
                {round}
              </span>
              <span className="font-mono text-xl font-bold text-paper w-10 text-right">{p.totalScore}</span>
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest font-mono text-paper/40 mt-1 px-4">
          <span>this round</span>
          <span className="text-right">total</span>
        </div>
      </div>

      <div className="w-full max-w-sm mt-6">
        <div className="text-xs font-mono uppercase tracking-widest text-paper/50 mb-2 text-center">
          {acks.length} of {players.length} ready
        </div>
        <div className="flex flex-wrap gap-2 justify-center mb-4">
          {players.map((p) => (
            <span
              key={p.id}
              className={`text-xs px-3 py-1 rounded-full font-mono ${
                acks.includes(p.id)
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-paper/5 text-paper/40 border border-paper/10"
              }`}
            >
              {p.name}
            </span>
          ))}
        </div>
        <button
          className={`btn-primary w-full text-lg py-4 ${alreadyAcked ? "opacity-50 cursor-not-allowed shadow-none" : ""}`}
          disabled={alreadyAcked || busy}
          onClick={onAck}
        >
          {alreadyAcked ? "Ready — waiting for others" : busy ? "…" : isLast ? "See the winner" : "Next round"}
        </button>
      </div>
    </div>
  );
}
