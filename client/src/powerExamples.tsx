import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { RoundPowerId } from "../../shared/types.js";
import { Wave, rankForNumber } from "./wave.js";
import { NumberCard, RoundPowerGlyph, seatColor } from "./components.js";

// Illustrated examples for the round-power description card: per power, a small
// swipeable carousel of mock-reveal slides drawn with the same Wave grammar as
// the real RevealTraceRow (Game.tsx), so "what's this power" shows the outcome
// in the game's own visual language instead of describing it.
//
// Outcomes below are HAND-VERIFIED against server/src/game/scoring.ts — the
// renderer draws whatever the table says, it does not score anything. If a
// scoring rule changes, re-check the affected power's slides by hand.
//
// Import-cycle note: components.tsx imports this file, and this file imports
// components.tsx back (SEATS via seatColor, NumberCard, RoundPowerGlyph). That
// is safe ONLY because those exports are read inside render functions, after
// both modules have finished evaluating. Never capture them at module scope
// (e.g. baking seatColor(0).hex into ROUND_POWER_EXAMPLES) — that would hit
// the temporal dead zone and crash on load. The table stores seat INDEXES.

type ExOutcome = "survivor" | "aliveZero" | "tie" | "zeroed" | "neutral" | "negative" | "faded";
type ChipTone = "grey" | "rose" | "gold" | "emerald" | "cool";

type ExampleRow = {
  /** Demo seat: 0 Ben (coral), 1 Voltaire (ice blue), 2 Mechano (gold). */
  seat: 0 | 1 | 2;
  /** Played face → numeral + wave rank. Ignored when `hidden`. */
  n: number;
  /** Wave treatment, mirroring revealTreatment's branches in Game.tsx. */
  outcome: ExOutcome;
  /** Right-column readout: "+4" emerald, "-4" rose, "0" grey. Omit on pre-score boards. */
  delta?: string;
  /** Extra outcome chip (TIED/CANCELLED/FADED are derived from `outcome` automatically). */
  chip?: { label: string; tone: ChipTone };
  /** Tie rows: the OTHER tied seats, for dotted antiphase overlays in their colors. */
  tieSeats?: (0 | 1 | 2)[];
  /** Tiny sub-label under the trace, e.g. "0 plays as 2". */
  note?: string;
  /** Flow slides: the pick was changed from `n` to this number. */
  arrowTo?: number;
  /** Flow slides: gold ring, this is the card you glimpsed. */
  glimpsed?: boolean;
  /** Flow slides: a face-down, not-yet-revealed pick. */
  hidden?: boolean;
};

type ExampleSlide =
  | { kind: "reveal"; rows: ExampleRow[]; caption: string }
  | { kind: "hand"; cards: { n: number; mark?: "return" | "spent" }[]; caption: string }
  | { kind: "custom"; render: () => ReactNode; caption: string };

const DEMO_NAMES = ["BEN", "VOLTAIRE", "MECHANO"] as const;

