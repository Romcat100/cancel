# Cancel — Design Exploration SPEC

You are building **one standalone visual-style demo** of the mobile party game **Cancel**. It is a static, frontend-only mockup: five screens of the game rendered in a specific art direction, in a single self-contained HTML file. Nothing needs to function beyond the screen switcher. This file is the complete contract; your style brief arrives separately in your prompt.

## What the game is (so the design serves it)

Cancel is a fast social bluffing game. Each turn every player secretly picks a number card from their hand (Ø 1 2 3 4 5). When everyone has locked in, all picks flip at once: **matching numbers cancel each other out** (both score zero), the lone Ø cancels everyone else, and the survivors bank their numbers as points. One player per turn (the "picker") may also play a power-up that twists the rules. High score after all rounds wins. The emotional beats your design must serve: **secrecy while picking → simultaneous reveal → the drama of cancellation**.

## Quality bar

- Commit fully to your assigned aesthetic. Every element — background, type, buttons, cards, chips, statuses — should belong to the same world. Intentionality over intensity.
- Typography is half the design. Pick 1-2 characterful Google Fonts that belong to your style (a display face + a body/numeral face). Avoid defaults (Arial, Inter, Roboto, system stacks). Do not use Space Grotesk; that is the current design being replaced (exception: the "evolution" styles 33-37, whose briefs say to keep it).
- Numbers are the heroes of this game. The number cards (Ø 1 2 3 4 5) should be the most lovingly designed objects on screen.
- Backgrounds create atmosphere: gradients, textures, patterns, vignettes, grain via inline SVG/CSS — never a flat default color unless your style demands it.
- It must still read as a **usable mobile game UI**: clear hierarchy, obvious primary action, finger-sized tap targets (≥44px), legible text (body ≥14px equivalent, sufficient contrast). A beautiful poster that fails as a UI fails the brief.
- Decorative art = CSS, inline SVG, data-URI, or unicode only. No external images, no canvas.

## HARD CONTRACT (a demo violating any of these is broken)

1. **One file**: write exactly `design-explorations/styles/NN-slug.html` (your prompt gives the exact name). No other files, no edits to anything else.
2. **Self-contained**: the only network request allowed is ONE Google Fonts `<link>` (plus its preconnects). All CSS in one `<style>` block; all art inline.
3. **Five screens**, exactly these sections in this order:
   `<main data-screen="home">`, `<main data-screen="lobby">`, `<main data-screen="game">`, `<main data-screen="reveal">`, `<main data-screen="end">`.
4. **Switcher script verbatim** (see skeleton below). No other JavaScript. No `Math.random()`, no `Date`, no JS-driven rendering.
5. **Determinism**: base CSS is the final resting visual state. Animations/transitions may exist ONLY inside `@media (prefers-reduced-motion: no-preference)`. The screenshot harness emulates reduced motion, so shots capture the settled state; humans browsing still see your flourishes. Confetti and similar scatter = statically positioned elements (hardcoded positions), never random.
6. **Layout**: design for 420px width. Each screen should fit in roughly one 900px-tall viewport; the dense game screen may run modestly longer (it is screenshotted full-page).
7. **Copy is fixed** (see content spec below) — typeset it however your style demands, but do not reword it. **No em-dashes in on-screen copy** (project rule): use a period, comma, or "and"/"but".
8. **Acceptance test**: opening `NN-slug.html?screen=game` (or any screen name) over `file://` renders exactly that screen with the switcher nav hidden.

### Skeleton (start from this; the `<script>` must be byte-identical)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cancel — {Style Name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family={YOUR+FONTS}&display=swap" rel="stylesheet">
  <style>
    [data-screen] { display: none; }
    [data-screen].active { display: block; }
    #switcher { position: fixed; bottom: 8px; right: 8px; z-index: 999; display: flex; gap: 4px; }
    /* your style here — base styles are the FINAL resting state */
    @media (prefers-reduced-motion: no-preference) {
      /* optional flourish animations ONLY here */
    }
  </style>
</head>
<body>
  <main data-screen="home"><!-- screen 1 --></main>
  <main data-screen="lobby"><!-- screen 2 --></main>
  <main data-screen="game"><!-- screen 3 --></main>
  <main data-screen="reveal"><!-- screen 4 --></main>
  <main data-screen="end"><!-- screen 5 --></main>
  <nav id="switcher">
    <a href="#home">1</a><a href="#lobby">2</a><a href="#game">3</a><a href="#reveal">4</a><a href="#end">5</a>
  </nav>
  <script>
    var SCREENS = ["home", "lobby", "game", "reveal", "end"];
    function show(name) {
      if (SCREENS.indexOf(name) === -1) name = "home";
      document.querySelectorAll("[data-screen]").forEach(function (el) {
        el.classList.toggle("active", el.dataset.screen === name);
      });
    }
    var qp = new URLSearchParams(location.search).get("screen");
    if (qp) document.getElementById("switcher").style.display = "none";
    show(qp || location.hash.slice(1) || "home");
    addEventListener("hashchange", function () { show(location.hash.slice(1) || "home"); });
  </script>
</body>
</html>
```

You may style `#switcher` links minimally so they're visible in your theme, but never reposition it away from the bottom-right corner and never let it overlap content meaningfully.

## The four players (identity must stay consistent across all 37 demos)

Reinterpret these into your palette, but keep each player's relative identity recognizable:

