# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development workflow

Solo developer project. Commit directly to `main` — do not create feature branches or PRs unless explicitly asked.

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

Type-check without building: `cd client && npx tsc --noEmit` or `cd server && npx tsc --noEmit`. The server's `npm run build` is just `tsc --noEmit` — there's no JS emit step because the server runs via `tsx` in both dev and production.

### Browser verification (`npm run verify`)

`scripts/verify.mjs` drives the real app headlessly to verify UI changes visually — use it instead of guessing whether a frontend change works. It uses `puppeteer-core` pointed at the **system** Chrome/Edge (no bundled Chromium download); set `CHROME_PATH` if auto-discovery (Windows Program Files / LocalAppData paths) misses it. It reuses the dev server on `:5173` if up, else spawns `npm run dev` and tears it down (taskkill the whole tree on Windows) on exit. Each step screenshots to `scripts/shots/NN-name.png` and prints the paths — **Read those PNGs to inspect the result** (Claude Code renders them visually).

- Run a named flow: `npm run verify <flow>` (default `lobby-rounds`). Flows live in the `flows` map at the bottom of the script; add a new `async function fooFlow(browser)` and register it there.
- Multiplayer flows give each "player" its own `browser.createBrowserContext()` so localStorage + socket are isolated — that's how host/joiner share a room without colliding on the claim token.
- Helpers wait on **state, never fixed sleeps**: `waitForText`, `clickByText`/`clickByAria`, `clickTestId`/`tid` (the preferred path), and `data-testid` hooks (e.g. `lobby-room-code`, `lobby-rounds-value`, `lobby-rounds-chip`, `lobby-rounds-plus`/`-minus`, `home-*`, `game-*`). Host stepper clicks go one at a time, waiting for each re-render, so they don't out-race the server round-trip and re-read a stale value. When adding UI you want to verify, add a stable `data-testid` rather than matching on visible copy that may change.
- **testid convention**: screen-prefixed kebab-case `<screen>-<element>[-<param>]` — prefixes `home-`, `lobby-`, `game-`, `game-end-`, and modal prefixes `power-select-`, `number-select-`, `pool-preview-`, `reveal-`, `round-end-`. Parameterized ids use a **stable** suffix: a card number (`game-hand-card-3`), a power id (`game-pool-card-double`), or a player **seat** index (`game-player-2`, `game-score-1`) — never a uuid or display name. The reusable card/chip components (`NumberCard`, `PowerUpCard`, `PowerUpChip`, `PlayerChip` in `components.tsx`) take an optional `testId` prop the call site supplies, so context-specific ids live at the call site, not baked into the component.

## Architecture

This is a **server-authoritative real-time multiplayer game** that also supports **async play** with the same engine. The same code path runs whether everyone is connected at once or playing across days.

### Flow of control

Clients send intents (`createRoom`, `joinRoom`, `startGame`, `submitTurn`, `unsubmitTurn`, `ackRoundEnd`) via REST or Socket.IO; the server validates against persisted state, mutates via pure state-machine functions, persists, then broadcasts a per-player projection back to every connected socket in the room.

```
client intent → handlers.ts (auth + load) → game/engine.ts (pure mutation)
              → rooms.ts (saveRoom)        → projection.ts (per-player view) → broadcast
```

The state machine in `server/src/game/engine.ts` is intentionally pure: `(roomDoc, intent) → newRoomDoc`. It's the same function regardless of whether players are live or returning hours later. **Don't** add I/O inside engine functions — keep them deterministic.

### Persistence model

Each room's *entire* state lives as a JSON blob in a single `rooms.state` row in SQLite (`server/data/cancel.sqlite`). There are no separate tables for turns or submissions — the engine is fast enough to recompute the projection from the full doc on every read. This means:

