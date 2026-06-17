We finished a visual-design exploration for our game **Cancel** and picked a winning direction: **Fable: Interference**. I want to apply this theme to the existing, working game, a visual reskin of the real client, so we end up with a fully playable, wave-themed version of Cancel.

You're starting in **plan mode**: research the design and the codebase first, then propose a plan. Don't write code until I approve it.

## What Cancel is
A server-authoritative real-time + async multiplayer party game. Everyone secretly picks a number card (Ø 1 2 3 4 5); on reveal, matching numbers cancel out (both score zero), a lone Ø cancels everyone, and survivors bank their numbers. One player per turn (the "picker") may also play a power-up. The repo root `CLAUDE.md` documents the architecture, conventions, and dev/test/verify commands.

## The chosen style: Fable: Interference
Cancellation as **destructive interference**, the physics of noise-cancelling: every player is a signal, and identical numbers are identical waves in antiphase that sum to silence. The intent in brief:
- **Palette:** deep indigo void (around `#12102e` to `#1a1748`), soft white text, each player a glowing wave color.
- **Fonts:** Hanken Grotesk (UI) + Spline Sans Mono (numerals/readouts). This replaces the current Space Grotesk + JetBrains Mono.
- **The motif:** every player element carries a glowing waveform (inline SVG sine path in their color). A number choice is a frequency: each rank 0-5 is a wave of increasing frequency inside its card; 0 is a flat line, the silent signal. Cards are minimal dark rounded panels decorated only by their wave.
- **Lobby = tuning** (idle player waves, the room code as a frequency readout). **Turn:** submitted players' waves hold steady, THINKING shows a dotted standby wave.
- **Reveal = the thesis:** players' waves drawn on a shared axis; two matched waves shown in antiphase with their flat grey sum between them, labeled CANCELLED; a card zeroed by the Ø also collapses to flat; the lone surviving Ø is the one signal still faintly glowing (silence as the winning move).
- **End:** score as amplitude, each player's total drawn as a wave whose height tracks their score, the winner's tallest and brightest.
- Soft instrument-glow aesthetics, not console clutter.

## Source of truth (read these first)
- **The demo** (the design encoded as one self-contained static HTML mockup of all five screens): `design-explorations/styles/31-fable-interference.html`. Open it in a browser and flip screens with the bottom-right 1-5 nav, or load it with `?screen=home|lobby|game|reveal|end`.
- **Screenshots of the demo:** `design-explorations/shots/31-fable-interference/{1-home,2-lobby,3-game,4-reveal,5-end}.png`. Read these; where the screenshots and the brief above disagree, the screenshots win.
- **The porting guide (your playbook):** `design-explorations/README.md`, section "Porting a style into the real game." It has the exact recipe (lift tokens → restyle the shared atoms → walk the screens → verify), the target file map, and the determinism nuance. Follow it, substituting Interference for the Aurora Glass 2 worked example.

## Scope
**In scope:** restyle the real client (`client/`) so every screen and state matches the Interference look (see the checklist below), with the game still fully playable and all current behavior intact.

**Out of scope for this pass (later work, do not do now):** forking the project into two variants, renaming the game, adding wave-themed power-ups, any server/gameplay/scoring change, and any deployment/Render change. This pass is purely a visual reskin of the existing game.

