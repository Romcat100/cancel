# Cancel — design exploration

This folder is a **visual-design exploration** for the game Cancel. Cancel's original look (the dark `ink`/coral theme in the live client) grew around the gameplay and was never deliberately designed. Before committing to a redesign, we explored a wide range of distinct visual directions as **frontend-only static mockups**, screenshotted them, and reviewed them as a gallery.

The demos here are **not wired to the real game**. They are throwaway-quality static HTML whose only job is to communicate a *look*. The durable value is twofold:

1. **The demos themselves** (`styles/*.html`) are the design encoded as readable code. If someone says "let's go with Aurora Glass 2," the exact palette, type, radii, glass recipe, and cancelled-card treatment are all legible in `styles/51-aurora-glass-2.html` — no image needed.
2. **This README** explains the process and, more importantly, **how to port a chosen style into the real client** (see [Porting a style into the real game](#porting-a-style-into-the-real-game)).

Screenshots and the exported zip are intentionally **git-ignored** (they're large and fully regenerable). The HTML demos, this guide, `SPEC.md`, and `shoot.mjs` are committed.

## What's in here

```
design-explorations/
  README.md      # this file — the durable guide (committed)
  SPEC.md        # the content + determinism contract every demo follows (committed)
  shoot.mjs      # screenshot harness + gallery generator (committed)
  styles/        # NN-slug.html — 52 self-contained demos (committed)
  shots/         # generated PNGs, 5 per style (git-ignored)
  GALLERY.md     # generated review doc with thumbnails (git-ignored)
  index.html     # generated browsable gallery (git-ignored)
```

To see the gallery, regenerate it locally and open `index.html`:

```bash
node design-explorations/shoot.mjs            # reshoot every style + rebuild gallery
node design-explorations/shoot.mjs 51         # reshoot one style (matches the slug substring)
node design-explorations/shoot.mjs --gallery  # rebuild GALLERY.md + index.html from existing shots, no Chrome
node design-explorations/shoot.mjs --list     # list style slugs
```

The harness drives the system Chrome/Edge via `puppeteer-core` (already a dev dependency; set `CHROME_PATH` if auto-discovery misses it). It loads each demo over `file://` at a 420×900 mobile viewport, waits for fonts, and screenshots each of the five screens. It emulates `prefers-reduced-motion: reduce`, so screenshots always capture each demo's **resting** state.

## How a demo is built (the contract)

Every demo obeys `SPEC.md`. The essentials, so you can read any demo fluently:

- **One self-contained file.** Inline `<style>`, one Google Fonts `<link>`, inline SVG/CSS/unicode art only. No build step, no shared assets.
- **Five screens**, each a `<main data-screen="...">` section: `home`, `lobby`, `game`, `reveal`, `end`. They correspond to the real app's Home, Lobby, Game (mid-turn picker view), the reveal overlay, and GameEnd.
- **A tiny switcher script** (byte-identical across all demos): `?screen=game` shows exactly that screen with the nav hidden (used by the harness); `#game` plus a fixed bottom-right nav lets a human flip screens 1-5.
- **Hardcoded, identical content** in every demo (room code `DN2H`; players Ben/Voltaire/Mechano/Data Dan; the `Ø 1 2 3 4 5` hand; a Jinx-power reveal where Ben/Mechano/Data Dan cancel out and Voltaire's lone `Ø` survives; a final scoreboard Ben wins). This makes the 52 styles an apples-to-apples comparison.
- **Determinism:** base CSS is the final resting state; any animation lives only inside `@media (prefers-reduced-motion: no-preference)`, so it's flourish for humans and invisible to the harness.
- **Player identity is consistent:** Ben = warm, Voltaire = cool/blue, Mechano = gold, Data Dan = green, reinterpreted per palette. Keep this when porting.

## How the exploration ran

1. Brainstormed widely, then narrowed to a spread across eras, materials, and moods.
2. Wrote `SPEC.md` and the harness, hand-built one reference style to validate the whole chain.
3. Fanned out one builder per style; each wrote its demo, screenshotted it, and self-reviewed.
4. A review pass read every screenshot and flagged real breakage (mostly cancelled-card treatments that hid the played number); those were fixed and reshot.
5. The team picked **Aurora Glass** (`16`) as the favorite, which spawned a refinement lineage (below).

Numbering is roughly thematic: `00` is the current live app (baseline); `01-32` are bold departures; `33-37` are evolutions of the current look; `38-40` are unthemed "good modern app" designs; `41-51` are the Aurora Glass lineage.

### The Aurora Glass lineage (the front-runners)

- **16 — Aurora Glass**: frosted glassmorphism over an aurora gradient mesh. The team's original pick.
- **41-48**: eight directed variations (Ember, Tokyo, Noir, Neumorph, Liquid, Smoke, Eclipse, Prism), each removing the home-screen orbs, dropping the cotton-candy gradient, and trying a different cancelled-card idea while keeping the glowing `Ø`.
- **49 — Ember Liquid**: the chosen hybrid of Liquid's clear refractive material + Ember's warm firelight palette, then tuned (toned-down glow, stronger star celebration, springy press feedback throughout).
- **50 — Blue Flame Liquid**: Ember Liquid's structural twin, recolored to a cold green→blue→violet flame.
- **51 — Aurora Glass 2**: the original Aurora Glass, refined — home orbs removed, violet nudged toward blue (teal + pink kept), cancelled-card legibility bumped, big four-point star celebration, press feedback added.

`49`, `50`, and `51` are byte-for-byte parallel where they can be, so flipping between them isolates exactly one variable (palette or material).

---

## Porting a style into the real game

When a style is chosen, this is how to translate a demo into the live client. The demos fake everything; the real app has logic, hidden information, accessibility, and test hooks that must be preserved. **Restyle the real components — never replace the real screens with the demo's markup.**

### The target (real client) at a glance

- **Stack:** React + Vite + Tailwind. Routing is phase-driven in `client/src/App.tsx` (no router).
- **Screens:** `client/src/screens/{Home,Lobby,Game,GameEnd}.tsx`. The demo's five screens map to these (the demo's `reveal` is the `RevealView` overlay inside `Game.tsx`, which renders regardless of phase).
- **Reusable atoms:** `client/src/components.tsx` exports `NumberCard`, `PowerUpCard`, `PowerUpChip`, `PlayerChip`, plus `SEAT_COLORS` and the `POWER_VISUAL` map (per-power glyph + colors) and the `Rules` overlay. Restyling these few atoms propagates everywhere.
- **Design tokens:** `client/tailwind.config.js` `theme.extend` holds the palette (`ink #0d0c14`, `paper #f5f1e8`, `accent #ff5b3a`, `cool #5e6ee3`, `gold #e8c25c`), the fonts (`display: "Space Grotesk"`, `mono: "JetBrains Mono"`), and the keyframes/animations (`flip`, `rise`, the `ping-*` set).
- **Component classes:** `client/src/index.css` `@layer components` defines `.btn`, `.btn-primary`, `.btn-ghost`, `.input`, `.chip`, `.card-face`, plus the base `body` background/color and the confetti keyframes.
- **Fonts** are loaded via a `<link>` in `client/index.html`.

### Recipe

1. **Lift the tokens.** Read the chosen demo's `:root` and translate them into `client/tailwind.config.js` `theme.extend.colors` and `fontFamily`, plus the font `<link>` in `client/index.html`. Add the demo's gradient(s), radii, and shadow recipes as Tailwind theme extensions or as utility classes/CSS variables so they're reused, not pasted per element. Update the base `body` styles and the `@layer components` classes in `index.css` to match the demo (e.g. a glass demo's `.btn`/`.card-face` become translucent with a rim + blur).

2. **Restyle the shared atoms first.** Port the demo's number card → `NumberCard`, power card/chip → `PowerUpCard`/`PowerUpChip`, player chip/avatar → `PlayerChip`, and refresh `POWER_VISUAL` (glyph + bg/text per power) and `SEAT_COLORS` to the new palette. Most of the game's surface updates from this step alone. **Keep every existing prop, `data-testid`, and the `size`/variant options** — only the visuals change.

3. **Then each screen, one at a time.** For `Home`, `Lobby`, `Game`, `GameEnd`: match the demo's layout/spacing/hierarchy while keeping the real component's state, conditionals, copy, and `data-testid` hooks intact. The demo shows one frozen state; the real screen has many (empty pools, hidden hands, peek/sabotage flows, absent players, host controls). Don't delete logic to match a screenshot.

4. **Map the cancelled-card / reveal treatment carefully.** In the demo it's static; in the real app it's driven by `round.reveals` data in `RevealView` (inside `Game.tsx`). Reproduce the demo's cancelled look (stripe, frost, eclipse, fog, etc.) and the surviving-`Ø` glow as data-driven states. Preserve the `flip` reveal animation and reveal-summary fields.

5. **Honor the determinism split in reverse.** The demos hid motion behind `prefers-reduced-motion`. The real app should generally animate by default but still respect reduced-motion. Press-feedback (the `:active` transforms in the recent demos) ports directly to `.btn`/cards.

6. **Don't break the hiding rules.** Visual changes must not surface hidden info. Styling lives in the components and CSS; the projection in `server/src/projection.ts` is the source of truth for what a player can see. A restyle never touches server logic.

7. **Verify.** `cd client && npx tsc --noEmit` for types, then `npm run verify` (drives the real app headlessly and screenshots each state to `scripts/shots/` — read those PNGs), and `npm run build` before shipping. Compare the verify screenshots against the chosen demo.

### Worked example — Aurora Glass 2 (`styles/51-aurora-glass-2.html`)

If we go with this one, the concrete starting values (all in the demo's `:root` and component rules):

- **Fonts:** Outfit (display/UI) + Sora (numerals/code) from Google Fonts. _Note: this replaces the current Space Grotesk + JetBrains Mono — update both `tailwind.config.js` and the `index.html` font `<link>`._
- **Background:** `--bg:#0b1026` with a starfield (tiny radial dots) plus six soft aurora blobs in teal `#2dd4bf`, blue `#5f7cfa`, and pink `#ec4899`, fixed to the viewport. (This is the "violet shifted toward blue" version; the original `16` used violet `#8b5cf6`.)
- **Signature gradient:** `linear-gradient(100deg,#2fd9c3,#5f7cfa 52%,#f05aa9)` — used on the wordmark, primary buttons, selected-card borders, the win row, and section accents.
- **Glass surface:** translucent white fill + `1px rgba(255,255,255,.18)` border + `backdrop-filter: blur(14px) saturate(1.4)` + deep drop shadow. Factor this into `.glass` / `.btn` / `.card-face`.
- **Player seat colors:** Ben `#ff7d6e`, Voltaire `#86a0ff`, Mechano `#fcc940`, Data Dan `#3ee6a2` → `SEAT_COLORS`.
- **Number cards:** glass tile; selected = gradient border + lift + glow (`.num.sel`). The `Ø` keeps an outline identity.
- **Cancelled cards (reveal):** frosted card with a diagonal teal→blue→pink strike, numeral at ~88% opacity so it stays readable; the lone surviving `Ø` is the `.flare` card with a conic gradient border and a bright caustic glow (the "glowing zero" the team liked).
- **End celebration:** big four-point CSS stars in white/teal/blue/pink, varied sizes and rotations, twinkling (humans only).
- **Interaction:** springy `:active` press feedback on all buttons/cards via a `cubic-bezier(.34,1.56,.64,1)` transition.

Start by lifting these into the tokens and the four atoms, then walk the four screens. A screenshot of the demo plus this list is enough to brief a fresh agent.
