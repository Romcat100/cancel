// Browser verification helper.
//
// Drives the app in a real (system) Chrome/Edge headlessly, screenshots each
// interesting state to scripts/shots/, and prints the paths so Claude can Read
// them (Claude Code renders PNGs visually). Multiplayer flows use two isolated
// browser contexts so each "player" gets its own localStorage + socket.
//
//   npm run verify            # runs the default flow (lobby-rounds)
//   npm run verify rounds     # runs a named flow
//   CHROME_PATH=... npm run verify
//
// Requires the dev client on http://localhost:5173. If it isn't up, this script
// starts `npm run dev` and tears it down on exit.

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = join(__dirname, "shots");
const APP_URL = "http://localhost:5173";
const VIEWPORT = { width: 420, height: 900 }; // UI is mobile-first (max-w-md)

// ---------------------------------------------------------------------------
// Browser discovery: point puppeteer-core at an already-installed browser.
// ---------------------------------------------------------------------------
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const lad = process.env["LOCALAPPDATA"] || "";
  const candidates = [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    lad && `${lad}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "No Chrome/Edge found. Set CHROME_PATH to your browser .exe, e.g.\n" +
        '  $env:CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
    );
  }
  return found;
}

// ---------------------------------------------------------------------------
// Dev server: reuse if already running, else spawn and clean up on exit.
// ---------------------------------------------------------------------------
async function isUp(url) {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isUp(APP_URL)) {
    console.log("[verify] dev server already up on 5173");
    return null;
  }
  console.log("[verify] starting `npm run dev`...");
  const child = spawn("npm", ["run", "dev"], {
    cwd: join(__dirname, ".."),
    stdio: "ignore",
    shell: true,
    detached: false,
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isUp(APP_URL)) {
      console.log("[verify] dev server is up");
      return child;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  child.kill();
  throw new Error("dev server did not come up on 5173 within 60s");
}

// ---------------------------------------------------------------------------
// Page helpers (sync waits, never fixed sleeps).
// ---------------------------------------------------------------------------
async function waitForText(page, text, ms = 10_000) {
  await page.waitForFunction(
    (t) => document.body && document.body.innerText.includes(t),
    { timeout: ms },
    text,
  );
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((t) => {
    const els = [...document.querySelectorAll("button, a, [role=button]")];
    const el = els.find((e) => e.innerText.trim().includes(t));
    if (el) el.click();
    return !!el;
  }, text);
  if (!clicked) throw new Error(`no clickable element containing text: ${text}`);
}

async function clickByAria(page, label) {
  const clicked = await page.evaluate((l) => {
    const el = document.querySelector(`[aria-label="${l}"]`);
    if (el) el.click();
    return !!el;
  }, label);
  if (!clicked) throw new Error(`no element with aria-label: ${label}`);
}

// Stable testid selector helper. Prefer this over clickByText for anything the
// app exposes a data-testid for — copy tweaks then can't break the flow.
const tid = (id) => `[data-testid="${id}"]`;

async function clickTestId(page, id) {
  await page.waitForSelector(tid(id), { timeout: 10_000 });
  await page.click(tid(id));
}

async function typeInto(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 10_000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
}

let shotCount = 0;
const shots = [];
// fullPage stitches the whole scrollable page (good for tall screens), but it
// mis-composites `position: fixed` + `backdrop-filter` overlays (the bg bleeds
// through). For full-screen modals pass { fullPage: false } to capture the
// viewport, which matches the real mobile experience.
async function shot(page, name, { fullPage = true } = {}) {
  const n = String(++shotCount).padStart(2, "0");
  const path = join(SHOTS_DIR, `${n}-${name}.png`);
  await page.screenshot({ path, fullPage });
  shots.push(path);
  console.log(`[verify] shot -> ${path}`);
  return path;
}

async function newPlayer(browser, name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(APP_URL, { waitUntil: "networkidle2" });
  page._playerName = name;
  return page;
}

// Step the host stepper one click at a time, waiting for each re-render so we
// never out-race the server round-trip (clicking faster re-reads a stale value).
async function setRounds(page, target) {
  for (let guard = 0; guard < 12; guard++) {
    const cur = Number(
      await page.$eval('[data-testid="lobby-rounds-value"]', (e) => e.textContent.trim()),
    );
    if (cur === target) return;
    const want = cur < target ? cur + 1 : cur - 1;
    await clickTestId(page, cur < target ? "lobby-rounds-plus" : "lobby-rounds-minus");
    await page.waitForFunction(
      (v) => document.querySelector('[data-testid="lobby-rounds-value"]')?.textContent.trim() === String(v),
      { timeout: 10_000 },
      want,
    );
  }
  throw new Error(`could not reach rounds=${target}`);
}

// Wait for the non-host read-only chip to show a specific value (broadcast).
async function waitForRoundsChip(page, n) {
  await page.waitForFunction(
    (v) => document.querySelector('[data-testid="lobby-rounds-chip"]')?.textContent.trim() === String(v),
    { timeout: 10_000 },
    n,
  );
}

// Generic host stepper driver (e.g. prefix "lobby-ai" → -minus/-value/-plus), one click at a
// time, waiting for each re-render so we never out-race the server round-trip.
async function setStepper(page, prefix, target) {
  for (let guard = 0; guard < 12; guard++) {
    const cur = Number(await page.$eval(`[data-testid="${prefix}-value"]`, (e) => e.textContent.trim()));
    if (cur === target) return;
    const want = cur < target ? cur + 1 : cur - 1;
    await clickTestId(page, cur < target ? `${prefix}-plus` : `${prefix}-minus`);
    await page.waitForFunction(
      (sel, v) => document.querySelector(sel)?.textContent.trim() === String(v),
      { timeout: 10_000 },
      `[data-testid="${prefix}-value"]`,
      want,
    );
  }
  throw new Error(`could not reach ${prefix}=${target}`);
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------
async function lobbyRoundsFlow(browser) {
  // Host creates a room.
  const host = await newPlayer(browser, "Host");
  await waitForText(host, "CANCEL");
  await clickTestId(host, "home-new-game");
  await typeInto(host, tid("home-name-input"), "Host");
  await clickTestId(host, "home-create-room");
  await host.waitForSelector(tid("lobby-options"), { timeout: 10_000 });
  const code = await host.$eval(tid("lobby-room-code"), (el) => el.innerText.trim());
  console.log(`[verify] room code: ${code}`);
  await shot(host, "host-lobby-default"); // expect summary "3 rounds · …" on the options button

  // Host opens Game options and bumps rounds to the max; + must disable at 5.
  await openOptions(host);
  await setRounds(host, 5);
  const plusDisabled = await host.$eval(tid("lobby-rounds-plus"), (b) => b.disabled);
  console.log(`[verify] at rounds=5, "+" disabled = ${plusDisabled}`);
  await shot(host, "host-rounds-5-max", { fullPage: false });

  // Joiner joins the room; opens the read-only options modal mirroring the host's 5.
  const joiner = await newPlayer(browser, "Joiner");
  await waitForText(joiner, "CANCEL");
  await clickTestId(joiner, "home-join-with-code");
  await typeInto(joiner, tid("home-code-input"), code);
  await typeInto(joiner, tid("home-name-input"), "Joiner");
  await clickTestId(joiner, "home-join");
  await joiner.waitForSelector(tid("lobby-options"), { timeout: 10_000 });
  await openOptions(joiner);
  await waitForRoundsChip(joiner, 5);
  await shot(joiner, "joiner-rounds-5", { fullPage: false });

  // Host drops to 2; confirm it propagates live into the joiner's open modal.
  await setRounds(host, 2);
  await shot(host, "host-rounds-2", { fullPage: false });
  await waitForRoundsChip(joiner, 2);
  await shot(joiner, "joiner-rounds-2", { fullPage: false });

  // Host starts the 2-round game. The room-code element only exists in the
  // lobby, so its disappearance is a reliable "we're in-game" signal.
  await closeOptions(host);
  await clickTestId(host, "lobby-start-game");
  await host.waitForFunction(() => !document.querySelector('[data-testid="lobby-room-code"]'), {
    timeout: 10_000,
  });
  await shot(host, "host-game");
}

// Host leaves mid-game, authority floats to a present player, the host skips a
// turn stalled on the (now-offline) picker, and a present player claims host
// when the holder vanishes ungracefully.
async function hostLeaveFlow(browser) {
  const host = await newPlayer(browser, "Host");
  host.on("dialog", (d) => d.accept()); // accept the "Leave this game?" confirm
  await waitForText(host, "CANCEL");
  await clickTestId(host, "home-new-game");
  await typeInto(host, tid("home-name-input"), "Host");
  await clickTestId(host, "home-create-room");
  await host.waitForSelector(tid("lobby-options"), { timeout: 10_000 });
  const code = await host.$eval(tid("lobby-room-code"), (el) => el.innerText.trim());
  console.log(`[verify] room code: ${code}`);
  // Power-ups off keeps submissions to a plain number (no pool/preview/power pick).
  await openOptions(host);
  await clickTestId(host, "lobby-powerup-off");
  await closeOptions(host);

  // Two joiners.
  const join = async (name) => {
    const p = await newPlayer(browser, name);
    await waitForText(p, "CANCEL");
    await clickTestId(p, "home-join-with-code");
    await typeInto(p, tid("home-code-input"), code);
    await typeInto(p, tid("home-name-input"), name);
    await clickTestId(p, "home-join");
    await p.waitForSelector(tid("lobby-options"), { timeout: 10_000 });
    return p;
  };
  const j1 = await join("Joiner1");
  const j2 = await join("Joiner2");

  // Host starts; everyone lands in the game (room-code element is lobby-only).
  await clickTestId(host, "lobby-start-game");
  await host.waitForFunction(() => !document.querySelector('[data-testid="lobby-room-code"]'), { timeout: 10_000 });
  await host.waitForSelector(tid("game-host-leave"), { timeout: 10_000 });
  await shot(host, "host-in-game"); // host sees Leave + End game

  // Host leaves. Authority should float to Joiner1 (lowest-seat present player).
  await clickTestId(host, "game-host-leave");
  await waitForText(host, "CANCEL"); // host bounced to Home
  await j1.waitForSelector(tid("game-end-game"), { timeout: 10_000 }); // J1 is now host
  await j1.waitForSelector(tid("host-change-toast"), { timeout: 10_000 }); // and gets told so
  await shot(j1, "joiner1-now-host");

  // The picker for turn 1 is the (now offline) ex-host, so the turn stalls.
  // The two present players submit; only the offline picker remains.
  const submitAny = async (page) => {
    await page.waitForSelector(tid("game-submit"), { timeout: 10_000 });
    await clickTestId(page, "game-hand-card-1");
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-testid="game-submit"]');
      return b && !b.disabled;
    }, { timeout: 10_000 });
    await clickTestId(page, "game-submit");
    await page.waitForSelector(tid("game-unlock"), { timeout: 10_000 });
  };
  await submitAny(j1);
  await submitAny(j2);

  // J1 (host) can now skip waiting on the absent picker.
  await j1.waitForSelector(tid("game-skip-waiting"), { timeout: 10_000 });
  await shot(j1, "host-skip-waiting-available");
  await clickTestId(j1, "game-skip-waiting");
  await j1.waitForSelector(tid("reveal-continue"), { timeout: 10_000 }); // turn resolved
  // Let the flip cascade finish so every row (incl. the J1/J2 tie — both play
  // card 1) is face-up in the shot.
  await j1.waitForFunction(
    () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
    { timeout: 10_000 },
  );
  await shot(j1, "turn-resolved-after-skip");
  await clickTestId(j1, "reveal-continue");
  // Every player sees the reveal; dismiss J2's too so its header isn't covered.
  await j2.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await clickTestId(j2, "reveal-continue");

  // Now J1 (current host) vanishes ungracefully — close its context, no step-down.
  // The host role stays on the offline J1, so J2 sees a "Claim host" button.
  await j1.browserContext().close();
  await j2.waitForSelector(tid("game-claim-host"), { timeout: 10_000 });
  await shot(j2, "joiner2-can-claim-host");
  await clickTestId(j2, "game-claim-host");
  await j2.waitForSelector(tid("game-end-game"), { timeout: 10_000 }); // J2 is now host
  await j2.waitForSelector(tid("host-change-toast"), { timeout: 10_000 }); // toast fires on claim too
  await shot(j2, "joiner2-now-host");
}

// Single player: one human taps "Single player", names themselves, lands in a solo lobby with an
// Opponents stepper, then plays a turn where the AIs have already submitted (no delay).
async function singlePlayerFlow(browser) {
  const solo = await newPlayer(browser, "Solo");
  await waitForText(solo, "CANCEL");
  await clickTestId(solo, "home-single-player");
  await typeInto(solo, tid("home-name-input"), "Solo");
  await clickTestId(solo, "home-start-single");

  // Solo lobby: shows the "vs. AI" header and an Opponents stepper (seeded at 3 bots).
  await solo.waitForSelector(tid("lobby-solo-header"), { timeout: 10_000 });
  await waitForText(solo, "Opponents");
  await shot(solo, "solo-lobby"); // expect You + 3 AI players in the list

  // Exercise the stepper: 3 opponents -> 2.
  await setStepper(solo, "lobby-ai", 2);
  await shot(solo, "solo-opponents-2");

  // Power-ups off keeps the human's submission a plain number (no power-pick UI to drive).
  await openOptions(solo);
  await clickTestId(solo, "lobby-powerup-off");
  await closeOptions(solo);

  // Start; the submit button appearing is our "we're in-game" signal.
  await clickTestId(solo, "lobby-start-game");
  await solo.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  // Bots pre-submit instantly — they read "submitted" while the human is still "thinking".
  // (Status copy is CSS-uppercased, so match case-insensitively.)
  await solo.waitForFunction(() => /submitted/i.test(document.body.innerText), { timeout: 10_000 });
  await shot(solo, "solo-game-start");

  // Play a card; with the AIs already in, the turn resolves immediately to a reveal.
  await clickTestId(solo, "game-hand-card-1");
  await solo.waitForFunction(
    () => {
      const b = document.querySelector('[data-testid="game-submit"]');
      return b && !b.disabled;
    },
    { timeout: 10_000 },
  );
  await clickTestId(solo, "game-submit");
  await solo.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await shot(solo, "solo-reveal"); // you + 2 AI cards flip
  await clickTestId(solo, "reveal-continue");
  await shot(solo, "solo-after-reveal");
}

// Click the first enabled card in the hand and lock it in (powerups-off turns,
// so the submission is a plain number).
async function submitSomeCard(page) {
  await page.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  const picked = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="game-hand-card-"]')];
    const btn = cards.find((b) => !b.disabled);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (!picked) throw new Error("no enabled hand card to play");
  await page.waitForFunction(
    () => {
      const b = document.querySelector('[data-testid="game-submit"]');
      return b && !b.disabled;
    },
    { timeout: 10_000 },
  );
  await clickTestId(page, "game-submit");
}

const has = async (page, id) => !!(await page.$(tid(id)));

// Wait until an element has finished its `animate-rise` entrance (opacity → 1),
// so a modal screenshot isn't caught mid-fade with the background showing through.
async function waitOpaque(page, id) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && parseFloat(getComputedStyle(el).opacity) >= 0.99;
    },
    { timeout: 5_000 },
    tid(id),
  );
}

// Open the lobby's Game options modal (holds rounds / round power / number pool /
// show hands). The control testids inside are unchanged, but the modal covers the
// Start button, so flows must closeOptions before starting the game.
async function openOptions(page) {
  await clickTestId(page, "lobby-options");
  await page.waitForSelector(tid("lobby-options-modal"), { timeout: 10_000 });
  await waitOpaque(page, "lobby-options-modal");
}

async function closeOptions(page) {
  await clickTestId(page, "lobby-options-close");
  await page.waitForFunction(() => !document.querySelector('[data-testid="lobby-options-modal"]'), {
    timeout: 10_000,
  });
}

// Interference reskin coverage. Phase A (powerups Random) reaches the Choose
// modal, the round-start round-power preview, and the in-game round-power banner.
// Phase B (powerups off, 2 rounds vs 1 AI) plays a whole game to reach a settled
// reveal, the round-results summary, and game over.
async function interferenceFlow(browser) {
  // --- Phase A: round-power select modal + preview + banner ---
  const a = await newPlayer(browser, "Solo");
  await waitForText(a, "CANCEL");
  await shot(a, "home"); // the entry menu
  await clickTestId(a, "home-single-player");
  await typeInto(a, tid("home-name-input"), "Solo");
  await clickTestId(a, "home-start-single");
  await a.waitForSelector(tid("lobby-solo-header"), { timeout: 10_000 });
  // Choose the roster and narrow it to just Refraction, so the round power is
  // deterministic and we can exercise its two-phase glimpse re-pick.
  await openOptions(a);
  await clickTestId(a, "lobby-powerup-selected");
  await a.waitForSelector(tid("round-power-select-modal"), { timeout: 10_000 });
  await waitOpaque(a, "round-power-select-modal");
  await clickTestId(a, "round-power-select-none");
  await clickTestId(a, "round-power-select-option-refraction");
  await shot(a, "round-power-select", { fullPage: false });
  await clickTestId(a, "round-power-select-save");
  await a.waitForFunction(
    () => !document.querySelector('[data-testid="round-power-select-modal"]'),
    { timeout: 10_000 },
  );
  await closeOptions(a);
  await shot(a, "lobby-solo-refraction"); // lobby, options summary reads "1 power"
  await clickTestId(a, "lobby-start-game");
  await a.waitForSelector(tid("round-power-preview-modal"), { timeout: 10_000 });
  await waitOpaque(a, "round-power-preview-modal");
  await shot(a, "round-start-preview", { fullPage: false }); // "this round's power" = Refraction
  await clickTestId(a, "round-power-preview-play");
  await a.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  await a.waitForSelector(tid("game-round-power"), { timeout: 10_000 });
  await shot(a, "game-turn-with-round-power"); // the turn screen showing the round-power banner
  // Submit an initial pick; bots have already pre-submitted, so this opens the
  // Refraction re-pick where each player glimpses a random other player's number.
  await submitSomeCard(a);
  await a.waitForSelector(tid("game-neighbor-review"), { timeout: 10_000 });
  await shot(a, "game-neighbor-review"); // "X is planning to play…"
  // Re-pick to resolve the turn and reach the reveal.
  await submitSomeCard(a);
  await a.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await shot(a, "refraction-reveal", { fullPage: false });

  // --- Phase B: full playthrough to round results + game over ---
  const b = await newPlayer(browser, "Solo");
  await waitForText(b, "CANCEL");
  await clickTestId(b, "home-single-player");
  await typeInto(b, tid("home-name-input"), "Solo");
  await clickTestId(b, "home-start-single");
  await b.waitForSelector(tid("lobby-solo-header"), { timeout: 10_000 });
  await setStepper(b, "lobby-ai", 1); // 2 players → 4 turns/round
  await openOptions(b);
  await setRounds(b, 2);
  await clickTestId(b, "lobby-powerup-off");
  await closeOptions(b);
  await clickTestId(b, "lobby-start-game");
  await b.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  if (await has(b, "game-round-power")) {
    throw new Error("round-power banner rendered in powerups-off mode");
  }

  let revealShot = false;
  let roundShot = false;
  for (let guard = 0; guard < 50; guard++) {
    if (await has(b, "game-end-winner")) break;
    if (await has(b, "reveal-continue")) {
      // Wait for the flip → score transition so the deltas/CANCELLED stamps show.
      await b
        .waitForFunction(
          () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
          { timeout: 5_000 },
        )
        .catch(() => {});
      if (!revealShot) {
        await shot(b, "reveal-settled", { fullPage: false });
        revealShot = true;
      }
      await clickTestId(b, "reveal-continue");
      await b.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), { timeout: 10_000 });
      continue;
    }
    if (await has(b, "round-end-modal")) {
      if (!roundShot) {
        await waitOpaque(b, "round-end-modal");
        await shot(b, "round-results", { fullPage: false });
        roundShot = true;
      }
      await clickTestId(b, "round-end-ack");
      await b.waitForFunction(
        () =>
          !document.querySelector('[data-testid="round-end-modal"]') ||
          !!document.querySelector('[data-testid="game-end-winner"]'),
        { timeout: 10_000 },
      );
      continue;
    }
    if (await has(b, "game-submit")) {
      await submitSomeCard(b);
      await b.waitForFunction(
        () =>
          !!document.querySelector('[data-testid="reveal-continue"]') ||
          !!document.querySelector('[data-testid="round-end-modal"]') ||
          !!document.querySelector('[data-testid="game-end-winner"]'),
        { timeout: 10_000 },
      );
      continue;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  await b.waitForSelector(tid("game-end-winner"), { timeout: 10_000 });
  await shot(b, "game-end"); // win or lose, with score-amplitude waves

  // The awards carousel: tap the last position dot and confirm the snap scroll
  // follows (reduced-motion makes the scroll instant, so no settling wait).
  const dots = await b.$$('[data-testid^="game-end-stat-dot-"]');
  if (dots.length > 1) {
    await dots[dots.length - 1].click();
    await b.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="game-end-stats-scroll"]');
        return !!el && el.scrollLeft > 0 && Math.abs(el.scrollLeft + el.clientWidth - el.scrollWidth) < 2;
      },
      { timeout: 5_000 },
    );
    await shot(b, "game-end-awards-last"); // carousel snapped to the final badge
  }
}

// Click a specific card number (e.g. the 0 for Absorption), or the highest
// enabled card when number is "highest" (keeps the human clear of Gate's
// floor cut and Subharmonic's lift, so the effect lands visibly on a bot).
async function submitCardNumber(page, number) {
  await page.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  const picked = await page.evaluate((want) => {
    const cards = [...document.querySelectorAll('[data-testid^="game-hand-card-"]')].filter((b) => !b.disabled);
    if (cards.length === 0) return false;
    const num = (b) => Number(b.getAttribute("data-testid").replace("game-hand-card-", ""));
    const btn =
      want === "highest"
        ? cards.reduce((a, b) => (num(b) > num(a) ? b : a))
        : cards.find((b) => num(b) === want);
    if (!btn) return false;
    btn.click();
    return true;
  }, number);
  if (!picked) throw new Error(`no enabled hand card for: ${number}`);
  await page.waitForFunction(
    () => {
      const b = document.querySelector('[data-testid="game-submit"]');
      return b && !b.disabled;
    },
    { timeout: 10_000 },
  );
  await clickTestId(page, "game-submit");
}

// New-round-powers coverage: pins each power via a one-entry Choose roster
// (same trick as interferenceFlow), then drives its distinctive moment —
// Broadcast's whole-board re-pick banner, Gate (id limiter) cutting the
// lowest scorer in the reveal, Subharmonic lifting the lowest scorer,
// Absorption paying the lone 0 the sum of what it silenced, Inversion
// flipping every scorer negative, Echo keeping the played card in hand
// on the next turn, and Fadeout fading the lowest scorer each turn with
// its live "signals remain" banner readout.
async function roundPowersFlow(browser) {
  let selectModalShot = false;
  const startSoloWithPower = async (name, powerId, ai) => {
    const p = await newPlayer(browser, name);
    await waitForText(p, "CANCEL");
    await clickTestId(p, "home-single-player");
    await typeInto(p, tid("home-name-input"), name);
    await clickTestId(p, "home-start-single");
    await p.waitForSelector(tid("lobby-solo-header"), { timeout: 10_000 });
    await setStepper(p, "lobby-ai", ai);
    await openOptions(p);
    await clickTestId(p, "lobby-powerup-selected");
    await p.waitForSelector(tid("round-power-select-modal"), { timeout: 10_000 });
    await waitOpaque(p, "round-power-select-modal");
    if (!selectModalShot) {
      // The full roster incl. Gate / Absorption / Broadcast.
      await shot(p, "round-power-select-full-roster", { fullPage: false });
      selectModalShot = true;
    }
    await clickTestId(p, "round-power-select-none");
    await clickTestId(p, `round-power-select-option-${powerId}`);
    await clickTestId(p, "round-power-select-save");
    await p.waitForFunction(
      () => !document.querySelector('[data-testid="round-power-select-modal"]'),
      { timeout: 10_000 },
    );
    await closeOptions(p);
    await clickTestId(p, "lobby-start-game");
    await p.waitForSelector(tid("round-power-preview-modal"), { timeout: 10_000 });
    await waitOpaque(p, "round-power-preview-modal");
    await shot(p, `${powerId}-preview`, { fullPage: false }); // captures example slide 1
    // Snap the example carousel to its last slide via the dots (same settle
    // wait as the game-end awards: the harness runs without reduced motion,
    // so the snap animates smoothly).
    const dots = await p.$$('[data-testid^="round-power-example-dot-"]');
    if (dots.length > 1) {
      await dots[dots.length - 1].click();
      await p.waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="round-power-example-scroll"]');
          return !!el && el.scrollLeft > 0 && Math.abs(el.scrollLeft + el.clientWidth - el.scrollWidth) < 2;
        },
        { timeout: 5_000 },
      );
      await shot(p, `${powerId}-preview-example-last`, { fullPage: false });
    }
    await clickTestId(p, "round-power-preview-play");
    await p.waitForSelector(tid("game-submit"), { timeout: 10_000 });
    return p;
  };

  // --- Broadcast: after submitting, the banner shows EVERY player's pick ---
  const bc = await startSoloWithPower("Solo", "broadcast", 3);
  // The in-game surface for the example carousel: the banner's "what's this?"
  // toggle opens the same RoundPowerDescription. Shot once here (any power
  // would do); closed again so the rest of the flow sees the usual layout.
  // The testid sits on the wrapper div (button + open description), so click
  // the inner button directly — the wrapper's center shifts onto the
  // description once it's open and a second wrapper-click wouldn't toggle.
  const bannerToggle = '[data-testid="game-round-power"] button';
  await bc.click(bannerToggle);
  await bc.waitForSelector(tid("game-round-power-description"), { timeout: 10_000 });
  await shot(bc, "broadcast-banner-examples");
  await bc.click(bannerToggle);
  await bc.waitForFunction(
    () => !document.querySelector('[data-testid="game-round-power-description"]'),
    { timeout: 10_000 },
  );
  await submitCardNumber(bc, "highest");
  await bc.waitForSelector(tid("game-broadcast-review"), { timeout: 10_000 });
  await shot(bc, "broadcast-review-banner"); // all 4 picks on the air
  await submitCardNumber(bc, "highest"); // keep the card; turn resolves
  await bc.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await shot(bc, "broadcast-reveal", { fullPage: false });

  // --- Gate (id limiter): the lowest card that scored gets cut to 0. Four
  // players so some card almost always survives as the floor (a 2-player game
  // too often ties out or lone-0s, leaving Gate's correct no-op instead of a
  // visible cut). Two turns shot, since a low tie on any single turn hides
  // the cut. ---
  const lm = await startSoloWithPower("Solo", "limiter", 3);
  for (let turn = 1; turn <= 2; turn++) {
    await submitCardNumber(lm, "highest");
    await lm.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
    await lm
      .waitForFunction(
        () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
        { timeout: 5_000 },
      )
      .catch(() => {});
    await shot(lm, `limiter-reveal-turn${turn}`, { fullPage: false });
    await clickTestId(lm, "reveal-continue");
    await lm.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), { timeout: 10_000 });
  }

  // --- Subharmonic: the lowest card that scored gains +4. Same 4-player,
  // two-turn setup as Gate (a low tie or a lone 0 on any single turn hides
  // the lift, so two shots make one visible lift near-certain). ---
  const sh = await startSoloWithPower("Solo", "subharmonic", 3);
  for (let turn = 1; turn <= 2; turn++) {
    await submitCardNumber(sh, "highest");
    await sh.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
    await sh
      .waitForFunction(
        () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
        { timeout: 5_000 },
      )
      .catch(() => {});
    await shot(sh, `subharmonic-reveal-turn${turn}`, { fullPage: false });
    await clickTestId(sh, "reveal-continue");
    await sh.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), { timeout: 10_000 });
  }

  // --- Absorption: play the 0; a lone 0 banks the sum of what it silenced ---
  const ab = await startSoloWithPower("Solo", "absorption", 1);
  await submitCardNumber(ab, 0);
  await ab.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await ab
    .waitForFunction(
      () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
      { timeout: 5_000 },
    )
    .catch(() => {});
  await shot(ab, "absorption-reveal", { fullPage: false });

  // --- Inversion: every card that scores counts against its player. Four
  // players, two turns shot, so at least one negative droop is near-certain
  // even if one turn ties out or gets wiped by a lone 0. ---
  const inv = await startSoloWithPower("Solo", "inversion", 3);
  for (let turn = 1; turn <= 2; turn++) {
    await submitCardNumber(inv, "highest");
    await inv.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
    await inv
      .waitForFunction(
        () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
        { timeout: 5_000 },
      )
      .catch(() => {});
    await shot(inv, `inversion-reveal-turn${turn}`, { fullPage: false });
    await clickTestId(inv, "reveal-continue");
    await inv.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), { timeout: 10_000 });
  }

  // --- Echo: played cards return to the hand. Solo vs 1 AI deals 0..3; play
  // the 3 on turn 1, then turn 2 must still offer it (normally it would be
  // gone), and it gets played again. ---
  const ec = await startSoloWithPower("Solo", "echo", 1);
  await submitCardNumber(ec, "highest");
  await ec.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await clickTestId(ec, "reveal-continue");
  await ec.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), { timeout: 10_000 });
  await ec.waitForSelector(tid("game-hand-card-3"), { timeout: 10_000 });
  await shot(ec, "echo-full-hand-turn2"); // hand still holds the card played on turn 1
  await submitCardNumber(ec, 3); // the same card, played again
  await ec.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await ec
    .waitForFunction(
      () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
      { timeout: 5_000 },
    )
    .catch(() => {});
  await shot(ec, "echo-reveal-repeat", { fullPage: false });

  // --- Fadeout: the lowest scorer each turn fades and scores nothing after.
  // Four players; two turns shot so a FADED/SIGNAL LOST chip is near-certain
  // (a single turn can legitimately fade nobody on a full tie or a lone-0
  // wipe). Between turns, the round-power banner shows the live race readout. ---
  const fo = await startSoloWithPower("Solo", "fadeout", 3);
  for (let turn = 1; turn <= 2; turn++) {
    await submitCardNumber(fo, "highest");
    await fo.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
    await fo
      .waitForFunction(
        () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
        { timeout: 5_000 },
      )
      .catch(() => {});
    await shot(fo, `fadeout-reveal-turn${turn}`, { fullPage: false });
    await clickTestId(fo, "reveal-continue");
    await fo.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), { timeout: 10_000 });
  }
  await fo.waitForSelector(tid("game-round-power-fadeout"), { timeout: 10_000 });
  await shot(fo, "fadeout-banner-readout"); // "N of 4 signals remain"

  // --- Conductor: preview only. Its example slide 2 is the lone custom-JSX
  // slide (the three-glyph pick diagram), captured by the helper's
  // last-dot tap; the round-end pick UI itself is the conductor flow's job. ---
  await startSoloWithPower("Solo", "conductor", 1);
}

// Drive an in-progress powerups-off game to the game-over screen (the reveal /
// round-results / submit loop from interferenceFlow, reusable across games).
async function playToGameEnd(page) {
  for (let guard = 0; guard < 50; guard++) {
    if (await has(page, "game-end-winner")) return;
    if (await has(page, "reveal-continue")) {
      await clickTestId(page, "reveal-continue");
      await page.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), { timeout: 10_000 });
      continue;
    }
    if (await has(page, "round-end-modal")) {
      await clickTestId(page, "round-end-ack");
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-testid="round-end-modal"]') ||
          !!document.querySelector('[data-testid="game-end-winner"]'),
        { timeout: 10_000 },
      );
      continue;
    }
    if (await has(page, "game-submit")) {
      await submitSomeCard(page);
      await page.waitForFunction(
        () =>
          !!document.querySelector('[data-testid="reveal-continue"]') ||
          !!document.querySelector('[data-testid="round-end-modal"]') ||
          !!document.querySelector('[data-testid="game-end-winner"]'),
        { timeout: 10_000 },
      );
      continue;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("game did not reach game_end");
}

// Cross-rematch series tally: a 1-round solo game vs 1 AI, straight through to
// game over (no series strip after game one), Play again (lobby shows the
// running series), then a second game (game over now shows the series strip).
async function seriesFlow(browser) {
  const p = await newPlayer(browser, "Solo");
  await waitForText(p, "CANCEL");
  await clickTestId(p, "home-single-player");
  await typeInto(p, tid("home-name-input"), "Solo");
  await clickTestId(p, "home-start-single");
  await p.waitForSelector(tid("lobby-solo-header"), { timeout: 10_000 });
  await setStepper(p, "lobby-ai", 1);
  await openOptions(p);
  await setRounds(p, 1);
  await clickTestId(p, "lobby-powerup-off");
  await closeOptions(p);
  // Fresh room: no series block in the lobby yet.
  if (await has(p, "lobby-series")) throw new Error("lobby-series rendered before any game was played");
  await clickTestId(p, "lobby-start-game");
  await p.waitForSelector(tid("game-submit"), { timeout: 10_000 });

  await playToGameEnd(p);
  // After game one the series is just the scoreboard again, so no strip yet.
  if (await has(p, "game-end-series")) throw new Error("game-end-series rendered after the first game");
  await shot(p, "game1-end-no-series");

  // Play again: the rematch lobby shows the running series under the seats.
  await clickTestId(p, "game-end-play-again");
  await p.waitForSelector(tid("lobby-series"), { timeout: 10_000 });
  await shot(p, "rematch-lobby-series");

  // Second game to game over: now the series strip renders.
  await clickTestId(p, "lobby-start-game");
  await p.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  await playToGameEnd(p);
  await p.waitForSelector(tid("game-end-series"), { timeout: 10_000 });
  await shot(p, "game2-end-series");
}

// Three humans all play card 1 for a guaranteed 3-way tie on the reveal:
// each row's solid wave should carry a staggered dotted inverse per opposing
// tied player, in that player's color.
async function tie3Flow(browser) {
  const host = await newPlayer(browser, "Host");
  await waitForText(host, "CANCEL");
  await clickTestId(host, "home-new-game");
  await typeInto(host, tid("home-name-input"), "Host");
  await clickTestId(host, "home-create-room");
  await host.waitForSelector(tid("lobby-options"), { timeout: 10_000 });
  const code = await host.$eval(tid("lobby-room-code"), (el) => el.innerText.trim());
  console.log(`[verify] room code: ${code}`);
  // Round powers off: Harmony would turn the tie into doubled survivors.
  await openOptions(host);
  await clickTestId(host, "lobby-powerup-off");
  await closeOptions(host);
  const join = async (name) => {
    const p = await newPlayer(browser, name);
    await waitForText(p, "CANCEL");
    await clickTestId(p, "home-join-with-code");
    await typeInto(p, tid("home-code-input"), code);
    await typeInto(p, tid("home-name-input"), name);
    await clickTestId(p, "home-join");
    await p.waitForSelector(tid("lobby-options"), { timeout: 10_000 });
    return p;
  };
  const j1 = await join("Joiner1");
  const j2 = await join("Joiner2");
  await clickTestId(host, "lobby-start-game");
  const submitOne = async (page) => {
    await page.waitForSelector(tid("game-submit"), { timeout: 10_000 });
    await clickTestId(page, "game-hand-card-1");
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-testid="game-submit"]');
      return b && !b.disabled;
    }, { timeout: 10_000 });
    await clickTestId(page, "game-submit");
  };
  await submitOne(host);
  await submitOne(j1);
  await submitOne(j2);
  await host.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await host.waitForFunction(
    () => document.querySelector('[data-testid="reveal-modal"]')?.getAttribute("data-reveal-phase") === "score",
    { timeout: 10_000 },
  );
  await shot(host, "three-way-tie");
}

// Conductor round power: two scripted humans, a one-entry Choose roster so round 1
// is guaranteed conductor, a 4-round game, and a deterministic host round-1 win
// (cards 0..3 in a 2-player game: Host 1,0,2,3 vs Joiner 0,3,1,2 → the lone 0s wipe
// turns 1-2, then Host takes 2v1 and 3v2 for a 5-3 round). Screenshots the live
// leader line from both seats, the joiner's waiting chip, the host's pick UI (a
// single option — conductor again, via the exhausted-roster fallback, locking the
// "offer what's left" edge), the joiner's chosen chip, and round 2's "Chosen by"
// credit on the preview and the in-game banner. Round 2 (conductor again) is then
// played to a scripted all-tie: the podium is drawn by lot between the tied players
// (shots of the lot winner's "tie broke your way" pick UI and the other seat's
// "drew the podium" chip — which side is which is random, so the flow branches),
// then the host skips waiting past the unpicked winner to lock round 3's "Drawn at
// random" slot-machine preview reveal (the draw animation runs in the harness too,
// so the shot waits for the settle fade to finish).
async function conductorFlow(browser) {
  const host = await newPlayer(browser, "Host");
  await waitForText(host, "CANCEL");
  await clickTestId(host, "home-new-game");
  await typeInto(host, tid("home-name-input"), "Host");
  await clickTestId(host, "home-create-room");
  await host.waitForSelector(tid("lobby-options"), { timeout: 10_000 });
  const code = await host.$eval(tid("lobby-room-code"), (el) => el.innerText.trim());
  console.log(`[verify] room code: ${code}`);

  // Choose roster = [conductor] only; 4 rounds so round 3 can re-draw conductor
  // (a conductor-only roster before a FINAL round has nothing to offer).
  await openOptions(host);
  await setRounds(host, 4);
  await clickTestId(host, "lobby-powerup-selected");
  await host.waitForSelector(tid("round-power-select-modal"), { timeout: 10_000 });
  await waitOpaque(host, "round-power-select-modal");
  await clickTestId(host, "round-power-select-none");
  await clickTestId(host, "round-power-select-option-conductor");
  await clickTestId(host, "round-power-select-save");
  await host.waitForFunction(
    () => !document.querySelector('[data-testid="round-power-select-modal"]'),
    { timeout: 10_000 },
  );
  await closeOptions(host);

  const joiner = await newPlayer(browser, "Joiner");
  await waitForText(joiner, "CANCEL");
  await clickTestId(joiner, "home-join-with-code");
  await typeInto(joiner, tid("home-code-input"), code);
  await typeInto(joiner, tid("home-name-input"), "Joiner");
  await clickTestId(joiner, "home-join");
  await joiner.waitForSelector(tid("lobby-options"), { timeout: 10_000 });

  await clickTestId(host, "lobby-start-game");
  const dismissPreview = async (page) => {
    await page.waitForSelector(tid("round-power-preview-modal"), { timeout: 10_000 });
    await waitOpaque(page, "round-power-preview-modal");
    await clickTestId(page, "round-power-preview-play");
    await page.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  };
  await dismissPreview(host);
  await dismissPreview(joiner);

  // Play a scripted list of [host, joiner] card pairs, clicking through reveals.
  const playTurns = async (pairs, onAfterTurn) => {
    for (let i = 0; i < pairs.length; i++) {
      const [h, j] = pairs[i];
      await submitCardNumber(host, h);
      await submitCardNumber(joiner, j);
      for (const page of [host, joiner]) {
        await page.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
        await clickTestId(page, "reveal-continue");
        await page.waitForFunction(() => !document.querySelector('[data-testid="reveal-modal"]'), {
          timeout: 10_000,
        });
      }
      if (onAfterTurn) await onAfterTurn(i);
    }
  };

  // Round 1: 4 turns in a 2-player game, host wins 5-3.
  await playTurns(
    [
      [1, 0], // Joiner's lone 0 wipes the board
      [0, 3], // Host's lone 0 wipes back
      [2, 1], // Host +2, Joiner +1
      [3, 2], // Host +3, Joiner +2 → Host wins 5-3
    ],
    async (i) => {
      if (i !== 2) return;
      // After turn 3 the host leads 2-1: the banner's live conductor readout,
      // from both seats ("you lead…" vs "Host leads…").
      await host.waitForFunction(
        () => document.querySelector('[data-testid="game-round-power-leader"]')?.textContent?.includes("you lead"),
        { timeout: 10_000 },
      );
      await shot(host, "conductor-leader-line");
      await joiner.waitForFunction(
        () => document.querySelector('[data-testid="game-round-power-leader"]')?.textContent?.includes("Host leads"),
        { timeout: 10_000 },
      );
      await shot(joiner, "conductor-leader-line-opponent");
    },
  );

  // Round end: the joiner waits on the conducting host.
  await joiner.waitForSelector(tid("round-end-conductor-waiting"), { timeout: 10_000 });
  await waitOpaque(joiner, "round-end-modal");
  await shot(joiner, "conductor-joiner-waiting", { fullPage: false });
  await host.waitForSelector(tid("round-end-conductor-choose"), { timeout: 10_000 });
  await waitOpaque(host, "round-end-modal");
  await shot(host, "conductor-host-pick", { fullPage: false });

  // Host picks (the lone fallback option: conductor again); joiner sees the chosen chip.
  await clickTestId(host, "round-end-conductor-option-conductor");
  await joiner.waitForSelector(tid("round-end-conductor-chosen"), { timeout: 10_000 });
  await shot(joiner, "conductor-joiner-chosen-chip", { fullPage: false });

  // Joiner acks → round 2 starts with the chosen power, credited on the preview…
  await clickTestId(joiner, "round-end-ack");
  await joiner.waitForSelector(tid("round-power-preview-chosen-by"), { timeout: 10_000 });
  await waitOpaque(joiner, "round-power-preview-modal");
  await shot(joiner, "conductor-round2-preview-chosen-by", { fullPage: false });
  await dismissPreview(joiner);

  // …and on the host's in-game banner ("chosen by you").
  await host.waitForSelector(tid("round-power-preview-modal"), { timeout: 10_000 });
  await dismissPreview(host);
  await host.waitForSelector(tid("game-round-power-chosen-by"), { timeout: 10_000 });
  await shot(host, "conductor-round2-banner-chosen-by");

  // Round 2 (conductor, chosen by Host): identical cards every turn → every card
  // ties or suppresses, an all-zero round → the podium is drawn by LOT between
  // the two tied players (a name-flicker plays first, then the pick UI lands on
  // whichever seat the engine drew).
  await playTurns([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ]);
  await host.waitForFunction(
    () =>
      document.querySelector('[data-testid="round-end-conductor-choose"]') ||
      document.querySelector('[data-testid="round-end-conductor-waiting"]'),
    { timeout: 15_000 },
  );
  const hostDrewLot = await has(host, "round-end-conductor-choose");
  const lotWinner = hostDrewLot ? host : joiner;
  const lotOther = hostDrewLot ? joiner : host;
  console.log(`[verify] lot winner: ${hostDrewLot ? "Host" : "Joiner"}`);
  await lotWinner.waitForSelector(tid("round-end-conductor-choose"), { timeout: 15_000 });
  await waitOpaque(lotWinner, "round-end-modal");
  await shot(lotWinner, "conductor-lot-winner-pick", { fullPage: false }); // "The tie broke your way."
  await lotOther.waitForSelector(tid("round-end-conductor-waiting"), { timeout: 15_000 });
  await shot(lotOther, "conductor-lot-waiting-chip", { fullPage: false }); // "NAME drew the podium…"

  // Nobody picks; the host skips waiting past the unpicked lot winner → round 3
  // opens with the slot-machine "Drawn at random" reveal (the draw is conductor
  // again, the only roster entry and round 3 is not final). The drawn-random
  // testid appears at settle; wait out the 300ms description/button fade-in
  // before shooting the landed frame.
  await clickTestId(host, "round-end-force-advance");
  await host.waitForSelector(tid("round-power-preview-drawn-random"), { timeout: 15_000 });
  await host.waitForFunction(
    () => {
      const b = document.querySelector('[data-testid="round-power-preview-play"]');
      return b && getComputedStyle(b).opacity === "1";
    },
    { timeout: 10_000 },
  );
  await waitOpaque(host, "round-power-preview-modal");
  await shot(host, "conductor-round3-drawn-at-random", { fullPage: false });
}

const flows = {
  "lobby-rounds": lobbyRoundsFlow,
  "tie-3way": tie3Flow,
  conductor: conductorFlow,
  "host-leave": hostLeaveFlow,
  "single-player": singlePlayerFlow,
  interference: interferenceFlow,
  "round-powers": roundPowersFlow,
  series: seriesFlow,
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const flowName = process.argv[2] || "lobby-rounds";
  const flow = flows[flowName];
  if (!flow) {
    throw new Error(`unknown flow "${flowName}". known: ${Object.keys(flows).join(", ")}`);
  }

  rmSync(SHOTS_DIR, { recursive: true, force: true });
  mkdirSync(SHOTS_DIR, { recursive: true });

  const executablePath = findChrome();
  console.log(`[verify] chrome: ${executablePath}`);
  const server = await ensureServer();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    console.log(`[verify] running flow: ${flowName}`);
    await flow(browser);
    console.log(`\n[verify] done. ${shots.length} screenshots:`);
    for (const s of shots) console.log("  " + s);
  } finally {
    await browser.close();
    if (server) {
      server.kill();
      // Best-effort: kill the whole tree on Windows so vite/tsx don't linger.
      if (process.platform === "win32" && server.pid) {
        spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", shell: true });
      }
    }
  }
}

main().catch((e) => {
  console.error("[verify] FAILED:", e.message);
  process.exit(1);
});