| Player | Identity | Notes |
|---|---|---|
| Ben | **warm** (coral/red family in the current app) | the human, "you", host |
| Voltaire | **cool** (blue/indigo family) | AI bot |
| Mechano | **gold** (yellow/amber family) | AI bot |
| Data Dan | **green** (emerald family) | AI bot |

## Screen-by-screen content spec

Copy below is required. Items marked *(optional)* are flavor you may include if they help the composition.

### 1. home
- Wordmark: **CANCEL** (this is your style's hero moment; a two-tone or otherwise expressive treatment is encouraged)
- Tagline: `a number-picking party game`
- Buttons: `New game` (primary), `Single player`, `Join with code`
- *(optional)* small mute/settings icon button

### 2. lobby
- Top bar: `← Leave` and `Rules` buttons
- Room code, large: `DN2H` with hint `press to copy`
- Section `Players · 4`, listing in order:
  - `Ben` — badges: `HOST`, `YOU`, online dot
  - `Voltaire` — badge: `BOT`, online dot
  - `Mechano` — badge: `BOT`, online dot
  - `Data Dan` — badge: `BOT`, online dot
- Setting rows:
  - `Rounds` = `3` with `−` / `+` stepper
  - `AI players` = `3` with `−` / `+` stepper
  - `Power-ups` segmented control: `None` / `Random` (selected) / `Choose`, helper text `A fresh random pool each round.`
- Button: `Start game` (primary)

### 3. game (the densest screen; the picker's view, mid-turn)
- Header: `R1/3` · `T2/6` · `DN2H` plus small `RULES` / `LEAVE` / `END GAME` buttons
- Scoreboard, one chip per player (seat color + name + score): `Ben 4`, `Voltaire 0`, `Mechano 2`, `Data Dan 5`
- Label: `POWER-UPS REMAINING` `6 / 6`
- Power pool (it is Ben's turn to pick a power), banner `YOUR TURN — PRESS TO SELECT` reworded freely without the em-dash, e.g. `YOUR TURN, PRESS TO SELECT`. Six power cards, with **Jinx visibly selected**:

| Power | Glyph | Color family |
|---|---|---|
| Swap Hands | ⇄ | teal |
| Sabotage | ✖ | red/rose |
| Jinx | = | pink |
| Plus Two | +2 | emerald |
| Wild | ? | violet |
| Drain | ↧ | amber |

- Players status block, label `PLAYERS · POWER PICKER: BEN`:
  - `Ben (you)` — status `THINKING…`
  - `Voltaire` — status `SUBMITTED`
  - `Mechano` — status `SUBMITTED`
  - `Data Dan` — status `SUBMITTED`
  - *(optional)* tiny remaining-hand readouts like `Ø 1 2 3 4 5`
- *(optional)* ghost button `SKIP WAITING, AUTO-PLAY WHO'S LEFT`
- Section `YOUR HAND`: cards `Ø` `1` `2` `3` `4` `5`, with **5 visibly selected**
- Primary CTA: `Lock it in`

### 4. reveal (the signature moment — make cancellation FEEL like your style)
- Eyebrow: `TURN 2 REVEAL`
- `BEN PLAYED` + the **Jinx** power card (= glyph, pink family)
- The four flipped number cards with outcomes:
  - `Ben` → card `5` → outcome `CANCELLED` (0 points)
  - `Voltaire` → card `Ø` → outcome `0` (the lone zero that cancelled everyone)
  - `Mechano` → card `5` → outcome `CANCELLED`
  - `Data Dan` → card `3` → outcome `CANCELLED`
- The CANCELLED treatment is where your style shows its teeth: a stamp, a burn, a flatline, an ink blot, whatever belongs to your world.
- Button: `Continue` (primary)

### 5. end
- Eyebrow: `GAME OVER`
- Hero line: `You won.` (Ben wins; this is the celebration screen)
- Ranked score table with columns `R1 R2 R3 TOTAL`:
  1. `Ben (you)` — 5, 9, 6 → **20**
  2. `Data Dan` — 5, 4, 3 → **12**
  3. `Voltaire` — 3, 2, 4 → **9**
  4. `Mechano` — 0, 5, 2 → **7**
- Celebration: statically-positioned confetti/sparkle/motif scatter in your style's vocabulary
- Buttons: `Play again` (primary), `Leave room`

## Reference: what the current app looks like

For layout grounding (information architecture, density, what sits where), Read these screenshots of today's app. Your job is a new VISUAL style, not a new layout; deviate from the layout only where your style genuinely demands it:

- `orig_screenshots/1_start_screen.png` — home
- `orig_screenshots/2_lobby_screen.png` — lobby
- `orig_screenshots/4_game_screen.png` + `5_picker_screen.png` — game
- `orig_screenshots/6_reveal_screen.png` — reveal
- `orig_screenshots/9_win_screen.png` — end

## Self-verification (required before you finish)

1. From the repo root run: `node design-explorations/shoot.mjs NN` (your style number). It launches headless Chrome, screenshots your five screens to `design-explorations/shots/NN-slug/`, and prints the paths.
2. **Read all five PNGs** and look at them critically: blank/black screens, overflowing or clipped text, illegible contrast, broken layout, an element that ignores your art direction.
3. Fix and reshoot. At most 2 fix iterations; polish is good, perfectionism is not.
4. If the harness prints `PAGE ERROR`, your file has a JS error: fix it (almost always a typo in the verbatim switcher).