## Screens and states to cover
The demo only mocks five archetypal screens, but the deliverable must look good on **every** screen and state of the real game, not just those five. Use `orig_screenshots/` as the checklist of states the current app actually has; every one must be restyled to Interference:
- `1_start_screen.png` — home
- `2_lobby_screen.png` — lobby
- `3_ready_screen.png` — round-start power preview ("this round's powers" plus Let's play)
- `4_game_screen.png` — the turn screen, non-picker view (waiting, your hand, pick a number)
- `5_picker_screen.png` — the turn screen, picker view (your power pool, "your turn, press to select")
- `5_target_screen.png` — choosing a target for a targeted power (e.g. Drain or Sabotage)
- `6_reveal_screen.png` — the reveal
- `7_results_screen.png` — round results between rounds (next round)
- `8_lose_screen.png` — game over, another player wins
- `9_win_screen.png` — game over, you win (celebration)

The demo's five mockups map onto these (its `game` covers the picker/non-picker turn views, its `end` covers both win and lose). For the states the demo doesn't show at all (round-start preview, target selection, round results, the lose end state), extrapolate the Interference look from the demo's visual vocabulary (waveforms, indigo void, instrument glow). Also restyle states not pictured in `orig_screenshots`: empty or "None" power-up pools, hidden-hands mode, the peek re-pick and sabotage flows, the locked-in / tap-to-unlock toggle, absent-player and host controls (claim host, skip waiting, end game), the round-start pool preview, error and empty states, and the Rules overlay.

## Requirements and gotchas
- **It's a reskin, not a rewrite.** Keep all game logic, every phase/state, all user-facing copy, accessibility, and every `data-testid` hook. The demo shows one frozen state per screen; the real screens have many (empty power pools, hidden hands, peek/sabotage flows, absent players, host controls, the unlock/re-pick flow). Don't delete or simplify logic to match a screenshot.
- **Restyle the shared atoms first.** Most of the surface updates by restyling `NumberCard`, `PowerUpCard`, `PowerUpChip`, `PlayerChip`, the `POWER_VISUAL` map, and `SEAT_COLORS` in `client/src/components.tsx`, plus the tokens in `client/tailwind.config.js`, the component classes in `client/src/index.css`, and the font `<link>` in `client/index.html`. Then walk `client/src/screens/{Home,Lobby,Game,GameEnd}.tsx`.
- **Eight player colors, not four.** The game seats up to 8 players (humans plus bots), so `SEAT_COLORS` needs 8 distinct glowing wave colors. The demo only shows four (Ben warm coral, Voltaire ice blue, Mechano gold, Data Dan green). Design a full set of 8 that all read clearly as glowing waveforms on the indigo void and stay distinguishable from each other (and from the cancelled grey), keeping those original four recognizable. Plan this as an explicit deliverable.
- **Animation:** the demo confined motion to `@media (prefers-reduced-motion: no-preference)` so its screenshots are static. In the real game the waves should actually oscillate by default (that's the whole charm), while still respecting reduced-motion.
- **The reveal is the hardest screen and it is data-driven** (`RevealView` inside `client/src/screens/Game.tsx`, fed by `round.reveals`). Express cancellation as destructive interference (matched waves flatlining, the lone Ø surviving and glowing) as real data-driven states, and preserve the existing reveal flip/animation and reveal-summary fields. Don't hardcode the demo's specific four-player outcome.
- **Don't break the hiding rules.** Styling never surfaces hidden info; `server/src/projection.ts` stays the source of truth for what a player can see. This reskin must not touch server logic.
- **Copy style:** no em-dashes in any user-facing text (project rule in `CLAUDE.md`).

## Before changing anything
Tag the current `HEAD` as the pre-redesign baseline so we can easily return to or fork the original game later (suggest a tag name, e.g. `original-game` or `pre-interference`). Include this as the first step of the plan.

## Verification
- Types: `cd client && npx tsc --noEmit`.
- Drive the real app and screenshot every state: `npm run verify` (writes PNGs to `scripts/shots/`; read them). Single-player vs bots is the quickest way to exercise the full flow. Make sure the run exercises every state in the `orig_screenshots/` checklist above (extend the verify flows if needed to reach round results, target selection, the lose screen, etc.).
- Build: `npm run build`.
- Walk the `orig_screenshots/` checklist screen by screen: every state must look intentionally Interference-themed, not just the five demo screens.

## Deliverable
A working, wave-themed Cancel: every screen and state in the `orig_screenshots/` checklist (plus the unpictured states listed above) restyled to Interference, not just the five demo screens; the app fully playable; types and build passing; the original tagged for easy return.

Please research the demo, its screenshots, the porting guide, and the real client, then come back with a plan before implementing.
