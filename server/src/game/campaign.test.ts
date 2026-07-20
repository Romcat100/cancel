import { describe, expect, it } from "vitest";
import { evaluateObjective, type CampaignEvalInput } from "./campaign.js";
import {
  CAMPAIGN_LEVELS,
  campaignLevel,
  earnedFlairs,
  FLAIR_IDS,
  isLevelUnlocked,
  nextLevelId,
  objectiveText,
  type CampaignProgress,
} from "../../../shared/campaign.js";
import { ROUND_POWER_IDS } from "../../../shared/types.js";

// Minimal fixtures: one human (h) vs bots (b1, b2). RoomDoc satisfies the
// structural CampaignEvalInput, so these mirror what the handlers pass in.
function board(opts: {
  human: number;
  bots: number[];
  humanRounds?: number[];
  humanNotes?: string[][];
}): CampaignEvalInput {
  const rounds = (opts.humanRounds ?? [0]).map((score, i) => ({
    perPlayerRoundScore: { h: score },
    reveals: (opts.humanNotes?.[i] ?? []).map((note) => ({
      scoreLines: [{ playerId: "h", delta: 1, notes: [note] }],
    })),
  }));
  return {
    players: [
      { id: "h", totalScore: opts.human },
      ...opts.bots.map((score, i) => ({ id: `b${i}`, totalScore: score, isBot: true })),
    ],
    rounds,
  };
}

const level11 = campaignLevel("1-1")!;
const level12 = campaignLevel("1-2")!;
const level13 = campaignLevel("1-3")!;

