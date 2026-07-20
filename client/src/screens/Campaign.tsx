import { useEffect, useState } from "react";
import { api } from "../api.js";
import { connectSocket, disconnectSocket } from "../socket.js";
import {
  clearIdentity,
  getProfileName,
  getProfileToken,
  listIdentities,
  saveIdentity,
  saveProfileName,
} from "../identity.js";
import { useAppStore } from "../store.js";
import { MusicToggle } from "../components.js";
import { playSignaturePreview, type SignatureVoice } from "../sfx.js";
import { Wave } from "../wave.js";
import { ROUND_THEMES } from "../theme.js";
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_LEVELS,
  FLAIR_IDS,
  FLAIRS,
  isLevelCompleted,
  isLevelUnlocked,
  objectiveText,
  type FlairId,
  type FlairKind,
} from "../../../shared/campaign.js";
import type { ProfileView } from "../../../shared/protocol.js";

// GameEnd's "Back to campaign" sets this before resetting to Home so the Home
// screen opens straight onto the campaign instead of the menu.
const RETURN_KEY = "cancel:campaign-return";

export function requestCampaignReturn() {
  try {
    sessionStorage.setItem(RETURN_KEY, "1");
  } catch {
    // sessionStorage unavailable: land on the menu instead, no harm
  }
}

