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
  await waitForText(host, "Rounds");
  const code = await host.$eval(tid("lobby-room-code"), (el) => el.innerText.trim());
  console.log(`[verify] room code: ${code}`);
  await shot(host, "host-lobby-default"); // expect Rounds = 3

  // Host bumps rounds to the max; + must disable at 5.
  await setRounds(host, 5);
  const plusDisabled = await host.$eval(tid("lobby-rounds-plus"), (b) => b.disabled);
  console.log(`[verify] at rounds=5, "+" disabled = ${plusDisabled}`);
  await shot(host, "host-rounds-5-max");

  // Joiner joins the room; sees a read-only chip mirroring the host's 5.
  const joiner = await newPlayer(browser, "Joiner");
  await waitForText(joiner, "CANCEL");
  await clickTestId(joiner, "home-join-with-code");
  await typeInto(joiner, tid("home-code-input"), code);
  await typeInto(joiner, tid("home-name-input"), "Joiner");
  await clickTestId(joiner, "home-join");
  await waitForRoundsChip(joiner, 5);
  await shot(joiner, "joiner-rounds-5");

  // Host drops to 2; confirm it propagates live to the joiner's chip.
  await setRounds(host, 2);
  await shot(host, "host-rounds-2");
  await waitForRoundsChip(joiner, 2);
  await shot(joiner, "joiner-rounds-2");

  // Host starts the 2-round game. The room-code element only exists in the
  // lobby, so its disappearance is a reliable "we're in-game" signal.
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
  await waitForText(host, "Rounds");
  const code = await host.$eval(tid("lobby-room-code"), (el) => el.innerText.trim());
  console.log(`[verify] room code: ${code}`);
  // Power-ups off keeps submissions to a plain number (no pool/preview/power pick).
  await clickTestId(host, "lobby-powerup-off");

  // Two joiners.
  const join = async (name) => {
    const p = await newPlayer(browser, name);
    await waitForText(p, "CANCEL");
    await clickTestId(p, "home-join-with-code");
    await typeInto(p, tid("home-code-input"), code);
    await typeInto(p, tid("home-name-input"), name);
    await clickTestId(p, "home-join");
    await waitForText(p, "Rounds");
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
  await clickTestId(solo, "lobby-powerup-off");

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
  // Choose the roster and narrow it to just Crosstalk, so the round power is
  // deterministic and we can exercise its two-phase neighbor re-pick.
  await clickTestId(a, "lobby-powerup-selected");
  await a.waitForSelector(tid("round-power-select-modal"), { timeout: 10_000 });
  await waitOpaque(a, "round-power-select-modal");
  await clickTestId(a, "round-power-select-none");
  await clickTestId(a, "round-power-select-option-crosstalk");
  await shot(a, "round-power-select", { fullPage: false });
  await clickTestId(a, "round-power-select-save");
  await a.waitForFunction(
    () => !document.querySelector('[data-testid="round-power-select-modal"]'),
    { timeout: 10_000 },
  );
  await shot(a, "lobby-solo-crosstalk"); // lobby with Crosstalk chosen
  await clickTestId(a, "lobby-start-game");
  await a.waitForSelector(tid("round-power-preview-modal"), { timeout: 10_000 });
  await waitOpaque(a, "round-power-preview-modal");
  await shot(a, "round-start-preview", { fullPage: false }); // "this round's power" = Crosstalk
  await clickTestId(a, "round-power-preview-play");
  await a.waitForSelector(tid("game-submit"), { timeout: 10_000 });
  await a.waitForSelector(tid("game-round-power"), { timeout: 10_000 });
  await shot(a, "game-turn-with-round-power"); // the turn screen showing the round-power banner
  // Submit an initial pick; bots have already pre-submitted, so this opens the
  // Crosstalk re-pick where each player sees their neighbor's number.
  await submitSomeCard(a);
  await a.waitForSelector(tid("game-neighbor-review"), { timeout: 10_000 });
  await shot(a, "game-neighbor-review"); // "your neighbor is planning to play…"
  // Re-pick to resolve the turn and reach the reveal.
  await submitSomeCard(a);
  await a.waitForSelector(tid("reveal-continue"), { timeout: 10_000 });
  await shot(a, "crosstalk-reveal", { fullPage: false });

  // --- Phase B: full playthrough to round results + game over ---
  const b = await newPlayer(browser, "Solo");
  await waitForText(b, "CANCEL");
  await clickTestId(b, "home-single-player");
  await typeInto(b, tid("home-name-input"), "Solo");
  await clickTestId(b, "home-start-single");
  await b.waitForSelector(tid("lobby-solo-header"), { timeout: 10_000 });
  await setStepper(b, "lobby-ai", 1); // 2 players → 4 turns/round
  await setRounds(b, 2);
  await clickTestId(b, "lobby-powerup-off");
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
}

const flows = {
  "lobby-rounds": lobbyRoundsFlow,
  "host-leave": hostLeaveFlow,
  "single-player": singlePlayerFlow,
  interference: interferenceFlow,
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
