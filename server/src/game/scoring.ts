import type { PowerUpId, RoundPowerId } from "../../../shared/types.js";

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

export function scoreTurn(
  plays: PlayInput[],
  gameNumbers?: number[],
  roundPower?: RoundPowerId,
): ScoreResult {
  const powerPlay = plays.find((p) => p.powerUp);
  const powerUp = powerPlay?.powerUp;
  const powerUserId = powerPlay?.playerId;
  const powerTarget = powerPlay?.powerUpTarget;

  // Round powers apply to everyone for the whole round. Static reuses the per-play
  // negate-zero flag; Ultraviolet is a universal +2 at the eff stage; Harmony rewires
  // the tie branch to double the tied value; Amplify, Limiter, and Subharmonic are
  // post-passes at the end; Absorption extends the lone-canceller branch. Pure Tone has no branch anywhere
  // on purpose (the nothingburger pattern) — don't "fix" it. Refraction / Broadcast
  // are turn-flow changes handled in engine.ts, not scoring effects.
  const staticActive = roundPower === "static";
  const ultravioletActive = roundPower === "ultraviolet";
  const harmonyActive = roundPower === "harmony";

  const negateZeroActive = powerUp === "negate_zero" || staticActive;
  const mutedId = powerUp === "mute" ? powerTarget : undefined;
  const freeThreeActive = powerUp === "free_three";
  const plusTwoUserId = powerUp === "plus_two" ? powerUserId : undefined;
  const minusTwoActive = powerUp === "minus_two"; // per-play "Minus Two" — Universal −2 to every face
  const flipActive = powerUp === "flip";
  const drainUserId = powerUp === "drain" ? powerUserId : undefined;
  const drainTargetId = powerUp === "drain" ? powerTarget : undefined;
  const jinxUserId = powerUp === "jinx" ? powerUserId : undefined;
  // Flip mirrors each card to its positional opposite within the game's sorted number
  // set (0 ↔ highest, etc.). For a contiguous default set this equals maxCard - n, so the
  // fallback below reproduces the old behavior when no explicit set is supplied.
  const sortedNums = (gameNumbers ?? Array.from({ length: plays.length + 2 }, (_, i) => i))
    .slice()
    .sort((a, b) => a - b);
  const flipMirror = new Map<number, number>();
  if (flipActive) {
    const n = sortedNums.length;
    for (let i = 0; i < n; i++) flipMirror.set(sortedNums[i], sortedNums[n - 1 - i]);
  }

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
    const isDrainUser = drainUserId === p.playerId;
    const isDrainTarget = drainTargetId === p.playerId;
    const flipped = flipActive ? (flipMirror.get(p.number) ?? p.number) : p.number;
    const bumped = isPlusTwoUser
      ? p.number + 2
      : minusTwoActive
        ? p.number - 2
        : ultravioletActive
          ? p.number + 2
          : isDrainUser
            ? p.number + 1
            : isDrainTarget
              ? p.number - 1
              : flipped;
    const face = isMuted ? 0 : bumped;
    const isCancel = !isMuted && bumped === 0 && !negateZeroActive;
    const scoreValue = isMuted ? 0 : bumped;
    const notes: string[] = [];
    if (isMuted) notes.push("Muted (treated as 0)");
    if (isPlusTwoUser) notes.push(`Plus Two: ${p.number} → ${bumped}`);
    // Plus Two / Minus Two (per-play) preempt Ultraviolet's +2 in the face ternary
    // above, so guard the note (dormant per-play composition only; live play has no
    // per-play powers, and only one round power is ever active).
    if (minusTwoActive && !isPlusTwoUser) notes.push(`Minus Two: ${p.number} → ${bumped}`);
    if (ultravioletActive && !isPlusTwoUser && !minusTwoActive) {
      notes.push(`Ultraviolet: ${p.number} → ${bumped}`);
    }
    if (isDrainUser) notes.push(`Drain: ${p.number} → ${bumped}`);
    if (isDrainTarget) notes.push(`Drained: ${p.number} → ${bumped}`);
    if (flipActive && flipped !== p.number) notes.push(`Flip: ${p.number} → ${flipped}`);
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
      // Absorption: the lone canceller drinks what it silenced — it scores the sum
      // of the other cards' faces. Only the lone 0 absorbs; suppressed multi-zeros
      // fall through the branch below and score 0. The "cancelled all others" note
      // above stays, so revealTreatment still renders the lone-Ø survivor look.
      if (roundPower === "absorption") {
        const silenced = eff.filter((o) => o.playerId !== e.playerId);
        if (silenced.length > 0) {
          delta = silenced.reduce((s, o) => s + o.face, 0);
          notes.push(`Absorption: ${delta >= 0 ? "+" : ""}${delta} (sum of the silenced cards)`);
        }
      }
    } else if (e.isCancel && !cancelActive) {
      if (e.playerId === jinxUserId) {
        // Jinx baited a matching 0: 0s normally suppress each other, but a Jinx
        // user instead cashes in +2 per other 0 (its scoreValue of 0 stays).
        const matches = (faceCount.get(e.face) ?? 1) - 1;
        delta = e.scoreValue + 2 * matches;
        notes.push(`Jinx: matched ${matches} → +${2 * matches}`);
      } else {
        // Matching zeros suppress each other's cancel and score 0. Harmony doubles a
        // tied value, but 0 doubled is still 0, so no Harmony special-case is needed here.
        delta = 0;
        notes.push("Played 0 (multiple zeros — cancel suppressed)");
      }
    } else if (cancelActive) {
      delta = 0;
      notes.push("Cancelled by 0");
    } else {
      const tied = (faceCount.get(e.face) ?? 0) > 1;
      if (tied) {
        if (powerUp === "tie_die" && e.playerId === powerUserId) {
          delta = e.scoreValue;
          notes.push(`Tie Die: scored ${e.scoreValue} despite tie on ${e.face}`);
        } else if (e.playerId === jinxUserId) {
          // Matching is normally a wipe; Jinx flips it into the user's card value
          // plus +2 for every opponent sharing the face. The opponents still tie out.
          const matches = (faceCount.get(e.face) ?? 1) - 1;
          delta = e.scoreValue + 2 * matches;
          notes.push(`Jinx: matched ${matches} on ${e.face} → ${e.scoreValue} +${2 * matches}`);
        } else if (harmonyActive) {
          // Harmony: a tied card scores double its value instead of being wiped. Note
          // must not start with "Tied" — revealTreatment keys off that prefix to render
          // CANCELLED pairs, and a positive delta must read as a survivor.
          delta = e.scoreValue * 2;
          notes.push(`Harmony: tied on ${e.face}, doubled to ${delta}`);
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
          notes.push(staticActive ? "Played 0 (Static, no cancel)" : "Played 0 (Negate Zero — no cancel)");
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

  if (powerUp === "slide" && lines.length >= 2) {
    // Rotate one seat clockwise: each player receives the previous seat's delta.
    // Lines come in seat order from the engine.
    const lastDelta = lines[lines.length - 1].delta;
    for (let i = lines.length - 1; i > 0; i--) {
      lines[i].delta = lines[i - 1].delta;
    }
    lines[0].delta = lastDelta;
    for (const l of lines) l.notes.push("Slide: received prev seat's score");
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

  // Sacrifice: the picker's card scores 0 and every other player loses the picker's
  // face value. The sacrifice only lands if the picker's own card would have scored —
  // it is nullified (fizzles, no penalty) when a board 0 cancels the picker or the
  // picker's card is tied out, exactly like the things that wipe an ordinary card.
  if (powerUp === "sacrifice" && powerUserId) {
    const pickerEff = eff.find((e) => e.playerId === powerUserId);
    const pickerLine = lines.find((l) => l.playerId === powerUserId);
    const pickerTied =
      !!pickerEff && !pickerEff.isCancel && (faceCount.get(pickerEff.face) ?? 0) > 1;
    const nullified = cancelActive || pickerTied;
    const penalty = powerPlay!.number;
    if (nullified) {
      pickerLine?.notes.push("Sacrifice: fizzled (card cancelled or tied)");
    } else {
      for (const l of lines) {
        if (l.playerId === powerUserId) {
          l.delta = 0;
          l.notes.push("Sacrifice: card scores 0");
        } else if (penalty !== 0) {
          l.delta -= penalty;
          l.notes.push(`Sacrifice: ${penalty > 0 ? "−" : "+"}${Math.abs(penalty)}`);
        }
      }
    }
  }

  // Amplify runs at the very END of the pipeline (after Sacrifice), so it doubles the
  // final per-play result even when a dormant per-play power is forced in tests. Note
  // stays distinct from the per-play "Doubled".
  if (roundPower === "amplify") {
    for (const l of lines) {
      if (l.delta !== 0) {
        l.delta *= 2;
        l.notes.push("Amplify: doubled");
      }
    }
  }

  // Limiter (round power) runs at the very end: the highest SURVIVING face is clipped
  // to 0. Surviving = a positive delta after the full pipeline, so cards already tied
  // out or cancelled aren't the peak — the clip lands on the highest card that actually
  // scored (a tie-for-highest wipes itself first, and the clip falls on the next card
  // down). A board wiped by a lone 0 has no survivors and nothing gets clipped.
  // `lines` and `eff` share indexes (both map 1:1 from `plays`).
  if (roundPower === "limiter") {
    let peak = -Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].delta > 0) peak = Math.max(peak, eff[i].face);
    }
    if (peak !== -Infinity) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].delta > 0 && eff[i].face === peak) {
          lines[i].delta = 0;
          lines[i].notes.push(`Limiter: ${peak} clipped to 0`);
        }
      }
    }
  }

  // Subharmonic (round power) is Limiter's mirror, also at the very end: the lowest
  // SURVIVING face gains a flat +4. Surviving = a positive delta after the full
  // pipeline, so a tied-out or cancelled card never collects the bonus (ties still
  // score nothing) and a board wiped by a lone 0 has nothing to lift. A tie for the
  // lowest face wipes itself first, so the lift lands on the lowest card that
  // actually scored — and on all of them, should dormant powers ever leave several
  // survivors sharing the low face (mirroring Limiter's clip-all-at-peak).
  if (roundPower === "subharmonic") {
    let low = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].delta > 0) low = Math.min(low, eff[i].face);
    }
    if (low !== Infinity) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].delta > 0 && eff[i].face === low) {
          lines[i].delta += 4;
          lines[i].notes.push(`Subharmonic: ${low} lifted by 4`);
        }
      }
    }
  }

  return { lines };
}
