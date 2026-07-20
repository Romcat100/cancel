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

export type FlairId =
  // Wave flairs: restyle your waveform.
  | "shimmer"
  | "comet"
  | "aurora"
  // Name flairs: restyle your player name.
  | "neon"
  | "marquee"
  | "gilded"
  // Victory flourishes: your personal celebration on the game-over screen,
  // shown to the whole table when you win outright.
  | "shockwave"
  | "zero_rain"
  | "limelight"
  // Signature sounds: your scoring cards get their own voice in the reveal
  // cascade (only the survivor tone is voiced; every other outcome keeps its
  // standard sound, so the reveal's audio language stays readable).
  | "chime"
  | "pluck"
  | "brass";

// Four cosmetic slots, one equipped per kind, all worn at the same time.
export type FlairKind = "wave" | "name" | "flourish" | "sound";

export interface FlairDef {
  id: FlairId;
  kind: FlairKind;
  name: string;
  description: string;
}

export const FLAIRS: Record<FlairId, FlairDef> = {
  shimmer: {
    id: "shimmer",
    kind: "wave",
    name: "Shimmer",
    description: "Your wave burns hot with a slow, breathing pulse.",
  },
  comet: {
    id: "comet",
    kind: "wave",
    name: "Comet",
    description: "Your wave streaks by in bright broken dashes.",
  },
  aurora: {
    id: "aurora",
    kind: "wave",
    name: "Aurora",
    description: "Your wave drifts in soft glowing ribbons, like northern lights.",
  },
  neon: {
    id: "neon",
    kind: "name",
    name: "Neon",
    description: "Your name glows like a lit sign.",
  },
  marquee: {
    id: "marquee",
    kind: "name",
    name: "Marquee",
    description: "Your name runs in tall broadcast capitals.",
  },
  gilded: {
    id: "gilded",
    kind: "name",
    name: "Gilded",
    description: "Your name shines with a golden halo.",
  },
  shockwave: {
    id: "shockwave",
    kind: "flourish",
    name: "Shockwave",
    description: "Win a game and rings of your signal blast across the screen.",
  },
  zero_rain: {
    id: "zero_rain",
    kind: "flourish",
    name: "Zero Rain",
    description: "Win a game and a slow rain of silent zeros falls over the final screen.",
  },
  limelight: {
    id: "limelight",
    kind: "flourish",
    name: "Limelight",
    description: "Win a game and the stage light swings to you.",
  },
  chime: {
    id: "chime",
    kind: "sound",
    name: "Chime",
    description: "Your scoring cards ring out like little bells.",
  },
  pluck: {
    id: "pluck",
    kind: "sound",
    name: "Pluck",
    description: "Your scoring cards snap like a plucked string.",
  },
  brass: {
    id: "brass",
    kind: "sound",
    name: "Brass",
    description: "Your scoring cards blare with a brassy edge.",
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
  | { type: "never_gated" }
  // Win and collect the Subharmonic +4 lift `count` times.
  | { type: "lifted"; count: number }
  // Win with a final margin of at least `min` over the runner-up.
  | { type: "win_margin"; min: number }
  // Win and, on some Refraction/Broadcast turn, score with a pick you changed
  // during the glimpse (initial != final and that turn's delta > 0).
  | { type: "repick_score" }
  // Win and take the Conductor's podium (be a conductor round's winner) at
  // least once.
  | { type: "conducted" }
  // Win and be the sole survivor of a Fadeout round.
  | { type: "last_standing" };

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
    case "lifted":
      return objective.count === 1
        ? "Win the game and catch the Subharmonic lift"
        : `Win the game and catch the Subharmonic lift ${objective.count === 2 ? "twice" : `${objective.count} times`}`;
    case "win_margin":
      return `Win the game by ${objective.min} points or more`;
    case "repick_score":
      return "Win the game and score with a pick you changed during a glimpse";
    case "conducted":
      return "Win the game and take the Conductor's podium at least once";
    case "last_standing":
      return "Win the game and be the last signal standing in a Fadeout round";
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

// Five chapters of three levels: exactly one level per round power, so the
// campaign is a complete tour of the roster with no filler (locked by a
// campaign.test.ts case — adding a 16th power means adding its level).
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
    completionFlair: "zero_rain",
  },
  {
    id: "ch3",
    title: "The Spectrum",
    flavor: "Every color of the wave: the deep lift, the gate, the ultraviolet shift.",
    themeIndex: 2,
    completionFlair: "aurora",
  },
  {
    id: "ch4",
    title: "Distortion",
    flavor: "Information games. Glimpses, open airwaves, and the podium.",
    themeIndex: 3,
    completionFlair: "brass",
  },
  {
    id: "ch5",
    title: "On the Air",
    flavor: "The last stretch. Signals repeat, flip, and fade to one.",
    themeIndex: 4,
    completionFlair: "gilded",
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
    unlocksFlair: "chime",
  },
  {
    id: "1-3",
    chapterId: "ch1",
    title: "Turn It Up",
    flavor: "Everything is doubled. Big rounds win this one, not safe ones.",
    setup: { rounds: 3, roster: ["amplify"], bots: 3 },
    // Tune min in playtesting; ~14 is a strong-but-reachable amplified round.
    // No per-level flair: beating it completes the chapter, which grants comet.
    objective: { type: "round_score", min: 14 },
  },
  {
    id: "2-1",
    chapterId: "ch2",
    title: "Noise Floor",
    flavor: "Zeros drown in the hiss and cancel nothing. Only a clean signal survives.",
    setup: { rounds: 3, roster: ["static"], bots: 3 },
    objective: { type: "untouched" },
    unlocksFlair: "neon",
  },
  {
    id: "2-2",
    chapterId: "ch2",
    title: "The Sponge",
    flavor: "The flat line drinks the sound and keeps it. Time your zero perfectly.",
    setup: { rounds: 3, roster: ["absorption"], bots: 3 },
    objective: { type: "silence" },
    unlocksFlair: "shockwave",
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
    id: "3-1",
    chapterId: "ch3",
    title: "The Low End",
    flavor: "The deep frequency swells, and the smallest card that scores gets paid. Play low on purpose.",
    setup: { rounds: 3, roster: ["subharmonic"], bots: 3 },
    objective: { type: "lifted", count: 2 },
  },
  {
    id: "3-2",
    chapterId: "ch3",
    title: "Past the Gate",
    flavor: "The quietest card that scores is cut every turn. Do not let it be yours.",
    setup: { rounds: 3, roster: ["limiter"], bots: 3 },
    objective: { type: "never_gated" },
    unlocksFlair: "marquee",
  },
  {
    id: "3-3",
    chapterId: "ch3",
    title: "Crowded Channel",
    flavor: "Five signals on one band, and every card plays 2 higher. The spectrum runs hot.",
    setup: { rounds: 3, roster: ["ultraviolet"], bots: 4 },
    // Chapter completion grants aurora.
    objective: { type: "win" },
  },
  {
    id: "4-1",
    chapterId: "ch4",
    title: "Bent Light",
    flavor: "Each turn you glimpse one player's pick, and everyone gets one change. Use yours well.",
    setup: { rounds: 3, roster: ["refraction"], bots: 3 },
    objective: { type: "repick_score" },
  },
  {
    id: "4-2",
    chapterId: "ch4",
    title: "Open Air",
    flavor: "Six signals, and every pick goes out over the air before it counts. No secrets, no mercy.",
    setup: { rounds: 3, roster: ["broadcast"], bots: 5 },
    objective: { type: "win" },
    unlocksFlair: "limelight",
  },
  {
    id: "4-3",
    chapterId: "ch4",
    title: "Take the Podium",
    flavor: "The round's top scorer conducts what comes next. Make sure it's you.",
    setup: { rounds: 3, roster: ["conductor"], bots: 3 },
    // Chapter completion grants eclipse.
    objective: { type: "conducted" },
  },
  {
    id: "5-1",
    chapterId: "ch5",
    title: "Repeat After Me",
    flavor: "Your cards come back every turn. Find the line that works and run it into the ground.",
    setup: { rounds: 3, roster: ["echo"], bots: 3 },
    objective: { type: "win_margin", min: 8 },
  },
  {
    id: "5-2",
    chapterId: "ch5",
    title: "Mirror World",
    flavor: "Every card that scores counts against you. The best plays are the ones that get cancelled.",
    setup: { rounds: 3, roster: ["inversion"], bots: 3 },
    objective: { type: "win" },
    unlocksFlair: "pluck",
  },
  {
    id: "5-3",
    chapterId: "ch5",
    title: "The Final Broadcast",
    flavor: "Six signals in the dark, and every turn the weakest one fades. Outlast them all to sign off.",
    setup: { rounds: 3, roster: ["fadeout"], bots: 5, showHands: false },
    // Campaign finale: completing the chapter grants gilded.
    objective: { type: "last_standing" },
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
