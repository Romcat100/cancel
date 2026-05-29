# Cancel

A multiplayer browser game where everyone secretly picks a number, then reveals at once. If two players pick the same number, both score zero. The `0` card is "Cancel" — one zero negates everyone else's points; two or more zeros cancel each other out and the rest of the table scores normally. Power-ups (`×2`, `Tie Die`, `Negate Zero`, `+2`, `Mute`, `Peek`, `Sabotage`, etc.) add twists.

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
npm test          # runs the scoring engine + state machine tests
```

## Play it

1. **Create a room** → you get a 4-character code.
2. **Share the code** with friends; they tap "Join with code" on the same site.
3. In the lobby, the **Rules** button opens a full how-to-play overlay. The host sets the round count (1-5, default 3), picks the number pool (the standard set or a host-chosen custom set), and chooses a power-up mode: **None** (pure numbers, no powers dealt), **Random** (a random pool each round), or **Choose** (hand-pick which powers can appear). The same Rules button is in the in-game header so anyone can re-read the rules mid-match.
4. **Host taps Start.** When power-ups are on, a "This round's powers" screen shows what's in this round's pool — tap any card to read what it does, then tap Let's play. (Skipped when power-ups are off.)
5. **Each turn:**
   - Everyone privately picks a number from their hand. Each player's remaining hand is shown publicly under their name so you can see what cards your opponents still have.
   - With power-ups on, a picker rotates each turn (shown by a **PICK** badge) and additionally picks one power-up from the pool — face-up to all so others know what's available, but only the picker plays it. With power-ups off, there's no picker — every turn is a pure simultaneous number pick.
   - You can **un-lock** your submission by tapping the locked-in button — as long as the turn hasn't fully resolved (i.e. not everyone has locked in yet), you can change your pick.
   - When all submissions are in, numbers and the played power-up flip face-up at once, scores tally, the next turn starts. (Exception: if **Peek** was played, the peeker is sent back to thinking with their target's number revealed; everyone waits while they re-pick.)
6. **End of round** — a tally screen shows what each player scored that round and the running totals. Tap **Next round** when you're ready; the round advances when all players are.
7. **Each round is (N+2) turns; the host picks 1-5 rounds (default 3).** Highest total wins.

## Scoring rules

- **Tied numbers:** all tied players score 0.
- **Unique numbers:** score equals card value.
- **One `0`:** all other players score 0 this turn.
- **Two or more `0`s:** the cancel effect is suppressed; standard rules apply.
- **Power-ups** modify the above — see below.

## Power-ups

Power-ups are on by default. In the lobby the host picks a mode: **None** (a pure-numbers game), **Random** (a random subset dealt each round), or **Choose** (the host hand-picks which powers can appear in the pool).

When on: at the start of each round, `N+2` power-ups are dealt face-up. They stay face-up the whole round so everyone sees what's still in the pool. Press any card to read its description. Only the picker for each turn (rotation shifts every round) can actually play one. Power-ups resolve at the same instant numbers do, except for **Peek** which pauses the turn for a re-pick.

| Card | What it does |
|---|---|
| **Double** (`×2`) | Every player's scored points this turn are multiplied by 2. Time it for a turn you expect to play a unique high card, but note it doubles your opponents' scores too. |
| **Tie Die** (`▽`) | Your card still scores its full value even if you tied with another player, and your `0` still cancels everyone even if another player also plays a `0`. Opponents who tied with you still score 0. Only your own tie/zero penalty is removed. |
| **Negate Zero** (`Ø!`) | All `0` cards are inert this turn, with no cancel effect. Use it to neuter someone's expected `0` play, or to play your own `0` safely without wasting it. |
| **Plus Two** (`+2`) | Bumps your card's face value up by 2. A `0` becomes `2` (so it no longer cancels), a `3` becomes `5`, and so on. Tie checks use the bumped value, so a Plus Two `0` ties with someone else's `2`. |
| **Free Three** (`3`) | Plays a virtual `3` alongside your card. If nobody plays a 3, you gain `+3`. If anyone plays a 3 (including you), that 3 cancels with the virtual 3 and the bonus is lost. |
| **Make Negative** (`−`) | All scored points this turn are inverted (positive becomes negative). Useful when you expect to be cancelled or tied (you score 0 either way) while your opponents are about to score big. |
| **Minus Two** (`−2`) | Universal mirror of Plus Two: every player's face value drops by 2. A played `2` becomes `0` and now cancels everyone, a `5` becomes `3`, a `0` becomes `−2` and no longer cancels. Tie checks, scoring, and the cancel effect all use the lowered value. |
| **Peek** (`◎`) | Pick an opponent. After everyone submits this turn, you privately see what they played and your own submission is wiped, then you re-pick a number while everyone waits. The cost is everyone has to pause for you. |
| **Mute** (`⌖`) | A chosen opponent's card is treated as `0`-value, non-cancel, this turn. Wipes their score, removes their `0` cancel if they played one, and breaks any tie they would have caused on their card's face. |
| **Slide** (`↻`) | Everyone's score this turn slides one seat. Your score goes to the next player, and you receive the previous player's score. Whether you "win" depends on who's behind you in seat order. |
| **Equalize** (`≈`) | Every player who scored above zero this turn receives the *average* of those positive scores. High earners come down, low earners come up. Cancelled and tied players are unaffected. |
| **Sabotage** (`✖`) | Pick an opponent AND choose which card from their visible hand they'll play this turn. Their submitted pick is overridden and they don't find out until the reveal. Their original choice stays in their hand for a future turn. |
| **Flip** (`⇋`) | Every card's face value is mirrored across the range, so a `0` becomes the high card and the high card becomes a `0`. Tie checks, scoring, and the cancel effect all use the mirrored values. |
| **Drain** (`↧`) | Pick an opponent. Your card's face value goes up by 1 and theirs goes down by 1 for this turn. The new values flow into scoring, ties, and the cancel effect, so a target who played a `1` becomes a board-cancelling `0`. |
| **Jinx** (`=`) | Tying pays off instead of wiping you out. Each opponent who plays your number adds `+2` to your score, on top of your card's value. If nobody ties, your card scores as normal. |
| **Wild** (`?`) | Rolls a random power from the rest of the set and plays that instead. Targeted powers (Peek, Mute, Sabotage, Drain) are excluded from the roll, since Wild is submitted without a target. |
| **Nothing Burger** (`∅`) | Does nothing at all. Your card scores exactly as if you'd played no power-up. It exists so the picker can deliberately decline to use the turn's power slot. |

The pool is drawn from this 17-card master list, a random subset each round (or the host's chosen subset in **Choose** mode). (In 2-player games, **Peek** and **Sabotage** are excluded as they're too dominant 1-on-1.)

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
- **Player-count limits and other rule tuning** still live only in code (`server/src/game/engine.ts`). Round count (1-5), the power-up mode/subset, and a custom number pool are now host-configurable in the lobby.
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

### Durable persistence (optional)

Room state lives in local SQLite, and on Render's free tier the filesystem is ephemeral: a cold start, redeploy, or platform restart wipes it. The keep-alive above only delays a spin-down, it doesn't survive a redeploy. To make async games genuinely durable, point the app at a free [Upstash](https://upstash.com) Redis database via two env vars:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Setup (one-time, ~10 min): create a free Upstash account, click **Create database**, open it, and copy the **REST API** URL + token into Render's Environment tab (and into a local `.env` if you want to test it locally — see `.env.example`).

How it works: SQLite stays the synchronous source of truth for every request. On each save the room and its seats are mirrored to Upstash in the background (fire-and-forget, so a KV hiccup can never slow or break gameplay), and on boot the server reads them back once to rehydrate. Rooms refresh a 7-day TTL on every save, so abandoned rooms self-expire while live ones stay alive.

**Without these vars set, the app runs exactly as before** (local SQLite only) — they're purely additive, so it's safe to deploy first and enable later.
