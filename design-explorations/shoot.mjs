// Design-exploration screenshot harness.
//
// Screenshots every style demo in design-explorations/styles/ across the five
// screens (home, lobby, game, reveal, end) using the system Chrome/Edge via
// puppeteer-core, then (full runs only) regenerates the review gallery
// (index.html) and README.md from whatever shots exist on disk.
//
//   node design-explorations/shoot.mjs            # all styles + regen gallery
//   node design-explorations/shoot.mjs 07         # styles matching "07" only,
//                                                 # no gallery regen (race-free
//                                                 # for parallel self-verify)
//   node design-explorations/shoot.mjs --list     # print discovered styles
//
// Demos are loaded over file:// with ?screen=<name>; each shot is a fresh page
// load. prefers-reduced-motion is emulated so demos render their resting state.

import { existsSync, mkdirSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STYLES_DIR = join(ROOT, "styles");
const SHOTS_DIR = join(ROOT, "shots");
const SCREENS = ["home", "lobby", "game", "reveal", "end"];
const VIEWPORT = { width: 420, height: 900, deviceScaleFactor: 1 };

// Display names + one-line blurbs for the generated gallery/README.
// Keyed by style slug (filename without NN- prefix and .html).
const STYLE_INFO = {
  "original": ["Original (current app)", "Today's live design, included as the baseline for comparison."],
  "arcade-crt": ["Arcade CRT", "Neon cabinet glow, scanlines, pixel type, insert-coin energy."],
  "cassette-futurism": ["Cassette Futurism", "Beige hardware panel, orange accents, 7-segment numerals."],
  "paper-cutout": ["Paper Cutout", "Layered construction paper, torn edges, hard shadows."],
  "risograph-zine": ["Risograph Zine", "Two-ink overprint, grain, deliberate misregistration."],
  "tabloid-front-page": ["Tabloid Front Page", "Newsprint, giant CANCELLED! headlines, halftone."],
  "medieval-manuscript": ["Medieval Manuscript", "Parchment, illuminated capitals, gold-leaf numerals."],
  "swiss-international": ["Swiss International", "Red/black/white, rigorous grid, type does the work."],
  "bauhaus": ["Bauhaus", "Primary colors and circles, triangles, squares as UI."],
  "art-deco": ["Art Deco", "Black and gold geometry, fan motifs, Gatsby frames."],
  "noir-editorial": ["Noir Editorial", "Fashion-magazine serif elegance, ink on cream."],
  "bingo-hall": ["Bingo Hall", "Numbers as bingo balls, dauber marks, ticket strips."],
  "metro-wayfinding": ["Metro Wayfinding", "Transit signage, numbered line roundels as cards."],
  "tokyo-neon": ["Tokyo Neon", "Night-alley palette, neon tube signage, lantern accents."],
  "clay-toybox": ["Clay Toybox", "Claymorphism: matte squishy 3D blobs, soft shadows."],
  "memphis-party": ["Memphis Party", "80s squiggles, confetti geometry, pastel-bold clash."],
  "aurora-glass": ["Aurora Glass", "Frosted glassmorphism over iridescent gradient mesh."],
  "mission-control": ["Mission Control", "Dark telemetry console: readouts, gauges, status lights."],
  "black-hole": ["Black Hole", "Event horizon, accretion ring, cancellation as gravity."],
  "nebula-drift": ["Nebula Drift", "Deep-space dust clouds, starfields, constellation lines."],
  "pulp-space-age": ["Pulp Space Age", "50s sci-fi paperback: planets, rockets, starbursts."],
  "tarot-midnight": ["Tarot Midnight", "Velvet night sky, gold line-art, cards as a reading."],
  "haunted-seance": ["Haunted Seance", "Victorian parlor gothic: candlelight, fog, spirit cards."],
  "case-file-mystery": ["Case File Mystery", "Detective noir: case files, typewriter, red string."],
  "crazy-eights": ["Crazy Eights", "Glossy shedding-game cards, thick borders, bright table."],
  "go-fish-vintage": ["Go Fish Vintage", "50s children's card deck, soft retro inks, fanned hands."],
  "forest-glade": ["Forest Glade", "Woodland greens, wood-grain panels, carved number tiles."],
  "riverstone-zen": ["Riverstone Zen", "Numbers on river stones, raked sand, misty teal calm."],
  "watercolor-wash": ["Watercolor Wash", "Pastel blooms on cold-press paper, ink-line details."],
  "sumi-ink": ["Sumi Ink", "Brushstroke sumi-e on rice paper, vermilion seal stamps."],
  "fable-overprint": ["Fable: Overprint", "Cancellation as subtractive ink overlap on warm cream."],
  "fable-interference": ["Fable: Interference", "Players as waveforms; matches flatline to silence."],
  "fable-cast-of-numbers": ["Fable: Cast of Numbers", "Numerals as a chunky character cast; 0 eats rounds."],
  "refined-current": ["Refined Current", "Today's design executed intentionally: spacing, depth, hierarchy."],
  "ember-glow": ["Ember Glow", "Current style plus warm gradients, glow, and depth."],
  "daylight-paper": ["Daylight Paper", "The current palette inverted into a warm light mode."],
  "neon-edge": ["Neon Edge", "Current dark base with electric edge-lit cards and CTAs."],
  "tactile-round": ["Tactile Round", "Current identity rebuilt chunky, springy, sticker-like."],
  "clean-light": ["Clean Light", "Unthemed modern light-mode product app, teal accent, pure craft."],
  "modern-dark": ["Modern Dark", "Unthemed refined dark-mode product app, indigo accent, precise."],
  "friendly-round": ["Friendly Round", "Unthemed cheerful consumer app: chunky pressed buttons, round and bold."],
  "aurora-ember": ["Aurora: Ember", "Aurora Glass in Ember Glow's warm coral-amber firelight; cancelled cards go dark and cold."],
  "aurora-tokyo": ["Aurora: Tokyo", "Aurora Glass with Tokyo Neon's electric night palette; cancelled numerals are dead neon tubes."],
  "aurora-noir": ["Aurora: Noir", "Red and black smoked glass, crimson aurora; cancelled cards crack."],
  "aurora-neumorph": ["Aurora: Neumorph", "The aurora layout gone soft-UI: extruded matte surfaces; cancelled cards press into the surface."],
  "aurora-liquid": ["Aurora: Liquid", "Apple-style liquid glass: clear, refractive, specular; cancelled cards fog with condensation."],
  "aurora-smoke": ["Aurora: Smoke", "Monochrome smoked glass, moonlight beams, one ice-blue accent; cancelled numerals dissolve to smoke."],
  "aurora-eclipse": ["Aurora: Eclipse", "Emerald and champagne glass; cancelled cards are eclipsed by a gold-corona disc."],
  "aurora-prism": ["Aurora: Prism", "Light-mode clear glass with sparing prism refractions; cancelled numerals split chromatically."],
  "ember-liquid": ["Ember Liquid", "The hybrid: Liquid's clear refractive glass in Ember's coral-amber firelight."],
  "blue-flame-liquid": ["Blue Flame Liquid", "Ember Liquid's twin burning cold: green to violet flame through clear glass."],
  "aurora-glass-2": ["Aurora Glass 2", "The original aurora, refined: no home orbs, violet shifted toward blue, teal and pink kept."],
};

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

function listStyles() {
  if (!existsSync(STYLES_DIR)) return [];
  return readdirSync(STYLES_DIR)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => join(STYLES_DIR, f));
}

