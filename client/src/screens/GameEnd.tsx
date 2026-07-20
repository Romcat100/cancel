import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameStats, Player, RoundHistoryEntry } from "../../../shared/types.js";
import { api } from "../api.js";
import { playGameEnd } from "../sfx.js";
import { clearIdentity, getIdentity, getProfileToken, saveIdentity } from "../identity.js";
import { useAppStore } from "../store.js";
import { connectSocket, disconnectSocket } from "../socket.js";
import { Confetti, MusicToggle, RoundScoreTable, SEAT_TEXT_COLORS, seatColor, SeriesStandings } from "../components.js";
import { Wave } from "../wave.js";
import { requestCampaignReturn } from "./Campaign.js";
import { campaignLevel, FLAIRS, nextLevelId, type FlairId } from "../../../shared/campaign.js";

// Victory flourish (campaign cosmetic): the winner's personal celebration,
// rendered on EVERY client when the game has a sole winner who has one
// equipped. Replaces the winner's default Confetti. All motion is behind
// prefers-reduced-motion (fx-* recipes in index.css), like everything else.
function VictoryFlourish({ kind, hex }: { kind: FlairId; hex: string }) {
  const [drops] = useState(() =>
    Array.from({ length: 16 }, (_, i) => {
      const dur = 6 + Math.random() * 4;
      return {
        key: i,
        left: Math.random() * 94,
        top: Math.random() * 60,
        size: Math.round(12 + Math.random() * 14),
        delay: -Math.random() * dur,
        dur,
      };
    }),
  );
  if (kind === "shockwave") {
    return (
      <div className="fx" style={{ color: hex }} data-testid="game-end-flourish">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className="fxr" style={{ animationDelay: `${i * 0.65}s` }} />
        ))}
      </div>
    );
  }
  if (kind === "zero_rain") {
    return (
      <div className="fx" style={{ color: hex }} data-testid="game-end-flourish">
        {drops.map((d) => (
          <span
            key={d.key}
            className="fxo"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              fontSize: `${d.size}px`,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.dur}s`,
            }}
          >
            Ø
          </span>
        ))}
      </div>
    );
  }
  // limelight
  return (
    <div className="fx" style={{ color: hex }} data-testid="game-end-flourish">
      <i className="fxl" />
    </div>
  );
}

// Monotone-x cubic path through the points (d3 curveMonotoneX's tangent rule):
// smooth like a signal trace, but it never overshoots a data point, so the curve
// can't invent a peak or dip that didn't happen.
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return "";
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  m.push(slope[n - 2]);
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const cx1 = pts[i].x + dx[i] / 3;
    const cy1 = pts[i].y + (m[i] * dx[i]) / 3;
    const cx2 = pts[i + 1].x - dx[i] / 3;
    const cy2 = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
    d += `C${cx1},${cy1} ${cx2},${cy2} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

// Score-over-rounds chart: one smoothed line per player (seat color), x = round,
// y = cumulative total, everyone starting from 0. Every line glows like a signal
// trace (self strongest + thicker); each ends in a dot + the final total. Exact
// per-round values live in the RoundScoreTable above, so the chart stays
// label-light and needs no hover layer. Not rendered for single-round games
// (two points isn't a race).
function ScoreChart({
  players,
  roundHistory,
  selfId,
}: {
  players: Player[];
  roundHistory: RoundHistoryEntry[];
  selfId: string;
}) {
  const rounds = [...roundHistory].sort((a, b) => a.index - b.index);
  if (rounds.length < 2 || players.length === 0) return null;

  const W = 320;
  const H = 128;
  const padL = 10;
  const padR = 40; // room for the end-of-line total labels
  const padT = 10;
  const padB = 18; // room for the R1..Rn axis labels
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Cumulative series per player, with a shared 0 start point.
  const series = players.map((p) => {
    let total = 0;
    const values = [0, ...rounds.map((r) => (total += r.scores[p.id] ?? 0))];
    return { player: p, values };
  });
  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allValues);
  const min = Math.min(0, ...allValues);
  const x = (i: number) => padL + (i / rounds.length) * plotW;
  const y = (v: number) => padT + ((max - v) / (max - min)) * plotH;

  // Nudge overlapping end labels apart (top-down sweep, then clamp to the plot).
  const labels = series
    .map((s) => ({ ...s, ly: y(s.values[s.values.length - 1]) }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) {
    labels[i].ly = Math.max(labels[i].ly, labels[i - 1].ly + 10);
  }
  const overflow = labels.length > 0 ? labels[labels.length - 1].ly - (H - padB) : 0;
  if (overflow > 0) for (const l of labels) l.ly -= overflow;

  // Draw self last so their glowing line sits on top.
  const drawOrder = [...series].sort((a, b) => (a.player.id === selfId ? 1 : 0) - (b.player.id === selfId ? 1 : 0));

  return (
    <div className="rounded-2xl bg-paper/5 border border-paper/10 px-3 pt-3 pb-1 mt-3" data-testid="game-end-chart">
      <div className="font-mono text-[10px] uppercase tracking-widest text-paper/40 mb-1">The race</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score by round">
        {/* Baseline at 0 (recessive). */}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="#eef0fb" strokeOpacity={0.15} strokeWidth={1} />
        {rounds.map((r, i) => (
          <text
            key={r.index}
            x={x(i + 1)}
            y={H - 5}
            textAnchor="middle"
            fill="#eef0fb"
            fillOpacity={0.35}
            fontSize={8}
            fontFamily="'Spline Sans Mono', monospace"
          >
            R{r.index + 1}
          </text>
        ))}
        {drawOrder.map(({ player, values }) => {
          const hex = seatColor(player.seat).hex;
          const isSelf = player.id === selfId;
          const d = monotonePath(values.map((v, i) => ({ x: x(i), y: y(v) })));
          const endX = x(values.length - 1);
          const endY = y(values[values.length - 1]);
          return (
            <g
              key={player.id}
              style={{ filter: isSelf ? `drop-shadow(0 0 4px ${hex})` : `drop-shadow(0 0 2.5px ${hex}66)` }}
            >
              <path
                d={d}
                fill="none"
                stroke={hex}
                strokeWidth={isSelf ? 2.5 : 1.5}
                strokeOpacity={isSelf ? 1 : 0.8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Surface-colored ring separates overlapping end dots. */}
              <circle cx={endX} cy={endY} r={3} fill={hex} stroke="rgb(var(--th-bg0))" strokeWidth={1.5} />
            </g>
          );
        })}
        {labels.map(({ player, values, ly }) => (
          <text
            key={player.id}
            x={x(values.length - 1) + 7}
            y={ly + 3}
            fill={seatColor(player.seat).hex}
            fontSize={10}
            fontWeight={player.id === selfId ? 700 : 500}
            fontFamily="'Spline Sans Mono', monospace"
          >
            {values[values.length - 1]}
          </text>
        ))}
      </svg>
    </div>
  );
}

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

interface AwardEntry {
  key: string;
  title: string;
  playerId: string;
  detail: string;
  emoji: string;
  glyph: string;
  wavePathId: string;
  waveVariant: "glow" | "dotted";
}

// The award list, derived from the server's sparse GameStats. Shared by the
// Highlights carousel and the mini emoji badges on the final score table, so
// the two always agree on who won what.
function buildAwards(stats: GameStats): AwardEntry[] {
  const entries: AwardEntry[] = [];
  if (stats.biggestTurn) {
    entries.push({
      key: "biggest-turn",
      title: "Loudest signal",
      playerId: stats.biggestTurn.playerId,
      detail: `+${stats.biggestTurn.delta} in one turn (round ${stats.biggestTurn.roundIndex + 1})`,
      emoji: "📣",
      glyph: `+${stats.biggestTurn.delta}`,
      wavePathId: "ca18",
      waveVariant: "glow",
    });
  }
  if (stats.bestRound) {
    entries.push({
      key: "best-round",
      title: "Peak round",
      playerId: stats.bestRound.playerId,
      detail: `+${stats.bestRound.points} in round ${stats.bestRound.roundIndex + 1}`,
      emoji: "🏔️",
      glyph: "▲",
      wavePathId: "ca11",
      waveVariant: "glow",
    });
  }
  if (stats.comeback) {
    entries.push({
      key: "comeback",
      title: "Late surge",
      playerId: stats.comeback.playerId,
      detail: `Climbed ${stats.comeback.places} ${stats.comeback.places === 1 ? "place" : "places"} in the final round`,
      emoji: "🚀",
      glyph: "↗",
      wavePathId: "ca8",
      waveVariant: "glow",
    });
  }
  if (stats.silencer) {
    entries.push({
      key: "silencer",
      title: "The silencer",
      playerId: stats.silencer.playerId,
      detail: `Wiped the board with a 0 ${times(stats.silencer.count)}`,
      emoji: "🤫",
      glyph: "Ø",
      wavePathId: "cw0",
      waveVariant: "glow",
    });
  }
  if (stats.cleanest) {
    entries.push({
      key: "cleanest",
      title: "Clean signal",
      playerId: stats.cleanest.playerId,
      detail: `Scored on ${stats.cleanest.count} turns`,
      emoji: "✨",
      glyph: "~",
      wavePathId: "cw2",
      waveVariant: "glow",
    });
  }
  if (stats.mostCancelled) {
    entries.push({
      key: "most-cancelled",
      title: "Lost in the noise",
      playerId: stats.mostCancelled.playerId,
      detail: `Cancelled ${times(stats.mostCancelled.count)}`,
      emoji: "💥",
      glyph: "✕",
      wavePathId: "cw7",
      waveVariant: "dotted",
    });
  }
  return entries;
}

// Emoji badges per player for the final score table, keyed to the carousel awards.
export function awardBadgesByPlayer(stats: GameStats | undefined): {
  [playerId: string]: { emoji: string; title: string }[];
} {
  const byPlayer: { [playerId: string]: { emoji: string; title: string }[] } = {};
  if (!stats) return byPlayer;
  for (const e of buildAwards(stats)) {
    (byPlayer[e.playerId] ??= []).push({ emoji: e.emoji, title: e.title });
  }
  return byPlayer;
}

// Game superlatives, computed server-side (publicState.gameStats, game_end only).
// Rendered as a swipeable row of award badges glowing in each winner's seat color
// (`.award` in index.css, driven by the same --pc trick as the power tiles). CSS
// scroll-snap does the swiping; the dots just mirror scroll position. Each badge
// carries a wave chosen for the stat's flavor: amplitude waves for the big-score
// awards, the flat silent line for the silencer, a dotted dense trace for the
// most-cancelled (a signal lost in the noise).
function Highlights({
  stats,
  players,
  selfId,
}: {
  stats: GameStats;
  players: Player[];
  selfId: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const byId = new Map(players.map((p) => [p.id, p]));
  const cards = buildAwards(stats).flatMap((e) => {
    const p = byId.get(e.playerId);
    return p ? [{ ...e, player: p }] : [];
  });
  if (cards.length === 0) return null;

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const snapTo = (i: number) => {
    const el = scrollRef.current;
    const child = el?.children[i] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  const onScroll = () => {
    const el = scrollRef.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return;
    const step = first.offsetWidth + 12; // card width + gap-3
    setActive(Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / step))));
  };

  return (
    <div className="mt-3" data-testid="game-end-stats">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="awards flex gap-3 overflow-x-auto snap-x snap-mandatory"
        data-testid="game-end-stats-scroll"
      >
        {cards.map((c) => {
          const hex = seatColor(c.player.seat).hex;
          return (
            <div
              key={c.key}
              className={`award snap-start shrink-0 px-4 py-3.5 ${cards.length === 1 ? "w-full" : "w-[81%]"}`}
              style={{ "--pc": hex } as CSSProperties}
              data-testid={`game-end-stat-${c.key}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-paper/50">
                    <span className="mr-1">{c.emoji}</span>
                    {c.title}
                  </div>
                  <div className="font-display text-xl font-extrabold truncate" style={{ color: hex }}>
                    {c.player.id === selfId ? "You" : c.player.name}
                  </div>
                  <div className="text-xs text-paper/70 mt-0.5">{c.detail}</div>
                </div>
                <div className="aw-glyph shrink-0">{c.glyph}</div>
              </div>
              <span className="nwv h-5 mt-3">
                <Wave pathId={c.wavePathId} variant={c.waveVariant} color={hex} className="w-full h-full" />
              </span>
            </div>
          );
        })}
      </div>
      {cards.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {cards.map((c, i) => (
            <button
              key={c.key}
              type="button"
              aria-label={`Show ${c.title}`}
              data-sfx="tap"
              data-testid={`game-end-stat-dot-${c.key}`}
              onClick={() => snapTo(i)}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-paper/80" : "w-1.5 bg-paper/25"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GameEnd({ onLeave }: { onLeave: () => void }) {
  const state = useAppStore((s) => s.state)!;
  const setState = useAppStore((s) => s.setState);
  const reset = useAppStore((s) => s.reset);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { publicState, selfPlayerId } = state;
  const isHost = publicState.hostId === selfPlayerId;
  const hostPlayer = publicState.players.find((p) => p.id === publicState.hostId);
  const hostName = hostPlayer?.name;
  const hostOffline = !!hostPlayer && hostPlayer.online === false;

  async function claimHost() {
    const id = getIdentity(publicState.roomCode);
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.claimHost(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function playAgain() {
    const id = getIdentity(publicState.roomCode);
    if (!id || !isHost) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.playAgain(publicState.roomCode, id.claimToken);
      setState(res.state);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  // Campaign rooms are single-use: the result panel replaces Play again, and
  // Retry / Next level create a fresh room while this one is left behind.
  const campaign = publicState.campaign;
  const campaignDef = campaign ? campaignLevel(campaign.levelId) : undefined;
  const campaignNext = campaign ? nextLevelId(campaign.levelId) : undefined;
  const me = publicState.players.find((p) => p.id === selfPlayerId);

  async function startCampaignLevel(levelId: string) {
    const playerName = me?.name ?? "Player";
    setBusy(true);
    setErr(null);
    try {
      const res = await api.createRoom(playerName, {
        campaignLevelId: levelId,
        profileToken: getProfileToken(),
      });
      clearIdentity(publicState.roomCode);
      disconnectSocket();
      saveIdentity({
        roomCode: res.roomCode,
        claimToken: res.claimToken,
        playerId: res.playerId,
        name: playerName,
      });
      setState(res.state);
      connectSocket(res.roomCode, res.claimToken, {
        onRoomState: setState,
        onRoomAbandoned: () => {
          clearIdentity(res.roomCode);
          disconnectSocket();
          reset();
        },
      });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  function backToCampaign() {
    requestCampaignReturn();
    clearIdentity(publicState.roomCode);
    disconnectSocket();
    reset();
  }

  const ranked = [...publicState.players].sort((a, b) => b.totalScore - a.totalScore);
  const topScore = ranked[0]?.totalScore;
  const leaders = ranked.filter((p) => p.totalScore === topScore);
  const isTie = leaders.length > 1;
  const selfIsLeader = leaders.some((p) => p.id === selfPlayerId);

  // One flourish per visit to the end screen (mount-only, like Confetti).
  useEffect(() => {
    playGameEnd(!selfIsLeader ? "lose" : isTie ? "tie" : "win");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A sole winner's equipped flourish celebrates on every client (that's the
  // cosmetic's point); without one, the winner keeps their own private confetti.
  const winnerFlourish = !isTie ? leaders[0]?.flourishFlair : undefined;
  return (
    <div className="h-[100dvh] flex flex-col px-6 pt-10 pb-6 max-w-md mx-auto relative overflow-hidden">
      {winnerFlourish ? (
        <VictoryFlourish kind={winnerFlourish} hex={seatColor(leaders[0].seat).hex} />
      ) : (
        !isTie && selfIsLeader && <Confetti />
      )}
      <div className="absolute top-3 right-3 z-10">
        <MusicToggle />
      </div>
      <div className="text-center mb-6 animate-rise shrink-0">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-paper/50">Game over</div>
        <div className="font-display text-5xl font-extrabold mt-2 [&_span]:[text-shadow:0_0_22px_currentColor]" data-testid="game-end-winner">
          {isTie ? (
            selfIsLeader ? (
              <>
                You <span className="text-gold">tied.</span>
              </>
            ) : (
              <span className="text-gold">Tie game.</span>
            )
          ) : selfIsLeader ? (
            <>
              You <span className="text-accent">won.</span>
            </>
          ) : (
            <>
              <span className={SEAT_TEXT_COLORS[leaders[0].seat % SEAT_TEXT_COLORS.length]}>
                {leaders[0].name}
              </span>{" "}
              wins.
            </>
          )}
        </div>
        {isTie && (
          <div className="mt-3 text-paper/70 text-sm">
            {leaders.map((p, i) => (
              <span key={p.id}>
                <span className={`font-bold ${SEAT_TEXT_COLORS[p.seat % SEAT_TEXT_COLORS.length]}`}>
                  {p.name}
                </span>
                {i < leaders.length - 2 ? ", " : i === leaders.length - 2 ? " & " : ""}
              </span>
            ))}{" "}
            share the lead at <span className="font-mono font-bold text-paper">{topScore}</span>.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
        {campaign?.result && (
          <div
            className={`rounded-2xl border px-4 py-3 mb-3 animate-rise ${
              campaign.result.passed
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-rose-400/40 bg-rose-400/10"
            }`}
            data-testid="game-end-campaign-result"
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-paper/50">
              Campaign · {campaign.levelId} {campaignDef?.title}
            </div>
            <div
              className={`font-display text-xl font-extrabold mt-0.5 ${
                campaign.result.passed ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {campaign.result.passed ? "Objective complete" : "Objective missed"}
            </div>
            <div className="text-xs text-paper/70 mt-0.5">{campaign.result.objectiveText}</div>
            {!campaign.result.passed && campaign.result.detail && (
              <div className="text-xs text-paper/55 mt-1">{campaign.result.detail}</div>
            )}
            {campaign.result.unlockedFlairs?.map((f) => (
              <div key={f} className="mt-1.5 text-xs font-bold text-gold" data-testid={`game-end-campaign-flair-${f}`}>
                Flair unlocked: {FLAIRS[f].name}
              </div>
            ))}
          </div>
        )}
        <RoundScoreTable
          ranked={ranked}
          selfId={selfPlayerId}
          roundHistory={publicState.roundHistory}
          awards={awardBadgesByPlayer(publicState.gameStats)}
        />
        <ScoreChart players={publicState.players} roundHistory={publicState.roundHistory} selfId={selfPlayerId} />
        {publicState.gameStats && (
          <Highlights stats={publicState.gameStats} players={publicState.players} selfId={selfPlayerId} />
        )}
        {/* Series standings appear only once there IS a series: from the second
            game on. After game one the tally would just echo the scoreboard. */}
        {publicState.series.gamesPlayed > 1 && (
          <div className="mt-3">
            <SeriesStandings
              series={publicState.series}
              players={publicState.players}
              selfId={selfPlayerId}
              testId="game-end-series"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 mt-4 shrink-0">
        {campaign ? (
          <>
            {campaign.result?.passed && campaignNext && (
              <button
                className="btn-primary text-xl py-5"
                disabled={busy}
                onClick={() => startCampaignLevel(campaignNext)}
                data-sfx="confirm"
                data-testid="game-end-campaign-next"
              >
                {busy ? "Loading…" : "Next level"}
              </button>
            )}
            <button
              className={campaign.result?.passed ? "btn-ghost text-sm py-3" : "btn-primary text-xl py-5"}
              disabled={busy}
              onClick={() => startCampaignLevel(campaign.levelId)}
              data-sfx="confirm"
              data-testid="game-end-campaign-retry"
            >
              {busy ? "Loading…" : campaign.result?.passed ? "Replay level" : "Retry"}
            </button>
          </>
        ) : isHost ? (
          <button className="btn-primary text-xl py-5" disabled={busy} onClick={playAgain} data-sfx="confirm" data-testid="game-end-play-again">
            {busy ? "Restarting…" : "Play again"}
          </button>
        ) : hostOffline ? (
          <button className="btn-primary text-xl py-5" disabled={busy} onClick={claimHost} data-sfx="confirm" data-testid="game-end-claim-host">
            {busy ? "…" : "Claim host to start a new game"}
          </button>
        ) : (
          <div className="text-center text-paper/50 font-mono text-sm py-4">
            Waiting for {hostName} to start a new game…
          </div>
        )}
        {err && (
          <div className="rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-3 text-sm" data-testid="game-end-error">{err}</div>
        )}
        {campaign ? (
          <button className="btn-ghost text-sm py-3" onClick={backToCampaign} data-testid="game-end-campaign-back">
            Back to campaign
          </button>
        ) : (
          <button className="btn-ghost text-sm py-3" onClick={onLeave} data-testid="game-end-leave">
            Leave room
          </button>
        )}
      </div>
    </div>
  );
}
