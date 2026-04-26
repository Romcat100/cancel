# Cancel

A multiplayer browser game where everyone secretly picks a number, then reveals at once. If two players pick the same number, both score zero. The `0` card is "Cancel" — one zero negates everyone else's points; two or more zeros cancel each other out and the rest of the table scores normally. Power-ups (`×2`, `Shield`, `Negate Zero`, `+2`, `Mute`, `Peek`, `Sabotage`, etc.) add twists.

The same engine supports both **live** play (everyone in the room at once) and **async** play (over hours/days — close your browser, come back later, your seat reclaims itself).

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173 (Vite dev server proxies `/api` and `/socket.io` to the Express server on `:3001`).

To run the production build instead:

```bash
npm run build
npm start
# open http://localhost:3001
```

## Test it

```bash
npm test          # runs the scoring engine + state machine tests (58 tests)
```

## Play it

1. **Create a room** → you get a 4-character code.
2. **Share the code** with friends; they tap "Join with code" on the same site.
3. **Host taps Start.** A "This round's powers" screen shows what's in this round's pool — tap any card to read what it does, then tap Let's play.
4. **Each turn:**
   - Everyone privately picks a number from their hand. Each player's remaining hand is shown publicly under their name so you can see what cards your opponents still have.
   - The picker (rotation, shown by a **PICK** badge) additionally picks one power-up from the pool — face-up to all so others know what's available, but only the picker plays it.
   - You can **un-lock** your submission by tapping the locked-in button — as long as the turn hasn't fully resolved (i.e. not everyone has locked in yet), you can change your pick.
   - When all submissions are in, numbers and the played power-up flip face-up at once, scores tally, the next turn starts. (Exception: if **Peek** was played, the peeker is sent back to thinking with their target's number revealed; everyone waits while they re-pick.)
5. **End of round** — a tally screen shows what each player scored that round and the running totals. Tap **Next round** when you're ready; the round advances when all players are.
6. **3 rounds × (N+2) turns each.** Highest total wins.

## Scoring rules

- **Tied numbers:** all tied players score 0.
- **Unique numbers:** score equals card value.
- **One `0`:** all other players score 0 this turn.
- **Two or more `0`s:** the cancel effect is suppressed; standard rules apply.
- **Power-ups** modify the above — see below.

## Power-ups

At the start of each round, `N+2` power-ups are dealt face-up. They stay face-up the whole round so everyone sees what's still in the pool — tap any card to read its description. Only the picker for each turn (rotation shifts every round) can actually play one. Power-ups resolve at the same instant numbers do, except for **Peek** which pauses the turn for a re-pick.

| Card | What it does |
|---|---|
| **Double** (`×2`) | Every player's scored points this turn are multiplied by 2. Time it for a turn you expect to play a unique high card — but it doubles your opponents' scores too. |
| **Shield** (`▽`) | Your card scores its full value even if you tied with another player. Other players who tied with you still score 0 — only your tie penalty is removed. |
| **Negate Zero** (`Ø!`) | All `0` cards are inert this turn — no cancel effect. Use it to neuter someone's expected `0` play, or to play your own `0` safely without wasting it. |
| **Plus Two** (`+2`) | Bumps your card's face value up by 2 — `0` becomes `2` (so it no longer cancels), `3` becomes `5`, etc. Tie checks use the bumped value, so a Plus Two `0` ties with someone else's `2`. |
| **Free Three** (`+3`) | Plays a virtual `3` alongside your card. If no other player played a 3, you gain `+3`. If anyone else played a 3, both 3s tie out (theirs scores 0, your bonus is lost). |
| **Make Negative** (`−`) | All scored points this turn are inverted (positive becomes negative). Useful when you expect to be cancelled or tied (you score 0 either way) while your opponents are about to score big. |
| **Minus Two** (`←2`) | Every opponent who scored more than 0 this turn loses 2 points. You don't lose any; their loss isn't transferred to you. |
| **Peek** (`◎`) | Pick an opponent. After everyone submits this turn, you privately see what they played and your own submission is wiped — you re-pick a number while everyone waits. The cost is everyone has to pause for you. |
| **Mute** (`⌖`) | A chosen opponent's card is treated as `0`-value, non-cancel, this turn. Wipes their score, removes their `0` cancel if they played one, and breaks any tie they would have caused on their card's face. |
| **Trade** (`↻`) | Everyone's score this turn slides one seat clockwise — your score goes to the next player; you receive the previous player's score. Whether you "win" depends on who's behind you in seat order. |
| **Equalize** (`≈`) | Every player who scored above zero this turn receives the *average* of those positive scores. High earners come down, low earners come up. Cancelled and tied players are unaffected. |
| **Sabotage** (`✖`) | Pick an opponent AND choose which card from their visible hand they'll play this turn. Their submitted pick is overridden — they don't find out until the reveal. Their original choice stays in their hand for a future turn. |

The pool is drawn from this 12-card master list — random subset each round.

## Project layout

```
shared/         types and protocol shared between client and server
server/         Express + Socket.IO + better-sqlite3 (durable game state)
  src/game/     scoring.ts (pure scoring) + engine.ts (state machine)
  src/db.ts     SQLite tables + WAL mode
  src/handlers.ts REST + socket handlers
client/         Vite + React + Tailwind PWA
  src/screens/  Home, Lobby, Game, GameEnd
  src/components.tsx  cards & player chips
```

Game state is persisted in `server/data/cancel.sqlite` so games survive server restarts and players returning hours/days later.

## Deferred for v1

- **Web Push notifications** ("your turn!" pings when offline). The PWA manifest is in place, so the app installs to a home screen, but push subscriptions and the VAPID key flow are not wired up yet.
- **Per-turn deadlines / auto-skip** for stuck async games — the current model just waits.
- **Custom rule variants** (round count, player range, custom power-up sets). All defaults live in one place: `server/src/game/engine.ts`.
- **Sounds, music, theming.**

## Mobile PWA

On iOS/Android, the site can be added to home screen and launches full-screen with the dark theme.

## Deploying to Render (free tier)

### Build

Render sets `NODE_ENV=production`, which makes modern npm skip every `devDependency` — including `vite`, `typescript`, and `@types/react`, all of which the client build needs. The repo's root `.npmrc` (`include=dev`) overrides this so `npm install` always pulls dev deps. It's the cleanest fix because it works regardless of which `npm install` flavor Render runs and regardless of `NODE_ENV`. **No `NPM_CONFIG_PRODUCTION` env var is needed** (and that one is deprecated anyway).

Build command: `npm install && npm run build`. Start command: `npm start`.

### Keep-alive

The free Render web service spins down after ~15 minutes of no inbound traffic — a player returning to an async game would otherwise hit a 50+ second cold start. The server has a built-in self-ping that keeps the instance warm only while at least one game is mid-play (`turn_submitting`, `turn_peek_review`, or `round_end`). It's a no-op locally.

It activates automatically when the `RENDER_EXTERNAL_URL` env var is set (Render injects this for every web service). You can override:

- `KEEPALIVE_INTERVAL_MS` — how often to ping while a game is active (default `600000` = 10 min). Pick something safely under Render's 15 min idle timeout.
- `PUBLIC_URL` — alternative to `RENDER_EXTERNAL_URL` if you're hosting elsewhere.

Once the last active room ends or is archived, the pings stop and Render is free to spin the instance down.
