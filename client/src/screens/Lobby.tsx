import { useState } from "react";
import { api } from "../api.js";
import { useAppStore } from "../store.js";
import { getIdentity } from "../identity.js";
import { MusicToggle, NumberCard, PowerGlyph, Rules, ScopedDescription } from "../components.js";
import {
  POWER_UPS,
  POWER_UP_IDS,
  TWO_PLAYER_EXCLUDED_POWERS,
  type NumberMode,
  type PowerUpId,
  type PowerUpMode,
} from "../../../shared/types.js";

const SEAT_COLORS = ["bg-accent", "bg-cool", "bg-gold", "bg-emerald-500", "bg-fuchsia-500", "bg-cyan-400", "bg-orange-300", "bg-rose-400"];

const MODES: { mode: PowerUpMode; label: string }[] = [
  { mode: "off", label: "None" },
  { mode: "random", label: "Random" },
  { mode: "selected", label: "Choose" },
];

const NUMBER_MODES: { mode: NumberMode; label: string }[] = [
  { mode: "default", label: "Default" },
  { mode: "custom", label: "Custom" },
];

// The numbers the host can pick from (0 is always dealt and not selectable).
const NUMBER_PALETTE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function Lobby({ onLeave }: { onLeave: () => void }) {
  const state = useAppStore((s) => s.state)!;
  const setState = useAppStore((s) => s.setState);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showPowerModal, setShowPowerModal] = useState(false);
  const [savingPowers, setSavingPowers] = useState(false);
  const [showNumberModal, setShowNumberModal] = useState(false);
  const [savingNumbers, setSavingNumbers] = useState(false);

  const { publicState, selfPlayerId } = state;
  const isHost = publicState.hostId === selfPlayerId;
  const id = getIdentity(publicState.roomCode);

  const playerCount = publicState.players.length;
  const handSize = playerCount + 2;
  const powerUpMode: PowerUpMode = publicState.config.powerUpMode ?? "random";
  const selectedPowerUps = publicState.config.selectedPowerUps ?? [];
  const showHandsOn = publicState.config.showHands !== false;
  const numberMode: NumberMode = publicState.config.numberMode ?? "default";
  const customNumbers = publicState.config.customNumbers ?? [];
  // 0 is always dealt, so a custom set needs one fewer than the hand size.
  const numbersNeeded = handSize - 1;

  // Powers actually in play after the 2-player exclusion (Peek/Sabotage need 3+).
  const usableSelected = selectedPowerUps.filter(
    (pid) => playerCount > 2 || !TWO_PLAYER_EXCLUDED_POWERS.includes(pid),
  );
  const selectedEmpty = powerUpMode === "selected" && usableSelected.length === 0;
  const customCountOk = numberMode === "default" || customNumbers.length === numbersNeeded;
  const canStart = playerCount >= 2 && !selectedEmpty && customCountOk;

  async function pickMode(mode: PowerUpMode) {
    if (!id || !isHost) return;
    setErr(null);
    try {
      const patch: { powerUpMode: PowerUpMode; selectedPowerUps?: PowerUpId[] } = { powerUpMode: mode };
      // First time into Choose, seed the full set so it starts as a valid pool to trim down.
      if (mode === "selected" && selectedPowerUps.length === 0) patch.selectedPowerUps = [...POWER_UP_IDS];
      const res = await api.setConfig(publicState.roomCode, id.claimToken, patch);
      setState(res.state);
      if (mode === "selected") setShowPowerModal(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function savePowers(ids: PowerUpId[]) {
    if (!id || !isHost) return;
    setSavingPowers(true);
    setErr(null);
    try {
      const res = await api.setConfig(publicState.roomCode, id.claimToken, {
        powerUpMode: "selected",
        selectedPowerUps: ids,
      });
      setState(res.state);
      setShowPowerModal(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingPowers(false);
    }
  }

  async function pickNumberMode(mode: NumberMode) {
    if (!id || !isHost) return;
    setErr(null);
    try {
      const patch: { numberMode: NumberMode; customNumbers?: number[] } = { numberMode: mode };
      // First time into Custom, seed the default set (1..numbersNeeded) so it's a valid
      // starting point the host can swap numbers out of.
      if (mode === "custom" && customNumbers.length === 0) {
        patch.customNumbers = Array.from({ length: numbersNeeded }, (_, i) => i + 1);
      }
      const res = await api.setConfig(publicState.roomCode, id.claimToken, patch);
      setState(res.state);
      if (mode === "custom") setShowNumberModal(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function saveNumbers(nums: number[]) {
    if (!id || !isHost) return;
    setSavingNumbers(true);
    setErr(null);
    try {
      const res = await api.setConfig(publicState.roomCode, id.claimToken, {
        numberMode: "custom",
        customNumbers: nums,
      });
      setState(res.state);
      setShowNumberModal(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingNumbers(false);
    }
  }

  async function toggleShowHands() {
    if (!id || !isHost) return;
    setErr(null);
    try {
      const res = await api.setConfig(publicState.roomCode, id.claimToken, { showHands: !showHandsOn });
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function start() {
    if (!id) return;
    setBusy(true);
    try {
      const res = await api.startGame(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(publicState.roomCode);
  }

  const modeChip = powerUpMode === "off" ? "off" : powerUpMode === "random" ? "random" : "custom";
  const modeText =
    powerUpMode === "off"
      ? "no power-ups"
      : powerUpMode === "random"
        ? "random pool each round"
        : `${usableSelected.length} powers chosen`;

  const numberModeText =
    numberMode === "default"
      ? "0 up to the standard top card"
      : customNumbers.length > 0
        ? `0 and ${[...customNumbers].sort((a, b) => a - b).join(", ")}`
        : "no numbers picked yet";

  const startLabel =
    playerCount < 2
      ? "Waiting for players…"
      : selectedEmpty
        ? "Pick a power-up first"
        : !customCountOk
          ? `Pick ${numbersNeeded} numbers first`
          : busy
            ? "Starting…"
            : "Start game";

  return (
    <div className="min-h-[100dvh] flex flex-col px-6 pt-10 pb-8 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button className="btn-ghost text-xs px-3 py-2" onClick={onLeave}>
          ← Leave
        </button>
        <div className="flex items-center gap-2">
          <MusicToggle />
          <button className="btn-ghost text-xs px-3 py-2" onClick={() => setShowRules(true)}>
            Rules
          </button>
        </div>
      </div>

      <div className="mb-6 text-center">
        <div className="text-paper/50 text-xs uppercase tracking-[0.3em] font-mono">Room code</div>
        <button
          onClick={copyCode}
          className="mt-2 group inline-flex items-baseline gap-3 active:scale-[.97] transition"
          aria-label="copy room code"
        >
          <span className="font-mono font-bold text-6xl tracking-[0.2em] text-accent">{publicState.roomCode}</span>
          <span className="text-paper/30 text-sm group-hover:text-paper/60 font-mono">press to copy</span>
        </button>
      </div>

      <div className="text-paper/50 text-xs uppercase tracking-[0.3em] font-mono mb-3">
        Players · {publicState.players.length}
      </div>
      <div className="flex flex-col gap-2">
        {publicState.players.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-2xl bg-paper/5 px-3 py-2 animate-rise"
          >
            <div
              className={`${SEAT_COLORS[p.seat % SEAT_COLORS.length]} text-ink font-bold w-10 h-10 rounded-xl flex items-center justify-center font-display`}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 font-bold">{p.name}</div>
            <div className="flex items-center gap-2 text-xs">
              {p.id === publicState.hostId && <span className="chip bg-gold/20 text-gold">host</span>}
              {p.id === selfPlayerId && <span className="chip">you</span>}
              <span className={`w-2 h-2 rounded-full ${p.online ? "bg-emerald-400" : "bg-paper/20"}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-10 flex flex-col gap-3">
        {isHost ? (
          <div className="rounded-2xl bg-paper/5 px-4 py-3">
            <span className="font-bold text-sm">Power-ups</span>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-paper/10 p-1">
              {MODES.map(({ mode, label }) => {
                const active = powerUpMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickMode(mode)}
                    className={`rounded-lg py-2 text-sm font-bold transition ${
                      active
                        ? "bg-accent text-ink shadow-[0_2px_0_0_rgba(0,0,0,0.4)]"
                        : "text-paper/70 hover:text-paper"
                    }`}
                    data-sfx="tap"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {powerUpMode === "selected" ? (
              <div className="mt-3 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowPowerModal(true)}
                  className="btn-ghost text-sm py-2.5 flex items-center justify-between"
                  data-sfx="tap"
                >
                  <span>Select powers</span>
                  <span className="font-mono text-paper/70">{usableSelected.length} chosen →</span>
                </button>
                <p className={`text-xs font-mono ${selectedEmpty ? "text-accent" : "text-paper/40"}`}>
                  {selectedEmpty
                    ? "Pick at least one power-up to start."
                    : `Around ${handSize} is one per turn. Fewer repeat, more adds variety.`}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs font-mono text-paper/40">
                {powerUpMode === "off" ? "Pure number picks, no twists." : "A fresh random pool each round."}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-paper/5 px-4 py-3 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-bold text-sm">Power-ups</span>
              <span className="text-paper/50 text-xs font-mono">{modeText}</span>
            </div>
            <span className="chip bg-accent/20 text-accent">{modeChip}</span>
          </div>
        )}

        {isHost ? (
          <div className="rounded-2xl bg-paper/5 px-4 py-3">
            <span className="font-bold text-sm">Number pool</span>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-paper/10 p-1">
              {NUMBER_MODES.map(({ mode, label }) => {
                const active = numberMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickNumberMode(mode)}
                    className={`rounded-lg py-2 text-sm font-bold transition ${
                      active
                        ? "bg-accent text-ink shadow-[0_2px_0_0_rgba(0,0,0,0.4)]"
                        : "text-paper/70 hover:text-paper"
                    }`}
                    data-sfx="tap"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {numberMode === "custom" ? (
              <div className="mt-3 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowNumberModal(true)}
                  className="btn-ghost text-sm py-2.5 flex items-center justify-between"
                  data-sfx="tap"
                >
                  <span>Select numbers</span>
                  <span className="font-mono text-paper/70">
                    {customNumbers.length}/{numbersNeeded} chosen →
                  </span>
                </button>
                <p className={`text-xs font-mono ${customCountOk ? "text-paper/40" : "text-accent"}`}>
                  {customCountOk
                    ? `Plus a 0, that's ${handSize} cards, one per turn.`
                    : `Pick exactly ${numbersNeeded} numbers for ${playerCount} players.`}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs font-mono text-paper/40">
                Cards run 0 up to 1 more than the player count.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-paper/5 px-4 py-3 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-bold text-sm">Number pool</span>
              <span className="text-paper/50 text-xs font-mono">{numberModeText}</span>
            </div>
            <span className="chip bg-accent/20 text-accent">{numberMode === "custom" ? "custom" : "default"}</span>
          </div>
        )}

        <div className="rounded-2xl bg-paper/5 px-4 py-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-bold text-sm">Show hands</span>
            <span className="text-paper/50 text-xs font-mono">
              {showHandsOn ? "everyone sees remaining cards" : "hands are hidden"}
            </span>
          </div>
          {isHost ? (
            <button
              type="button"
              role="switch"
              aria-checked={showHandsOn}
              onClick={toggleShowHands}
              className={`relative w-12 h-7 rounded-full transition shrink-0 ${
                showHandsOn ? "bg-accent" : "bg-paper/20"
              }`}
            >
              <span
                className={`absolute top-0.5 ${showHandsOn ? "left-[22px]" : "left-0.5"} w-6 h-6 rounded-full bg-paper transition-all`}
              />
            </button>
          ) : (
            <span className={`chip ${showHandsOn ? "bg-accent/20 text-accent" : "bg-paper/15 text-paper/60"}`}>
              {showHandsOn ? "on" : "off"}
            </span>
          )}
        </div>
        {isHost ? (
          <>
            <button
              className="btn-primary text-xl py-5"
              disabled={busy || !canStart}
              onClick={start}
              data-sfx="confirm"
            >
              {startLabel}
            </button>
            <p className="text-paper/40 text-xs text-center font-mono">
              {publicState.players.length + 2} cards each · {publicState.config.rounds} rounds
            </p>
          </>
        ) : (
          <div className="text-center text-paper/50 font-mono text-sm py-4">
            Waiting for {publicState.players.find((p) => p.id === publicState.hostId)?.name} to start the game…
          </div>
        )}
        {err && (
          <div className="rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-3 text-sm">{err}</div>
        )}
      </div>

      {showRules && <Rules onClose={() => setShowRules(false)} includePowerUps={powerUpMode !== "off"} />}
      {showPowerModal && isHost && (
        <PowerSelectModal
          players={playerCount}
          initial={selectedPowerUps}
          busy={savingPowers}
          onCancel={() => setShowPowerModal(false)}
          onSave={savePowers}
        />
      )}
      {showNumberModal && isHost && (
        <NumberSelectModal
          needed={numbersNeeded}
          players={playerCount}
          initial={customNumbers}
          busy={savingNumbers}
          onCancel={() => setShowNumberModal(false)}
          onSave={saveNumbers}
        />
      )}
    </div>
  );
}

function NumberSelectModal({
  needed,
  players,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  needed: number;
  players: number;
  initial: number[];
  busy: boolean;
  onCancel: () => void;
  onSave: (nums: number[]) => void;
}) {
  const [draft, setDraft] = useState<Set<number>>(() => new Set(initial));

  function toggle(n: number) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const count = draft.size;
  const exact = count === needed;

  return (
    <div className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-md flex flex-col animate-rise">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-paper/10">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">Number pool</div>
          <div className="font-display text-2xl font-bold text-paper">Choose the numbers</div>
        </div>
        <button className="btn-ghost text-xs px-3 py-2" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="px-5 pt-3 pb-2 max-w-md w-full mx-auto shrink-0">
        <p className="text-paper/60 text-xs leading-snug">
          A 0 is always dealt. Pick as many cards as you have players, plus one.
          <br />
          E.g. {needed} needed for {players} players.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3 max-w-md w-full mx-auto">
        <div className="flex flex-wrap gap-3 justify-center">
          <NumberCard n={0} size="sm" state="played" />
          {NUMBER_PALETTE.map((n) => (
            <NumberCard
              key={n}
              n={n}
              size="sm"
              state={draft.has(n) ? "selected" : "idle"}
              onClick={() => toggle(n)}
            />
          ))}
        </div>
      </div>

      <div className="px-5 pb-5 pt-3 border-t border-paper/10 max-w-md w-full mx-auto shrink-0 flex items-center gap-3">
        <span className={`font-mono text-sm flex-1 ${exact ? "text-paper/60" : "text-accent"}`}>
          {count}/{needed} selected
        </span>
        <button
          className="btn-primary text-lg py-3 px-6 disabled:opacity-40"
          disabled={count === 0 || busy}
          onClick={() => onSave([...draft].sort((a, b) => a - b))}
          data-sfx="confirm"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PowerSelectModal({
  players,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  players: number;
  initial: PowerUpId[];
  busy: boolean;
  onCancel: () => void;
  onSave: (ids: PowerUpId[]) => void;
}) {
  const handSize = players + 2;
  const [draft, setDraft] = useState<Set<PowerUpId>>(
    () => new Set(initial.length ? initial : POWER_UP_IDS),
  );

  function toggle(id: PowerUpId, disabled: boolean) {
    if (disabled) return;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const usableCount = [...draft].filter(
    (id) => players > 2 || !TWO_PLAYER_EXCLUDED_POWERS.includes(id),
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-ink/95 backdrop-blur-md flex flex-col animate-rise">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-paper/10">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">Power-ups</div>
          <div className="font-display text-2xl font-bold text-paper">Choose the pool</div>
        </div>
        <button className="btn-ghost text-xs px-3 py-2" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <div className="px-5 pt-3 pb-2 max-w-md w-full mx-auto shrink-0">
        <div className="flex items-start justify-between gap-3">
          <p className="text-paper/60 text-xs leading-snug">
            {handSize} turns per round. Around {handSize} powers is one per turn. Pick fewer and they
            repeat, pick more for variety.
          </p>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              className="btn-ghost text-[11px] px-2.5 py-1.5"
              onClick={() => setDraft(new Set(POWER_UP_IDS))}
            >
              All
            </button>
            <button
              type="button"
              className="btn-ghost text-[11px] px-2.5 py-1.5"
              onClick={() => setDraft(new Set())}
            >
              None
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-3 max-w-md w-full mx-auto">
        <ul className="flex flex-col gap-2">
          {POWER_UP_IDS.map((pid) => {
            const def = POWER_UPS[pid];
            const disabled = players <= 2 && TWO_PLAYER_EXCLUDED_POWERS.includes(pid);
            const checked = draft.has(pid) && !disabled;
            return (
              <li key={pid}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(pid, disabled)}
                  className={`w-full text-left flex gap-3 items-start rounded-2xl border px-3 py-2.5 transition ${
                    disabled
                      ? "opacity-40 border-paper/10 bg-paper/[.02] cursor-not-allowed"
                      : checked
                        ? "border-accent/60 bg-accent/10"
                        : "border-paper/10 bg-paper/5 hover:border-paper/25"
                  }`}
                  data-sfx="tap"
                >
                  <PowerGlyph id={pid} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-paper">{def.name}</span>
                      {disabled && <span className="chip bg-paper/15 text-paper/60 text-[10px]">needs 3+</span>}
                    </div>
                    <ScopedDescription
                      description={def.description}
                      className="text-paper/70 text-xs leading-snug mt-0.5"
                    />
                  </div>
                  <span
                    className={`shrink-0 mt-0.5 w-6 h-6 rounded-md border flex items-center justify-center text-sm font-bold ${
                      checked ? "bg-accent border-accent text-ink" : "border-paper/30 text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-5 pb-5 pt-3 border-t border-paper/10 max-w-md w-full mx-auto shrink-0 flex items-center gap-3">
        <span className="font-mono text-sm text-paper/60 flex-1">{usableCount} selected</span>
        <button
          className="btn-primary text-lg py-3 px-6 disabled:opacity-40"
          disabled={usableCount === 0 || busy}
          onClick={() => onSave([...draft])}
          data-sfx="confirm"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
