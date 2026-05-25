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