- Adding fields to `RoomDoc` requires no migration; just default them defensively when reading old rows. `rooms.ts:loadRoom` is the single chokepoint for those defaults — e.g. it maps the legacy `config.powerUps` boolean onto `config.powerUpMode` (`false → "off"`, else `"random"`) and deletes the stale field. Add new defaults there.
- The DB is purely durable cache for the in-memory state; recomputing from scratch is cheap.
- `players` and `push_subscriptions` are separate tables only because they're queried independently (claim-token lookup, push fan-out).
- **`RoomDoc.rev`** is a monotonic per-room version bumped in `saveRoom` (kept out of the pure engine; carried by the `{ ...room }` spread) and projected onto `RoomStateForPlayer.rev`. `store.ts:setState` drops any projection with an older `rev` for the same room, because a player's state arrives over two unordered channels — the HTTP reply to their own intent *and* the socket broadcast — so a stale one must not clobber newer state. **Keep equal `rev`**: `auth`/`disconnect` presence broadcasts re-emit without saving, so they reuse the last mutation's `rev` and still need to apply.

Identity is via a per-room **claim token** (UUID, in localStorage on the client). The same token reused on reconnect reclaims the seat — survives tab close, browser restart, even days later. This is what makes async play work; treat it as the auth primitive everywhere.

### Per-player projection — the hiding rules

`server/src/projection.ts` is the only place where hidden info is filtered out. When editing it, remember:

- **Hand** is **public** on `Player.hand` (sorted ascending) by default — every player can see what cards each opponent still has, and the picker uses this when targeting Sabotage. `privateState.hand` still exists for the self-view but the same data is mirrored on `publicState.players[*].hand`. **Host can toggle this off** via `config.showHands`: when false, the projection returns an empty `hand` for everyone except the recipient themselves. Sabotage still works — `Game.tsx`'s target-number picker derives the target's remaining cards from `round.reveals` (every play is publicly recorded with the post-override number that left the hand), so the hidden-hands variant just forces the picker to reason from the reveal log instead of a convenience list.
- **Power-up pool** (`publicState.round.poolFull` and `poolRemaining`) is **public** — face-up in-game.
- **Peek context** (`privateState.peekReveal`) is sent only to the peeker; everyone else gets `blockedByOthers: true` while the peeker re-picks.
- **Submitted/not-submitted** is public; *what* was submitted is hidden until reveal. **Sabotage** is also hidden until reveal — the target shows as `submitted: true` with their original choice in `pendingSubmissions` (the override is only applied at `resolveTurn`), so they don't learn they were sabotaged until the cards flip.

The client UI relies on these flags being right — if you accidentally leak an opponent's number into `publicState`, the game breaks.

### State-machine phases (server-side)

`lobby → turn_submitting → (turn_peek_review →) turn_submitting … → round_end → … → game_end`

Three non-obvious flows:

1. **Peek mid-turn** (`turn_peek_review`): when the picker plays Peek, after all submissions arrive, the engine wipes the peeker's submission, stores `peekReview = { peekerId, targetId, revealedNumber, originalNumber }`, and switches phase. Only the peeker can submit during this phase, with a number-only payload (the power-up is reattached server-side). Once they submit, `resolveTurn` runs normally and the reveal records `peekUsed` showing the original-vs-final pick.
2. **Sabotage override** (no phase change): the picker's submission carries `powerUp: "sabotage"`, `powerUpTarget`, and `sabotageNumber` (validated against the target's current hand at submit time). Nothing happens to the target's submission until `resolveTurn`, which swaps in the forced number, records `sabotageUsed` in the reveal, and discards the forced number from the target's hand (their original pick stays available). The target sees no in-flight signal — they only learn at reveal.
3. **Round end** (`round_end`): after the last turn of a round, phase is `round_end` (not auto-advanced). Each player calls `ackRoundEnd`; advance fires only when *all* players have acked. The host has `forceAdvance` for stuck async games. After the final round's acks, transitions to `game_end`.

**Unlock**: while phase is `turn_submitting`, a player who has already submitted may call `unsubmitTurn` to clear their `pendingSubmissions` entry and re-pick. Naturally bounded — once everyone has submitted, the engine immediately calls `resolveTurn` (or transitions to `turn_peek_review`), so there's no opportunity to unlock past that point. The peeker's re-pick during `turn_peek_review` cannot be unlocked.

