import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { POWER_UPS, type PowerUpId, type PowerUpDef } from "../../shared/types.js";
import { useMusicMuted, useMusicUnlocked } from "./music.js";
import { Wave, rankForNumber, amplitudePathForScore } from "./wave.js";

// The 8 player signals. Each seat has a tailwind bg/text class (for solid fills
// like the avatar) and a `hex` that drives its glowing waveform (inline color).
// Seats 0-3 are the demo's named players (Ben/Voltaire/Mechano/Data Dan); 4-7 are
// distinct glow colors that read clearly on the indigo void and against the
// cancelled grey (#9aa0b8). The class strings below MUST stay literal (see note).
export const SEATS = [
  { bg: "bg-accent", text: "text-accent", hex: "#ff7a5c" }, // Ben — warm coral
  { bg: "bg-cool", text: "text-cool", hex: "#6fa8ff" }, // Voltaire — ice blue
  { bg: "bg-gold", text: "text-gold", hex: "#ffd166" }, // Mechano — gold
  { bg: "bg-emerald-500", text: "text-emerald-500", hex: "#5ad6a0" }, // Data Dan — green
  { bg: "bg-fuchsia-500", text: "text-fuchsia-500", hex: "#e879f9" }, // magenta
  { bg: "bg-cyan-400", text: "text-cyan-400", hex: "#22d3ee" }, // cyan
  { bg: "bg-orange-300", text: "text-orange-300", hex: "#fdba74" }, // peach
  { bg: "bg-rose-400", text: "text-rose-400", hex: "#fb7185" }, // rose
] as const;

export function seatColor(seat: number) {
  return SEATS[seat % SEATS.length];
}

// Class-name views of SEATS, kept as literal lists (not derived via .map/.replace)
// so Tailwind's JIT actually emits each rule. Otherwise classes like text-cool
// silently no-op because their string never appears in source. The `hex` field is
// only ever used inline (style.color), never as a class, so it needs no JIT entry.
export const SEAT_COLORS = [
  "bg-accent",
  "bg-cool",
  "bg-gold",
  "bg-emerald-500",
  "bg-fuchsia-500",
  "bg-cyan-400",
  "bg-orange-300",
  "bg-rose-400",
];

export const SEAT_TEXT_COLORS = [
  "text-accent",
  "text-cool",
  "text-gold",
  "text-emerald-500",
  "text-fuchsia-500",
  "text-cyan-400",
  "text-orange-300",
  "text-rose-400",
];

const NUMBER_CARD_DIM = { sm: "w-12 h-16", md: "w-[60px] h-20", lg: "w-20 h-28" } as const;
const NUMBER_CARD_TEXT = { sm: "text-xl", md: "text-3xl", lg: "text-4xl" } as const;
const NUMBER_WAVE_H = { sm: "h-3", md: "h-4", lg: "h-6" } as const;

