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

Clients send intents (`createRoom`, `joinRoom`, `startGame`, `submitTurn`, `ackRoundEnd`) via REST or Socket.IO; the server validates against persisted state, mutates via pure state-machine functions, persists, then broadcasts a per-player projection back to every connected socket in the room.

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

- **Hand** (`privateState.hand`) is only sent to its owner.
- **Power-up pool** (`publicState.round.poolFull` and `poolRemaining`) is **public** — face-up in-game.
- **Peek context** (`privateState.peekReveal`) is sent only to the peeker; everyone else gets `blockedByOthers: true` while the peeker re-picks.
- **Submitted/not-submitted** is public; *what* was submitted is hidden until reveal.

The client UI relies on these flags being right — if you accidentally leak an opponent's number into `publicState`, the game breaks.

### State-machine phases (server-side)

`lobby → turn_submitting → (turn_peek_review →) turn_submitting … → round_end → … → game_end`

Two non-obvious flows:

1. **Peek mid-turn** (`turn_peek_review`): when the picker plays Peek, after all submissions arrive, the engine wipes the peeker's submission, stores `peekReview = { peekerId, targetId, revealedNumber, originalNumber }`, and switches phase. Only the peeker can submit during this phase, with a number-only payload (the power-up is reattached server-side). Once they submit, `resolveTurn` runs normally and the reveal records `peekUsed` showing the original-vs-final pick.
2. **Round end** (`round_end`): after the last turn of a round, phase is `round_end` (not auto-advanced). Each player calls `ackRoundEnd`; advance fires only when *all* players have acked. The host has `forceAdvance` for stuck async games. After the final round's acks, transitions to `game_end`.

### Scoring engine — read this before changing rules

`server/src/game/scoring.ts` is a pure function fully covered by tests. Effects apply in a deterministic order; tests in `scoring.test.ts` lock the contract — if you change behavior, update both. Watch for:

- **Tie detection uses face value**, not score value (matters because muting a card changes its face).
- **Free Three** contributes a phantom `3` that ties with any other player's `3` — *both* lose. The user themselves is exempt from self-collision.
- **Plus Two / Free Three** are suppressed by a single-zero cancel.
- **Trade** rotates `lines[]` by one seat; the engine guarantees `plays` arrive sorted by seat, so this is just a circular shift.
- **Equalize** only averages players whose `delta > 0`; tied/cancelled/negative players are untouched.
- Power-ups stack within the function in this order: standard scoring → Shield → Double → Make Negative → Steal Two → Plus Two → Free Three → Trade → Equalize. Adding a new power-up means deciding where in this pipeline it lives.

### Client flow

- `App.tsx` routes by `state.publicState.phase` — there's no router, just phase-driven rendering.
- `Game.tsx` is the main play UI. The reveal overlay (`RevealView`) is **rendered regardless of phase** so the final turn's flip animation shows before the round-end summary; `RoundEnd` is gated on `!revealOverlay` to enforce that ordering. Don't combine those guards.
- The non-picker pool uses `<PowerUpChip>` (small colored chip, symbol only); the picker's pool uses `<PowerUpCard>` (full card with name + tap-for-description). They're explicitly two components — `Pool` switches based on `isPicker`.
- `getIdentity` / `saveIdentity` in `identity.ts` are how the client knows what room/token it has; `App.tsx` auto-rejoins the most recent room on bootstrap.

### Module conventions

- Root `package.json` has `"type": "module"`. **All imports use explicit `.js` extensions** even when sourcing `.ts` (`from "./scoring.js"`). `tsx` rewrites `.js` → `.ts` at runtime; Node's ESM loader otherwise refuses extensionless or `.ts` paths. Don't change this.
- `shared/` has no `package.json` — both server and client import from it via relative paths (`from "../../../shared/types.js"` from server, `from "../../shared/types.js"` from client).
- Workspaces use npm's native workspaces (`@cancel/server`, `@cancel/client`). Run cross-cutting commands with `npm --workspace <name> run <script>`.

### Adding a new power-up

1. Add the id to the `PowerUpId` union and `POWER_UPS` map in `shared/types.ts`.
2. Wire its scoring effect into `server/src/game/scoring.ts` at the right point in the resolution pipeline; add tests in `scoring.test.ts`.
3. Add a `POWER_VISUAL` entry in `client/src/components.tsx` (abbr glyph + tailwind colors). Long names auto-wrap inside the fixed `68×88px` card.
4. If it needs a target (like Mute/Peek), set `needsTarget: true` and the engine + client target-picker UI handle the rest.