### Scoring engine — read this before changing rules

`server/src/game/scoring.ts` is a pure function fully covered by tests. Effects apply in a deterministic order; tests in `scoring.test.ts` lock the contract — if you change behavior, update both. Watch for:

- **Tie detection uses face value**, not score value (matters because muting a card changes its face, and Plus Two bumps it).
- **Free Three** contributes a phantom `3` that ties with any other player's `3` — *both* lose. The user themselves is exempt from self-collision.
- **Plus Two** mutates the user's face value at the `eff` stage (`p.number + 2`): scoring, tie detection, and `isCancel` all use the bumped value. So a 0+plus_two is treated as a 2 (no longer cancels) and ties with another player's 2; a 3+plus_two becomes a 5. The picker can still be cancelled by *another* player's true 0.
- **Minus Two** (id `minus_two`) is the **Universal** mirror of Plus Two: it subtracts 2 from *every* player's face value at the `eff` stage (`minusTwoActive`), so scoring, tie detection, and `isCancel` all use the lowered value for everyone (including the picker). A played `2` becomes `0` and now cancels the board; a true `0` becomes `-2` and no longer cancels; faces/scores can go negative. It is no longer a late-pipeline delta subtraction.
- **Free Three** is suppressed by a single-zero cancel (Plus Two is not — its bonus is baked into the face value before scoring).
- **Tie Die** (id `tie_die`) does two things: (1) the user's card still scores even when face-tied with another player (the tie branch pays out `scoreValue` for the power user); (2) if the user's own card is a `0`, that 0 stays *the* canceller even when other players also play `0` — normally multiple 0s suppress each other (`cancelZeros.length === 1` rule), but a shielded 0 sets `cancellerId` to itself, so the other 0s are cancelled by it instead of suppressing it. It does **not** protect the user from being cancelled by *another* player's lone 0 when the user's own card is non-zero.
- **Jinx** (id `jinx`) inverts the tie penalty *for the user only*: instead of being wiped by a face-tie, the user's card pays out `scoreValue` plus `+2` per opponent who matched their number. If the user's card is a `0` and another player also plays `0`, Jinx keeps the user's 0 as a real canceller (same self-canceller trick as Tie Die) while still banking the `+2` per match. It does nothing when nobody ties.
- **Wild** (id `wild`) is resolved in `engine.ts`, not scoring: `rollWildPower` picks a random non-target power (excluding `wild` itself and anything with `needsTarget`, since Wild is submitted without a target) into `resolvedPowerUp`. The reveal records `wild → <rolled>`, pool removal keys off the *submitted* `wild` slot, and `scoreTurn` only ever sees the rolled power. Don't add a `wild` branch to `scoring.ts`.
- **Sabotage** has no scoring effect of its own; the override happens in `engine.resolveTurn` *before* `scoreTurn` is called. Scoring just sees the forced number on the target's play.
- **Switch Cards** / **Random Ray** are *score-only* overrides written in `engine.resolveTurn` (`scoreOverrides`), layered **on top of** sabotage's number override. Switch cards swaps the picker's and target's scored numbers; Random Ray rolls a number from `gameNumbers(room)` for the target. Either way, each affected player still discards **their own original card** from their hand — the override only changes what gets scored and reveal-recorded. Random Ray sets `allowSelfTarget: true` (the picker may target themselves).
- **Swap Hands** runs at the end of `engine.resolveTurn`, *after* played cards are removed, so each player keeps their own played card out of the swapped remainder. The new hands persist for the rest of the round simply by reassignment; subsequent turns play from the swapped arrays.
- **Sacrifice** is the only power that has both no target *and* a non-trivial scoring effect. In `scoring.ts` (last block before `return`): the picker's `delta` is zeroed and every other player's `delta -= picker.number`. The penalty is "damage done" — it lands even if the picker's own card was cancelled or tied out. A `0` sacrifice is a no-op on opponents.
- **Nothingburger** (id `nothingburger`) is an *intentional* true no-op: no flag, no pipeline stage, no engine branch. `scoreTurn` falls through to standard scoring because no effect checks match the id. It exists so the picker can deliberately decline to use a power slot. Don't "fix" it by adding wiring — the absence of code is the feature; the `scoring.test.ts` no-op test locks this.
- **Slide** rotates `lines[]` by one seat; the engine guarantees `plays` arrive sorted by seat, so this is just a circular shift.
- **Equalize** only averages players whose `delta > 0`; tied/cancelled/negative players are untouched.
- Power-ups stack within `scoreTurn` in this order: standard scoring (Plus Two's, Minus Two's, Drain's, and Flip's face shifts already applied at the eff stage) → Tie Die → Jinx → Double → Make Negative → Free Three → Slide → Equalize → Sacrifice. Adding a new power-up means deciding where in this pipeline it lives — or, like Sabotage / Switch Cards / Random Ray / Swap Hands, deciding it's an engine-level rewrite (number override, score override, or hand swap) that runs in `engine.resolveTurn` and bypasses `scoreTurn` entirely.