// A number is a signal: the numeral plus a waveform whose frequency = its rank
// (0 is a flat, silent line). The card is a dark panel; state tints the numeral
// and its wave (selected glows coral; played settles to paper; ghost fades).
export function NumberCard({
  n,
  state = "idle",
  onClick,
  size = "md",
  testId,
}: {
  n: number;
  state?: "idle" | "selected" | "played" | "ghost" | "muted";
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  testId?: string;
}) {
  const isZero = n === 0;
  const rank = rankForNumber(n);
  const sel = state === "selected";
  const numCls =
    sel
      ? "text-[#ffb39e] [text-shadow:0_0_12px_rgba(255,122,92,0.7)]"
      : state === "played"
      ? "text-paper"
      : state === "ghost"
      ? "text-paper/30"
      : state === "muted"
      ? "text-paper/40"
      : "text-paper";
  // undefined color → wave inherits the faint coral on .nwv (idle hand look).
  const waveColor =
    sel
      ? "#ff8a6e"
      : state === "played"
      ? "rgba(238,240,251,0.55)"
      : state === "ghost"
      ? "rgba(238,240,251,0.18)"
      : state === "muted"
      ? "rgba(238,240,251,0.22)"
      : undefined;
  const waveVariant = sel ? "soft" : state === "ghost" ? "ghosted" : "solid";
  const animated = state === "idle" || sel;
  const cx = `card-face shrink-0 flex-col justify-between items-stretch px-1.5 py-2 ${NUMBER_CARD_DIM[size]} ${
    onClick ? "cursor-pointer" : ""
  } ${sel ? "-translate-y-1.5 border-accent/80 shadow-[0_10px_26px_rgba(255,122,92,0.28),0_0_0_1px_rgba(255,138,110,0.4)]" : ""} transition`;
  return (
    <button type="button" disabled={!onClick} onClick={onClick} className={cx} data-sfx="tap" data-testid={testId}>
      <span className={`block text-center leading-none ${NUMBER_CARD_TEXT[size]} ${numCls}`}>
        {isZero ? <span className="font-display font-bold">Ø</span> : n}
      </span>
      <span className={`nwv ${NUMBER_WAVE_H[size]}`}>
        <Wave rank={rank} variant={waveVariant} color={waveColor} animated={animated} className="w-full h-full" />
      </span>
    </button>
  );
}

// Each power is a glyph that glows in its family color on a dark tile (the .pcard
// recipe in index.css drives --pc). Families: green = good-for-you, rose/red =
// harm, teal = swap/shield, blue = zero/flip/mirror structural, violet =
// wild/random, slate = inert/silence, amber = amplify/drain.
const POWER_VISUAL: Record<PowerUpId, { abbr: string; color: string }> = {
  double: { abbr: "×2", color: "#ffb84d" },
  tie_die: { abbr: "⚔", color: "#4dd6c4" },
  negate_zero: { abbr: "Ø!", color: "#6fa8ff" },
  plus_two: { abbr: "+2", color: "#4ade80" },
  free_three: { abbr: "3", color: "#7ef0a0" },
  make_negative: { abbr: "−", color: "#ff5c7a" },
  minus_two: { abbr: "−2", color: "#ff8095" },
  peek: { abbr: "◎", color: "#5bd6e6" },
  mute: { abbr: "⌖", color: "#9aa0c8" },
  slide: { abbr: "↻", color: "#c98bff" },
  equalize: { abbr: "≈", color: "#7fe4ee" },
  sabotage: { abbr: "✖", color: "#ff5c7a" },
  flip: { abbr: "⇋", color: "#8ea2ff" },
  drain: { abbr: "↧", color: "#ffa64d" },
  jinx: { abbr: "=", color: "#ff7ad1" },
  wild: { abbr: "?", color: "#b48bff" },
  swap_hands: { abbr: "⇄", color: "#4dd6c4" },
  switch_cards: { abbr: "⇌", color: "#52c8d8" },
  sacrifice: { abbr: "▼", color: "#e04a68" },
  random_ray: { abbr: "↯", color: "#9a6dff" },
  nothingburger: { abbr: "∅", color: "#7c819c" },
};

// Defensive fallbacks: a room persisted before a power-up rename can carry an
// id that's no longer in POWER_VISUAL/POWER_UPS. Indexing those maps would yield
// undefined and crash the whole tree (white screen). These resolvers degrade a
// stale id to a neutral "?" card instead. The description keeps a scope prefix
// so ScopedDescription still parses cleanly.
const FALLBACK_VISUAL = { abbr: "?", color: "#9aa0c8" };

function powerVisual(id: PowerUpId): { abbr: string; color: string } {
  return POWER_VISUAL[id] ?? FALLBACK_VISUAL;
}

function powerDef(id: PowerUpId): PowerUpDef {
  return (
    POWER_UPS[id] ?? {
      id,
      name: "Unknown power",
      description: "(Just you) This power is no longer available.",
      needsTarget: false,
    }
  );
}

const POWER_CARD_DIM = "w-[68px] h-[88px]";
const POWER_CARD_DIM_LG = "w-[88px] h-[112px]";

