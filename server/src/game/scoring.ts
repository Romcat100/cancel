import type { PowerUpId } from "../../../shared/types.js";

export interface PlayInput {
  playerId: string;
  number: number;
  powerUp?: PowerUpId;
  powerUpTarget?: string;
}

export interface ScoreLineInternal {
  playerId: string;
  delta: number;
  notes: string[];
}

export interface ScoreResult {
  lines: ScoreLineInternal[];
}

export function scoreTurn(plays: PlayInput[]): ScoreResult {
  const powerPlay = plays.find((p) => p.powerUp);
  const powerUp = powerPlay?.powerUp;
  const powerUserId = powerPlay?.playerId;
  const powerTarget = powerPlay?.powerUpTarget;

  const negateZeroActive = powerUp === "negate_zero";
  const mutedId = powerUp === "mute" ? powerTarget : undefined;
  const freeThreeActive = powerUp === "free_three";
  const plusTwoUserId = powerUp === "plus_two" ? powerUserId : undefined;
  const minusTwoActive = powerUp === "minus_two"; // "Minus Two" — Universal −2 to every face
  const reverseActive = powerUp === "reverse";
  const maxCard = plays.length + 1; // handSize - 1 (handSize = playerCount + 2)

  type Eff = {
    playerId: string;
    face: number;
    scoreValue: number;
    isCancel: boolean;
    notes: string[];
  };

  const eff: Eff[] = plays.map((p) => {
    const isMuted = mutedId === p.playerId;
    const isPlusTwoUser = plusTwoUserId === p.playerId;
    const flipped = reverseActive ? maxCard - p.number : p.number;
    const bumped = isPlusTwoUser ? p.number + 2 : minusTwoActive ? p.number - 2 : flipped;
    const face = isMuted ? 0 : bumped;
    const isCancel = !isMuted && bumped === 0 && !negateZeroActive;
    const scoreValue = isMuted ? 0 : bumped;
    const notes: string[] = [];
    if (isMuted) notes.push("Muted (treated as 0)");
    if (isPlusTwoUser) notes.push(`Plus Two: ${p.number} → ${bumped}`);
    if (minusTwoActive) notes.push(`Minus Two: ${p.number} → ${bumped}`);
    if (reverseActive && flipped !== p.number) notes.push(`Reverse: ${p.number} → ${flipped}`);
    return { playerId: p.playerId, face, scoreValue, isCancel, notes };
  });

  // A lone 0 cancels everyone. Multiple 0s normally suppress each other's cancel.
  // Tie Die (id "tie_die") on a 0 keeps it as THE canceller even when other 0s are
  // on the board — those other 0s no longer suppress it and are cancelled by it.
  const shieldUserId = powerUp === "tie_die" ? powerUserId : undefined;
  const cancelZeros = eff.filter((e) => e.isCancel);
  const shieldedZero = cancelZeros.find((e) => e.playerId === shieldUserId);
  const cancellerId = shieldedZero
    ? shieldedZero.playerId
    : cancelZeros.length === 1
      ? cancelZeros[0].playerId
      : undefined;
  const cancelActive = cancellerId !== undefined;

  // Tie detection: treat free_three as adding a "phantom 3" to the board. If anyone —
  // including the user themselves — played a real 3, that 3 collides with the phantom and
  // the free_three bonus is lost. The user's own 3 self-cancels just like another player's would.
  const realThrees = freeThreeActive
    ? eff.filter((e) => e.face === 3 && !e.isCancel).length
    : 0;
  const phantomThreeIsContested = freeThreeActive && realThrees > 0;

  const faceCount = new Map<number, number>();
  for (const e of eff) faceCount.set(e.face, (faceCount.get(e.face) ?? 0) + 1);
  if (phantomThreeIsContested) {
    // The phantom 3 also "ties" with each other 3, so add it to the count.
    faceCount.set(3, (faceCount.get(3) ?? 0) + 1);
  }

  const lines: ScoreLineInternal[] = eff.map((e) => {
    let delta = 0;
    const notes = [...e.notes];

    if (e.isCancel && e.playerId === cancellerId) {
      delta = 0;
      notes.push(
        shieldedZero && cancelZeros.length > 1
          ? "Tie Die: 0 still cancels despite another 0"
          : "Played 0 (cancelled all others)",
      );
    } else if (e.isCancel && !cancelActive) {
      delta = 0;
      notes.push("Played 0 (multiple zeros — cancel suppressed)");
    } else if (cancelActive) {
      delta = 0;
      notes.push("Cancelled by 0");
    } else {
      const tied = (faceCount.get(e.face) ?? 0) > 1;
      if (tied) {
        if (powerUp === "tie_die" && e.playerId === powerUserId) {
          delta = e.scoreValue;
          notes.push(`Tie Die: scored ${e.scoreValue} despite tie on ${e.face}`);
        } else {
          delta = 0;
          if (e.face === 3 && phantomThreeIsContested) {
            notes.push(
              e.playerId === powerUserId
                ? "Self-cancelled by Free Three's virtual 3"
                : "Tied with Free Three's virtual 3",
            );
          } else {
            notes.push(`Tied on ${e.face}`);
          }
        }
      } else {
        delta = e.scoreValue;
        if (e.face === 0 && negateZeroActive) {
          notes.push("Played 0 (Negate Zero — no cancel)");
        } else {
          notes.push(`Unique ${e.face}`);
        }
      }
    }

    return { playerId: e.playerId, delta, notes };
  });

  if (powerUp === "double") {
    for (const l of lines) {
      if (l.delta !== 0) {
        l.delta *= 2;
        l.notes.push("Doubled");
      }
    }
  }

  if (powerUp === "make_negative") {
    for (const l of lines) {
      if (l.delta !== 0) {
        l.delta = -l.delta;
        l.notes.push("Made Negative");
      }
    }
  }

  if (powerUp === "free_three" && powerUserId) {
    const line = lines.find((l) => l.playerId === powerUserId);
    if (line && !cancelActive && !phantomThreeIsContested) {
      line.delta += 3;
      line.notes.push("Free Three: +3");
    } else if (line && phantomThreeIsContested) {
      line.notes.push("Free Three: virtual 3 cancelled by another 3");
    } else if (line && cancelActive) {
      line.notes.push("Free Three: cancelled by 0");
    }
  }

  if (powerUp === "switch" && lines.length >= 2) {
    // Rotate one seat clockwise: each player receives the previous seat's delta.
    // Lines come in seat order from the engine.
    const lastDelta = lines[lines.length - 1].delta;
    for (let i = lines.length - 1; i > 0; i--) {
      lines[i].delta = lines[i - 1].delta;
    }
    lines[0].delta = lastDelta;
    for (const l of lines) l.notes.push("Traded (received prev seat's score)");
  }

  if (powerUp === "equalize") {
    const positives = lines.filter((l) => l.delta > 0);
    if (positives.length > 1) {
      const avg = Math.floor(positives.reduce((s, l) => s + l.delta, 0) / positives.length);
      for (const l of positives) {
        l.delta = avg;
        l.notes.push(`Equalized to avg ${avg}`);
      }
    }
  }

  // Drain (id "drain"): flat transfer of 1 point — +1 to the user, −1 to the
  // chosen target, unconditionally. Much weaker than its old steal-everything behaviour.
  if (powerUp === "drain" && powerUserId && powerTarget) {
    const drainer = lines.find((l) => l.playerId === powerUserId);
    const target = lines.find((l) => l.playerId === powerTarget);
    if (drainer && target) {
      drainer.delta += 1;
      drainer.notes.push("Drain: +1 from target");
      target.delta -= 1;
      target.notes.push("Drained: −1 to drainer");
    }
  }

  return { lines };
}
