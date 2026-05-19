import { useEffect, useState, type ReactNode } from "react";
import { POWER_UPS, type PowerUpId, type PowerUpDef } from "../../shared/types.js";

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
  tie_die: { abbr: "▽", bg: "bg-cool", text: "text-paper" },
  negate_zero: { abbr: "Ø!", bg: "bg-accent", text: "text-ink" },
  plus_two: { abbr: "+2", bg: "bg-emerald-500", text: "text-ink" },
  free_three: { abbr: "3", bg: "bg-emerald-400", text: "text-ink" },
  make_negative: { abbr: "−", bg: "bg-rose-500", text: "text-paper" },
  minus_two: { abbr: "−2", bg: "bg-rose-400", text: "text-ink" },
  peek: { abbr: "◎", bg: "bg-cyan-400", text: "text-ink" },
  mute: { abbr: "⌖", bg: "bg-paper/40", text: "text-ink" },
  slide: { abbr: "↻", bg: "bg-fuchsia-500", text: "text-paper" },
  equalize: { abbr: "≈", bg: "bg-cyan-300", text: "text-ink" },
  sabotage: { abbr: "✖", bg: "bg-rose-600", text: "text-paper" },
  reverse: { abbr: "⇋", bg: "bg-indigo-400", text: "text-ink" },
  drain: { abbr: "↧", bg: "bg-amber-500", text: "text-ink" },
  wild: { abbr: "?", bg: "bg-violet-400", text: "text-ink" },
  nothingburger: { abbr: "∅", bg: "bg-paper/20", text: "text-paper/70" },
};

// Defensive fallbacks: a room persisted before a power-up rename can carry an
// id that's no longer in POWER_VISUAL/POWER_UPS. Indexing those maps would yield
// undefined and crash the whole tree (white screen). These resolvers degrade a
// stale id to a neutral "?" card instead. The description keeps a scope prefix
// so ScopedDescription still parses cleanly.
const FALLBACK_VISUAL = { abbr: "?", bg: "bg-paper/20", text: "text-paper/60" };

function powerVisual(id: PowerUpId): { abbr: string; bg: string; text: string } {
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

// Scope prefix tags live at the start of every POWER_UPS description as
// "(Everyone|Opponents|Just you) …". Parsed out here and rendered as a chip.
// Class strings are literals so Tailwind's JIT actually emits them (see SEAT_COLORS note).
const SCOPE_CHIP: Record<string, string> = {
  Everyone: "bg-cool text-ink",
  Opponents: "bg-rose-500 text-paper",
  "Just you": "bg-emerald-500 text-ink",
};

function parseScopedDescription(description: string): { scope: string | null; body: string } {
  const m = description.match(/^\((Everyone|Opponents|Just you)\)\s*([\s\S]*)$/);
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
}: {
  id: PowerUpId;
  state?: "idle" | "selected";
  onClick?: () => void;
  size?: "md" | "lg";
  used?: boolean;
}) {
  const v = powerVisual(id);
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
      title={powerDef(id).name}
    >
      <div className="flex flex-col items-center justify-center gap-1 w-full overflow-hidden">
        <span className="font-mono font-bold leading-none text-xl">{v.abbr}</span>
        <span className="text-[9px] uppercase tracking-tight font-display opacity-80 text-center leading-tight break-words px-0.5">
          {powerDef(id).name}
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
  showName,
}: {
  id: PowerUpId;
  used?: boolean;
  count?: number;
  onClick?: () => void;
  selected?: boolean;
  showName?: boolean;
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
                const v = POWER_VISUAL[id];
                const def = POWER_UPS[id];
                return (
                  <li key={id} className="flex gap-3 items-start">
                    <div
                      className={`relative shrink-0 ${v.bg} ${v.text} w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-sm`}
                    >
                      {v.abbr}
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
  const def = powerDef(id);
  const v = powerVisual(id);
  return (
    <div className="rounded-2xl border border-paper/15 bg-paper/[.04] p-4 animate-rise">
      <div className="flex items-center gap-3 mb-2">
        <div className={`${v.bg} ${v.text} w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold`}>
          {v.abbr}
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
          className={`rounded-2xl px-3 py-3 flex items-center gap-2 ${
            i === 0 ? "bg-gold/15 border border-gold/40" : "bg-paper/5 border border-paper/10"
          }`}
        >
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