// A `--pc` style object for the .pcard glyph-tile recipe (custom prop needs a cast).
function pc(color: string): CSSProperties {
  return { ["--pc"]: color } as CSSProperties;
}

// Non-interactive glowing glyph tile. Used in lists (e.g. the lobby power picker)
// where the whole row is the button, so a nested <button> would be invalid markup.
export function PowerGlyph({ id, size = "md" }: { id: PowerUpId; size?: "sm" | "md" }) {
  const v = powerVisual(id);
  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  return (
    <span className={`pcard lit shrink-0 ${dim} rounded-lg`} style={pc(v.color)}>
      <span className="pc-glyph">{v.abbr}</span>
    </span>
  );
}

// Scope prefix tags live at the start of every POWER_UPS description as
// "(Everyone|Opponents|Just you) …". Parsed out here and rendered as a chip.
// Class strings are literals so Tailwind's JIT actually emits them (see SEAT_COLORS note).
// Outlined glow pills on the indigo void (transparent fill + colored rim + text).
const SCOPE_CHIP: Record<string, string> = {
  Everyone: "text-cool border border-cool/45",
  Opponents: "text-rose-400 border border-rose-400/45",
  "Just you": "text-emerald-400 border border-emerald-400/45",
  Anyone: "text-violet-400 border border-violet-400/45",
};

function parseScopedDescription(description: string): { scope: string | null; body: string } {
  const m = description.match(/^\((Everyone|Opponents|Just you|Anyone)\)\s*([\s\S]*)$/);
  return m ? { scope: m[1], body: m[2] } : { scope: null, body: description };
}

export function ScopedDescription({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
  const { scope, body } = parseScopedDescription(description);
  return (
    <div className={className}>
      {scope && (
        <span
          className={`inline-block align-baseline mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SCOPE_CHIP[scope] ?? "bg-paper/15 text-paper"}`}
        >
          {scope}
        </span>
      )}
      {body}
    </div>
  );
}

export function PowerUpCard({
  id,
  state = "idle",
  onClick,
  size = "md",
  used,
  testId,
}: {
  id: PowerUpId;
  state?: "idle" | "selected";
  onClick?: () => void;
  size?: "md" | "lg";
  used?: boolean;
  testId?: string;
}) {
  const v = powerVisual(id);
  const dim = size === "lg" ? POWER_CARD_DIM_LG : POWER_CARD_DIM;
  const sel = state === "selected";
  const glyphSize = size === "lg" ? "text-3xl" : "text-xl";
  const nameSize = size === "lg" ? "text-[10px]" : "text-[8.5px]";
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`pcard shrink-0 ${dim} gap-1.5 px-1 ${sel ? "lit sel" : ""} ${
        used ? "opacity-30 grayscale" : ""
      } ${onClick ? "cursor-pointer" : ""}`}
      style={pc(v.color)}
      title={powerDef(id).name}
      data-sfx="tap"
      data-testid={testId}
    >
      <span className={`pc-glyph ${glyphSize}`}>{v.abbr}</span>
      <span className={`pc-name ${nameSize} tracking-tight break-words px-0.5`}>{powerDef(id).name}</span>
    </button>
  );
}

