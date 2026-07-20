import type { RoundPowerId } from "./types.js";

// --- Solo campaign (v1) ---
// A campaign level is nothing but a solo room created with a prescribed config
// (powerUpMode "selected" + a pinned roster, rounds, bots, showHands) plus an
// objective checked at game_end. The engine knows nothing about any of this.
// A one-power roster repeats that power every round via the engine's
// exhausted-roster fallback, which is what makes each level a tutorial for its
// power. Progress lives in server-side profiles keyed by an anonymous profile
// token (see server/src/profiles.ts).

// --- Wave flair (campaign-unlocked cosmetics) ---

export type FlairId = "shimmer" | "echo_trace" | "comet" | "fuzz" | "undertow" | "halo";

export interface FlairDef {
  id: FlairId;
  name: string;
  description: string;
}

export const FLAIRS: Record<FlairId, FlairDef> = {
  shimmer: {
    id: "shimmer",
    name: "Shimmer",
    description: "Your wave glows with a slow, breathing pulse.",
  },
  echo_trace: {
    id: "echo_trace",
    name: "Echo Trace",
    description: "A faint second trace trails your wave.",
  },
  comet: {
    id: "comet",
    name: "Comet",
    description: "Your wave streaks by in bright broken dashes.",
  },
  fuzz: {
    id: "fuzz",
    name: "Fuzz",
    description: "Your wave crackles with broken static.",
  },
  undertow: {
    id: "undertow",
    name: "Undertow",
    description: "A shadow of your wave rides beneath it.",
  },
  halo: {
    id: "halo",
    name: "Halo",
    description: "A white-hot core burns inside your glow.",
  },
};

export const FLAIR_IDS = Object.keys(FLAIRS) as FlairId[];

// --- Objectives ---

export type CampaignObjective =
  | { type: "win" }
  | { type: "round_score"; min: number }
  | { type: "harmony_double" }
  // Win and be the 0 that cancels the whole board, `count` times (default 1).
  // Detected via the "cancelled all others" scoring note, so it works for a
  // plain lone 0, Absorption, and Dead Air alike.
  | { type: "silence"; count?: number }
  // Win with no card of yours tied out or cancelled, the whole game.
  | { type: "untouched" }
  // Win without the Gate ever cutting your card (limiter rounds).
  | { type: "never_gated" };

// The one line players see for a level's goal, on the level tile and on the
// game-end result panel. Every objective beyond plain "win" also requires the win.
export function objectiveText(objective: CampaignObjective): string {
  switch (objective.type) {
    case "win":
      return "Win the game";
    case "round_score":
      return `Win the game and bank ${objective.min}+ points in a single round`;
    case "harmony_double":
      return "Win the game and score at least one doubled tie";
    case "silence": {
      const count = objective.count ?? 1;
      if (count === 1) return "Win the game and silence the board with a 0";
      if (count === 2) return "Win the game and silence the board with a 0, twice";
      return `Win the game and silence the board with a 0, ${count} times`;
    }
    case "untouched":
      return "Win the game with none of your cards tied or cancelled";
    case "never_gated":
      return "Win the game without the Gate ever cutting your card";
  }
}

// --- Chapters & levels ---

export interface CampaignChapterDef {
  id: string;
  title: string;
  flavor: string;
  // Index into the client's ROUND_THEMES (client-side use only).
  themeIndex: number;
  // Granted when every level in the chapter is completed.
  completionFlair?: FlairId;
  comingSoon?: boolean;
}

export interface CampaignLevelDef {
  id: string;
  chapterId: string;
  title: string;
  flavor: string;
  setup: {
    rounds: number;
    roster: RoundPowerId[];
    bots: number;
    showHands?: boolean;
  };
  objective: CampaignObjective;
  unlocksFlair?: FlairId;
}

// All five chapters are titled now so the map view can tease what's ahead;
// only Chapter 1 has playable levels in v1.
export const CAMPAIGN_CHAPTERS: CampaignChapterDef[] = [
  {
    id: "ch1",
    title: "Tuning In",
    flavor: "Find the frequency. Learn to read a quiet board.",
    themeIndex: 0,
    completionFlair: "comet",
  },
  {
    id: "ch2",
    title: "Interference",
    flavor: "Signals start to collide. The zero is a weapon now.",
    themeIndex: 1,
    completionFlair: "halo",
  },
  {
    id: "ch3",
    title: "The Spectrum",
    flavor: "Every color of the wave.",
    themeIndex: 2,
    comingSoon: true,
  },
  {
    id: "ch4",
    title: "Distortion",
    flavor: "Nothing scores the way it should.",
    themeIndex: 3,
    comingSoon: true,
  },
  {
    id: "ch5",
    title: "On the Air",
    flavor: "The final broadcast.",
    themeIndex: 4,
    comingSoon: true,
  },
];

