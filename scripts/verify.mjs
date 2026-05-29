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
async function shot(page, name) {
  const n = String(++shotCount).padStart(2, "0");
  const path = join(SHOTS_DIR, `${n}-${name}.png`);
  await page.screenshot({ path, fullPage: true });
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

const flows = {
  "lobby-rounds": lobbyRoundsFlow,
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
