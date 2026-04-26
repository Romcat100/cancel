import { useEffect, useState } from "react";
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
}: {
  id: PowerUpId;
  used?: boolean;
  count?: number;
}) {
  const v = POWER_VISUAL[id];
  const [showName, setShowName] = useState(false);
  useEffect(() => {
    if (!showName) return;
    const t = setTimeout(() => setShowName(false), 1800);
    return () => clearTimeout(t);
  }, [showName]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowName((s) => !s)}
        className={`shrink-0 w-9 h-12 rounded-lg ${v.bg} ${v.text} flex items-center justify-center font-mono font-bold text-sm shadow-[0_3px_0_0_rgba(0,0,0,0.4)] ${
          used ? "opacity-25 grayscale" : ""
        }`}
        title={POWER_UPS[id].name}
      >
        {v.abbr}
      </button>
      {count !== undefined && count > 1 && (
        <span className="absolute -top-1 -right-1 bg-paper text-ink text-[9px] font-bold rounded-full px-1.5 py-0.5">
          ×{count}
        </span>
      )}
      {showName && (
        <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-10 bg-paper text-ink text-[10px] font-mono uppercase tracking-tight px-2 py-1 rounded-md shadow-lg whitespace-nowrap pointer-events-none animate-rise">
          {POWER_UPS[id].name}
        </span>
      )}
    </div>
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
