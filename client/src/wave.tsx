import type { CSSProperties } from "react";

// Fable: Interference — the waveform motif.
//
// Every player is a signal; a number rank is a wave of increasing frequency, and
// rank 0 is a flat line (the "silent signal"). `<Wave>` renders one inline SVG
// trace whose stroke + glow track `color` via currentColor. The path geometry
// lives once in `<WaveDefs/>` (mounted at the app root) and is referenced by id.
//
// Determinism: the resting (motionless) frame is always the correct still. Motion
// is opt-in via `animated` (adds `cw-anim`) and only runs under
// `prefers-reduced-motion: no-preference`, so the screenshot harness sees the
// settled wave.

type WaveVariant = "solid" | "glow" | "soft" | "think" | "ghosted" | "sum";

const VARIANT_CLASS: Record<WaveVariant, string> = {
  solid: "",
  glow: "cw-glow",
  soft: "cw-soft",
  think: "cw-think",
  ghosted: "cw-ghosted",
  sum: "cw-sum",
};

export function Wave({
  rank,
  pathId,
  color,
  variant = "solid",
  antiphase = false,
  animated = true,
  className = "",
  style: styleProp,
  title,
}: {
  /** Semantic frequency (0 = flat, higher = denser; see `rankForNumber`). Mutually exclusive with `pathId`. */
  rank?: number;
  /** Explicit path id (e.g. amplitude waves "ca18", or a raw "cw0"). */
  pathId?: string;
  /** Signal color (hex/CSS color). Drives stroke + glow. Ignored for `sum`. */
  color?: string;
  variant?: WaveVariant;
  /** Flip to the antiphase twin (only ranks 2 and 5 have one). */
  antiphase?: boolean;
  /** Oscillate (under no-preference). Default true; pass false for static art. */
  animated?: boolean;
  className?: string;
  /** Extra inline style (e.g. positioning). Merged after the color. */
  style?: CSSProperties;
  /** When set, the wave is treated as meaningful (gets a <title>); else aria-hidden. */
  title?: string;
}) {
  let id = pathId;
  if (!id) {
    const r = rank ?? 0;
    // Every rank >= 1 has an antiphase twin (cwNi); rank 0 is flat (no phase).
    id = antiphase && r >= 1 ? `cw${r}i` : `cw${r}`;
  }
  const cls = ["cw", VARIANT_CLASS[variant], animated ? "cw-anim" : "", className]
    .filter(Boolean)
    .join(" ");
  // The sum line has an intrinsic grey (its "no signal" identity), so ignore color.
  const style: CSSProperties =
    variant === "sum" || !color ? { ...styleProp } : { color, ...styleProp };
  return (
    <svg
      className={cls}
      viewBox="0 0 120 40"
      preserveAspectRatio="none"
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <use href={`#${id}`} />
    </svg>
  );
}

// Waves span 3 viewBox widths (-120..240) while the viewBox window stays 0..120.
// That extra cycle on each side lets a wave scroll a full period (120 units = the
// common period of every rank: 1 cycle at rank 1 … 5 at rank 5) and loop with no
// visible seam, while the window clips a partial cycle at each edge. See `cw-osc`.
const WAVE_START = -120;
const WAVE_END = 240;
const WAVE_CENTER = 20;

// A periodic wave: `halfWidth` = one hump's width (period = 2·halfWidth), and the
// phase is aligned so the 0..120 window matches the original short paths exactly.
// `firstControlY` sets amplitude + starting direction (above center = up first;
// below = the antiphase twin).
function wavePath(halfWidth: number, firstControlY: number): string {
  let d = `M${WAVE_START} ${WAVE_CENTER} Q${WAVE_START + halfWidth / 2} ${firstControlY} ${
    WAVE_START + halfWidth
  } ${WAVE_CENTER}`;
  for (let x = WAVE_START + 2 * halfWidth; x <= WAVE_END + 1e-6; x += halfWidth) {
    d += ` T${x} ${WAVE_CENTER}`;
  }
  return d;
}

// Highest distinct frequency. Numbers run 0..(players+1) ≤ 9 and custom pools
// reach ±10, so 10 distinct ranks cover every card with no two sharing a wave.
const MAX_RANK = 10;

// rank N → hump width 60/N (period 120/N). Each rank N >= 1 also gets an antiphase
// twin `cwNi` (first hump flipped) for the reveal's destructive-interference
// pairing. `cw0` is the flat silent line; ca6/8/11/18 are fixed-width,
// growing-amplitude score waves (rank-1 width).
const WAVE_PATHS: Record<string, string> = {
  cw0: `M${WAVE_START} ${WAVE_CENTER} L${WAVE_END} ${WAVE_CENTER}`,
  ca18: wavePath(60, -16),
  ca11: wavePath(60, -2),
  ca8: wavePath(60, 4),
  ca6: wavePath(60, 8),
};
for (let r = 1; r <= MAX_RANK; r++) {
  WAVE_PATHS[`cw${r}`] = wavePath(60 / r, -4);
  WAVE_PATHS[`cw${r}i`] = wavePath(60 / r, 44);
}

// The shared path geometry. Mounted ONCE near the app root; `<use href="#id">`
// resolves document-globally. Ids are `cw`/`ca`-prefixed to avoid collisions.
export function WaveDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        {Object.entries(WAVE_PATHS).map(([id, d]) => (
          <path key={id} id={id} d={d} fill="none" vectorEffect="non-scaling-stroke" />
        ))}
      </defs>
    </svg>
  );
}

// Number → frequency, 1:1 on magnitude: 0 is flat (silent), then each magnitude
// gets its own increasing frequency (so 1, 2, 3… all look different), capped at
// MAX_RANK. Sign doesn't change frequency — the numeral carries it (2 and -2 match).
export function rankForNumber(n: number): number {
  return Math.min(Math.abs(n), MAX_RANK);
}

// End-screen amplitude ∝ total score, mapped to the four amplitude paths.
export function amplitudePathForScore(score: number, maxScore: number): string {
  if (maxScore <= 0) return "cw0"; // everyone at/below 0 → flat
  const r = Math.max(0, score) / maxScore;
  if (r >= 0.85) return "ca18";
  if (r >= 0.55) return "ca11";
  if (r >= 0.3) return "ca8";
  return "ca6";
}