function styleSlug(file) {
  return basename(file, ".html"); // e.g. "01-arcade-crt"
}

function styleInfo(slug) {
  const bare = slug.replace(/^\d+-/, "");
  const [name, blurb] = STYLE_INFO[bare] || [titleCase(bare), ""];
  return { name, blurb };
}

function titleCase(s) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function shootStyle(page, file) {
  const slug = styleSlug(file);
  const outDir = join(SHOTS_DIR, slug);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const shots = [];
  for (const [i, screen] of SCREENS.entries()) {
    const url = pathToFileURL(file).href + `?screen=${screen}`;
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    // Wait for web fonts, but never hang on a dead network.
    await page.evaluate(
      () => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]),
    );
    await new Promise((r) => setTimeout(r, 250)); // settle late font-swap reflow
    const path = join(outDir, `${i + 1}-${screen}.png`);
    await page.screenshot({ path, fullPage: true });
    shots.push(path);
  }
  return shots;
}

function generateGallery(styleFiles) {
  // Synthetic entries are shot dirs with no demo file (e.g. 00-original, the
  // current app's screenshots copied in as the comparison baseline).
  const slugs = styleFiles.map(styleSlug);
  if (existsSync(join(SHOTS_DIR, "00-original"))) slugs.unshift("00-original");
  const hasDemo = (slug) => existsSync(join(STYLES_DIR, `${slug}.html`));

  const sections = slugs.map((slug) => {
    const { name, blurb } = styleInfo(slug);
    const imgs = SCREENS.map((screen, i) => {
      const rel = `shots/${slug}/${i + 1}-${screen}.png`;
      return `<a href="${rel}" title="${name}: ${screen}"><img loading="lazy" src="${rel}" alt="${name} ${screen}"></a>`;
    }).join("\n      ");
    const demoLink = hasDemo(slug)
      ? ` <a class="demo" href="styles/${slug}.html" title="open live demo">live demo ↗</a>`
      : "";
    return `  <section id="${slug}">
    <h2>${slug.slice(0, 2)} · ${name}${demoLink}</h2>
    <p>${blurb}</p>
    <div class="row">
      ${imgs}
    </div>
  </section>`;
  });

  const toc = slugs
    .map((slug) => `<a href="#${slug}">${slug.slice(0, 2)} ${styleInfo(slug).name}</a>`)
    .join(" · ");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cancel — design exploration gallery</title>
<style>
  body { font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 24px; background: #16151c; color: #f5f1e8; }
  h1 { font-size: 26px; } h2 { font-size: 19px; margin: 8px 0 2px; }
  p { margin: 2px 0 10px; color: #b9b4a8; }
  nav { margin-bottom: 28px; line-height: 2; }
  a { color: #ff8a6b; text-decoration: none; } a:hover { text-decoration: underline; }
  .demo { font-size: 13px; font-weight: normal; margin-left: 10px; }
  section { margin-bottom: 36px; }
  .row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-width: 1400px; }
  .row img { width: 100%; height: auto; display: block; border-radius: 6px; background: #000; }
</style>
</head>
<body>
<h1>Cancel — design exploration gallery</h1>
<p>${slugs.length} styles × ${SCREENS.length} screens (home, lobby, game, reveal, end). Click a shot for full size, or open the live demo and browse screens with the 1-5 switcher.</p>
<nav>${toc}</nav>
${sections.join("\n")}
</body>
</html>
`;
  writeFileSync(join(ROOT, "index.html"), html);

  const md = [
    "# Cancel — design exploration gallery",
    "",
    "_Generated by `shoot.mjs` from the screenshots in `shots/` — do not hand-edit; see `README.md` for the durable guide._",
    "",
    `${slugs.length} visual styles, each a self-contained demo in \`styles/\` with five screens (home, lobby, game, reveal, end).`,
    "Regenerate this file and the screenshots with `node design-explorations/shoot.mjs` (or just this file with `--gallery`).",
    "",
    ...slugs.flatMap((slug) => {
      const { name, blurb } = styleInfo(slug);
      const imgs = SCREENS.map((screen, i) => {
        const rel = `shots/${slug}/${i + 1}-${screen}.png`;
        return `<a href="${rel}"><img src="${rel}" width="150" alt="${screen}"></a>`;
      }).join(" ");
      const demo = hasDemo(slug) ? [`[Live demo](styles/${slug}.html)`, ""] : [];
      return [`## ${slug.slice(0, 2)} — ${name}`, "", blurb, "", ...demo, imgs, ""];
    }),
  ].join("\n");
  writeFileSync(join(ROOT, "GALLERY.md"), md);
}

async function main() {
  const arg = process.argv[2];
  const all = listStyles();
  if (arg === "--list") {
    for (const f of all) console.log(styleSlug(f));
    return;
  }
  if (arg === "--gallery") {
    generateGallery(all);
    console.log(join(ROOT, "index.html"));
    console.log(join(ROOT, "GALLERY.md"));
    return;
  }
  const targets = arg ? all.filter((f) => styleSlug(f).includes(arg)) : all;
  if (targets.length === 0) {
    console.error(arg ? `No style matches "${arg}".` : "No styles found in styles/.");
    process.exitCode = 1;
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  let hadPageError = false;
  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    let current = "";
    page.on("pageerror", (e) => {
      hadPageError = true;
      console.error(`PAGE ERROR in ${current}: ${e.message}`);
    });
    for (const file of targets) {
      current = styleSlug(file);
      const shots = await shootStyle(page, file);
      for (const s of shots) console.log(s);
    }
  } finally {
    await browser.close();
  }

  if (!arg) {
    generateGallery(all);
    console.log(join(ROOT, "index.html"));
    console.log(join(ROOT, "GALLERY.md"));
  }
  if (hadPageError) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