const ROUND_POWER_EXAMPLES: Record<RoundPowerId, ExampleSlide[]> = {
  pure_tone: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 1, n: 3, outcome: "survivor", delta: "+3" },
        { seat: 2, n: 1, outcome: "survivor", delta: "+1" },
      ],
      caption: "Every unique card scores its face value.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 3, outcome: "tie", delta: "0", tieSeats: [1] },
        { seat: 1, n: 3, outcome: "tie", delta: "0", tieSeats: [0] },
        { seat: 2, n: 2, outcome: "survivor", delta: "+2" },
      ],
      caption: "Matching cards wipe each other, so the lone 2 is the only score.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "aliveZero", delta: "0" },
        { seat: 1, n: 4, outcome: "zeroed", delta: "0" },
        { seat: 2, n: 2, outcome: "zeroed", delta: "0" },
      ],
      caption: "A lone 0 silences every other card.",
    },
  ],
  harmony: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 3, outcome: "survivor", delta: "+6", note: "tied, doubled" },
        { seat: 1, n: 3, outcome: "survivor", delta: "+6", note: "tied, doubled" },
        { seat: 2, n: 4, outcome: "survivor", delta: "+4" },
      ],
      caption: "Tied 3s resonate and score 6 each instead of nothing.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "aliveZero", delta: "0" },
        { seat: 1, n: 4, outcome: "zeroed", delta: "0" },
        { seat: 2, n: 2, outcome: "zeroed", delta: "0" },
      ],
      caption: "A lone 0 is not a tie, it still silences the board.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "neutral", delta: "0", note: "suppressed" },
        { seat: 1, n: 0, outcome: "neutral", delta: "0", note: "suppressed" },
        { seat: 2, n: 4, outcome: "survivor", delta: "+4" },
      ],
      caption: "Matching 0s still suppress each other, and 0 doubled is 0.",
    },
  ],
  amplify: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "survivor", delta: "+8", note: "4, doubled" },
        { seat: 1, n: 2, outcome: "survivor", delta: "+4" },
        { seat: 2, n: 1, outcome: "survivor", delta: "+2" },
      ],
      caption: "Every point scored is doubled, so the 4 banks 8.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 3, outcome: "tie", delta: "0", tieSeats: [1] },
        { seat: 1, n: 3, outcome: "tie", delta: "0", tieSeats: [0] },
        { seat: 2, n: 2, outcome: "survivor", delta: "+4", note: "2, doubled" },
      ],
      caption: "Zero doubled is still zero, ties score nothing.",
    },
  ],
  static: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "neutral", delta: "0", note: "no cancel" },
        { seat: 1, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 2, n: 2, outcome: "survivor", delta: "+2" },
      ],
      caption: "The 0 is lost in the noise and cancels nothing.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "tie", delta: "0", tieSeats: [1] },
        { seat: 1, n: 4, outcome: "tie", delta: "0", tieSeats: [0] },
        { seat: 2, n: 0, outcome: "neutral", delta: "0", note: "no cancel" },
      ],
      caption: "Ties still wipe, but nobody has to fear the 0.",
    },
  ],
  ultraviolet: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "survivor", delta: "+2", note: "0 plays as 2" },
        { seat: 1, n: 3, outcome: "survivor", delta: "+5", note: "3 plays as 5" },
        { seat: 2, n: 1, outcome: "survivor", delta: "+3", note: "1 plays as 3" },
      ],
      caption: "Every card plays 2 higher, even the 0 becomes a scoring 2.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "tie", delta: "0", tieSeats: [1], note: "0 plays as 2" },
        { seat: 1, n: 0, outcome: "tie", delta: "0", tieSeats: [0], note: "0 plays as 2" },
        { seat: 2, n: 4, outcome: "survivor", delta: "+6", note: "4 plays as 6" },
      ],
      caption: "Two 0s become two 2s and tie each other out.",
    },
  ],
  refraction: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "neutral", hidden: true },
        { seat: 1, n: 4, outcome: "neutral", glimpsed: true, chip: { label: "GLIMPSED", tone: "gold" } },
        { seat: 2, n: 0, outcome: "neutral", hidden: true },
      ],
      caption: "Each turn you glimpse one random player's pick before the reveal.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "neutral", arrowTo: 2, chip: { label: "CHANGED", tone: "cool" } },
        { seat: 1, n: 4, outcome: "neutral", glimpsed: true },
        { seat: 2, n: 0, outcome: "neutral", hidden: true },
      ],
      caption: "Then everyone gets one chance to change their card.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 2, outcome: "survivor", delta: "+2" },
        { seat: 1, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 2, n: 3, outcome: "survivor", delta: "+3" },
      ],
      caption: "The final picks score, and the dodge turned a tie into points.",
    },
  ],
  limiter: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 1, n: 3, outcome: "survivor", delta: "+3" },
        { seat: 2, n: 1, outcome: "neutral", delta: "0", chip: { label: "GATED", tone: "rose" } },
      ],
      caption: "The lowest card that scored is cut to nothing.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 1, outcome: "tie", delta: "0", tieSeats: [1] },
        { seat: 1, n: 1, outcome: "tie", delta: "0", tieSeats: [0] },
        { seat: 2, n: 3, outcome: "neutral", delta: "0", chip: { label: "GATED", tone: "rose" } },
      ],
      caption: "Tied 1s already score nothing, so the cut climbs to the 3.",
    },
  ],
  absorption: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "aliveZero", delta: "+7", note: "drinks 4+3" },
        { seat: 1, n: 4, outcome: "zeroed", delta: "0" },
        { seat: 2, n: 3, outcome: "zeroed", delta: "0" },
      ],
      caption: "The lone 0 silences the board, then drinks it for +7.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "neutral", delta: "0", note: "suppressed" },
        { seat: 1, n: 0, outcome: "neutral", delta: "0", note: "suppressed" },
        { seat: 2, n: 4, outcome: "survivor", delta: "+4" },
      ],
      caption: "Matching 0s still suppress each other and absorb nothing.",
    },
  ],
  broadcast: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "neutral", chip: { label: "ON AIR", tone: "cool" } },
        { seat: 1, n: 4, outcome: "neutral", chip: { label: "ON AIR", tone: "cool" } },
        { seat: 2, n: 2, outcome: "neutral", chip: { label: "ON AIR", tone: "cool" } },
      ],
      caption: "Everyone locks in, then every pick goes out over the air.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "neutral", arrowTo: 1, chip: { label: "CHANGED", tone: "cool" } },
        { seat: 1, n: 4, outcome: "neutral" },
        { seat: 2, n: 2, outcome: "neutral" },
      ],
      caption: "Everyone gets one chance to change before the cards score.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 1, outcome: "survivor", delta: "+1" },
        { seat: 1, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 2, n: 2, outcome: "survivor", delta: "+2" },
      ],
      caption: "Blinking first saved Ben from the tie but handed Voltaire the 4.",
    },
  ],
  subharmonic: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 1, n: 3, outcome: "survivor", delta: "+3" },
        { seat: 2, n: 1, outcome: "survivor", delta: "+5", chip: { label: "LIFTED", tone: "emerald" } },
      ],
      caption: "The lowest scoring card gains 4, so the 1 banks 5.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 1, outcome: "tie", delta: "0", tieSeats: [1] },
        { seat: 1, n: 1, outcome: "tie", delta: "0", tieSeats: [0] },
        { seat: 2, n: 3, outcome: "survivor", delta: "+7", chip: { label: "LIFTED", tone: "emerald" } },
      ],
      caption: "Tied 1s score nothing, so the lift lands on the 3.",
    },
  ],
  inversion: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "negative", delta: "-4" },
        { seat: 1, n: 2, outcome: "negative", delta: "-2" },
        { seat: 2, n: 1, outcome: "negative", delta: "-1" },
      ],
      caption: "Every card that scores now costs its player points.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 3, outcome: "tie", delta: "0", tieSeats: [1] },
        { seat: 1, n: 3, outcome: "tie", delta: "0", tieSeats: [0] },
        { seat: 2, n: 1, outcome: "negative", delta: "-1" },
      ],
      caption: "A tie scores nothing, suddenly the best result on the board.",
    },
  ],
  echo: [
    {
      kind: "hand",
      cards: [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3, mark: "return" }],
      caption: "Played cards return to your hand for the next turn.",
    },
    {
      kind: "hand",
      cards: [{ n: 0, mark: "spent" }, { n: 1 }, { n: 2 }, { n: 3 }],
      caption: "Silence does not echo, a played 0 is spent for good.",
    },
  ],
  dead_air: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "neutral", delta: "0", note: "suppressed" },
        { seat: 1, n: 0, outcome: "neutral", delta: "0", note: "suppressed" },
        { seat: 2, n: 4, outcome: "survivor", delta: "+4" },
      ],
      caption: "Normally matching 0s suppress each other and the 4 scores.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 0, outcome: "aliveZero", delta: "0" },
        { seat: 1, n: 0, outcome: "aliveZero", delta: "0" },
        { seat: 2, n: 4, outcome: "zeroed", delta: "0" },
      ],
      caption: "Under Dead Air every 0 still silences the board.",
    },
  ],
  fadeout: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 1, n: 3, outcome: "survivor", delta: "+3" },
        { seat: 2, n: 1, outcome: "survivor", delta: "+1", chip: { label: "SIGNAL LOST", tone: "rose" } },
      ],
      caption: "Each turn the lowest scorer fades out of the race.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "survivor", delta: "+4" },
        { seat: 1, n: 1, outcome: "survivor", delta: "+1", chip: { label: "SIGNAL LOST", tone: "rose" } },
        { seat: 2, n: 2, outcome: "faded", delta: "0" },
      ],
      caption: "Faded players play on but score nothing, and the race keeps cutting the lowest.",
    },
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 3, outcome: "survivor", delta: "+3", chip: { label: "LAST SIGNAL", tone: "gold" }, note: "outlast bonus +4" },
        { seat: 1, n: 2, outcome: "faded", delta: "0" },
        { seat: 2, n: 4, outcome: "faded", delta: "0" },
      ],
      caption: "Outlast everyone and bank +2 per faded rival.",
    },
  ],
  conductor: [
    {
      kind: "reveal",
      rows: [
        { seat: 0, n: 4, outcome: "survivor", delta: "+4", chip: { label: "LEADER", tone: "gold" } },
        { seat: 1, n: 3, outcome: "survivor", delta: "+3" },
        { seat: 2, n: 1, outcome: "survivor", delta: "+1" },
      ],
      caption: "Cards score as normal while the podium tracks the round leader.",
    },
    {
      kind: "custom",
      render: () => (
        <div className="flex flex-col items-center gap-2 py-2">
          <span className="font-mono text-[9px] tracking-widest" style={{ color: seatColor(0).hex }}>
            BEN PICKS
          </span>
          <div className="flex items-center gap-2.5">
            <RoundPowerGlyph id="harmony" />
            <span
              className="rounded-lg"
              style={{ boxShadow: "0 0 0 2px rgb(var(--th-gold)), 0 0 14px rgb(var(--th-gold) / 0.5)" }}
            >
              <RoundPowerGlyph id="amplify" />
            </span>
            <RoundPowerGlyph id="static" />
          </div>
        </div>
      ),
      caption: "The round's top scorer picks the next round's power from 3 drawn options.",
    },
  ],
};

