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
    const bumped = isPlusTwoUser ? p.number + 2 : p.number;
    const face = isMuted ? 0 : bumped;
    const isCancel = !isMuted && !isPlusTwoUser && p.number === 0 && !negateZeroActive;
    const scoreValue = isMuted ? 0 : bumped;
    const notes: string[] = [];
    if (isMuted) notes.push("Muted (treated as 0)");
    if (isPlusTwoUser) notes.push(`Plus Two: ${p.number} → ${bumped}`);
    return { playerId: p.playerId, face, scoreValue, isCancel, notes };
  });

  const cancellers = eff.filter((e) => e.isCancel).length;
  const cancelActive = cancellers === 1;

  // Tie detection: treat free_three's user as if they ALSO played a 3 (a "phantom 3")
  // — only against other players. This means: if any OTHER player played a 3, both their 3
  // and the free_three bonus are nullified.
  const others3 = freeThreeActive
    ? eff.filter((e) => e.playerId !== powerUserId && e.face === 3 && !e.isCancel).length
    : 0;
  const phantomThreeIsContested = freeThreeActive && others3 > 0;

  const faceCount = new Map<number, number>();
  for (const e of eff) faceCount.set(e.face, (faceCount.get(e.face) ?? 0) + 1);
  if (phantomThreeIsContested) {
    // The phantom 3 also "ties" with each other 3, so add it to the count.
    faceCount.set(3, (faceCount.get(3) ?? 0) + 1);
  }

  const lines: ScoreLineInternal[] = eff.map((e) => {
    let delta = 0;
    const notes = [...e.notes];

    if (e.isCancel && cancelActive) {
      delta = 0;
      notes.push("Played 0 (cancelled all others)");
    } else if (e.isCancel && cancellers > 1) {
      delta = 0;
      notes.push("Played 0 (multiple zeros — cancel suppressed)");
    } else if (cancelActive) {
      delta = 0;
      notes.push("Cancelled by 0");
    } else {
      const tied = (faceCount.get(e.face) ?? 0) > 1;
      if (tied) {
        if (powerUp === "shield" && e.playerId === powerUserId) {
          delta = e.scoreValue;
          notes.push(`Shield: scored ${e.scoreValue} despite tie on ${e.face}`);
        } else {
          delta = 0;
          if (e.face === 3 && phantomThreeIsContested && e.playerId !== powerUserId) {
            notes.push("Tied with Free Three's virtual 3");
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

  if (powerUp === "negate") {
    for (const l of lines) {
      if (l.delta !== 0) {
        l.delta = -l.delta;
        l.notes.push("Made Negative");
      }
    }
  }

  if (powerUp === "steal_two" && powerUserId) {
    for (const l of lines) {
      if (l.playerId !== powerUserId && l.delta > 0) {
        l.delta -= 2;
        l.notes.push("Steal Two: −2");
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

  if (powerUp === "trade" && lines.length >= 2) {
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

  return { lines };
}