describe("evaluateObjective", () => {
  it("win: passes when the human tops the board", () => {
    expect(evaluateObjective(board({ human: 10, bots: [4, 7] }), level11)).toEqual({ passed: true });
  });

  it("win: a tie at the top counts as a win (same rule as series wins)", () => {
    expect(evaluateObjective(board({ human: 10, bots: [10] }), level11).passed).toBe(true);
  });

  it("win: fails when a bot wins, with a detail line", () => {
    const res = evaluateObjective(board({ human: 5, bots: [9] }), level11);
    expect(res.passed).toBe(false);
    expect(res.detail).toBeTruthy();
  });

  it("round_score: passes only when some single round reaches the min", () => {
    const pass = board({ human: 20, bots: [3], humanRounds: [5, 15, 0] });
    expect(evaluateObjective(pass, level13).passed).toBe(true);
    const fail = board({ human: 20, bots: [3], humanRounds: [8, 9, 3] });
    const res = evaluateObjective(fail, level13);
    expect(res.passed).toBe(false);
    expect(res.detail).toContain("9");
  });

  it("round_score: winning is still required", () => {
    const res = evaluateObjective(board({ human: 10, bots: [30], humanRounds: [99] }), level13);
    expect(res.passed).toBe(false);
  });

  it("silence: counts 'cancelled all others' notes on the human's lines", () => {
    const level22 = campaignLevel("2-2")!; // count 1
    const level23 = campaignLevel("2-3")!; // count 2
    const oneSilence = board({
      human: 10,
      bots: [4],
      humanRounds: [10],
      humanNotes: [["Played 0 (cancelled all others)"]],
    });
    expect(evaluateObjective(oneSilence, level22).passed).toBe(true);
    const short = evaluateObjective(oneSilence, level23);
    expect(short.passed).toBe(false);
    expect(short.detail).toContain("once");
    const none = evaluateObjective(board({ human: 10, bots: [4], humanRounds: [10] }), level22);
    expect(none.passed).toBe(false);
  });

  it("untouched: any tie or cancel on the human's lines fails it", () => {
    const level21 = campaignLevel("2-1")!;
    expect(level21.objective.type).toBe("untouched");
    const clean = board({ human: 10, bots: [4], humanRounds: [10], humanNotes: [["Scored 4"]] });
    expect(evaluateObjective(clean, level21).passed).toBe(true);
    const tied = board({ human: 10, bots: [4], humanRounds: [10], humanNotes: [["Tied on 3"]] });
    expect(evaluateObjective(tied, level21).passed).toBe(false);
    const zeroed = board({ human: 10, bots: [4], humanRounds: [10], humanNotes: [["Cancelled by 0"]] });
    expect(evaluateObjective(zeroed, level21).passed).toBe(false);
  });

  it("never_gated: a Gate cut on the human's line fails it", () => {
    const level24 = campaignLevel("3-2")!;
    expect(level24.objective.type).toBe("never_gated");
    const clean = board({ human: 10, bots: [4], humanRounds: [10], humanNotes: [["Scored 4"]] });
    expect(evaluateObjective(clean, level24).passed).toBe(true);
    const cut = board({ human: 10, bots: [4], humanRounds: [10], humanNotes: [["Gate: 1 cut to 0"]] });
    const res = evaluateObjective(cut, level24);
    expect(res.passed).toBe(false);
    expect(res.detail).toContain("once");
  });

  it("lifted: counts Subharmonic lift notes on the human's lines", () => {
    const level31 = campaignLevel("3-1")!; // count 2
    const twice = board({
      human: 10,
      bots: [4],
      humanRounds: [10],
      humanNotes: [["Subharmonic: 1 lifted by 4", "Subharmonic: 2 lifted by 4"]],
    });
    expect(evaluateObjective(twice, level31).passed).toBe(true);
    const once = board({
      human: 10,
      bots: [4],
      humanRounds: [10],
      humanNotes: [["Subharmonic: 1 lifted by 4"]],
    });
    expect(evaluateObjective(once, level31).passed).toBe(false);
  });

  it("win_margin: measures the gap to the runner-up", () => {
    const level32 = campaignLevel("5-1")!; // min 8
    expect(level32.objective.type).toBe("win_margin");
    expect(evaluateObjective(board({ human: 20, bots: [12, 5] }), level32).passed).toBe(true);
    const close = evaluateObjective(board({ human: 20, bots: [15, 5] }), level32);
    expect(close.passed).toBe(false);
    expect(close.detail).toContain("5");
  });

  it("repick_score: needs a changed glimpse pick that scored, on the same turn", () => {
    const level41 = campaignLevel("4-1")!;
    const make = (initial: number, final: number, delta: number): CampaignEvalInput => ({
      players: [
        { id: "h", totalScore: 10 },
        { id: "b0", totalScore: 4, isBot: true },
      ],
      rounds: [
        {
          perPlayerRoundScore: { h: 10 },
          reveals: [
            {
              scoreLines: [{ playerId: "h", delta, notes: [] }],
              crosstalkUsed: [{ playerId: "h", initialNumber: initial, finalNumber: final }],
            },
          ],
        },
      ],
    });
    expect(evaluateObjective(make(2, 4, 4), level41).passed).toBe(true);
    // Kept the initial pick: no repick.
    expect(evaluateObjective(make(4, 4, 4), level41).passed).toBe(false);
    // Changed but the new pick got wiped.
    expect(evaluateObjective(make(2, 4, 0), level41).passed).toBe(false);
  });

  it("conducted: needs the human on a conductor round's podium", () => {
    const level43 = campaignLevel("4-3")!;
    const make = (winnerId: string): CampaignEvalInput => ({
      players: [
        { id: "h", totalScore: 10 },
        { id: "b0", totalScore: 4, isBot: true },
      ],
      rounds: [{ perPlayerRoundScore: { h: 10 }, conductorWinnerId: winnerId, reveals: [] }],
    });
    expect(evaluateObjective(make("h"), level43).passed).toBe(true);
    expect(evaluateObjective(make("b0"), level43).passed).toBe(false);
  });

  it("last_standing: needs the human as a Fadeout round's sole survivor", () => {
    const level52 = campaignLevel("5-3")!;
    expect(level52.objective.type).toBe("last_standing");
    const make = (survivorId?: string): CampaignEvalInput => ({
      players: [
        { id: "h", totalScore: 10 },
        { id: "b0", totalScore: 4, isBot: true },
      ],
      rounds: [
        {
          perPlayerRoundScore: { h: 10 },
          reveals: [{ scoreLines: [], fadeoutSurvivorId: survivorId }],
        },
      ],
    });
    expect(evaluateObjective(make("h"), level52).passed).toBe(true);
    expect(evaluateObjective(make("b0"), level52).passed).toBe(false);
    expect(evaluateObjective(make(undefined), level52).passed).toBe(false);
  });

  it("harmony_double: passes on the exact Harmony survivor note, human's line only", () => {
    const pass = board({
      human: 12,
      bots: [4],
      humanRounds: [12],
      humanNotes: [["Harmony: tied on 3, doubled to 6"]],
    });
    expect(evaluateObjective(pass, level12).passed).toBe(true);
    const fail = board({ human: 12, bots: [4], humanRounds: [12], humanNotes: [["Tied on 3"]] });
    expect(evaluateObjective(fail, level12).passed).toBe(false);
  });
});

