# Cancel

A multiplayer browser game where everyone secretly picks a number, then reveals at once. If two players pick the same number, both score zero. The `0` card is "Cancel" — one zero negates everyone else's points; two or more zeros cancel each other out and the rest of the table scores normally. Each round a random **round power** (Harmony, Amplify, Static, Ultraviolet, Refraction, Gate, Absorption, Broadcast, Subharmonic, Inversion, Echo, Dead Air, or plain Pure Tone) bends the rules for everyone.

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

You can play **solo against AI** from the Home screen (tap **Single player**), or create a multiplayer room and invite friends. Multiplayer lobbies can also add AI players to fill out a small group, capped so humans + AIs stay at or below 8.

1. **Create a room** → you get a 4-character code.
2. **Share the code** with friends; they tap "Join with code" on the same site.
3. In the lobby, the **Rules** button opens a full how-to-play overlay. The host taps **Game options** to set the round count (1-5, default 3), pick the number pool (the standard set or a host-chosen custom set), toggle whether hands are visible, and choose a round-power mode: **None** (pure numbers, no powers), **Random** (one random power drawn each round), or **Choose** (hand-pick which powers can appear). Everyone else can open Game options too, as a read-only view of the setup. The same Rules button is in the in-game header so anyone can re-read the rules mid-match.
4. **Host taps Start.** When round powers are on, a "This round's power" screen reveals the power drawn for the round and what it does, then a banner keeps it visible for the whole round. (Skipped when powers are off.)
5. **Each turn:**
   - Everyone privately picks a number from their hand. Each player's remaining hand is shown publicly under their name so you can see what cards your opponents still have.
   - You can **un-lock** your submission by tapping the locked-in button — as long as the turn hasn't fully resolved (i.e. not everyone has locked in yet), you can change your pick.
   - When all submissions are in, the numbers flip face-up at once, scores tally under the round power's rules, and the next turn starts.
6. **End of round** — a tally screen shows what each player scored that round and the running totals. Tap **Next round** when you're ready; the round advances when all players are. Each round arrives with its own color scheme (the background and UI accents shift; player colors never change).
7. **Each round is (N+2) turns; the host picks 1-5 rounds (default 3).** Highest total wins.
8. **Game over** — alongside the final standings, the screen shows a score-over-rounds chart of the whole race (multi-round games) and a few superlatives: the biggest single turn, the sneakiest `0` player, who got cancelled the most, and the best final-round comeback.

## Scoring rules

- **Tied numbers:** all tied players score 0.
- **Unique numbers:** score equals card value.
- **One `0`:** all other players score 0 this turn.
- **Two or more `0`s:** the cancel effect is suppressed; standard rules apply.
- **Round powers** modify the above — see below.

## Round powers

Round powers are on by default. In the lobby the host picks a mode: **None** (a pure-numbers game), **Random** (one power drawn at random each round), or **Choose** (the host hand-picks which powers can appear). Each round draws a power that hasn't come up yet this game, so powers never repeat within a game. If the eligible powers run out before the rounds do, repeats come back rather than leaving a round without a power.

When on: at the start of each round, one power is drawn and shown to everyone. It applies to every player, on every turn of that round. A banner keeps it visible during play and on each reveal. In a 2-player game the random draw skips Harmony, Refraction, and Dead Air (they fall flat 1v1), but a host can still hand-pick them in Choose mode.

| Power | What it does |
|---|---|
| **Pure Tone** (`~`) | A clean signal. No power this round, every card scores by the normal rules. |
| **Harmony** (`≋`) | Tied signals resonate instead of clashing. If players tie, each tied card scores double its value instead of being wiped. A lone `0` still silences the board. |
| **Amplify** (`×2`) | The signal is boosted. Every point scored this round is doubled, gains and losses alike. |
| **Static** (`Ø!`) | Zeros are lost in the noise. A `0` is inert this round and cancels nothing. |
| **Ultraviolet** (`UV`) | The whole spectrum shifts up. Every card plays 2 higher than its face value, so a `0` becomes a `2` and a `3` becomes a `5`. Ties use the raised values. |
| **Refraction** (`△`) | Light bends to a new angle. Each turn you glimpse the number a random player means to play, then everyone gets one chance to change their pick before the reveal. |
| **Gate** (`▁×`) | Too quiet to pass the gate. Each turn, the lowest card that scored is cut to 0, so the smallest number on the board earns nothing. |
| **Absorption** (`Ø+`) | The flat line drinks the sound. A lone `0` still silences the board, and it also scores the total of all the cards it silenced. |
| **Broadcast** (`⊚`) | Every pick goes out over the air. Once everyone locks in, all picks are shown to all players, and everyone gets one chance to change their card before the reveal. |
| **Subharmonic** (`▁`) | The deep frequency swells. Each turn, the lowest card that scored gains 4 bonus points. Tied or cancelled cards score nothing as usual, so the bonus goes to the lowest card that survived. |
| **Inversion** (`−∿`) | The whole signal flips below the axis. Every card that scores counts against its player this round, so a tie or a cancel is a lucky escape. The best plays are the ones that get cancelled. |
| **Echo** (`⟲`) | The signal repeats. Played cards return to your hand, so any card can be played again and again and every turn is a fresh standoff. Silence does not echo: a played `0` is spent for good. |
| **Dead Air** (`ØØ`) | Silence cannot hide in silence. Zeros no longer suppress each other, so every `0` played still silences the board, no matter how many there are. |

## Project layout

```
shared/         types and protocol shared between client and server
server/         Express + Socket.IO + better-sqlite3 (durable game state)
  src/game/     scoring.ts (pure scoring) + engine.ts (state machine)
                bots.ts (AI brain) + bot-names.ts
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
- **Player-count limits and other rule tuning** still live only in code (`server/src/game/engine.ts`). Round count (1-5), the round-power mode/roster, and a custom number pool are now host-configurable in the lobby.
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