export const CAMPAIGN_LEVELS: CampaignLevelDef[] = [
  {
    id: "1-1",
    chapterId: "ch1",
    title: "First Signal",
    flavor: "A clean channel and two rival signals. Make yours the loudest.",
    setup: { rounds: 2, roster: ["pure_tone"], bots: 2 },
    objective: { type: "win" },
    // One flair per level, starting with the very first win, so the flair
    // system introduces itself (a locked-only picker is invisible).
    unlocksFlair: "shimmer",
  },
  {
    id: "1-2",
    chapterId: "ch1",
    title: "In Harmony",
    flavor: "Ties resonate here. Stop dodging collisions and start engineering them.",
    setup: { rounds: 3, roster: ["harmony"], bots: 3 },
    objective: { type: "harmony_double" },
  },
  {
    id: "1-3",
    chapterId: "ch1",
    title: "Turn It Up",
    flavor: "Everything is doubled. Big rounds win this one, not safe ones.",
    setup: { rounds: 3, roster: ["amplify"], bots: 3 },
    // Tune min in playtesting; ~14 is a strong-but-reachable amplified round.
    objective: { type: "round_score", min: 14 },
    unlocksFlair: "echo_trace",
  },
  {
    id: "1-4",
    chapterId: "ch1",
    title: "Crowded Channel",
    flavor: "Five signals on one band, and every card plays 2 higher. The spectrum runs hot.",
    setup: { rounds: 3, roster: ["ultraviolet"], bots: 4 },
    objective: { type: "win" },
  },
  {
    id: "1-5",
    chapterId: "ch1",
    title: "Recital",
    flavor: "Every power from this chapter, drawn in any order. Play what the round demands.",
    setup: { rounds: 4, roster: ["pure_tone", "harmony", "amplify", "ultraviolet"], bots: 3 },
    // No per-level flair: beating it completes the chapter, which grants comet.
    objective: { type: "win" },
  },
  {
    id: "2-1",
    chapterId: "ch2",
    title: "Noise Floor",
    flavor: "Zeros drown in the hiss and cancel nothing. Only a clean signal survives.",
    setup: { rounds: 3, roster: ["static"], bots: 3 },
    objective: { type: "untouched" },
  },
  {
    id: "2-2",
    chapterId: "ch2",
    title: "The Sponge",
    flavor: "The flat line drinks the sound and keeps it. Time your zero perfectly.",
    setup: { rounds: 3, roster: ["absorption"], bots: 3 },
    objective: { type: "silence" },
    unlocksFlair: "fuzz",
  },
  {
    id: "2-3",
    chapterId: "ch2",
    title: "Nowhere to Hide",
    flavor: "Every zero cuts through, no matter how many are played. Silence is a weapon you can spend.",
    setup: { rounds: 3, roster: ["dead_air"], bots: 3 },
    objective: { type: "silence", count: 2 },
  },
  {
    id: "2-4",
    chapterId: "ch2",
    title: "Past the Gate",
    flavor: "The quietest card that scores is cut every turn. Do not let it be yours.",
    setup: { rounds: 3, roster: ["limiter"], bots: 3 },
    objective: { type: "never_gated" },
    unlocksFlair: "undertow",
  },
  {
    id: "2-5",
    chapterId: "ch2",
    title: "Interference Storm",
    flavor: "Four ways for the noise to eat you, one round at a time.",
    setup: { rounds: 4, roster: ["static", "absorption", "dead_air", "limiter"], bots: 4 },
    // No per-level flair: beating it completes the chapter, which grants halo.
    objective: { type: "win" },
  },
];

export function campaignLevel(levelId: string): CampaignLevelDef | undefined {
  return CAMPAIGN_LEVELS.find((l) => l.id === levelId);
}

export function nextLevelId(levelId: string): string | undefined {
  const idx = CAMPAIGN_LEVELS.findIndex((l) => l.id === levelId);
  return idx >= 0 ? CAMPAIGN_LEVELS[idx + 1]?.id : undefined;
}

// Stamped onto a campaign room at game_end (projected publicly; the profile
// token never is). `detail` is an optional one-line explanation of a miss.
export interface CampaignResult {
  passed: boolean;
  objectiveText: string;
  detail?: string;
  // Flairs newly granted by this completion (for the game-end callout).
  unlockedFlairs?: FlairId[];
}

// --- Progress ---
// The campaign slice of a profile, shared so unlock gating is identical on both
// sides (server validates, client renders).

export interface CampaignProgress {
  completedLevels: { [levelId: string]: { completedAt: number } };
}

export function isLevelCompleted(progress: CampaignProgress, levelId: string): boolean {
  return !!progress.completedLevels[levelId];
}

// The first level is always open; every later level opens when the previous
// one (in CAMPAIGN_LEVELS order) is completed.
export function isLevelUnlocked(progress: CampaignProgress, levelId: string): boolean {
  const idx = CAMPAIGN_LEVELS.findIndex((l) => l.id === levelId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  return isLevelCompleted(progress, CAMPAIGN_LEVELS[idx - 1].id);
}

export function isChapterCompleted(progress: CampaignProgress, chapterId: string): boolean {
  const levels = CAMPAIGN_LEVELS.filter((l) => l.chapterId === chapterId);
  return levels.length > 0 && levels.every((l) => isLevelCompleted(progress, l.id));
}

// Every flair a given progress state has earned: per-level unlocks plus chapter
// completion grants. Idempotent by construction, so the server can re-derive it
// after any completion without double-granting.
export function earnedFlairs(progress: CampaignProgress): FlairId[] {
  const out: FlairId[] = [];
  for (const level of CAMPAIGN_LEVELS) {
    if (level.unlocksFlair && isLevelCompleted(progress, level.id)) out.push(level.unlocksFlair);
  }
  for (const chapter of CAMPAIGN_CHAPTERS) {
    if (chapter.completionFlair && isChapterCompleted(progress, chapter.id)) {
      out.push(chapter.completionFlair);
    }
  }
  return [...new Set(out)];
}
