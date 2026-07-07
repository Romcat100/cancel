// Per-round visual themes. Each round recolors the UI's theme slots (the page
// background gradient plus the accent/cool/gold families) by writing the --th-*
// CSS variables inline on <html>; everything styled via the Tailwind
// ink/accent/cool/gold tokens or rgb(var(--th-*)) follows automatically.
// Values are space-separated RGB triplets so Tailwind opacity modifiers keep
// working (rgb(var(--x) / <alpha-value>)).
//
// Theme 0 must stay byte-identical to the :root defaults in index.css — it is
// what Home/Lobby (no active round) and round 1 render. Player seat colors are
// pinned to literal hexes in components.tsx and never read these vars.

export interface RoundTheme {
  name: string;
  bg0: string; // background base (the `ink` token)
  bg1: string; // background gradient mid
  bg2: string; // background gradient end
  accent: string; // warm CTA / selection glow (the `accent` token)
  cool: string; // secondary cool glow (the `cool` token)
  gold: string; // highlight / host / round-power (the `gold` token)
}

export const ROUND_THEMES: RoundTheme[] = [
  {
    name: "indigo",
    bg0: "18 16 46", // #12102e
    bg1: "21 18 64", // #151240
    bg2: "26 23 72", // #1a1748
    accent: "255 122 92", // #ff7a5c coral
    cool: "111 168 255", // #6fa8ff ice blue
    gold: "255 209 102", // #ffd166
  },
  {
    name: "tide",
    bg0: "7 31 36", // #071f24 deep teal
    bg1: "10 41 47", // #0a292f
    bg2: "13 49 56", // #0d3138
    accent: "63 224 197", // #3fe0c5 mint
    cool: "122 192 255", // #7ac0ff sky
    gold: "255 223 142", // #ffdf8e sand
  },
  {
    name: "plum",
    bg0: "37 13 51", // #250d33 dark violet
    bg1: "46 18 64", // #2e1240
    bg2: "56 23 76", // #38174c
    accent: "255 110 199", // #ff6ec7 pink
    cool: "169 140 255", // #a98cff lavender
    gold: "255 193 120", // #ffc178 apricot
  },
  {
    name: "ember",
    bg0: "43 13 20", // #2b0d14 dark crimson
    bg1: "54 16 26", // #36101a
    bg2: "63 21 34", // #3f1522
    accent: "255 140 77", // #ff8c4d orange
    cool: "140 166 255", // #8ca6ff dusty blue
    gold: "255 207 125", // #ffcf7d
  },
  {
    name: "moss",
    bg0: "10 32 24", // #0a2018 dark forest
    bg1: "13 42 32", // #0d2a20
    bg2: "17 53 40", // #113528
    accent: "168 224 95", // #a8e05f lime
    cool: "102 217 194", // #66d9c2 aqua
    gold: "255 217 122", // #ffd97a
  },
];

const THEME_VARS: Record<keyof Omit<RoundTheme, "name">, string> = {
  bg0: "--th-bg0",
  bg1: "--th-bg1",
  bg2: "--th-bg2",
  accent: "--th-accent",
  cool: "--th-cool",
  gold: "--th-gold",
};

// null (no active round: Home/Lobby, or after leaving a room) clears the inline
// overrides so the :root defaults (theme 0) show through.
export function applyRoundTheme(roundIndex: number | null) {
  const root = document.documentElement;
  if (roundIndex == null) {
    for (const cssVar of Object.values(THEME_VARS)) root.style.removeProperty(cssVar);
    return;
  }
  const theme = ROUND_THEMES[roundIndex % ROUND_THEMES.length];
  for (const [key, cssVar] of Object.entries(THEME_VARS) as [keyof Omit<RoundTheme, "name">, string][]) {
    root.style.setProperty(cssVar, theme[key]);
  }
}
