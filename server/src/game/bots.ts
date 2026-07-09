import { POWER_UPS, type PowerUpId } from "../../../shared/types.js";
import { ackRoundEnd, submitTurn, type RoomDoc, type SubmitInput } from "./engine.js";
import { chooseNumber, mean, pUniqueAgainst } from "./heuristics.js";

// Single-difficulty AI. Pure: every decision is a function of the RoomDoc (the engine
// already exposes full hands server-side, even when hidden from clients). The driver applies bot
// moves through the same engine intents a human would, so bots are validated identically and the
// game stays on one code path. No timers — bots act immediately (no artificial delay).
//
// Number selection (chooseNumber) lives in heuristics.js so the engine's "Skip waiting" auto-play
// can share it without a dependency cycle; the power-up brain (choosePower) stays here.

// The game's highest card (for valuing Flip, which mirrors a low card to near the top).
function gameMaxCard(room: RoomDoc): number {
  if (room.config.numberMode === "custom" && room.config.customNumbers.length) {
    return Math.max(0, ...room.config.customNumbers);
  }
  return room.players.length + 2 - 1;
}

interface PowerCtx {
  myHand: number[];
  oppHands: { id: string; hand: number[] }[];
  maxCard: number;
  rng: () => number;
}

interface PowerChoice {
  powerUp: PowerUpId;
  number: number;
  powerUpTarget?: string;
  sabotageNumber?: number;
}