### Client flow

- `App.tsx` routes by `state.publicState.phase` — there's no router, just phase-driven rendering.
- `Game.tsx` is the main play UI. The reveal overlay (`RevealView`) is **rendered regardless of phase** so the final turn's flip animation shows before the round-end summary; `RoundEnd` is gated on `!revealOverlay` to enforce that ordering. Don't combine those guards.
- The non-picker pool uses `<PowerUpChip>` (small colored chip, symbol only); the picker's pool uses `<PowerUpCard>` (full card with name + tap-for-description). They're explicitly two components — `Pool` switches based on `isPicker`. `PowerUpChip` is tappable on mobile to flash the power's name (desktop relies on the `title` hover tooltip).
- **Power-up modes**: `config.powerUpMode` is `"off" | "random" | "selected"` (plus `config.selectedPowerUps: PowerUpId[]`, the host's allow-list). `startRound` deals `[]` for `"off"`, a random pool for `"random"`, and a random pool drawn *only* from `selectedPowerUps` for `"selected"`. The whole pool section in `Game.tsx`, the round-start `PoolPreview`, and the picker label/badge are all gated on `round.poolFull.length > 0`, so client UI never branches on the mode directly — it just reacts to an empty pool. Without power-ups, picker has no privileged action — keep new picker UI behind the same gate.
- **Targeting flow**: the target-picker block in `Game.tsx` handles all `needsTarget` powers. For Sabotage specifically, after the target is chosen, the same block renders the target's public hand as `<NumberCard size="sm">` buttons so the picker can pick which card to force. The submission then carries `powerUp: "sabotage"`, `powerUpTarget`, and `sabotageNumber`.
- **Locked-in button** swaps to a ghost-styled "tap to unlock" while `phase === "turn_submitting" && privateState.hasSubmittedThisTurn`, calling `api.unsubmitTurn`. Local UI state (selected number/power/target) is preserved across an unlock so the player can tweak and re-submit.
- **Rules overlay**: `<Rules />` in `components.tsx` is a reusable how-to-play modal — power-up section auto-renders from the live `POWER_UPS` map (so any new power added there appears for free), and the section is swapped to a "(off)" note when `includePowerUps={false}` is passed. Rendered from a button in both `Lobby.tsx` and the `Game.tsx` header.
- **Scope prefix chip**: descriptions are always rendered via `<ScopedDescription>` (in `components.tsx`), which parses the leading `(Everyone|Opponents|Just you)` tag off the string and renders it as a colored chip, then the remaining body text. Both the Rules list and `<PowerDescription>` go through it. Keep the prefix in the `POWER_UPS` string (it's the parser's source of truth) — never print `def.description` raw, or the `(tag)` shows as literal text.
- **Lobby power-up control**: host-only `None / Random / Choose` segmented control in `Lobby.tsx` calls `api.setConfig` (`POST /api/rooms/:code/config` → `apiSetRoomConfig` → engine's `setRoomConfig`, which only succeeds while `phase === "lobby"`). Tapping **Choose** seeds `selectedPowerUps` with the full set the first time (so it starts valid) and opens `PowerSelectModal`, a checkbox list of every `POWER_UPS` entry; Peek/Sabotage are shown disabled in 2-player games (`TWO_PLAYER_EXCLUDED_POWERS`, shared between engine and client). Start is blocked when `selected` mode resolves to an empty pool (`startGame` also throws defensively). Non-hosts see the read-only mode via the broadcast-projected `publicState.config`.
- `getIdentity` / `saveIdentity` in `identity.ts` are how the client knows what room/token it has; `App.tsx` auto-rejoins the most recent room on bootstrap **including at `phase === "game_end"`** — a returning player stays connected so the host's "Play again" can pull them back. Leaving a finished game is explicit: the **Leave room** button on `GameEnd` routes through `onAbandoned` (clears identity → Home), and `onRoomAbandoned` does the same when the host abandons.
- **Play again / rematch**: `engine.resetToLobby` is a pure `game_end → lobby` transition that keeps `code`/`hostId`/`config`/`players` (seats + claim tokens) but zeroes `totalScore` and wipes `rounds`/indices/`winnerId`. Host-only intent (`POST /api/rooms/:code/play-again` → `apiPlayAgain`), mirroring `startGame`. Because routing is phase-driven, the broadcast flips every connected client from `GameEnd` to `<Lobby>` for free. Players who hit Leave first linger as offline seats in the recycled lobby — host can kick them there. A cross-game series tally is deliberately *not* tracked; each rematch is a clean slate.
- **Leaving & rejoining mid-game**: `Game.tsx`'s **Leave** routes through `onLeave`, which *keeps* the claim token — not `onAbandoned` — so the game continues for others and the player can return. Both non-hosts and the host get a Leave button; the host's variant (`game-host-leave`) first calls `api.stepDownHost` (engine `stepDownHost`) to pass the role on, *then* `onLeave`. The host still also has the destructive **End game** (`apiAbandonRoom`, host-only). Rejoin works because `Home.tsx:handleJoin` passes `getIdentity(roomCode)?.claimToken`, so `apiJoinRoom` reclaims the seat regardless of phase — the "game already started" error only fires when no token is sent. Don't switch Leave to clear identity or drop the token from the join call — each silently breaks this.
- **Floating host / continuation past absent players**: the host role is not pinned to one person. `stepDownHost(room, leaverId, onlineIds)` (the host Leave button) and `claimHost(room, requesterId, onlineIds)` (a gold **Claim host** button shown in `Lobby`/`Game`/`GameEnd` only when the projected `hostId` player is `online === false`) move `hostId` to the lowest-seat **online** player via the `pickNewHost` helper. `claimHost` is gated on the current host being offline so it can't yank the role from an active host. **Disconnect does NOT auto-reassign** (handlers' `disconnect` stays presence-only) — deliberately, so the role doesn't flap on a refresh. Because the engine waits for *every* seated player each turn, an absent player otherwise wedges the game: `forceResolveTurn` (host **Skip waiting** button, `apiSkipWaiting`, host-only) auto-plays each non-submitter their lowest remaining card with **no** power (an absent picker forfeits the slot; the pool rolls untouched) and handles both `turn_submitting` and a stalled `turn_peek_review`; `forceAdvanceRound` (host **Skip waiting → next round** in the RoundEnd modal) pushes a stuck `round_end`. `removePlayer` now also runs at `round_end`/`game_end` (not just lobby) so an absent player can be dropped at a round boundary where the next `startRound` re-deals cleanly — it still throws mid-turn (use Skip there). See `engine.test.ts` → "mid-game continuation & host succession" and the `host-leave` verify flow.

### Single-player & AI opponents

AIs are ordinary **seated players** flagged `isBot` (no claim token, no `players` row, always
projected `online: true`, never eligible for host via `pickNewHost`). They're created in the lobby by
`setBotCount(room, n)` (engine, lobby-only, clamped to `[0, 8 - humans]`, names drawn from
`server/src/game/bot-names.ts`). Single-player is just a room created with `config.solo: true` and a
few pre-seated bots (`apiCreateRoom` calls `setBotCount`); the client reuses `<Lobby>` (hiding the
room code, showing an **Opponents** stepper) and `<Game>` unchanged — phase routing does the rest.
Multiplayer lobbies get the same stepper labelled **AI players** (`lobby-ai-*` testids → `api.setBotCount`).

The brain lives in **`server/src/game/bots.ts`** — pure, imports only the engine's intents. `driveBots(room)`
loops applying bot moves through the *same* `submitTurn` / `ackRoundEnd` a human uses (so bots are
validated identically), and handlers call it right after the engine mutation in `apiStartGame`,
`apiSubmitTurn`, `apiAckRoundEnd`, `apiForceAdvance`, `apiSkipWaiting` (folded into one save/broadcast).
Bots **pre-submit** the instant a turn opens, so the human always submits last and sees the reveal
immediately — there is intentionally **no move delay**. At `round_end` `driveBots` acks only the bots
and returns, so the human still gets to read the round summary before acking. `decideBotMove`/`choosePower`
are a single "medium" heuristic (value × P(unique) for numbers; per-power scoring for the picker);
**any power id not explicitly cased falls through to a positive default + auto-target**, so a newly
added power never stalls or crashes the bot. Locked by `bots.test.ts` (+ `setBotCount` cases in
`engine.test.ts`) and the `single-player` verify flow.

### Module conventions

- Root `package.json` has `"type": "module"`. **All imports use explicit `.js` extensions** even when sourcing `.ts` (`from "./scoring.js"`). `tsx` rewrites `.js` → `.ts` at runtime; Node's ESM loader otherwise refuses extensionless or `.ts` paths. Don't change this.
- `shared/` has no `package.json` — both server and client import from it via relative paths (`from "../../../shared/types.js"` from server, `from "../../shared/types.js"` from client).
- Workspaces use npm's native workspaces (`@cancel/server`, `@cancel/client`). Run cross-cutting commands with `npm --workspace <name> run <script>`.

### Adding a new power-up

1. Add the id to the `PowerUpId` union and `POWER_UPS` map in `shared/types.ts`. **Every description must start with exactly one scope prefix tag** — `(Everyone)` (affects all players incl. the picker), `(Opponents)` (hits a chosen/other player), `(Just you)` (only the picker's own play/info), or `(Anyone)` (a chosen target that may include the picker themselves, used with `allowSelfTarget: true`). This is a hard convention: no description without a prefix tag. The parser (`parseScopedDescription` in `components.tsx`) and the `SCOPE_CHIP` colour map both enumerate the same four tags, so adding a fifth prefix means updating both. The `Rules` overlay reads from this map, so descriptions you write here are what players see.
2. Wire its scoring effect into `server/src/game/scoring.ts` at the right point in the resolution pipeline; add tests in `scoring.test.ts`. If the effect is structural (rewrites which card a player plays, like Sabotage; rewrites which number they *score* without touching the played card, like Switch Cards / Random Ray; swaps remaining hands, like Swap Hands; or pauses the turn, like Peek), put it in `engine.ts` instead — `scoreTurn` should stay focused on per-card math.
3. Add a `POWER_VISUAL` entry in `client/src/components.tsx` (abbr glyph + tailwind colors). Long names auto-wrap inside the fixed `68×88px` card. Also add the id to `SAFE_POOL` in `engine.test.ts` if the power doesn't require a target — the lifecycle tests draw from that list.
4. If it needs a target (like Mute/Peek/Sabotage/Swap Hands), set `needsTarget: true` and the engine + client target-picker UI handle the rest. If the picker should also be allowed to target themselves (like Random Ray), add `allowSelfTarget: true` as well — the engine rejects self-target for any `needsTarget` power unless this flag is set. If it needs additional input beyond a target (like Sabotage's `sabotageNumber`), add a field to `SubmitTurnReq` / `SubmissionDoc` / `SubmitInput`, validate in `submitTurn`, and extend the target-picker block in `Game.tsx` to gather it. If you want the reveal UI to display a power-specific summary (cf. `peekUsed` / `sabotageUsed` / `swapUsed` / `switchUsed` / `rayUsed` on `RevealedTurn`), add a parallel field on the reveal type and populate it in `engine.resolveTurn`.
5. The pool can be empty by host choice (`config.powerUpMode === "off"`, or a `"selected"` pool that filtered down to nothing). Don't write engine code that assumes the pool is non-empty — the picker is allowed to submit a number-only payload whenever the pool is empty, regardless of whether that's because power-ups are off or just because the round's used them all up. If you add a new power, it joins the `"random"` deal automatically and becomes selectable in the lobby modal for free (both iterate `POWER_UP_IDS`). The bot (`server/src/game/bots.ts`) auto-falls-through any unrecognized power id to a small positive default score (and auto-targets if `needsTarget`), so a brand-new power never crashes or stalls the bot — but for stronger play, add a real case to `choosePower`'s switch and lock it with a `bots.test.ts` case.

### Deployment / keep-alive

`server/src/index.ts:startKeepAlive` self-pings `/api/health` via `RENDER_EXTERNAL_URL` (or `PUBLIC_URL`) every `KEEPALIVE_INTERVAL_MS` (default 10 min) **only while `countActiveGames()` returns > 0**. This keeps Render's free instance from spinning down mid-async-game (its 15 min idle timer would otherwise cause a 50+ second cold start when a player returns). The query checks `json_extract(state, '$.phase') IN ('turn_submitting', 'turn_peek_review', 'round_end')` — lobby-only and finished games don't keep the instance warm. The interval is a no-op locally because no `RENDER_EXTERNAL_URL` is set; `setInterval(...).unref()` so it never blocks shutdown.

### Cache-busting / "new version available" refresh

The client bundles its own copy of `shared/types.ts` at build time, so a stale cached bundle has a stale `POWER_UPS`/`POWER_VISUAL` map. When a new power is deployed, the server starts sending the new id and the old client falls back to rendering **"Unknown power"** (`powerDef`/`powerVisual` in `components.tsx`). The fix makes both a reload and an *open/async tab* recover onto the new bundle.

- **Build id.** `server/src/version.ts` exports `BUILD_ID` = first 12 hex of a sha1 over the built `client/dist/index.html`. It's a **hash, not a timestamp/uptime**, on purpose: it changes exactly when the bundle changes (index.html embeds the content-hashed asset names) but stays constant across plain restarts, so a Render cold start never raises a false "new version" prompt. Falls back to `RENDER_GIT_COMMIT`, then `"dev"`, when there's no built client (dev).
- **Serving (`index.ts` `clientDist` block).** The server injects `<script>window.__BUILD_ID__="…"</script>` into the index.html it serves, so each loaded tab carries a race-free record of the exact build it's running. **Invariant:** the SPA fallback must `res.send` that *injected* string (not `sendFile`) and `express.static` must be `index: false`, or the baseline disappears and the banner silently stops working. Cache headers: `index.html` is `no-cache` (always revalidate the entry point); `/assets/*` is `public, max-age=31536000, immutable` (content-hashed, safe forever).
- **Reporting.** `/api/health` returns `{ ok, buildId }` and the socket `auth` ack includes `buildId` (`handlers.ts`). Shared shapes: `HealthRes` / `SocketAuthRes` in `shared/protocol.ts`.
- **Client (`client/src/version.ts`).** `checkBuildId` compares the baked-in `window.__BUILD_ID__` baseline against the server's reported id and fires a one-shot stale handler on mismatch; `App.tsx` shows the `version-refresh-banner` (a "Refresh" button → `location.reload()`). Checked on the socket auth ack (a redeploy restarts the server, dropping every socket, so the reconnect catches it for foreground tabs) and via `pollHealth()` on `visibilitychange`/`pageshow` (backgrounded and bfcache-restored tabs). **No-op in dev:** Vite serves an un-injected index.html so the baseline is undefined, and the server's `BUILD_ID` is `"dev"`. The `npm run verify` harness runs against the Vite dev server, so the banner can't be exercised there — verify it against a built server (`npm run build` + `npm start`).
