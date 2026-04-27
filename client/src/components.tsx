import { useEffect, useState, type ReactNode } from "react";
import { POWER_UPS, type PowerUpId } from "../../shared/types.js";

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

// Parallel to SEAT_COLORS — kept as a literal list (not derived via .replace) so
// Tailwind's JIT actually emits each text-* rule. Otherwise classes like text-cool
// silently no-op because their string never appears in source.
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
const NUMBER_CARD_TEXT = { sm: "text-2xl", md: "text-4xl", lg: "text-5xl" } as const;

export function NumberCard({
  n,
  state = "idle",
  onClick,
  size = "md",
}: {
  n: number;
  state?: "idle" | "selected" | "played" | "ghost" | "muted";
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const isZero = n === 0;
  const base =
    state === "selected"
      ? "bg-accent text-ink ring-4 ring-accent/40"
      : state === "played"
      ? "bg-paper text-ink"
      : state === "ghost"
      ? "bg-paper/10 text-paper/30"
      : state === "muted"
      ? "bg-paper/20 text-ink/40"
      : isZero
      ? "bg-ink/80 text-accent border-2 border-accent"
      : "bg-paper text-ink";
  const cx = `card-face shrink-0 ${NUMBER_CARD_DIM[size]} ${NUMBER_CARD_TEXT[size]} ${base} ${
    onClick ? "cursor-pointer" : ""
  } ${state === "selected" ? "-translate-y-2" : ""} transition`;
  return (
    <button type="button" disabled={!onClick} onClick={onClick} className={cx}>
      {isZero ? <span className="font-display font-bold">Ø</span> : n}
    </button>
  );
}

const POWER_VISUAL: Record<PowerUpId, { abbr: string; bg: string; text: string }> = {
  double: { abbr: "×2", bg: "bg-gold", text: "text-ink" },
  shield: { abbr: "▽", bg: "bg-cool", text: "text-paper" },
  negate_zero: { abbr: "Ø!", bg: "bg-accent", text: "text-ink" },
  plus_two: { abbr: "+2", bg: "bg-emerald-500", text: "text-ink" },
  free_three: { abbr: "3", bg: "bg-emerald-400", text: "text-ink" },
  negate: { abbr: "−", bg: "bg-rose-500", text: "text-paper" },
  steal_two: { abbr: "←2", bg: "bg-rose-400", text: "text-ink" },
  peek: { abbr: "◎", bg: "bg-cyan-400", text: "text-ink" },
  mute: { abbr: "⌖", bg: "bg-paper/40", text: "text-ink" },
  trade: { abbr: "↻", bg: "bg-fuchsia-500", text: "text-paper" },
  equalize: { abbr: "≈", bg: "bg-cyan-300", text: "text-ink" },
  sabotage: { abbr: "✖", bg: "bg-rose-600", text: "text-paper" },
  reverse: { abbr: "⇋", bg: "bg-indigo-400", text: "text-ink" },
  snipe: { abbr: "↳", bg: "bg-amber-500", text: "text-ink" },
};

const POWER_CARD_DIM = "w-[68px] h-[88px]";
const POWER_CARD_DIM_LG = "w-[88px] h-[112px]";

export function PowerUpCard({
  id,
  state = "idle",
  onClick,
  size = "md",
  used,
}: {
  id: PowerUpId;
  state?: "idle" | "selected";
  onClick?: () => void;
  size?: "md" | "lg";
  used?: boolean;
}) {
  const v = POWER_VISUAL[id];
  const dim = size === "lg" ? POWER_CARD_DIM_LG : POWER_CARD_DIM;
  const ring = state === "selected" ? "ring-4 ring-paper/40 -translate-y-2" : "";
  const dim2 = used ? "opacity-30 grayscale" : "";
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`card-face shrink-0 ${dim} ${v.bg} ${v.text} ${ring} ${dim2} ${
        onClick ? "cursor-pointer" : ""
      } transition px-1`}
      title={POWER_UPS[id].name}
    >
      <div className="flex flex-col items-center justify-center gap-1 w-full overflow-hidden">
        <span className="font-mono font-bold leading-none text-xl">{v.abbr}</span>
        <span className="text-[9px] uppercase tracking-tight font-display opacity-80 text-center leading-tight break-words px-0.5">
          {POWER_UPS[id].name}
        </span>
      </div>
    </button>
  );
}