// Score every available power against the intended card + board and pick the best (jittered). A few
// powers override the number (Minus Two wants a 2, Flip/Free Three/Switch want a low card). Unknown
// or newly-added powers fall through to a small positive default so the bot never breaks or stalls.
function choosePower(available: PowerUpId[], intended: number, ctx: PowerCtx): PowerChoice {
  const { myHand, oppHands, maxCard, rng } = ctx;
  const oppArrays = oppHands.map((o) => o.hand);
  const baseScore = (c: number) => (c > 0 ? c * pUniqueAgainst(c, oppArrays) : 0);
  const myBase = baseScore(intended);
  const myCollision = 1 - pUniqueAgainst(intended, oppArrays);
  const avgBoard = oppHands.length ? mean(oppHands.map((o) => mean(o.hand))) : 0;
  const pAnyZero = 1 - pUniqueAgainst(0, oppArrays); // chance an opponent plays a (lone) 0
  const lowestNonZero = [...myHand].sort((a, b) => a - b).find((n) => n > 0) ?? Math.min(...myHand);
  const topTarget = [...oppHands].sort((a, b) => mean(b.hand) - mean(a.hand))[0];

  let best: PowerChoice = { powerUp: available[0], number: intended };
  let bestScore = -Infinity;

  for (const power of available) {
    let score = 0;
    let number = intended;
    let target: string | undefined;
    let sabotageNumber: number | undefined;

    switch (power) {
      case "double":
        score = myBase; // scales positive points; great on a strong unique card
        break;
      case "make_negative":
        score = Math.max(0, avgBoard - myBase) * 1.1; // good when the board out-scores me
        break;
      case "equalize":
        score = intended > 0 ? Math.max(0, avgBoard - myBase) * 0.9 : 0; // low-but-positive vs. high board
        break;
      case "tie_die":
        score = myCollision * intended; // saves the points a tie would wipe
        break;
      case "jinx":
        score = myCollision * (intended + 2); // turns a likely tie into a payout
        break;
      case "plus_two": {
        const bumped = intended + 2;
        score = bumped * pUniqueAgainst(bumped, oppArrays) - myBase;
        break;
      }
      case "free_three": {
        const p3 = 1 - pUniqueAgainst(3, oppArrays);
        number = lowestNonZero;
        score = baseScore(lowestNonZero) + 3 * (1 - p3) - myBase;
        break;
      }
      case "minus_two":
        if (myHand.includes(2)) {
          number = 2; // 2 → 0, cancels the whole board
          score = avgBoard * 1.1;
        } else {
          score = 0.5;
        }
        break;
      case "flip": {
        const low = Math.min(...myHand);
        number = low;
        score = maxCard - low - myBase; // a low card mirrors near the top
        break;
      }
      case "negate_zero":
        score = intended > 0 ? pAnyZero * myBase * 0.5 : 0; // shield a high card from a lone 0
        break;
      case "mute":
        if (topTarget) {
          target = topTarget.id;
          score = mean(topTarget.hand);
        }
        break;
      case "drain":
        if (topTarget) {
          target = topTarget.id;
          score = 1 + 0.3 * mean(topTarget.hand);
        }
        break;
      case "swap_hands":
        if (topTarget) {
          target = topTarget.id;
          score = Math.max(0, mean(topTarget.hand) - mean(myHand)); // take a better hand
        }
        break;
      case "switch_cards":
        if (topTarget) {
          target = topTarget.id;
          number = lowestNonZero; // hand the target a dud; I score their (hopefully higher) pick
          score = Math.max(0, mean(topTarget.hand) - baseScore(lowestNonZero));
        }
        break;
      case "sabotage":
        if (topTarget && topTarget.hand.length > 0) {
          target = topTarget.id;
          const th = [...topTarget.hand].sort((a, b) => a - b);
          sabotageNumber = th.find((n) => n > 0) ?? th[0]; // deny a high card; avoid a lone-0 backfire
          score = mean(topTarget.hand) * 1.2;
        }
        break;
      case "peek":
        if (topTarget) {
          target = topTarget.id;
          score = 1; // modest info value
        }
        break;
      case "random_ray":
        // Re-roll the strongest opponent's score to a random pool number — usually drags a high
        // scorer toward the pool average. (allowSelfTarget exists, but hitting the best opponent
        // is the sensible play.)
        if (topTarget) {
          target = topTarget.id;
          score = Math.max(0, mean(topTarget.hand) - maxCard / 2) + 0.5;
        }
        break;
      case "slide":
        score = 0.3;
        break;
      case "sacrifice": {
        // Picker's card scores 0; every other player loses the picker's face value — but only if
        // the picker's card scores (a board 0 or a tie nullifies it). Martyr the highest card: it
        // does the most damage and, being high, is the least likely to tie or be cancelled. Value
        // scales with the card and the opponent count, net of the score the picker forgoes.
        const high = Math.max(...myHand);
        number = high;
        score = high * oppHands.length * 0.35 - myBase;
        break;
      }
      case "wild":
        score = 1.5; // a gamble, occasionally worth it
        break;
      case "nothingburger":
        score = 0; // only wins when every real power scores <= 0
        break;
      default:
        // Resilience: a power not modeled above (the game keeps gaining new ones). Give it a small
        // positive baseline and auto-target so it's played occasionally and never crashes the bot.
        // `power` narrows to `never` here today (the switch is exhaustive), so cast to index safely;
        // when a new power id is added to the union without a case, this branch starts catching it.
        score = 0.8;
        if (POWER_UPS[power as PowerUpId]?.needsTarget && topTarget) target = topTarget.id;
        break;
    }

    // A targeted power with no valid target (or sabotage with no number) must never be chosen.
    if (POWER_UPS[power]?.needsTarget && !target) score = -Infinity;
    if (power === "sabotage" && sabotageNumber == null) score = -Infinity;

    const jittered = score === -Infinity ? -Infinity : score * (0.8 + 0.4 * rng());
    if (jittered > bestScore) {
      bestScore = jittered;
      best = { powerUp: power, number, powerUpTarget: target, sabotageNumber };
    }
  }

  // Safety net: if the winner needs a target but somehow lacks one, attach the best target.
  if (POWER_UPS[best.powerUp]?.needsTarget && !best.powerUpTarget && topTarget) {
    best.powerUpTarget = topTarget.id;
    if (best.powerUp === "sabotage" && best.sabotageNumber == null && topTarget.hand.length) {
      const th = [...topTarget.hand].sort((a, b) => a - b);
      best.sabotageNumber = th.find((n) => n > 0) ?? th[0];
    }
  }
  return best;
}