const CHIP_TONE: Record<ChipTone, string> = {
  grey: "text-paper/45 border-paper/25",
  rose: "text-rose-300 border-rose-300/40",
  gold: "text-gold border-gold/40",
  emerald: "text-emerald-300 border-emerald-300/40",
  cool: "text-cool border-cool/40",
};

function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  return (
    <span className={`font-mono text-[8px] tracking-widest border rounded px-1.5 py-0.5 ${CHIP_TONE[tone]}`}>
      {label}
    </span>
  );
}

// The gold "this is the card you glimpsed" ring (Refraction/Broadcast steps).
const GLIMPSE_RING: CSSProperties = {
  boxShadow: "0 0 0 2px rgb(var(--th-gold)), 0 0 12px rgb(var(--th-gold) / 0.5)",
};

// One mock scorecard line: name + minicard, the wave trace, the outcome. A
// compressed sibling of Game.tsx's RevealTraceRow — same treatments, no flip
// cascade, no totals.
function ExampleRowView({ row }: { row: ExampleRow }) {
  const hex = seatColor(row.seat).hex;
  const rank = rankForNumber(row.arrowTo ?? row.n);
  const chips: { label: string; tone: ChipTone }[] = [];
  if (row.outcome === "tie") chips.push({ label: "TIED", tone: "grey" });
  if (row.outcome === "zeroed") chips.push({ label: "CANCELLED", tone: "grey" });
  if (row.outcome === "faded") chips.push({ label: "FADED", tone: "grey" });
  if (row.chip) chips.push(row.chip);
  return (
    <div className="grid grid-cols-[52px_1fr_60px] gap-2 items-center py-1">
      <div className="flex flex-col items-start gap-0.5 min-w-0">
        <span className="font-mono text-[8px] tracking-widest truncate max-w-full" style={{ color: hex }}>
          {DEMO_NAMES[row.seat]}
        </span>
        {row.hidden ? (
          <span className="card-face shrink-0 flex-col justify-center items-center w-12 h-16">
            <span className="text-xl text-paper/30">?</span>
          </span>
        ) : (
          <span className="rounded-xl" style={row.glimpsed ? GLIMPSE_RING : undefined}>
            <NumberCard n={row.arrowTo ?? row.n} state="played" size="sm" />
          </span>
        )}
        {row.arrowTo != null && (
          <span className="font-mono text-[8px] text-paper/35 line-through">was {row.n}</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="relative h-8">
          {row.hidden ? (
            <Wave rank={3} variant="think" color={hex} className="absolute inset-0 w-full h-full" style={{ opacity: 0.35 }} />
          ) : row.outcome === "zeroed" ? (
            <>
              <Wave rank={rank} variant="ghosted" color={hex} className="absolute inset-0 w-full h-full" />
              <Wave pathId="cw0" variant="sum" animated={false} className="absolute inset-0 w-full h-full" />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] text-cool bg-ink px-1 rounded [text-shadow:0_0_8px_rgb(var(--th-cool)/0.8)]">
                Ø
              </span>
            </>
          ) : row.outcome === "aliveZero" ? (
            <Wave rank={0} variant="glow" color={hex} className="absolute inset-0 w-full h-full" />
          ) : row.outcome === "tie" ? (
            <>
              {/* Same peak-stagger math as RevealTraceRow: shifts spread evenly
                  around true antiphase, folded non-negative (see Wave's phase). */}
              <Wave rank={rank} variant="ghosted" color={hex} className="absolute inset-0 w-full h-full" />
              {(row.tieSeats ?? []).map((ts, i, arr) => {
                const period = 120 / Math.max(1, rank);
                const raw = ((i - (arr.length - 1) / 2) * period) / (arr.length + 1);
                const phase = ((raw % period) + period) % period;
                return (
                  <Wave
                    key={ts}
                    rank={rank}
                    antiphase
                    variant="dotted"
                    color={seatColor(ts).hex}
                    phase={phase}
                    className="absolute inset-0 w-full h-full"
                  />
                );
              })}
            </>
          ) : row.outcome === "faded" ? (
            <Wave rank={rank} variant="ghosted" color={hex} className="absolute inset-0 w-full h-full" />
          ) : (
            <Wave
              rank={rank}
              variant={row.outcome === "survivor" ? "glow" : "soft"}
              color={hex}
              className="absolute inset-0 w-full h-full"
            />
          )}
        </div>
        {row.note && (
          <span className="font-mono text-[8px] text-paper/40 text-center truncate">{row.note}</span>
        )}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {row.delta == null ? null : row.outcome === "survivor" ? (
          <b className="font-mono text-base text-emerald-300 [text-shadow:0_0_10px_rgba(94,234,160,0.4)]">
            {row.delta}
          </b>
        ) : row.outcome === "aliveZero" && row.delta !== "0" ? (
          // Absorption: the winning Ø that also banks points.
          <b className="font-mono text-base text-emerald-300 [text-shadow:0_0_10px_rgba(94,234,160,0.4)]">
            {row.delta}
          </b>
        ) : row.outcome === "aliveZero" ? (
          <b className="font-mono text-lg text-cool [text-shadow:0_0_14px_rgb(var(--th-cool)/0.6)]">0</b>
        ) : row.outcome === "negative" ? (
          <b className="font-mono text-base text-rose-300">{row.delta}</b>
        ) : (
          <b className="font-mono text-base text-paper/45">{row.delta}</b>
        )}
        {chips.map((c) => (
          <Chip key={c.label} label={c.label} tone={c.tone} />
        ))}
      </div>
    </div>
  );
}

// Echo's hand slides: your cards between turns, with the returned/spent one marked.
function HandSlideView({ cards }: { cards: { n: number; mark?: "return" | "spent" }[] }) {
  return (
    <div className="flex justify-center gap-1.5 py-2">
      {cards.map((c) => (
        <div key={c.n} className="relative flex flex-col items-center gap-0.5">
          <NumberCard n={c.n} state={c.mark === "spent" ? "ghost" : "idle"} size="sm" />
          {c.mark === "return" && (
            <span
              className="absolute -top-1.5 -right-1.5 font-mono text-[11px] rounded-full bg-ink px-1"
              style={{ color: "#4dd6c4", textShadow: "0 0 8px #4dd6c4aa" }}
            >
              ⟲
            </span>
          )}
          {c.mark && (
            <span className={`font-mono text-[8px] tracking-widest ${c.mark === "spent" ? "text-paper/35" : "text-[#4dd6c4]"}`}>
              {c.mark === "return" ? "RETURNS" : "SPENT"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// The examples carousel: scroll-snap tiles + tappable dots, same mechanics as
// GameEnd's Highlights awards scroller (and the shared .awards CSS recipe).
export function RoundPowerExamples({ id }: { id: RoundPowerId }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const slides = ROUND_POWER_EXAMPLES[id];
  if (!slides || slides.length === 0) return null;

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const snapTo = (i: number) => {
    const el = scrollRef.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const onScroll = () => {
    const el = scrollRef.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return;
    const step = first.offsetWidth + 12; // tile width + gap-3
    setActive(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / step))));
  };

  return (
    <div className="mt-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-paper/40 mb-1.5">Examples</div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="awards flex gap-3 overflow-x-auto snap-x snap-mandatory"
        data-testid="round-power-example-scroll"
      >
        {slides.map((slide, i) => (
          <div key={i} className="snap-start shrink-0 w-full" data-testid={`round-power-example-${i}`}>
            <div className="rounded-xl border border-paper/10 scope px-2.5 py-1.5">
              {slide.kind === "reveal" ? (
                slide.rows.map((row, ri) => <ExampleRowView key={ri} row={row} />)
              ) : slide.kind === "hand" ? (
                <HandSlideView cards={slide.cards} />
              ) : (
                slide.render()
              )}
            </div>
            <p className="text-[11px] text-paper/60 leading-snug mt-1.5">{slide.caption}</p>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show example ${i + 1}`}
              data-sfx="tap"
              data-testid={`round-power-example-dot-${i}`}
              onClick={() => snapTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-paper/80" : "w-1.5 bg-paper/25"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
