import { isMusicMuted } from "./music.js";

type Variant = "tap" | "click" | "confirm" | "ping";

type Recipe = {
  wave: OscillatorType;
  freq: number;
  endFreq?: number;
  gain: number;
  duration: number;
  filterFreq?: number;
  attack?: number;
};

const RECIPES: Record<Variant, Recipe> = {
  tap: { wave: "sine", freq: 294, endFreq: 247, gain: 0.08, duration: 0.09, filterFreq: 1200, attack: 0.008 },
  click: { wave: "triangle", freq: 440, gain: 0.095, duration: 0.05, filterFreq: 1800, attack: 0.004 },
  confirm: { wave: "sine", freq: 330, endFreq: 220, gain: 0.09, duration: 0.2, filterFreq: 700, attack: 0.012 },
  // Marker only — actual ping is rendered as a two-tone sequence in playSfx below.
  ping: { wave: "sine", freq: 988, gain: 0.13, duration: 0.4 },
};

type ToneOpts = {
  startAt: number;
  wave: OscillatorType;
  freq: number;
  endFreq?: number;
  duration: number;
  gain: number;
  filterFreq?: number;
  attack?: number;
};

function playTone(c: AudioContext, opts: ToneOpts) {
  const start = opts.startAt;
  const attack = opts.attack ?? 0.005;
  const osc = c.createOscillator();
  const gainNode = c.createGain();
  if (opts.filterFreq !== undefined) {
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(opts.filterFreq, start);
    filter.Q.setValueAtTime(0.8, start);
    osc.connect(filter);
    filter.connect(gainNode);
  } else {
    osc.connect(gainNode);
  }
  gainNode.connect(c.destination);
  osc.type = opts.wave;
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(opts.endFreq, start + opts.duration);
  }
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(opts.gain, start + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + opts.duration);
  osc.start(start);
  osc.stop(start + opts.duration);
}

let ctx: AudioContext | null = null;
let initialized = false;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

export function playSfx(variant: Variant = "click") {
  if (isMusicMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {});
  }
  const now = c.currentTime;

  if (variant === "ping") {
    // Two-tone descending fifth, brighter and louder than other variants so it
    // cuts through the music. First tone is "hey"; second tone resolves down.
    // Stacked octave on each tone for body without raw amplitude punching.
    playTone(c, { startAt: now,         wave: "sine", freq: 988,  duration: 0.18, gain: 0.13, filterFreq: 3500, attack: 0.003 });
    playTone(c, { startAt: now,         wave: "sine", freq: 1976, duration: 0.18, gain: 0.04, filterFreq: 3500, attack: 0.003 });
    playTone(c, { startAt: now + 0.11,  wave: "sine", freq: 659,  duration: 0.36, gain: 0.13, filterFreq: 3500, attack: 0.003 });
    playTone(c, { startAt: now + 0.11,  wave: "sine", freq: 1319, duration: 0.36, gain: 0.04, filterFreq: 3500, attack: 0.003 });
    return;
  }

  const recipe = RECIPES[variant] ?? RECIPES.click;
  playTone(c, {
    startAt: now,
    wave: recipe.wave,
    freq: recipe.freq,
    endFreq: recipe.endFreq,
    duration: recipe.duration,
    gain: recipe.gain,
    filterFreq: recipe.filterFreq,
    attack: recipe.attack,
  });
}

// ---- Reveal cascade tones ------------------------------------------------
// Each scorecard flapping in during the reveal plays a tone pitched by its
// card's wave rank (rankForNumber, 0..10), mapped onto a minor pentatonic so
// any combination of turns stays musical. When Parker's per-round tracks land,
// retune the whole suite to their key by changing RANK_ROOT_HZ alone.
const RANK_ROOT_HZ = 220; // A3
const PENT_SEMITONES = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]; // two octaves, index = rank

function rankFreq(rank: number): number {
  const i = Math.max(0, Math.min(rank, PENT_SEMITONES.length - 1));
  return RANK_ROOT_HZ * Math.pow(2, PENT_SEMITONES[i] / 12);
}

// Mirrors Game.tsx's revealTreatment union — what happened to one revealed card.
export type RevealOutcome = "survivor" | "aliveZero" | "tie" | "zeroed" | "negative" | "neutral";

// The flip-row animation runs 600ms; the face reads as "landed" near the
// mid-flap, so tones fire this long after each row's animation-delay.
const FLIP_LAND_MS = 280;