// Decide a bot's full submission for the current turn: a number, plus a power-up (with target /
// sabotage number) when the bot is the picker and the pool is non-empty.
export function decideBotMove(room: RoomDoc, botId: string, rng: () => number = Math.random): SubmitInput {
  const round = room.rounds[room.currentRoundIndex];
  const pickerId = round.rotation[room.currentTurnIndex];
  const myHand = round.hands[botId] ?? [];
  const oppHands = room.players
    .filter((p) => p.id !== botId)
    .map((p) => ({ id: p.id, hand: round.hands[p.id] ?? [] }));
  const intended = chooseNumber(myHand, oppHands.map((o) => o.hand), [], rng);

  if (botId !== pickerId || round.poolRemaining.length === 0) {
    return { playerId: botId, number: intended };
  }

  const available = Array.from(new Set(round.poolRemaining));
  const pick = choosePower(available, intended, { myHand, oppHands, maxCard: gameMaxCard(room), rng });
  const number = myHand.includes(pick.number) ? pick.number : intended;
  return {
    playerId: botId,
    number,
    powerUp: pick.powerUp,
    powerUpTarget: pick.powerUpTarget,
    sabotageNumber: pick.sabotageNumber,
  };
}

// A bot's re-pick during Crosstalk's turn_neighbor_review. The bot keeps its initial pick,
// which also keeps the human's glimpsed neighbor info truthful (a bot neighbor plays what
// the human saw). Falls back to a fresh choice if the snapshot is somehow missing.
export function decideBotNeighborRepick(room: RoomDoc, botId: string, rng: () => number = Math.random): SubmitInput {
  const initial = room.neighborReview?.initialPicks[botId];
  if (initial != null) return { playerId: botId, number: initial };
  const round = room.rounds[room.currentRoundIndex];
  const myHand = round.hands[botId] ?? [];
  const oppHands = room.players.filter((p) => p.id !== botId).map((p) => round.hands[p.id] ?? []);
  return { playerId: botId, number: chooseNumber(myHand, oppHands, [], rng) };
}

// A bot peeker's re-pick during turn_peek_review: it now knows the peeked opponent's number, so
// treat that as a guaranteed play on the board and pick around it.
export function decideBotPeekRepick(room: RoomDoc, botId: string, rng: () => number = Math.random): SubmitInput {
  const round = room.rounds[room.currentRoundIndex];
  const myHand = round.hands[botId] ?? [];
  const oppHands = room.players
    .filter((p) => p.id !== botId)
    .map((p) => round.hands[p.id] ?? []);
  const known = room.peekReview ? [room.peekReview.revealedNumber] : [];
  return { playerId: botId, number: chooseNumber(myHand, oppHands, known, rng) };
}

// Advance the game by applying every pending bot action, looping until only humans remain to act
// (or the game ends). Bots pre-submit the instant a turn opens, so the human always submits last
// and sees the reveal immediately. At round_end, bots ack but the round only advances once the
// human acks too — so the human still gets to read the round summary. The guard cap is a backstop
// against any pathological loop; normal play terminates in a handful of iterations.
export function driveBots(room: RoomDoc, rng: () => number = Math.random): RoomDoc {
  let cur = room;
  for (let guard = 0; guard < 5000; guard++) {
    if (cur.phase === "turn_submitting") {
      const bot = cur.players.find((p) => p.isBot && !cur.pendingSubmissions[p.id]);
      if (!bot) return cur;
      cur = submitTurn(cur, decideBotMove(cur, bot.id, rng));
      continue;
    }
    if (cur.phase === "turn_peek_review") {
      const peekerId = cur.peekReview?.peekerId;
      const peeker = peekerId ? cur.players.find((p) => p.id === peekerId) : undefined;
      if (!peeker?.isBot) return cur;
      cur = submitTurn(cur, decideBotPeekRepick(cur, peeker.id, rng));
      continue;
    }
    if (cur.phase === "turn_neighbor_review") {
      const bot = cur.players.find((p) => p.isBot && !cur.pendingSubmissions[p.id]);
      if (!bot) return cur;
      cur = submitTurn(cur, decideBotNeighborRepick(cur, bot.id, rng));
      continue;
    }
    if (cur.phase === "round_end") {
      const round = cur.rounds[cur.currentRoundIndex];
      const bot = cur.players.find((p) => p.isBot && !round.endAcksBy.includes(p.id));
      if (!bot) return cur;
      cur = ackRoundEnd(cur, bot.id);
      continue;
    }
    return cur; // lobby / game_end — nothing for bots to do
  }
  return cur;
}
