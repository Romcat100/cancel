# Future work

Two lists: the **owner's priorities** (product/design direction) and **polish & QA**
noticed while coding the Fable: Interference reskin (commit `beddca3`). Delete items as
they're done.

## Owner's priorities

1. **Reveal screen: mark my own row, not (just) the survivors.** During the reveal it's hard
   to spot which trace is yours. `RevealTraceRow` (in `RevealView`, `Game.tsx`) gives the
   *uncancelled survivors* the cool `.alive` outline (`border-cool/35 bg-cool/[.06]`), which
   reads as "these are the winners," not "this is you." Mark the self row instead — or
   distinctly, e.g. a self outline / "you" marker in the player's seat colour. Survivors
   already glow and show a green `+N`, so the cool border can move to self without losing the
   who-survived signal. Needs threading `selfPlayerId` into `RevealView`/`RevealTraceRow`
   (they currently only get `{id, name, seat}` per player).
2. **One auto-chosen, board-visible power per turn** instead of the rotating picker choosing
   it. Deal/announce a single wave-themed power each turn that applies to everyone and can be
   planned around. This is an engine change (the picker model in `startRound` / picker
   rotation, plus the projection and the pool UI), not a reskin — coordinate with #3.
3. **Explore rule changes that better fit the wave theme.** Lean the mechanics into
   interference (e.g. how/whether powers, amplitude, or frequency interact), pairs with #2.
4. **Rename the game to "Interference" (or similar).** Touches the wordmark in
   `Home.tsx`, the `<title>` + manifest `name`/`short_name` + description, and README. Pairs
   with #6, and with the PWA-asset refresh in polish item 1.
5. **Host two versions on Render** (the classic game + the reskin). The `original-game` tag
   captures the pre-reskin build, so a second deploy off that tag is cheap
   (`git diff original-game..main` shows exactly what differs). Deployment-only; no code
   change to the current app.
6. **Clean up internal comments that name "Fable: Interference"** if the theme name isn't
   kept. It appears in header comments in `wave.tsx`, `index.css`, `tailwind.config.js`,
   `components.tsx`, and the CLAUDE.md visual-theme note. Cosmetic.

7. **Win-screen confetti should be velocity-dynamic, not hovering.** The wave-shard
   confetti currently sits at random positions and just bobs in place (the `floaty`
   keyframe in `index.css` translates ±8px), which reads as awkward hovering. Make it a real
   celebration: ideally a party-popper burst from below the screen — shards fly up and out
   with varied velocity, then arc and fall — or at minimum fall like confetti (the
   pre-reskin `fall` keyframe did this) instead of hovering. Touches the `Confetti` component
   in `components.tsx` (per-piece positions/velocities, seeded once) and the
   `.cf`/`.cfd`/`.cfo` + keyframes in `index.css`. Keep it behind
   `prefers-reduced-motion: no-preference`.

8. **Trim the extra vertical scroll space below the title-screen buttons.** Home scrolls
   past the content, leaving dead space under the menu buttons. Likely the `min-h-screen`
   root + top-aligned content in `Home.tsx` (`min-h-screen flex flex-col … pt-12 pb-8`);
   consider `min-h-[100dvh]`, centering the block, or otherwise sizing it so the page
   doesn't scroll beyond the buttons.

## Polish & QA (noticed during the reskin)

1. **PWA icon, manifest, and favicon still use the old theme.** The home-screen icon, PWA
   splash, and tab favicon still show the old near-black `#0d0c14` / coral `#ff5b3a` "C✕"
   mark in Space Grotesk.
   - `client/public/icon-192.svg` / `icon-512.svg`: rebuild in the Interference look (indigo
     `#12102e` bg, `#eef0fb`/coral, ideally a waveform glyph).
   - `client/public/manifest.webmanifest`: `background_color` + `theme_color` are still
     `#0d0c14` → set to `#12102e` (the `theme-color` meta in `index.html` is already updated).
   - Do this alongside owner item 4 (rename) so the name/mark change together.

2. **Remove em-dashes from user-facing copy** (CLAUDE.md "Copy style" bans them; these are
   pre-existing). Replace with a comma / period / "but"/"and"; code comments are exempt.
   - `components.tsx`: "Cancel — the rules"; "...everyone — each one is gone...".
   - `Game.tsx`: "Skip waiting — auto-play who's left"; "...— pick again now." (peek banner);
     "Locked in — press to unlock"; "Your turn — press to select"; "Ready — waiting for
     others"; "Skip waiting — see the winner" / "Skip waiting — next round". (The `?? "—"`
     picker fallback is borderline.)

3. **Visually verify the states the reskin didn't screenshot.** They inherit the theme via
   the shared atoms but were never shot — eyeball them (or extend `scripts/verify.mjs`):
   target selection (Drain/Sabotage picker + the Sabotage number grid), peek re-pick
   (`turn_peek_review`), hidden-hands mode, empty/"None" pool, the reveal's
   **lone-Ø-survives** case (only tie-cancel and suppressed-zeros came up in verify), the
   Rules overlay + lobby `PowerSelectModal`/`NumberSelectModal`, and error banners.

4. **Real-device / iOS Safari QA.** Everything was verified in headless Chromium. As a PWA,
   check on a real phone (esp. iOS Safari): the `.cw-feather` title mask, modal
   `backdrop-blur`, and the overall glow feel on a small screen.

5. **Animation performance on low-end devices.** Many waves animate at once and each glowing
   one carries a `drop-shadow` filter (repainted, not just composited); game-end with 8
   players + confetti is the worst case. Profile on a mid/low phone; if janky, cap how many
   waves animate, drop the filter on secondary waves, or slow `--cw-osc-dur`.

6. **Soft (feathered) side edges for in-game waves.** They currently have a hard horizontal
   edge (`clip-path`), because feathering a short wave with `.cw-feather` clips its vertical
   glow (border-box mask). Barely noticeable at small sizes; if wanted, give the container
   vertical room for the glow, then add `.cw-feather`. See CLAUDE.md "Tuning the wave scroll".

7. **Reveal polish.** Multi-tie groups (3+ on the same number) emit a grey `Σ CANCELLED` row
   between each consecutive pair — check it doesn't get busy. And `amplitudePathForScore`
   (`wave.tsx`) clamps negative/zero-max totals to a flat line, so a negative total looks
   like zero; consider a below-axis treatment if negatives become common.

8. **Client-side tests.** The suite is server-only; the pure helpers in `wave.tsx`
   (`rankForNumber`, `amplitudePathForScore`) are cheap to unit-test and lock the
   magnitude-bucketing / amplitude-mapping contract.
