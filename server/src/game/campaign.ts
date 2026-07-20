import type { CampaignLevelDef } from "../../../shared/campaign.js";

// Pure objective evaluation over a finished campaign game. Structural input
// (like stats.ts's GameStatsInput) so tests can hand-build minimal fixtures;
// RoomDoc satisfies it.
export interface CampaignEvalInput {
  players: { id: string; totalScore: number; isBot?: boolean }[];
  rounds: {
    perPlayerRoundScore: { [playerId: string]: number };
    reveals: { scoreLines: { playerId: string; delta: number; notes: string[] }[] }[];
  }[];
}

export interface ObjectiveResult {
  passed: boolean;
  // One-line explanation of a miss (absent on a pass).
  detail?: string;
}

// Note-string coupling: these key off the exact strings scoring.ts pushes (the
// same ones revealTreatment and stats.ts read). Changing a note in scoring.ts
// must keep these in sync.
// - harmony_double: the Harmony survivor note ("Harmony: tied on N, doubled to M").
// - silence: the lone-canceller note ("cancelled all others"), shared by a plain
//   lone 0, Absorption, and every Dead Air canceller (stats.ts uses it too).
// - untouched: the tie/cancel wipe notes, same matcher as stats.ts:isWipeNote.
// - never_gated: the Gate cut note ("Gate: N cut to 0").
const isHarmonyDoubleNote = (n: string) => n.startsWith("Harmony: tied on");
const isSilenceNote = (n: string) => n.includes("cancelled all others");
const isWipeNote = (n: string) => n.startsWith("Tied") || n === "Cancelled by 0";
const isGateCutNote = (n: string) => n.startsWith("Gate:");

// "Win" means the human finishes at (or tied for) the top score — the same rule
// endGame uses for series wins.
function humanWon(input: CampaignEvalInput, humanId: string): boolean {
  const max = Math.max(...input.players.map((p) => p.totalScore));
  return (input.players.find((p) => p.id === humanId)?.totalScore ?? -Infinity) === max;
}

// How many of the human's score lines match a note predicate, over every reveal.
function countNotes(input: CampaignEvalInput, humanId: string, match: (n: string) => boolean): number {
  let count = 0;
  for (const round of input.rounds) {
    for (const reveal of round.reveals) {
      for (const line of reveal.scoreLines) {
        if (line.playerId === humanId && line.notes.some(match)) count++;
      }
    }
  }
  return count;
}

export function evaluateObjective(input: CampaignEvalInput, level: CampaignLevelDef): ObjectiveResult {
  const human = input.players.find((p) => !p.isBot);
  if (!human) return { passed: false, detail: "No human player found." };
  const won = humanWon(input, human.id);
  const obj = level.objective;

  if (!won) return { passed: false, detail: "You didn't win this one." };

  switch (obj.type) {
    case "win":
      return { passed: true };
    case "round_score": {
      const best = Math.max(0, ...input.rounds.map((r) => r.perPlayerRoundScore[human.id] ?? 0));
      if (best >= obj.min) return { passed: true };
      return {
        passed: false,
        detail: `You won, but your best round banked ${best}. Get ${obj.min} or more in a single round.`,
      };
    }
    case "harmony_double": {
      if (countNotes(input, human.id, isHarmonyDoubleNote) > 0) return { passed: true };
      return { passed: false, detail: "You won, but never landed a doubled tie." };
    }
    case "silence": {
      const want = obj.count ?? 1;
      const got = countNotes(input, human.id, isSilenceNote);
      if (got >= want) return { passed: true };
      if (got === 0) return { passed: false, detail: "You won, but never silenced the board with a 0." };
      return {
        passed: false,
        detail: `You won and silenced the board ${got === 1 ? "once" : `${got} times`}. Do it ${want} times.`,
      };
    }
    case "untouched": {
      const wiped = countNotes(input, human.id, isWipeNote);
      if (wiped === 0) return { passed: true };
      return {
        passed: false,
        detail: `You won, but ${wiped === 1 ? "one of your cards was" : `${wiped} of your cards were`} wiped. Keep every card clean.`,
      };
    }
    case "never_gated": {
      const cuts = countNotes(input, human.id, isGateCutNote);
      if (cuts === 0) return { passed: true };
      return {
        passed: false,
        detail: `You won, but the Gate cut your card ${cuts === 1 ? "once" : `${cuts} times`}.`,
      };
    }
  }
}