describe("level unlock gating", () => {
  const none: CampaignProgress = { completedLevels: {} };
  const did = (...ids: string[]): CampaignProgress => ({
    completedLevels: Object.fromEntries(ids.map((id) => [id, { completedAt: 1 }])),
  });

  it("the first level is always open; later levels need the previous one", () => {
    expect(isLevelUnlocked(none, "1-1")).toBe(true);
    expect(isLevelUnlocked(none, "1-2")).toBe(false);
    expect(isLevelUnlocked(did("1-1"), "1-2")).toBe(true);
    expect(isLevelUnlocked(did("1-1"), "1-3")).toBe(false);
    expect(isLevelUnlocked(none, "no-such-level")).toBe(false);
  });

  it("the chain crosses chapters: 2-1 needs chapter 1's last level", () => {
    expect(isLevelUnlocked(did("1-1", "1-2"), "2-1")).toBe(false);
    expect(isLevelUnlocked(did("1-1", "1-2", "1-3"), "2-1")).toBe(true);
  });

  it("nextLevelId walks the level list in order", () => {
    expect(nextLevelId("1-1")).toBe("1-2");
    expect(nextLevelId(CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1].id)).toBeUndefined();
    expect(nextLevelId("nope")).toBeUndefined();
  });
});

describe("earnedFlairs", () => {
  const did = (...ids: string[]): CampaignProgress => ({
    completedLevels: Object.fromEntries(ids.map((id) => [id, { completedAt: 1 }])),
  });

  it("grants per-level unlocks as levels complete, one from the very first win", () => {
    expect(earnedFlairs(did("1-1"))).toEqual(["shimmer"]);
    expect(earnedFlairs(did("1-1", "1-2"))).toEqual(["shimmer"]);
    // 1-3 pays out its own flair AND completes the chapter.
    expect(earnedFlairs(did("1-1", "1-2", "1-3"))).toEqual(["shimmer", "echo_trace", "comet"]);
  });

  it("chapter completion adds the chapter flair, exactly once", () => {
    const ch1 = ["1-1", "1-2", "1-3"];
    const all = earnedFlairs(did(...ch1));
    expect(all).toContain("shimmer");
    expect(all).toContain("echo_trace");
    expect(all).toContain("comet");
    expect(new Set(all).size).toBe(all.length);
    const both = earnedFlairs(did(...ch1, "2-1", "2-2", "2-3"));
    expect(both).toContain("fuzz");
    expect(both).toContain("neon");
    expect(new Set(both).size).toBe(both.length);
  });

  it("finishing every level earns every flair", () => {
    const everything = earnedFlairs(did(...CAMPAIGN_LEVELS.map((l) => l.id)));
    expect(new Set(everything)).toEqual(new Set(FLAIR_IDS));
  });
});

describe("level definitions", () => {
  it("exactly one level per round power, covering the whole roster", () => {
    const powers = CAMPAIGN_LEVELS.flatMap((l) => l.setup.roster);
    expect(CAMPAIGN_LEVELS.every((l) => l.setup.roster.length === 1)).toBe(true);
    expect(new Set(powers).size).toBe(powers.length);
    expect(new Set(powers)).toEqual(new Set(ROUND_POWER_IDS));
  });

  it("every objective renders a user-facing goal line", () => {
    for (const level of CAMPAIGN_LEVELS) {
      expect(objectiveText(level.objective).length).toBeGreaterThan(0);
    }
  });

  it("no user-facing campaign copy contains an em-dash", () => {
    for (const level of CAMPAIGN_LEVELS) {
      expect(level.title).not.toContain("—");
      expect(level.flavor).not.toContain("—");
      expect(objectiveText(level.objective)).not.toContain("—");
    }
  });
});
