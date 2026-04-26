# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

- Adding fields to `RoomDoc` requires no migration; just default them defensively when reading old rows.
- The DB is purely durable cache for the in-memory state; recomputing from scratch is cheap.
- `players` and `push_subscriptions` are separate tables only because they're queried independently (claim-token lookup, push fan-out).

Identity is via a per-room **claim token** (UUID, in localStorage on the client). The same token reused on reconnect reclaims the seat — survives tab close, browser restart, even days later. This is what makes async play work; treat it as the auth primitive everywhere.

### Per-player projection — the hiding rules

`server/src/projection.ts` is the only place where hidden info is filtered out. When editing it, remember:

- **Hand** is **public** on `Player.hand` (sorted ascending) — every player can see what cards each opponent still has, and the picker uses this when targeting Sabotage. `privateState.hand` still exists for the self-view but the same data is mirrored on `publicState.players[*].hand`.
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
- **Free Three** is suppressed by a single-zero cancel (Plus Two is not — its bonus is baked into the face value before scoring).
- **Sabotage** has no scoring effect of its own; the override happens in `engine.resolveTurn` *before* `scoreTurn` is called. Scoring just sees the forced number on the target's play.
- **Trade** rotates `lines[]` by one seat; the engine guarantees `plays` arrive sorted by seat, so this is just a circular shift.
- **Equalize** only averages players whose `delta > 0`; tied/cancelled/negative players are untouched.
- Power-ups stack within the function in this order: standard scoring (Plus Two's face-bump already applied at the eff stage) → Shield → Double → Make Negative → Steal Two → Free Three → Trade → Equalize. Adding a new power-up means deciding where in this pipeline it lives — or, like Sabotage, deciding it's an engine-level rewrite that bypasses scoring entirely.

### Client flow

- `App.tsx` routes by `state.publicState.phase` — there's no router, just phase-driven rendering.
- `Game.tsx` is the main play UI. The reveal overlay (`RevealView`) is **rendered regardless of phase** so the final turn's flip animation shows before the round-end summary; `RoundEnd` is gated on `!revealOverlay` to enforce that ordering. Don't combine those guards.
- The non-picker pool uses `<PowerUpChip>` (small colored chip, symbol only); the picker's pool uses `<PowerUpCard>` (full card with name + tap-for-description). They're explicitly two components — `Pool` switches based on `isPicker`. `PowerUpChip` is tappable on mobile to flash the power's name (desktop relies on the `title` hover tooltip).
- **Targeting flow**: the target-picker block in `Game.tsx` handles all `needsTarget` powers. For Sabotage specifically, after the target is chosen, the same block renders the target's public hand as `<NumberCard size="sm">` buttons so the picker can pick which card to force. The submission then carries `powerUp: "sabotage"`, `powerUpTarget`, and `sabotageNumber`.
- **Locked-in button** swaps to a ghost-styled "tap to unlock" while `phase === "turn_submitting" && privateState.hasSubmittedThisTurn`, calling `api.unsubmitTurn`. Local UI state (selected number/power/target) is preserved across an unlock so the player can tweak and re-submit.
- `getIdentity` / `saveIdentity` in `identity.ts` are how the client knows what room/token it has; `App.tsx` auto-rejoins the most recent room on bootstrap.

### Module conventions

- Root `package.json` has `"type": "module"`. **All imports use explicit `.js` extensions** even when sourcing `.ts` (`from "./scoring.js"`). `tsx` rewrites `.js` → `.ts` at runtime; Node's ESM loader otherwise refuses extensionless or `.ts` paths. Don't change this.
- `shared/` has no `package.json` — both server and client import from it via relative paths (`from "../../../shared/types.js"` from server, `from "../../shared/types.js"` from client).
- Workspaces use npm's native workspaces (`@cancel/server`, `@cancel/client`). Run cross-cutting commands with `npm --workspace <name> run <script>`.

### Adding a new power-up

1. Add the id to the `PowerUpId` union and `POWER_UPS` map in `shared/types.ts`. Mark `(Universal)` at the start of the description if it affects every player rather than just the picker.
2. Wire its scoring effect into `server/src/game/scoring.ts` at the right point in the resolution pipeline; add tests in `scoring.test.ts`. If the effect is structural (rewrites which card a player plays, like Sabotage; or pauses the turn, like Peek), put it in `engine.ts` instead — `scoreTurn` should stay focused on per-card math.
3. Add a `POWER_VISUAL` entry in `client/src/components.tsx` (abbr glyph + tailwind colors). Long names auto-wrap inside the fixed `68×88px` card. Also add the id to `SAFE_POOL` in `engine.test.ts` if the power doesn't require a target — the lifecycle tests draw from that list.
4. If it needs a target (like Mute/Peek/Sabotage), set `needsTarget: true` and the engine + client target-picker UI handle the rest. If it needs additional input beyond a target (like Sabotage's `sabotageNumber`), add a field to `SubmitTurnReq` / `SubmissionDoc` / `SubmitInput`, validate in `submitTurn`, and extend the target-picker block in `Game.tsx` to gather it.

### Deployment / keep-alive

`server/src/index.ts:startKeepAlive` self-pings `/api/health` via `RENDER_EXTERNAL_URL` (or `PUBLIC_URL`) every `KEEPALIVE_INTERVAL_MS` (default 10 min) **only while `countActiveGames()` returns > 0**. This keeps Render's free instance from spinning down mid-async-game (its 15 min idle timer would otherwise cause a 50+ second cold start when a player returns). The query checks `json_extract(state, '$.phase') IN ('turn_submitting', 'turn_peek_review', 'round_end')` — lobby-only and finished games don't keep the instance warm. The interval is a no-op locally because no `RENDER_EXTERNAL_URL` is set; `setInterval(...).unref()` so it never blocks shutdown.