export function PowerUpChip({
  id,
  used,
  count,
  onClick,
  selected,
  showName,
  testId,
}: {
  id: PowerUpId;
  used?: boolean;
  count?: number;
  onClick?: () => void;
  selected?: boolean;
  showName?: boolean;
  testId?: string;
}) {
  const v = powerVisual(id);
  return (
    <div className="relative">
      {showName && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="block whitespace-nowrap bg-paper text-ink text-[10px] font-bold px-2 py-1 rounded-md shadow-[0_3px_0_0_rgba(0,0,0,0.4)] animate-rise">
            {powerDef(id).name}
          </span>
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        className={`pcard shrink-0 w-9 h-12 ${
          used ? "opacity-25 grayscale" : ""
        } ${selected ? "lit -translate-y-0.5" : ""}`}
        style={pc(v.color)}
        title={POWER_UPS[id].name}
        data-sfx="tap"
        data-testid={testId}
      >
        <span className="pc-glyph text-sm">{v.abbr}</span>
      </button>
      {count !== undefined && count > 1 && (
        <span className="absolute -top-1 -right-1 bg-paper text-ink text-[9px] font-bold rounded-full px-1.5 py-0.5">
          ×{count}
        </span>
      )}
    </div>
  );
}

export function MusicToggle({ compact = false }: { compact?: boolean }) {
  const unlocked = useMusicUnlocked();
  const [muted, toggle] = useMusicMuted();
  if (!unlocked) return null;
  const aria = muted ? "Unmute music" : "Mute music";
  const note = (
    <span className="relative inline-block">
      <span>♪</span>
      {muted && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[0.9em] -translate-x-1/2 -translate-y-1/2 rotate-[45deg] bg-current"
        />
      )}
    </span>
  );
  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="text-sm leading-none font-mono text-paper/60 hover:text-paper border border-paper/15 hover:border-paper/40 rounded-lg px-2 py-1 transition"
        title={aria}
        aria-label={aria}
        data-sfx="none"
      >
        {note}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-ghost text-sm leading-none px-3 py-2"
      title={aria}
      aria-label={aria}
      data-sfx="none"
    >
      {note}
    </button>
  );
}