// Split peek/clear so Home's useState initializer stays side-effect-free —
// StrictMode double-invokes initializers, and a consuming read would see the
// flag on the first call and lose it on the second.
export function peekCampaignReturn(): boolean {
  try {
    return sessionStorage.getItem(RETURN_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearCampaignReturn() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // nothing to clear
  }
}

const EMPTY_PROFILE: ProfileView = {
  completedLevels: {},
  unlockedFlairs: [],
  equippedFlair: null,
  equippedName: null,
  equippedFlourish: null,
  equippedSound: null,
};

// Chapter tints come straight from the round themes (inline styles only — the
// global --th-* vars stay untouched, so Home/campaign remain indigo overall).
function themeRgb(triplet: string, alpha = 1): string {
  return `rgb(${triplet} / ${alpha})`;
}

// Self-contained flair manager for screens outside the campaign (Home): fetches
// the profile when opened, reuses the same picker modal. Equip changes apply to
// the NEXT room you create or join (flair is snapshotted at seat time).
export function FlairButton({ className = "", testId }: { className?: string; testId: string }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileView | null>(null);

  async function openPicker() {
    setOpen(true);
    try {
      const res = await api.getProfile(getProfileToken());
      setProfile(res.profile);
    } catch {
      setProfile(EMPTY_PROFILE);
    }
  }

  async function equip(flair: FlairId | null, kind: FlairKind) {
    try {
      const res = await api.equipFlair(getProfileToken(), flair, kind);
      setProfile(res.profile);
    } catch {
      // leave the picker as-is; the campaign screen surfaces equip errors
    }
  }

  return (
    <>
      <button className={className} onClick={() => void openPicker()} data-sfx="tap" data-testid={testId}>
        Wave flair
      </button>
      {open && profile && (
        <FlairPicker profile={profile} onEquip={equip} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function Campaign({ onBack }: { onBack: () => void }) {
  const setState = useAppStore((s) => s.setState);
  const reset = useAppStore((s) => s.reset);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flairOpen, setFlairOpen] = useState(false);
  // Level waiting on a name: the one-time inline prompt before first start.
  const [pendingLevel, setPendingLevel] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    api
      .getProfile(getProfileToken())
      .then((res) => setProfile(res.profile))
      .catch((e) => setErr((e as Error).message));
  }, []);

  const knownName = getProfileName() ?? listIdentities()[0]?.name ?? "";

  async function begin(levelId: string, playerName: string) {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.createRoom(playerName, {
        campaignLevelId: levelId,
        profileToken: getProfileToken(),
      });
      saveProfileName(playerName);
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

  function startLevel(levelId: string) {
    if (busy) return;
    if (!knownName.trim()) {
      setPendingLevel(levelId);
      return;
    }
    void begin(levelId, knownName.trim());
  }

  async function equip(flair: FlairId | null, kind: FlairKind) {
    try {
      const res = await api.equipFlair(getProfileToken(), flair, kind);
      setProfile(res.profile);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const progress = profile ?? EMPTY_PROFILE;

  return (
    <div className="min-h-screen flex flex-col px-6 pt-8 pb-8 max-w-md mx-auto relative">
      <div className="absolute top-3 right-3">
        <MusicToggle />
      </div>

      <header className="mb-6 animate-rise">
        <button className="text-paper/50 font-mono text-xs uppercase tracking-widest" onClick={onBack} data-testid="campaign-back">
          &larr; Back
        </button>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-4xl font-extrabold tracking-tight">Campaign</div>
            <div className="mt-1 text-paper/55 font-mono text-xs uppercase tracking-[0.22em]">
              solo · one signal against the noise
            </div>
          </div>
          <button
            className="btn-ghost px-4 py-2 text-sm shrink-0"
            onClick={() => setFlairOpen(true)}
            data-testid="campaign-profile"
          >
            Flair
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded-2xl bg-accent/15 border border-accent/40 text-accent px-4 py-3 text-sm" data-testid="campaign-error">
          {err}
        </div>
      )}

      <div className="flex flex-col gap-6">
        {CAMPAIGN_CHAPTERS.map((chapter) => {
          const theme = ROUND_THEMES[chapter.themeIndex % ROUND_THEMES.length];
          const accent = themeRgb(theme.accent);
          const levels = CAMPAIGN_LEVELS.filter((l) => l.chapterId === chapter.id);
          return (
            <section
              key={chapter.id}
              className="rounded-3xl border p-4 animate-rise"
              style={{
                borderColor: themeRgb(theme.accent, 0.25),
                background: `linear-gradient(160deg, ${themeRgb(theme.bg1, 0.55)}, ${themeRgb(theme.bg2, 0.3)})`,
              }}
              data-testid={`campaign-chapter-${chapter.id}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-display text-xl font-extrabold" style={{ color: accent }}>
                  {chapter.title}
                </div>
                {chapter.comingSoon && (
                  <span className="chip bg-paper/10 text-paper/50 font-mono text-[10px] uppercase tracking-widest">
                    coming soon
                  </span>
                )}
              </div>
              <div className="text-paper/55 text-xs mt-0.5 mb-1">{chapter.flavor}</div>
              {chapter.completionFlair ? (
                <div className="mb-3 font-mono text-[10px] text-paper/40">
                  Finish the chapter to unlock: {FLAIRS[chapter.completionFlair].name}
                </div>
              ) : (
                <div className="mb-2" />
              )}

              {chapter.comingSoon ? (
                <div className="rounded-2xl border border-paper/10 bg-paper/[.03] px-4 py-4 text-paper/35 font-mono text-xs">
                  New levels are still being written.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {levels.map((level) => {
                    const done = isLevelCompleted(progress, level.id);
                    const unlocked = isLevelUnlocked(progress, level.id);
                    const isNext = unlocked && !done;
                    return (
                      <button
                        key={level.id}
                        disabled={!unlocked || busy}
                        onClick={() => startLevel(level.id)}
                        data-sfx={unlocked ? "confirm" : "none"}
                        data-testid={`campaign-level-${level.id}`}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          isNext
                            ? "bg-paper/10"
                            : done
                              ? "bg-paper/[.04] border-paper/15"
                              : "bg-paper/[.02] border-paper/10 opacity-45"
                        }`}
                        style={
                          isNext
                            ? { borderColor: themeRgb(theme.accent, 0.6), boxShadow: `0 0 18px ${themeRgb(theme.accent, 0.25)}` }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-paper/40">{level.id}</span>
                          <span className="font-bold flex-1">{level.title}</span>
                          {done && (
                            <span className="font-mono text-xs" style={{ color: accent }}>
                              done ✓
                            </span>
                          )}
                          {!unlocked && <span className="font-mono text-xs text-paper/40">locked</span>}
                        </div>
                        <div className="text-paper/55 text-xs mt-1">{level.flavor}</div>
                        <div className="mt-1.5 font-mono text-[11px]" style={{ color: themeRgb(theme.gold) }}>
                          Goal: {objectiveText(level.objective)}
                        </div>
                        {level.unlocksFlair && (
                          <div className="mt-0.5 font-mono text-[10px] text-paper/40">
                            Unlocks flair: {FLAIRS[level.unlocksFlair].name}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* One-time name prompt: only shown when this device has never entered a name. */}
      {pendingLevel && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/90 backdrop-blur-md p-4" onClick={() => setPendingLevel(null)}>
          <div
            className="panel w-full max-w-md rounded-3xl p-5 animate-rise bg-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <label className="text-paper/60 text-xs uppercase tracking-widest font-mono">Your name</label>
            <input
              className="input mt-2 w-full"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Taylor"
              maxLength={16}
              data-testid="campaign-name-input"
            />
            <button
              className="btn-primary w-full mt-3 py-3"
              disabled={busy || !name.trim()}
              onClick={() => void begin(pendingLevel, name.trim())}
              data-sfx="confirm"
              data-testid="campaign-name-start"
            >
              {busy ? "Loading…" : "Start"}
            </button>
          </div>
        </div>
      )}

      {flairOpen && (
        <FlairPicker
          profile={progress}
          onEquip={equip}
          onClose={() => setFlairOpen(false)}
        />
      )}
    </div>
  );
}

function FlairPicker({
  profile,
  onEquip,
  onClose,
}: {
  profile: ProfileView;
  onEquip: (flair: FlairId | null, kind: FlairKind) => void;
  onClose: () => void;
}) {
  const sections: { kind: FlairKind; title: string }[] = [
    { kind: "wave", title: "Wave" },
    { kind: "name", title: "Name" },
    { kind: "flourish", title: "Victory flourish" },
    { kind: "sound", title: "Signature sound" },
  ];
  const equippedIn = (kind: FlairKind) =>
    kind === "name"
      ? profile.equippedName
      : kind === "flourish"
        ? profile.equippedFlourish
        : kind === "sound"
          ? profile.equippedSound
          : profile.equippedFlair;
  // Static preview glyphs for the two non-visual-on-a-wave kinds.
  const FLOURISH_GLYPH: { [id: string]: string } = { shockwave: "◎", zero_rain: "Ø", limelight: "✦" };
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/90 backdrop-blur-md p-4" onClick={onClose}>
      {/* testid on the rising panel (not the static overlay) so waitOpaque
          actually waits out the entrance animation before screenshots. */}
      <div
        className="panel w-full max-w-md rounded-3xl p-5 animate-rise bg-ink max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="campaign-flair-modal"
      >
        <div className="flex items-center justify-between">
          <div className="font-display text-xl font-extrabold">Flair</div>
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={onClose} data-testid="campaign-flair-close">
            Close
          </button>
        </div>
        <div className="text-paper/55 text-xs mt-1">
          Earned in the campaign, worn everywhere you play. One wave style and one name style at a
          time; tap an equipped flair to go plain.
        </div>
        {sections.map((section) => (
          <div key={section.kind}>
            <div className="mt-4 mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-paper/45">
              {section.title}
            </div>
            <div className="flex flex-col gap-2">
              {FLAIR_IDS.filter((id) => FLAIRS[id].kind === section.kind).map((id) => {
                const unlocked = profile.unlockedFlairs.includes(id);
                const equipped = equippedIn(section.kind) === id;
                return (
                  <button
                    key={id}
                    disabled={!unlocked}
                    onClick={() => {
                      // Equipping a signature sound plays it, so the pick is audible.
                      if (section.kind === "sound" && !equipped) {
                        playSignaturePreview(id as SignatureVoice);
                      }
                      onEquip(equipped ? null : id, section.kind);
                    }}
                    data-sfx={unlocked && section.kind !== "sound" ? "click" : "none"}
                    data-testid={`campaign-flair-${id}`}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      equipped
                        ? "border-gold/70 bg-gold/10"
                        : unlocked
                          ? "border-paper/15 bg-paper/5"
                          : "border-paper/10 bg-paper/[.02] opacity-40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-16 h-6 shrink-0 flex items-center justify-center">
                        {section.kind === "wave" ? (
                          <Wave rank={2} color="#6fa8ff" variant="soft" flair={unlocked ? id : null} className="w-full h-full" />
                        ) : section.kind === "name" ? (
                          <span
                            className={`font-bold text-sm ${unlocked ? `nf-${id}` : ""}`}
                            style={{ color: "#6fa8ff" }}
                          >
                            You
                          </span>
                        ) : (
                          <span
                            className="font-mono text-lg"
                            style={{ color: "#6fa8ff", textShadow: unlocked ? "0 0 8px #6fa8ff" : undefined }}
                          >
                            {section.kind === "sound" ? "♪" : FLOURISH_GLYPH[id] ?? "❋"}
                          </span>
                        )}
                      </span>
                      <span className="flex-1">
                        <span className="font-bold text-sm block">{FLAIRS[id].name}</span>
                        <span className="text-paper/55 text-xs block">{FLAIRS[id].description}</span>
                      </span>
                      {equipped && <span className="chip bg-gold/20 text-gold text-xs">equipped</span>}
                      {!unlocked && <span className="font-mono text-[10px] text-paper/40">locked</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
