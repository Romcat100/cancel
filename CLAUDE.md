# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development workflow

Solo developer project. Commit directly to `main` — do not create feature branches or PRs unless explicitly asked.

Windows machine: for multi-line commit messages use the **PowerShell** tool with a single-quoted here-string (`git commit -m @'` … `'@`), or pipe a bash heredoc through the **Bash** tool (`git commit -F - <<'EOF'`). Don't use PowerShell `@'…'@` syntax inside the Bash tool — bash treats the `@` markers as literal text and they leak into the message.

When a feature or behavior change is complete, before committing check whether the docs still match. Update **CLAUDE.md** if the change touched anything it describes (architecture, a scoring/engine rule, a flow, a convention, a file that's named here) — only if needed, skip it for pure refactors or bug fixes that don't change documented behavior. Update **README.md** too when the change is user-facing or alters setup/run instructions. Stale docs here are worse than none, so keep them honest as part of the same change.

## Copy style

No em-dashes (`—`) in user-facing text — power-up descriptions, rules copy, UI strings, button labels, error messages. Use a period, a comma, or "but"/"and" instead. Em-dashes in code comments and these dev docs are fine.

## Commands

```bash
npm install                    # installs all workspaces (server + client)
npm run dev                    # concurrently runs server :3001 and Vite :5173 (open :5173 in browser)
npm run build                  # builds the client into client/dist; server keeps running TS via tsx
npm start                      # production: serves built client + API from :3001
npm test                       # runs scoring + state-machine vitest suite (server workspace)
```

Single-test runs (workspace-aware):

```bash
cd server && npx vitest run src/game/scoring.test.ts          # one file
cd server && npx vitest run -t "Equalize"                     # by test name pattern
cd server && npm run test:watch                                # watch mode
```

Type-check without building: `cd client && npx tsc --noEmit` or `cd server && npx tsc --noEmit`. The server's `npm run build` is just `tsc --noEmit` — it runs via `tsx` in both dev and production, so there's no JS emit step.

### Cleaning up stray dev servers (Windows)

`npm run dev` / `npm start` (incl. agent background runs) can orphan `node.exe` processes holding the dev ports. Kill them **by port**, never with a blanket `taskkill /IM node.exe` — that also kills VS Code's TypeScript server and extension host.

### Browser verification (`npm run verify`)

`scripts/verify.mjs` drives the real app headlessly to verify UI changes visually — use it instead of guessing whether a frontend change works. It uses `puppeteer-core` against the **system** Chrome/Edge (no bundled Chromium); set `CHROME_PATH` if auto-discovery misses it. Reuses the dev server on `:5173` if up, else spawns `npm run dev` and tears down the whole tree on exit. Each step screenshots to `scripts/shots/NN-name.png` and prints the paths — **Read those PNGs to inspect the result**.

- Run a named flow: `npm run verify <flow>` (default `lobby-rounds`; others: `single-player`, `host-leave`, `interference` — a solo playthrough that screenshots home, the round-power Choose modal, lobby, the round-power preview, the in-game round-power banner, a settled reveal, round results, and game over). Flows live in the `flows` map at the bottom of the script. `shot(page, name, { fullPage })` defaults to full-page; pass `{ fullPage: false }` for `fixed`+`backdrop-filter` modals, and `waitOpaque` before shooting a modal so its `animate-rise` entrance has finished (else the background bleeds through).
- Multiplayer flows give each "player" its own `browser.createBrowserContext()` so localStorage + socket are isolated (host/joiner don't collide on the claim token).
- Helpers wait on **state, never fixed sleeps**: `waitForText`, `clickByText`/`clickByAria`, `clickTestId`/`tid` (preferred), and `data-testid` hooks. Host stepper clicks go one at a time, waiting for each re-render, so they don't out-race the server and re-read stale values.
- **testid convention**: screen-prefixed kebab-case `<screen>-<element>[-<param>]` — prefixes `home-`, `lobby-`, `game-`, `game-end-`, plus modal prefixes (`round-power-select-`, `round-power-preview-`, `number-select-`, `reveal-`, `round-end-`; dormant: `power-select-`, `pool-preview-`). Crosstalk adds `game-neighbor-review` and `reveal-crosstalk`. Parameterized ids use a **stable** suffix — a card number, a power id, or a player **seat** index — never a uuid or display name. The reusable card/chip components (`NumberCard`, `PowerUpCard`, `PowerUpChip`, `PlayerChip` in `components.tsx`) take an optional `testId` prop, so context-specific ids live at the call site. When adding UI you want to verify, add a stable `data-testid`.

## Architecture

A **server-authoritative real-time multiplayer game** that also supports **async play** with the same engine. The same code path runs whether everyone is connected at once or playing across days.

### Flow of control

Clients send intents (`createRoom`, `joinRoom`, `startGame`, `submitTurn`, `unsubmitTurn`, `ackRoundEnd`) via REST or Socket.IO; the server validates against persisted state, mutates via pure state-machine functions, persists, then broadcasts a per-player projection to every connected socket in the room.

```
client intent → handlers.ts (auth + load) → game/engine.ts (pure mutation)
              → rooms.ts (saveRoom)        → projection.ts (per-player view) → broadcast
```

The state machine in `server/src/game/engine.ts` is intentionally pure: `(roomDoc, intent) → newRoomDoc`, same whether players are live or returning hours later. **Don't** add I/O inside engine functions — keep them deterministic.

### Persistence model

Each room's *entire* state is a JSON blob in a single `rooms.state` row in SQLite (`server/data/cancel.sqlite`). No separate tables for turns or submissions — the engine recomputes the projection from the full doc on every read. So:

- Adding fields to `RoomDoc` needs no migration; just default them defensively when reading old rows. `rooms.ts:loadRoom` is the single chokepoint for those defaults (e.g. it maps the legacy `config.powerUps` boolean onto `config.powerUpMode` and deletes the stale field). Add new defaults there.
- `players` and `push_subscriptions` are separate tables only because they're queried independently (claim-token lookup, push fan-out).
- **`RoomDoc.rev`** is a monotonic per-room version bumped in `saveRoom` (kept out of the pure engine; carried by the `{ ...room }` spread) and projected onto `RoomStateForPlayer.rev`. `store.ts:setState` drops any projection with an older `rev` for the same room, because a player's state arrives over two unordered channels — the HTTP reply to their own intent *and* the socket broadcast — so a stale one must not clobber newer state. **Keep equal `rev`**: `auth`/`disconnect` presence broadcasts re-emit without saving, so they reuse the last mutation's `rev` and still need to apply.

Identity is a per-room **claim token** (UUID, in localStorage). Reusing it on reconnect reclaims the seat — survives tab close, browser restart, even days later. This is what makes async play work; treat it as the auth primitive everywhere.

### Per-player projection — the hiding rules

`server/src/projection.ts` is the only place hidden info is filtered out. When editing it:

- **Hand** is **public** on `Player.hand` (sorted ascending) by default — everyone sees each opponent's remaining cards, and the picker uses this for Sabotage targeting. `privateState.hand` mirrors the self-view. **Host can toggle this off** via `config.showHands`: when false, the projection returns an empty `hand` for everyone but the recipient. Sabotage still works — `Game.tsx`'s target-number picker derives the target's cards from `round.reveals` (every play is publicly recorded with its post-override number), so hidden-hands just forces reasoning from the reveal log.
- **Round power** (`round.roundPower`) is **public** — visible to everyone all round by design. The dormant per-turn pool (`round.poolFull` / `poolRemaining`) is also public (always `[]` in new games).
- **Crosstalk neighbor pick** (`privateState.neighborReveal`) is private — each player sees only their one next-seat neighbor's initial pick during `turn_neighbor_review`, never the whole board.
- **Peek context** (`privateState.peekReveal`) goes only to the peeker; everyone else gets `blockedByOthers: true` while they re-pick.
- **Submitted/not-submitted** is public; *what* was submitted is hidden until reveal. **Sabotage** is hidden until reveal too — the target shows `submitted: true` with their original choice in `pendingSubmissions` (override applied only at `resolveTurn`), so they don't learn they were sabotaged until cards flip.

If you leak an opponent's number into `publicState`, the game breaks.

### Round powers vs. the dormant per-turn system

The live power system is **round powers**: `startRound` rolls ONE power (`rollRoundPower`, rng-threaded through `startGame`/`ackRoundEnd`/`forceAdvanceRound`) onto `RoundDoc.roundPower`, applying to **every player on every turn** of that round. `config.powerUpMode` governs it: `off` → no roll, `random` → uniform over `ROUND_POWER_IDS`, `selected` → uniform over `config.selectedRoundPowers` (empty roster rolls nothing — deliberate for legacy saves). `resolveTurn` threads it into `scoreTurn` as the third arg.

The old **per-turn picker system is dormant, not deleted**: `startRound` always deals an empty pool, so `submitTurn`'s picker-must-pick rule self-disables and no power submission is reachable from the live UI. The engine machinery (dealPool, peek/sabotage/switch/ray/swap, pool removal), the client pool/target-picker UI (gated on `poolFull.length > 0`), and their tests all remain and **must keep passing** — tests force pools via `forceSafePool`-style helpers, and legacy mid-round saves still play out through the dormant path. Don't delete it and don't wire new UI to it.

**Crosstalk / Refraction** are the round powers that change turn *flow* (not scoring): when `round.roundPower` is `"crosstalk"` or `"refraction"`, after everyone submits, `submitTurn` snapshots the picks into `room.neighborReview.initialPicks`, computes a per-player peek assignment via `assignPeekTargets` (neighbor = next seat for Crosstalk, random other player for Refraction — random uses `Math.random` like the Wild roll, mock it in tests), clears `pendingSubmissions`, and enters `turn_neighbor_review` instead of resolving. Each player is then shown only their assigned target's initial pick (`projection.ts` → `privateState.neighborReveal`, reading `neighborReview.targets[playerId]`) and re-submits a number-only payload through `submitNeighborReview`; when all have re-picked, `resolveTurn` runs with the final picks and records `reveal.crosstalkUsed` (initial-vs-final per player). `resolveTurn` always stamps `phase: "turn_submitting"` on its non-last-turn result so the review phase doesn't leak through the `...room` spread. Bots keep their initial pick during review (`decideBotNeighborRepick`, keeps the human's glimpse truthful); `forceResolveTurn` fills absentees with their initial pick. **Test determinism:** `ackAll` pins the round-power roll to `() => 0` (pure_tone) so multi-round structural tests never randomly roll a flow-changing power. (The `neighborReview`/`turn_neighbor_review` names predate Refraction and now cover both; it's the shared "glimpse a target and re-pick" flow.)

### State-machine phases (server-side)

`lobby → turn_submitting → (turn_peek_review | turn_neighbor_review →) turn_submitting … → round_end → … → game_end`

Non-obvious flows (1 and 2 are dormant per-turn paths, reachable only from tests/legacy saves; 4 is the live Crosstalk flow):

1. **Peek mid-turn** (`turn_peek_review`): when the picker plays Peek, after all submissions arrive the engine wipes the peeker's submission, stores `peekReview = { peekerId, targetId, revealedNumber, originalNumber }`, and switches phase. Only the peeker may submit during this phase, with a number-only payload (power-up reattached server-side). On submit, `resolveTurn` runs and the reveal records `peekUsed` (original-vs-final pick).
2. **Sabotage override** (no phase change): the picker's submission carries `powerUp: "sabotage"`, `powerUpTarget`, `sabotageNumber` (validated against the target's current hand at submit). The target's submission is untouched until `resolveTurn`, which swaps in the forced number, records `sabotageUsed`, and discards the forced number from the target's hand (their original pick stays available). The target gets no in-flight signal.
3. **Round end** (`round_end`): not auto-advanced. Each player calls `ackRoundEnd`; advance fires only when *all* have acked. Host has `forceAdvance` for stuck async games. After the final round's acks, transitions to `game_end`.
4. **Crosstalk re-pick** (`turn_neighbor_review`): the live round power described above — after all initial submissions, the turn pauses so each player sees their neighbor's pick and re-submits before `resolveTurn`.

**Unlock**: while `turn_submitting`, a player who has already submitted may call `unsubmitTurn` to clear their `pendingSubmissions` entry and re-pick. Naturally bounded — once everyone has submitted the engine immediately resolves (or moves to `turn_peek_review`). The peeker's re-pick during `turn_peek_review` cannot be unlocked.

**Picker rotation** (vestigial in live play now that no per-turn power is picked, but still computed and used by peek/force-resolve paths): each round's per-turn picker order is `round.rotation`, precomputed by `buildRotation` from seat order with `offset = (roundIndex + firstPickerSeat) % playerCount`. `RoomDoc.firstPickerSeat` is rolled randomly in `startGame` (rng-threaded, defaults `Math.random`) so the **first turn of the game lands on a random seat, not always the host**; each later round shifts the starting picker one more seat. Re-rolled every game (incl. rematch via `startGame`). `loadRoom` defaults it to `0` for pre-feature saves (legacy host-first). Tests pin it with `startGame(room, () => 0)` (helper `startGame0` in `engine.test.ts`).

### Scoring engine — read this before changing rules

`server/src/game/scoring.ts` is a pure function fully covered by tests. Effects apply in deterministic order; `scoring.test.ts` locks the contract — change behavior, update both.

**Round powers** — the live roster is `pure_tone, harmony, amplify, static, ultraviolet, crosstalk, refraction`. Most are `scoreTurn`'s third param (see `describe("scoreTurn — round powers")`); Crosstalk and Refraction are turn-flow changes in `engine.ts` (no scoring branch):

- **Pure Tone** (`pure_tone`) is an intentional true no-op — no branch anywhere (the Nothingburger pattern). Don't "fix" it.
- **Harmony** (`harmony`) rewires the plain-tie branch: a face-tied card scores `e.scoreValue * 2` (double its value) instead of `0`. Matching zeros are NOT special-cased (0 doubled is 0, so they fall through the normal multi-zero-suppress branch and score 0). A lone-0 cancel is NOT a tie and is not rescued. **Note-string coupling:** the Harmony survivor note (`"Harmony: tied on N, doubled to M"`) must not start with `"Tied"` or contain the cancel substrings — `revealTreatment` keys off those, and a Harmony tie has `delta > 0` so it must render as a glowing survivor, not a CANCELLED pair.
- **Static** (`static`) ORs into `negateZeroActive` (same math as per-play Negate Zero, distinct note `"Played 0 (Static, no cancel)"`).
- **Ultraviolet** (`ultraviolet`) is a universal **+2** at the eff stage (its own branch in the `bumped` ternary): every face rises 2, so a 0 becomes a non-cancelling 2. Distinct `"Ultraviolet: X → Y"` note; a dormant forced Plus Two / Minus Two preempts it — locked by composition, don't restructure the ternary.
- **Amplify** (`amplify`) is a post-pass at the very END of the pipeline (after Sacrifice), note `"Amplify: doubled"` (distinct from the per-play `"Doubled"`). Doubles every nonzero delta, negatives included.
- **Crosstalk** (`crosstalk`) and **Refraction** (`refraction`) have no scoring effect — they're two-phase turns handled in `engine.ts` (see the state-machine flow below). They share all the machinery; only the peek-target assignment differs (Crosstalk = next seat, Refraction = a random other player).

**Dormant per-turn powers** (per-play `powerUp` on one play; reachable only from tests/legacy saves — behavior still locked by tests):

- **Tie detection uses face value**, not score value (muting changes face; Plus Two bumps it).
- **Free Three** contributes a phantom `3` that ties with any other player's `3` — *both* lose. The user is exempt from self-collision. Suppressed by a single-zero cancel (Plus Two is not — its bonus is baked into face value before scoring).
- **Plus Two** mutates the user's face at the `eff` stage (`p.number + 2`): scoring, tie detection, and `isCancel` all use the bumped value. A 0+plus_two becomes a 2 (no longer cancels, ties another player's 2); a 3 becomes a 5. The picker can still be cancelled by *another* player's true 0.
- **Minus Two** (id `minus_two`) is the **Universal** mirror of Plus Two: subtracts 2 from *every* player's face at the `eff` stage (`minusTwoActive`), used everywhere (incl. the picker). A `2` becomes `0` and cancels; a true `0` becomes `-2` and no longer cancels; faces/scores can go negative. Not a late-pipeline delta.
- **Tie Die** (id `tie_die`): (1) the user's card still scores when face-tied (the tie branch pays `scoreValue`); (2) if the user's card is `0`, it stays *the* canceller even when others also play `0` — normally multiple 0s suppress each other (`cancelZeros.length === 1`), but a shielded 0 sets `cancellerId` to itself. Does **not** protect a non-zero user card from *another* player's lone 0.
- **Jinx** (id `jinx`) inverts the tie penalty *for the user only*: instead of being wiped by a face-tie, the card pays `scoreValue` plus `+2` per opponent who matched. If the user's card is `0` and another also plays `0`, Jinx keeps the user's 0 as a real canceller (same trick as Tie Die) while banking `+2` per match. No effect when nobody ties.
- **Wild** (id `wild`) is resolved in `engine.ts`, not scoring: `rollWildPower` picks a random non-target power (excluding `wild` and anything `needsTarget`) into `resolvedPowerUp`. The reveal records `wild → <rolled>`, pool removal keys off the *submitted* `wild` slot, and `scoreTurn` only sees the rolled power. Don't add a `wild` branch to `scoring.ts`.
- **Sabotage** has no scoring effect of its own; the override happens in `engine.resolveTurn` *before* `scoreTurn`.
- **Switch Cards** / **Random Ray** are *score-only* overrides in `engine.resolveTurn` (`scoreOverrides`), layered **on top of** sabotage's number override. Switch swaps the picker's and target's scored numbers; Random Ray rolls a number from `gameNumbers(room)` for the target. Each affected player still discards **their own original card** — the override only changes what's scored and reveal-recorded. Random Ray sets `allowSelfTarget: true`.
- **Swap Hands** runs at the end of `engine.resolveTurn`, *after* played cards are removed, so each player keeps their played card out of the swapped remainder. New hands persist for the round by reassignment.
- **Sacrifice** is the only power with no target *and* a non-trivial scoring effect (`scoring.ts`, last block): the picker's `delta` is zeroed and every other player's `delta -= picker.number`. The penalty lands only if the picker's card *would have scored* — **nullified when the picker is cancelled by a board 0 (`cancelActive`) or tied out (`pickerTied`)**. The tie check is the picker's *own* face being contested: an uninvolved opponent tie, or multiple zeros suppressing each other (no `cancelActive`), still leaves the picker's card live and the sacrifice lands. A `0` sacrifice is a no-op on opponents (it's its own canceller).
- **Nothingburger** (id `nothingburger`) is an *intentional* true no-op: no flag, no stage, no branch — `scoreTurn` falls through to standard scoring. It lets the picker decline a power slot. Don't "fix" it by adding wiring; the `scoring.test.ts` no-op test locks this.
- **Slide** rotates `lines[]` by one seat (the engine guarantees `plays` sorted by seat, so it's a circular shift).
- **Equalize** only averages players whose `delta > 0`; tied/cancelled/negative players are untouched.
- **Pipeline order** within `scoreTurn`: standard scoring (Plus Two / Minus Two / Ultraviolet / Drain / Flip face shifts already applied at the eff stage) → Tie Die → Jinx → Double → Make Negative → Free Three → Slide → Equalize (per-play) → Sacrifice → **round-power Amplify** (always runs last so it doubles the final per-play result).

### Client flow

**Visual theme — Fable: Interference.** The UI is a deep-indigo "signal" theme: every player is a glowing waveform, a number rank is a wave of increasing frequency (0 is a flat, silent line), and cancellation reads as destructive interference. Fonts are Hanken Grotesk (display) + Spline Sans Mono (numerals/readouts); palette tokens (`ink`/`paper`/`accent`/`cool`/`gold`) live in `tailwind.config.js`. The motif's backbone is `client/src/wave.tsx`: `<Wave>` (one inline-SVG trace; props `rank`/`pathId`, `color`, `variant`, `antiphase`, `animated`), `<WaveDefs>` (the shared path `<defs>`, mounted once in `App.tsx`), and pure helpers `rankForNumber` (number → frequency, 1:1 per magnitude up to 10 so adjacent numbers look distinct; sign is carried by the numeral) and `amplitudePathForScore` (score → amplitude wave). Seat colours are the single source of truth `SEATS` in `components.tsx` (`{bg,text,hex}` × 8, plus the legacy literal `SEAT_COLORS`/`SEAT_TEXT_COLORS` arrays kept for Tailwind's JIT); `hex` drives wave strokes inline. Reusable CSS recipes are in `index.css`: `.cw*` (wave variants), `.pcard` (the glyph-tile power look), `.nwv` (number-card wave well), `.scope` (reveal grid), `.dial` (lobby room-code). **All motion lives behind `@media (prefers-reduced-motion: no-preference)`** so the resting frame is always correct (the verify harness screenshots reduced-motion).
- **Tuning the wave scroll**: paths run 3 viewBox widths wide (`-120..240`); `cw-osc` translates them `-120px` (one viewBox width = a whole number of cycles for every rank, so the loop has no seam). `.cw` is windowed to the `0..120` box by `clip-path: inset(-100% 0 -100% 0)` — a hard horizontal clip that contains the drift while the `-100%` top/bottom insets leave the glow free to bleed vertically (essential for the small in-game player/number waves; a box clip or border-box mask shears their glow flat). For a **soft** feathered side edge, add the `.cw-feather` class (used on the home title): it swaps the clip for a horizontal gradient `mask` (`transparent → #000 var(--cw-fade,12%) → … → transparent`, `mask-repeat: no-repeat` so the drift stays contained). Only use it on tall/prominent waves — the mask clips to the border-box, so on a short wave it would cut the glow. Knobs: `--cw-osc-dur` (default `8s`, one window-width per cycle) for speed; `--cw-fade` (default `8%`, bumped to `22%` on the home hero) for edge softness; flip the `-120px` sign to reverse direction. Keep the translate at exactly `±120px` (or a multiple) or the loop will visibly jump.
- The **reveal** (`RevealView` in `Game.tsx`) draws each card as a wave on a shared axis. `revealTreatment(number, delta, notes)` derives the interference outcome purely from the scored data (never hardcoded seats): tie-cancelled cards pair up in antiphase with a grey `Σ CANCELLED` sum row between them, a card zeroed by a lone Ø collapses to a ghosted+flatline with a Ø marker, and the surviving signal (a positive delta, or the lone Ø) glows. It keys off scoring `notes` strings (`"Tied…"`, `"Cancelled by 0"`, `"cancelled all others"`, `"cancel suppressed"`) so changes to those notes in `scoring.ts` must stay in sync — which is why Harmony's notes deliberately avoid those substrings (a Harmony tie has `delta > 0` and renders as a survivor).
- `App.tsx` routes by `state.publicState.phase` — no router, just phase-driven rendering.
- `Game.tsx` is the main play UI. The reveal overlay (`RevealView`) is **rendered regardless of phase** so the final turn's flip shows before the round-end summary; `RoundEnd` is gated on `!revealOverlay` to enforce ordering. Don't combine those guards.
- **Round-power UI**: the gold `game-round-power` banner (glyph + name, tap toggles `RoundPowerDescription`) sits under the scoreboard in `Game.tsx`, gated on `round.roundPower != null`. `RoundPowerPreview` (testids `round-power-preview-*`) replaces the round-start pool preview via the same `showPreview`/`hasSeenPreviewLocal` machinery; `RevealView` takes a `roundPower` prop and shows a small `reveal-round-power` chip by the turn heading. Components live in `components.tsx`: `ROUND_POWER_VISUAL` + `roundPowerVisual`/`roundPowerDef` (separate maps from the per-turn ones — `equalize` exists in **both** id unions, never cross-index) and `RoundPowerGlyph`/`RoundPowerCard`/`RoundPowerDescription` (siblings of the untouched per-turn components).
- **Round-power modes**: `config.powerUpMode` is `"off" | "random" | "selected"` and now governs the round power (`config.selectedRoundPowers` is the Choose roster; `config.selectedPowerUps` is legacy/dormant). `startRound` always deals an empty pool and rolls `round.roundPower` instead. New round-power UI gates on `round.roundPower != null`.
- **Dormant pool/picker UI**: the pool section, `Pool` (chips vs picker cards), `PoolPreview`, and the target-picker block in `Game.tsx` are all gated on `round.poolFull.length > 0` / `poolRemaining`, which are always empty under the live system — they render only for legacy in-flight saves. Leave them be.
- **Locked-in button** swaps to a ghost "tap to unlock" while `phase === "turn_submitting" && privateState.hasSubmittedThisTurn` (calls `api.unsubmitTurn`). Local selection state is preserved across unlock so the player can tweak and re-submit.
- **Rules overlay**: `<Rules />` in `components.tsx` auto-renders the round-power roster from `ROUND_POWERS` (new powers appear free), highlighting the current one via its `roundPower` prop; swapped to an "(off)" note when `includePowerUps={false}`. The dormant per-turn pool section still renders when a legacy `pool` is non-empty. Rendered from a button in `Lobby.tsx` and the `Game.tsx` header.
- **Scope prefix chip**: descriptions render via `<ScopedDescription>`, which parses a leading `(Everyone|Opponents|Just you|Anyone)` tag into a colored chip then the body. The per-turn `POWER_UPS` strings must keep their prefix (it's the parser's source of truth) — never print `def.description` raw, or the `(tag)` shows as literal text. **Round-power descriptions carry NO tag** (they all apply to everyone, so the chip is redundant); `parseScopedDescription` returns them tag-less and `ScopedDescription` renders them plain.
- **Lobby round-power control**: host-only `None / Random / Choose` segmented control (testids still `lobby-powerup-*`) calls `api.setConfig` (→ engine `setRoomConfig`, lobby-only). **Choose** seeds `selectedRoundPowers` with the full roster the first time and opens `RoundPowerSelectModal` (checkbox list of every `ROUND_POWERS` entry; no 2-player exclusions — round powers are all Everyone-scope). Start is blocked when the selected roster is empty (`startGame` also throws defensively). Non-hosts see the read-only mode via projected `publicState.config`. The old `PowerSelectModal` stays in the file, dormant.
- **Identity / auto-rejoin**: `getIdentity` / `saveIdentity` in `identity.ts`; `App.tsx` auto-rejoins the most recent room on bootstrap **including at `game_end`** so a returning player can be pulled into "Play again". Leaving a finished game is explicit: the **Leave room** button on `GameEnd` routes through `onAbandoned` (clears identity → Home); `onRoomAbandoned` does the same when the host abandons.
- **Play again / rematch**: `engine.resetToLobby` is a pure `game_end → lobby` transition keeping `code`/`hostId`/`config`/`players` (seats + tokens) but zeroing `totalScore` and wiping `rounds`/indices/`winnerId`. Host-only (`apiPlayAgain`), mirroring `startGame`. Phase-driven routing flips every client from `GameEnd` to `<Lobby>` for free. Players who Left first linger as offline seats (host can kick). No cross-game series tally — each rematch is a clean slate.
- **Leaving & rejoining mid-game**: `Game.tsx`'s **Leave** routes through `onLeave`, which *keeps* the claim token (not `onAbandoned`), so the game continues and the player can return. Host's variant (`game-host-leave`) first calls `api.stepDownHost` then `onLeave`. The host also has destructive **End game** (`apiAbandonRoom`). Rejoin works because `Home.tsx:handleJoin` passes the stored claim token, so `apiJoinRoom` reclaims the seat regardless of phase (the "game already started" error only fires when no token is sent). Don't switch Leave to clear identity or drop the token from join — each silently breaks this.
- **Floating host / continuation past absent players**: the host role isn't pinned. `stepDownHost` (host Leave) and `claimHost` (gold **Claim host** button, shown in Lobby/Game/GameEnd only when the projected host is `online === false`) move `hostId` to the lowest-seat **online** player via `pickNewHost`. **Disconnect does NOT auto-reassign** (presence-only) so the role doesn't flap on refresh. Since the engine waits for *every* seated player each turn, an absent player otherwise wedges the game: `forceResolveTurn` (host **Skip waiting**) auto-plays each non-submitter a card sampled from their remaining hand via the shared `chooseNumber` heuristic (`game/heuristics.ts`, also used by the bots) with no power (absent picker forfeits the slot; pool rolls untouched) — sampling rather than always the lowest so multiple absentees don't all play the same card and tie out; it's rng-threaded (default `Math.random`) for deterministic tests, and the `turn_peek_review` branch feeds the peeked number as a known play. Handles `turn_submitting` and a stalled `turn_peek_review`; `forceAdvanceRound` (host **Skip waiting → next round**) pushes a stuck `round_end`. `removePlayer` also runs at `round_end`/`game_end` (not just lobby) so an absent player can be dropped at a round boundary; it still throws mid-turn (use Skip). See `engine.test.ts` → "mid-game continuation & host succession" and the `host-leave` verify flow.