// Schedules one tone per reveal row, sample-accurately, using the same
// per-row stagger (stepMs = flipStepMs in RevealView) as the visual cascade.
// Rows arrive in standings order, so every reveal is a different melody.
export function playRevealCascade(rows: { rank: number; outcome: RevealOutcome }[], stepMs: number) {
  if (isMusicMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {});
  }
  const t0 = c.currentTime + FLIP_LAND_MS / 1000;
  rows.forEach((row, i) => {
    const at = t0 + (i * stepMs) / 1000;
    const f = rankFreq(row.rank);
    switch (row.outcome) {
      case "survivor":
        // Clean ring with an octave shimmer on top.
        playTone(c, { startAt: at, wave: "sine", freq: f, duration: 0.5, gain: 0.085, filterFreq: 2600, attack: 0.008 });
        playTone(c, { startAt: at, wave: "sine", freq: f * 2, duration: 0.5, gain: 0.025, filterFreq: 3200, attack: 0.008 });
        break;
      case "aliveZero":
        // The winning silence: a soft power-down glide into the floor. Stays
        // out of true sub range (small speakers distort down there) and keeps
        // the same loudness class as the other rows.
        playTone(c, { startAt: at, wave: "sine", freq: 196, endFreq: 49, duration: 0.55, gain: 0.08, filterFreq: 600, attack: 0.03 });
        break;
      case "tie":
        // Destructive interference: a minor-second clash that beats and dies.
        playTone(c, { startAt: at, wave: "sine", freq: f, duration: 0.4, gain: 0.07, filterFreq: 1800, attack: 0.006 });
        playTone(c, { startAt: at + 0.012, wave: "sine", freq: f * 1.0595, duration: 0.38, gain: 0.07, filterFreq: 1800, attack: 0.006 });
        break;
      case "zeroed":
        // Signal choked off by the Ø: pitch collapses through a closing filter.
        playTone(c, { startAt: at, wave: "sine", freq: f, endFreq: Math.max(40, f * 0.25), duration: 0.22, gain: 0.06, filterFreq: 700, attack: 0.005 });
        break;
      case "negative":
        // Sour droop, down a minor third.
        playTone(c, { startAt: at, wave: "sine", freq: f, endFreq: f * 0.79, duration: 0.35, gain: 0.08, filterFreq: 1200, attack: 0.006 });
        break;
      default:
        // neutral — a suppressed/negated 0 etc.: a dull soft tick.
        playTone(c, { startAt: at, wave: "triangle", freq: f, duration: 0.12, gain: 0.04, filterFreq: 900, attack: 0.005 });
    }
  });
}

// ---- Game-over flourish ----------------------------------------------------
export function playGameEnd(result: "win" | "tie" | "lose") {
  if (isMusicMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume().catch(() => {});
  }
  const now = c.currentTime + 0.05;
  if (result === "win") {
    // Rising quartal run up the pentatonic, last note held with a shimmer.
    const run = [0, 5, 7, 12, 17];
    run.forEach((semi, i) => {
      const f = RANK_ROOT_HZ * Math.pow(2, semi / 12);
      const last = i === run.length - 1;
      const at = now + i * 0.11;
      playTone(c, { startAt: at, wave: "sine", freq: f, duration: last ? 0.9 : 0.3, gain: 0.09, filterFreq: 2800, attack: 0.008 });
      if (last) {
        playTone(c, { startAt: at, wave: "sine", freq: f * 2, duration: 0.9, gain: 0.03, filterFreq: 3400, attack: 0.008 });
      }
    });
  } else if (result === "tie") {
    // Two near-unison tones beating gently and refusing to resolve — a standoff.
    playTone(c, { startAt: now, wave: "sine", freq: 330, duration: 1.0, gain: 0.07, filterFreq: 2000, attack: 0.02 });
    playTone(c, { startAt: now, wave: "sine", freq: 333, duration: 1.0, gain: 0.07, filterFreq: 2000, attack: 0.02 });
  } else {
    // Soft falling resolve, a fifth down.
    playTone(c, { startAt: now, wave: "sine", freq: 330, duration: 0.35, gain: 0.06, filterFreq: 1400, attack: 0.012 });
    playTone(c, { startAt: now + 0.28, wave: "sine", freq: 220, duration: 0.7, gain: 0.06, filterFreq: 1200, attack: 0.012 });
  }
}

function isVariant(v: string | undefined): v is Variant {
  return v === "tap" || v === "click" || v === "confirm" || v === "ping";
}

export function initSfx() {
  if (initialized) return;
  initialized = true;
  // Capture phase so the SFX fires before any React onClick can navigate away,
  // unmount the button, or trigger an async API call that leaves the DOM in a
  // state where bubble-phase listeners would miss the target.
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest<HTMLElement>('button, [role="button"]');
      if (!el) return;
      if (el instanceof HTMLButtonElement && el.disabled) return;
      const raw = el.dataset.sfx;
      if (raw === "none") return;
      const variant: Variant = isVariant(raw) ? raw : "click";
      playSfx(variant);
    },
    true,
  );
}