export function Rules({
  onClose,
  includePowerUps = true,
  pool,
}: {
  onClose: () => void;
  includePowerUps?: boolean;
  pool?: PowerUpId[];
}) {
  // Dedupe the current round's pool, preserving deal order, with a count per power.
  const roundPowers: { id: PowerUpId; count: number }[] = [];
  for (const id of pool ?? []) {
    const existing = roundPowers.find((p) => p.id === id);
    if (existing) existing.count++;
    else roundPowers.push({ id, count: 1 });
  }
  return (
    <div className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-md flex flex-col animate-rise">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-paper/10">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">How to play</div>
          <div className="font-display text-2xl font-bold text-paper">Cancel — the rules</div>
        </div>
        <button className="btn-ghost text-xs px-3 py-2" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 max-w-md w-full mx-auto">
        <RulesSection title="The goal">
          Score the most points by the end of the final round. Each turn you secretly pick a number from your hand,
          and that's your score for that turn. The trick is dodging your friends and avoiding the cards they pick at the same time.
        </RulesSection>

        <RulesSection title="Setup">
          You'll play 3 rounds. Each round, every player gets a fresh hand of cards. By default they're
          numbered <b>0</b> up to 1 more than the number of players, so 3 players each get 0 to 4, 4 players
          get 0 to 5, and so on. The host can instead pick a custom set of numbers (a 0 is always included).
          A round has one turn per card.
        </RulesSection>

        <RulesSection title="A turn">
          <ol className="list-decimal pl-5 space-y-1.5 text-paper/80">
            <li>Everyone secretly chooses one card from their hand.</li>
            <li>Once all submissions are in, the cards flip face-up.</li>
            <li>Scores update, then the played cards are discarded and the next turn begins.</li>
          </ol>
          <div className="mt-2 text-paper/60 text-xs">
            You can press your locked-in submission to unlock it and re-pick, but only until the last person submits.
          </div>
        </RulesSection>

        <RulesSection title="Scoring">
          Your card's <b>face value</b> is the points you earn. For example, a 5 scores 5. With two big exceptions:
          <ul className="list-disc pl-5 mt-2 space-y-1.5 text-paper/80">
            <li>
              <b className="text-accent">Zero cancels.</b> If exactly one player plays a 0, every other card scores 0.
              The 0 itself also scores 0. If two or more players play a 0, the cancel is suppressed and everyone scores
              normally.
            </li>
            <li>
              <b>Ties cancel each other.</b> If two or more players play the same number, all tied cards score 0. The unique cards
              still score.
            </li>
          </ul>
        </RulesSection>

        <RulesSection title="Rounds &amp; winning">
          When all hands are empty, the round ends and totals carry over. After the final round, the highest total wins.
        </RulesSection>

        {includePowerUps && (
          <RulesSection title="Power-ups">
            At the start of each round, a small pool of power-ups is dealt face-up. On each turn,
            the player who is the <b>picker</b> for that turn chooses a number <i>and</i> one power-up
            from the pool. Used power-ups are gone for the rest of the round.
          </RulesSection>
        )}

        {includePowerUps && roundPowers.length > 0 && (
          <RulesSection title="This round's power-ups">
            <div className="text-paper/60 text-xs mb-3">
              The exact pool dealt for the current round. Shared by everyone — each one is gone once any
              picker uses it.
            </div>
            <ul className="space-y-3">
              {roundPowers.map(({ id, count }) => {
                const v = powerVisual(id);
                const def = powerDef(id);
                return (
                  <li key={id} className="flex gap-3 items-start">
                    <div className="relative shrink-0 pcard lit w-9 h-9 text-sm" style={pc(v.color)}>
                      <span className="pc-glyph">{v.abbr}</span>
                      {count > 1 && (
                        <span className="absolute -top-1 -right-1 bg-paper text-ink text-[9px] font-bold rounded-full px-1.5 py-0.5">
                          ×{count}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-display font-bold text-paper">{def.name}</div>
                      <ScopedDescription
                        description={def.description}
                        className="text-paper/75 text-sm leading-snug"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </RulesSection>
        )}

        {!includePowerUps && (
          <RulesSection title="Power-ups (off)">
            This game is set to <b>no power-ups</b>. Every turn is a pure number pick, without any twists.
          </RulesSection>
        )}
      </div>
      <div className="px-5 pb-5 pt-3 border-t border-paper/10 max-w-md w-full mx-auto shrink-0">
        <button className="btn-primary w-full text-lg py-4" onClick={onClose} data-sfx="confirm">
          Got it
        </button>
      </div>
    </div>
  );
}

function RulesSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="font-display text-lg font-bold text-paper mb-2">{title}</h3>
      <div className="text-paper/80 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export function PowerDescription({ id }: { id: PowerUpId }) {
  const def = powerDef(id);
  const v = powerVisual(id);
  return (
    <div className="rounded-2xl border border-paper/15 bg-paper/[.04] p-4 animate-rise">
      <div className="flex items-center gap-3 mb-2">
        <div className="pcard lit w-10 h-10 text-base" style={pc(v.color)}>
          <span className="pc-glyph">{v.abbr}</span>
        </div>
        <div className="font-display font-bold text-lg">{def.name}</div>
      </div>
      <ScopedDescription
        description={def.description}
        className="text-paper/80 text-sm leading-relaxed"
      />
    </div>
  );
}

export type PingKind = "target" | "sender" | "bystander";

export function PlayerChip({
  name,
  seat,
  active,
  online,
  submitted,
  isSelf,
  isPicker,
  isBot,
  small,
  hand,
  onClick,
  pingKind,
  pingNonce,
  testId,
}: {
  name: string;
  seat: number;
  active?: boolean;
  online?: boolean;
  submitted?: boolean;
  isSelf?: boolean;
  isPicker?: boolean;
  isBot?: boolean;
  small?: boolean;
  hand?: number[];
  onClick?: () => void;
  pingKind?: PingKind | null;
  pingNonce?: number;
  testId?: string;
}) {
  const color = SEAT_COLORS[seat % SEAT_COLORS.length];
  const hex = seatColor(seat).hex;
  // A stable standby frequency per seat so each player's idle signal looks distinct.
  const standbyRank = ([2, 1, 3, 4, 2, 4, 3, 1] as const)[seat % 8];
  const sz = small ? "w-8 h-8 text-sm" : "w-10 h-10";
  const pingClass =
    pingKind === "target"
      ? "animate-ping-target"
      : pingKind === "sender"
      ? "animate-ping-sender"
      : pingKind === "bystander"
      ? "animate-ping-wiggle"
      : "";
  const interactive = !!onClick;
  const avatarClass = `${color} ${sz} rounded-xl flex items-center justify-center text-ink font-bold font-display relative ${pingClass} ${
    interactive ? "cursor-pointer hover:scale-105 active:scale-95 transition" : ""
  }`;
  const avatarInner = (
    <>
      {name.slice(0, 1).toUpperCase()}
      {isBot && (
        <span className="absolute -top-1 -left-1 bg-cool text-ink text-[8px] font-bold rounded-full px-1 py-0.5 leading-none">
          AI
        </span>
      )}
      {isPicker && (
        <span className="absolute -top-1 -right-1 bg-gold text-ink text-[9px] font-bold rounded-full px-1.5 py-0.5">
          POWER
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-ink ${
            online ? "bg-emerald-400" : "bg-paper/30"
          }`}
        />
      )}
    </>
  );
  return (
    <div className={`flex items-center gap-2 ${active === false ? "opacity-60" : ""}`} data-testid={testId}>
      {interactive ? (
        <button
          key={pingNonce ?? 0}
          type="button"
          onClick={onClick}
          className={avatarClass}
          title={`Ping ${name}`}
          aria-label={`Ping ${name}`}
        >
          {avatarInner}
        </button>
      ) : (
        <div key={pingNonce ?? 0} className={avatarClass}>
          {avatarInner}
        </div>
      )}
      <div className="flex flex-col leading-tight min-w-0 flex-1">
        <span className="font-bold text-sm truncate">
          {name}
          {isSelf && <span className="ml-1 text-paper/40 font-mono text-[10px]">(you)</span>}
        </span>
        {hand && hand.length > 0 && (
          <span className="font-mono text-[11px] tracking-wider text-paper/70 leading-none mt-0.5">
            {hand.map((n) => (n === 0 ? "Ø" : n)).join(" ")}
          </span>
        )}
        <Wave
          rank={standbyRank}
          color={hex}
          variant={submitted ? "soft" : "think"}
          className={`w-full ${small ? "h-2.5" : "h-3.5"} mt-1`}
        />
        <span
          className={`text-[10px] uppercase tracking-widest font-mono mt-0.5 ${
            submitted ? "text-emerald-300/70" : "text-paper/50"
          }`}
        >
          {submitted ? "submitted" : "thinking…"}
        </span>
      </div>
    </div>
  );
}

// Celebration: drifting signals (wave shards) + glow dots + silent-Ø glyphs in
// the player colors, scattered over the void. Randomness is seeded once so a
// single render (and the screenshot harness) is stable.
export function Confetti() {
  const [pieces] = useState(() => {
    const hexes = SEATS.map((s) => s.hex);
    const pick = () => hexes[Math.floor(Math.random() * hexes.length)];
    const dur = () => 5.5 + Math.random() * 4; // 5.5-9.5s: staggered fall speeds
    // Negative delay starts each piece already mid-fall (a random phase of its own
    // cycle) the instant it mounts, instead of holding it static at its resting
    // `top` until a positive delay elapses -- that hold read as "hovering" before
    // the fall kicked in.
    const phase = (d: number) => -Math.random() * d;
    const waves = Array.from({ length: 19 }, (_, i) => {
      const d = dur();
      return {
        kind: "wave" as const,
        key: `w${i}`,
        left: Math.random() * 92,
        top: Math.random() * 58,
        rot: Math.round(Math.random() * 80 - 40),
        w: Math.round(16 + Math.random() * 14),
        rank: ((i % 3) + 1) as 1 | 2 | 3,
        color: pick(),
        delay: phase(d),
        dur: d,
      };
    });
    const dots = Array.from({ length: 13 }, (_, i) => {
      const d = dur();
      return {
        kind: "dot" as const,
        key: `d${i}`,
        left: Math.random() * 94,
        top: Math.random() * 58,
        color: pick(),
        delay: phase(d),
        dur: d,
      };
    });
    const zeros = Array.from({ length: 4 }, (_, i) => {
      const d = dur();
      return {
        kind: "zero" as const,
        key: `z${i}`,
        left: 10 + Math.random() * 80,
        top: Math.random() * 56,
        delay: phase(d),
        dur: d,
      };
    });
    return [...waves, ...dots, ...zeros];
  });
  return (
    <div className="confetti">
      {pieces.map((p) => {
        const common: CSSProperties = {
          left: `${p.left}%`,
          top: `${p.top}%`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.dur}s`,
        };
        if (p.kind === "wave") {
          return (
            <Wave
              key={p.key}
              rank={p.rank}
              color={p.color}
              animated={false}
              className="cf"
              style={{ ...common, width: `${p.w}px`, ["--r"]: `${p.rot}deg` } as CSSProperties}
            />
          );
        }
        if (p.kind === "dot") {
          return <i key={p.key} className="cfd" style={{ ...common, color: p.color }} />;
        }
        return (
          <span key={p.key} className="cfo" style={common}>
            Ø
          </span>
        );
      })}
    </div>
  );
}

export function RoundScoreTable({
  ranked,
  selfId,
  roundHistory,
  currentRoundIndex,
}: {
  ranked: { id: string; name: string; seat: number; totalScore: number }[];
  selfId: string;
  roundHistory: { index: number; scores: { [playerId: string]: number } }[];
  currentRoundIndex?: number;
}) {
  const rounds = [...roundHistory].sort((a, b) => a.index - b.index);
  const maxScore = ranked.reduce((m, p) => Math.max(m, p.totalScore), 0);
  return (
    <div className="w-full flex flex-col gap-2">
      <div className="flex items-center gap-2 px-3 text-[10px] uppercase tracking-widest font-mono text-paper/40">
        <span className="w-5" />
        <span className="w-3" />
        <span className="flex-1" />
        {rounds.map((r) => (
          <span
            key={r.index}
            className={`w-8 text-center ${r.index === currentRoundIndex ? "text-paper/70" : ""}`}
          >
            R{r.index + 1}
          </span>
        ))}
        <span className="w-9 text-right">total</span>
      </div>
      {ranked.map((p, i) => (
        <div
          key={p.id}
          data-testid={`score-row-${p.seat}`}
          className={`rounded-2xl px-3 pt-3 pb-2 ${
            i === 0 ? "bg-gold/15 border border-gold/40" : "bg-paper/5 border border-paper/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-paper/40 w-5 text-right text-sm">{i + 1}</span>
            <span className={`${SEAT_COLORS[p.seat % SEAT_COLORS.length]} w-3 h-3 rounded-full`} />
            <span className="font-bold flex-1 text-sm truncate">
              {p.name}
              {p.id === selfId && <span className="ml-1 text-paper/40 font-mono text-[10px]">(you)</span>}
            </span>
            {rounds.map((r) => {
              const score = r.scores[p.id] ?? 0;
              const isCurrent = r.index === currentRoundIndex;
              return (
                <span
                  key={r.index}
                  className={`w-8 text-center font-mono text-sm ${
                    score > 0
                      ? isCurrent
                        ? "text-emerald-300 font-bold"
                        : "text-emerald-300/70"
                      : score < 0
                        ? isCurrent
                          ? "text-rose-300 font-bold"
                          : "text-rose-300/70"
                        : "text-paper/30"
                  }`}
                >
                  {score > 0 ? "+" : ""}
                  {score}
                </span>
              );
            })}
            <span className="font-mono text-xl font-bold text-paper w-9 text-right">{p.totalScore}</span>
          </div>
          {/* Score as amplitude: a wave whose height tracks this player's total. */}
          <Wave
            pathId={amplitudePathForScore(p.totalScore, maxScore)}
            color={seatColor(p.seat).hex}
            variant={i === 0 ? "glow" : "solid"}
            className={`w-full h-7 mt-1.5 ${i === 0 ? "opacity-100" : "opacity-40"}`}
          />
        </div>
      ))}
    </div>
  );
}

export function useFlash(value: unknown) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}