export function PowerUpChip({
  id,
  used,
  count,
  onClick,
  selected,
}: {
  id: PowerUpId;
  used?: boolean;
  count?: number;
  onClick?: () => void;
  selected?: boolean;
}) {
  const v = POWER_VISUAL[id];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`shrink-0 w-9 h-12 rounded-lg ${v.bg} ${v.text} flex items-center justify-center font-mono font-bold text-sm shadow-[0_3px_0_0_rgba(0,0,0,0.4)] ${
          used ? "opacity-25 grayscale" : ""
        } ${selected ? "ring-2 ring-paper/70 -translate-y-0.5" : ""} transition`}
        title={POWER_UPS[id].name}
      >
        {v.abbr}
      </button>
      {count !== undefined && count > 1 && (
        <span className="absolute -top-1 -right-1 bg-paper text-ink text-[9px] font-bold rounded-full px-1.5 py-0.5">
          ×{count}
        </span>
      )}
    </div>
  );
}

export function Rules({ onClose, includePowerUps = true }: { onClose: () => void; includePowerUps?: boolean }) {
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
          Score the most points by the end of the final round. Each round, you'll secretly pick numbers from your hand.
          The trick is dodging your friends and avoiding the cards they pick at the same time.
        </RulesSection>

        <RulesSection title="Setup">
          You'll play 3 rounds. Each round, every player gets a fresh hand of cards numbered <b>0</b> up
          to 1 more than the number of players. So 3 players each get 0–4, 4 players get 0–5, and so on.
          A round has one turn per card.
        </RulesSection>

        <RulesSection title="A turn">
          <ol className="list-decimal pl-5 space-y-1.5 text-paper/80">
            <li>Everyone secretly chooses one card from their hand.</li>
            <li>Once all submissions are in, the cards flip face-up.</li>
            <li>Scores update, then the played cards are discarded and the next turn begins.</li>
          </ol>
          <div className="mt-2 text-paper/60 text-xs">
            You can tap your locked-in submission to unlock it and re-pick, but only until the last person submits.
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
              <b>Ties wipe.</b> If two or more players play the same number, all tied cards score 0. The unique cards
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

        {!includePowerUps && (
          <RulesSection title="Power-ups (off)">
            This game is set to <b>no power-ups</b>. Every turn is a pure number pick, without any twists.
          </RulesSection>
        )}
      </div>
      <div className="px-5 pb-5 pt-3 border-t border-paper/10 max-w-md w-full mx-auto shrink-0">
        <button className="btn-primary w-full text-lg py-4" onClick={onClose}>
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
  const def = POWER_UPS[id];
  const v = POWER_VISUAL[id];
  return (
    <div className="rounded-2xl border border-paper/15 bg-paper/[.04] p-4 animate-rise">
      <div className="flex items-center gap-3 mb-2">
        <div className={`${v.bg} ${v.text} w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold`}>
          {v.abbr}
        </div>
        <div className="font-display font-bold text-lg">{def.name}</div>
      </div>
      <div className="text-paper/80 text-sm leading-relaxed">{def.description}</div>
    </div>
  );
}

export function PlayerChip({
  name,
  seat,
  active,
  online,
  submitted,
  isSelf,
  isPicker,
  small,
  hand,
}: {
  name: string;
  seat: number;
  active?: boolean;
  online?: boolean;
  submitted?: boolean;
  isSelf?: boolean;
  isPicker?: boolean;
  small?: boolean;
  hand?: number[];
}) {
  const color = SEAT_COLORS[seat % SEAT_COLORS.length];
  const sz = small ? "w-8 h-8 text-sm" : "w-10 h-10";
  return (
    <div className={`flex items-center gap-2 ${active === false ? "opacity-60" : ""}`}>
      <div
        className={`${color} ${sz} rounded-xl flex items-center justify-center text-ink font-bold font-display relative`}
      >
        {name.slice(0, 1).toUpperCase()}
        {isPicker && (
          <span className="absolute -top-1 -right-1 bg-gold text-ink text-[9px] font-bold rounded-full px-1.5 py-0.5">
            PICK
          </span>
        )}
        {online !== undefined && (
          <span
            className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-ink ${
              online ? "bg-emerald-400" : "bg-paper/30"
            }`}
          />
        )}
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="font-bold text-sm truncate">
          {name}
          {isSelf && <span className="ml-1 text-paper/40 font-mono text-[10px]">(you)</span>}
        </span>
        {hand && hand.length > 0 && (
          <span className="font-mono text-[11px] tracking-wider text-paper/70 leading-none mt-0.5">
            {hand.map((n) => (n === 0 ? "Ø" : n)).join(" ")}
          </span>
        )}
        <span className="text-[10px] uppercase tracking-widest font-mono text-paper/50 mt-0.5">
          {submitted ? "submitted" : "thinking…"}
        </span>
      </div>
    </div>
  );
}

export function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 50 }, (_, i) => ({
      key: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      bg: ["#ff5b3a", "#5e6ee3", "#e8c25c", "#f5f1e8"][Math.floor(Math.random() * 4)],
      duration: 2 + Math.random() * 2,
    })),
  );
  return (
    <div className="confetti">
      {pieces.map((p) => (
        <span
          key={p.key}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            background: p.bg,
          }}
        />
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