### Single-player & AI opponents

AIs are ordinary **seated players** flagged `isBot` (no claim token, no `players` row, always projected `online: true`, never eligible for host). Created in the lobby by `setBotCount(room, n)` (engine, lobby-only, clamped to `[0, 8 - humans]`, names from `bot-names.ts`). Single-player is just a room with `config.solo: true` and pre-seated bots (`apiCreateRoom` calls `setBotCount`); the client reuses `<Lobby>` (hiding the room code, showing an **Opponents** stepper) and `<Game>` unchanged. Multiplayer lobbies get the same stepper labelled **AI players** (`lobby-ai-*` → `api.setBotCount`).

The brain is **`server/src/game/bots.ts`** — pure, imports engine intents plus the shared number heuristic from `game/heuristics.ts`. `driveBots(room)` applies bot moves through the *same* `submitTurn` / `ackRoundEnd` a human uses, called right after the engine mutation in `apiStartGame`/`apiSubmitTurn`/`apiAckRoundEnd`/`apiForceAdvance`/`apiSkipWaiting` (one save/broadcast). Bots **pre-submit** the instant a turn opens (no move delay), so the human always submits last and sees the reveal immediately. At `round_end` `driveBots` acks only the bots so the human still reads the summary. `decideBotMove`/`choosePower` are a single "medium" heuristic; **any power id not explicitly cased falls through to a positive default + auto-target**, so a new power never stalls or crashes the bot. `chooseNumber` (in `game/heuristics.ts`, shared with the engine's Skip-waiting auto-play) **samples** ∝ `(EV + floor)^GREED` rather than argmax — identical hands otherwise produce identical lockstep picks; `GREED` (1.3) and `PICK_FLOOR` tune greedy↔random, known board numbers collapse to EV 0. Locked by `bots.test.ts` (+ `setBotCount` cases in `engine.test.ts`) and the `single-player` verify flow.

### Module conventions

- Root `package.json` is `"type": "module"`. **All imports use explicit `.js` extensions** even when sourcing `.ts` (`from "./scoring.js"`) — `tsx` rewrites `.js` → `.ts` at runtime; Node's ESM loader refuses extensionless/`.ts` paths. Don't change this.
- `shared/` has no `package.json` — server and client import it via relative paths (`../../../shared/types.js` from server, `../../shared/types.js` from client).
- npm native workspaces (`@cancel/server`, `@cancel/client`). Run cross-cutting commands with `npm --workspace <name> run <script>`.

### Adding a new round power

1. Add the id to the `RoundPowerId` union and `ROUND_POWERS` map in `shared/types.ts`. The description carries **no** scope tag (round powers apply to all) and contains no em-dashes.
2. Wire it in. For a **scoring** effect (`scoring.ts` round-power composition points): OR into an existing flag at the top (the Static pattern), add an eff-stage branch (the Ultraviolet pattern), rewire a branch (the Harmony pattern), or add an end-of-pipeline post-pass (the Amplify pattern). Give its notes distinct strings that don't collide with `revealTreatment`'s substrings, and add `scoring.test.ts` cases incl. a dormancy-composition case. For a **turn-flow** effect (like Crosstalk), it's an `engine.ts` change instead — a new phase + review handler + projection field, not a `scoreTurn` branch.
3. Add a `ROUND_POWER_VISUAL` entry in `client/src/components.tsx` (`{ abbr, color }`, same colour families as the per-turn map).
4. Done — it joins the `"random"` roll, the lobby `RoundPowerSelectModal`, and the Rules roster for free (all iterate `ROUND_POWER_IDS`). Bots need nothing (they only pick numbers), though `chooseNumber` doesn't yet adapt its strategy to the round power (known future work).

### Adding a new per-turn power-up (dormant system — only if reviving it)

1. Add the id to the `PowerUpId` union and `POWER_UPS` map in `shared/types.ts`. **Every description must start with exactly one scope prefix tag** — `(Everyone)`, `(Opponents)`, `(Just you)`, or `(Anyone)` (a target that may include the picker, with `allowSelfTarget: true`). Hard convention: no description without a tag. The parser (`parseScopedDescription`) and the `SCOPE_CHIP` colour map both enumerate the same four tags. The `Rules` overlay reads this map, so what you write is what players see.
2. Wire scoring into `scoring.ts` at the right pipeline point; add `scoring.test.ts` cases. If the effect is structural (rewrites the played card like Sabotage; rewrites the scored number like Switch Cards / Random Ray; swaps hands like Swap Hands; or pauses the turn like Peek), put it in `engine.ts` instead — `scoreTurn` stays per-card math.
3. Add a `POWER_VISUAL` entry in `client/src/components.tsx` — `{ abbr, color }`, where `color` is a single glow hex driving the `--pc` glyph-tile (`.pcard` in `index.css`); group it with its colour family (green = good-for-you, rose = harm, teal = swap/shield, blue = zero/flip structural, violet = wild/random, slate = inert). Long names auto-wrap in the fixed `68×88px` card. If it needs no target, add the id to `SAFE_POOL` in `engine.test.ts` (lifecycle tests draw from it).
4. If it needs a target, set `needsTarget: true` (engine + target-picker UI handle the rest). Add `allowSelfTarget: true` to let the picker target themselves (the engine otherwise rejects self-target). For extra input like Sabotage's `sabotageNumber`, add a field to `SubmitTurnReq` / `SubmissionDoc` / `SubmitInput`, validate in `submitTurn`, and extend the target-picker block. For a power-specific reveal summary (cf. `peekUsed`/`sabotageUsed`/`swapUsed`/`switchUsed`/`rayUsed`), add a field on `RevealedTurn` and populate it in `engine.resolveTurn`.
5. The pool can legitimately be empty (`powerUpMode === "off"`, or a `"selected"` pool filtered to nothing, or just used up) — the picker may always submit a number-only payload. Don't assume a non-empty pool. New powers join the `"random"` deal and the lobby modal for free (both iterate `POWER_UP_IDS`). The bot auto-falls-through unrecognized ids; for stronger play add a real `choosePower` case + `bots.test.ts` lock.

### Deployment / keep-alive

`server/src/index.ts:startKeepAlive` self-pings `/api/health` via `RENDER_EXTERNAL_URL` (or `PUBLIC_URL`) every `KEEPALIVE_INTERVAL_MS` (default 10 min) **only while `countActiveGames() > 0`** (query: `json_extract(state, '$.phase') IN ('turn_submitting', 'turn_peek_review', 'round_end')`). This stops Render's free instance spinning down mid-async-game (its 15 min idle timer otherwise causes a 50+ s cold start). No-op locally (no `RENDER_EXTERNAL_URL`); `.unref()` so it never blocks shutdown.

### Cache-busting / "new version available" refresh

The client bundles its own copy of `shared/types.ts` at build time, so a stale cached bundle has a stale `POWER_UPS`/`POWER_VISUAL` map and renders **"Unknown power"** for a newly deployed id. The fix recovers both a reload and an open/async tab onto the new bundle.

- **Build id** (`server/src/version.ts`): `BUILD_ID` = first 12 hex of a sha1 over the built `client/dist/index.html`. A **hash, not a timestamp** — changes exactly when the bundle changes but stays constant across plain restarts, so a Render cold start never raises a false prompt. Falls back to `RENDER_GIT_COMMIT`, then `"dev"`.
- **Serving** (`index.ts` `clientDist` block): injects `<script>window.__BUILD_ID__="…"</script>` into the served index.html so each tab records its exact build. **Invariant:** the SPA fallback must `res.send` that injected string (not `sendFile`) and `express.static` must be `index: false`, or the baseline disappears and the banner silently stops working. Cache headers: `index.html` `no-cache`; `/assets/*` `public, max-age=31536000, immutable` (content-hashed).
- **Reporting**: `/api/health` returns `{ ok, buildId }` and the socket `auth` ack includes `buildId` (shapes `HealthRes` / `SocketAuthRes` in `shared/protocol.ts`).
- **Client** (`client/src/version.ts`): `checkBuildId` compares the baked-in `window.__BUILD_ID__` against the server's id and fires a one-shot stale handler on mismatch; `App.tsx` shows the `version-refresh-banner` ("Refresh" → `location.reload()`). Checked on the socket auth ack (a redeploy drops every socket, so reconnect catches foreground tabs) and via `pollHealth()` on `visibilitychange`/`pageshow` (backgrounded/bfcache tabs). **No-op in dev** (un-injected index.html, `BUILD_ID === "dev"`); verify against a built server (`npm run build` + `npm start`), not the Vite-backed `npm run verify`.
