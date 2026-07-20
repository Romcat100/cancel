interface StoredIdentity {
  roomCode: string;
  claimToken: string;
  playerId: string;
  name: string;
  lastSeenAt: number;
  previewSeenRounds: number[];
}

const KEY = "cancel/identities/v1";

function readAll(): Record<string, StoredIdentity> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredIdentity>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, StoredIdentity>) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function saveIdentity(id: Omit<StoredIdentity, "lastSeenAt" | "previewSeenRounds"> & { previewSeenRounds?: number[] }) {
  const all = readAll();
  const existing = all[id.roomCode];
  all[id.roomCode] = {
    ...id,
    previewSeenRounds: id.previewSeenRounds ?? existing?.previewSeenRounds ?? [],
    lastSeenAt: Date.now(),
  };
  writeAll(all);
}

export function getIdentity(roomCode: string): StoredIdentity | null {
  const all = readAll();
  return all[roomCode] ?? null;
}

export function listIdentities(): StoredIdentity[] {
  return Object.values(readAll()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function clearIdentity(roomCode: string) {
  const all = readAll();
  delete all[roomCode];
  writeAll(all);
}

// --- Anonymous profile (campaign progress + cosmetics) ---
// One persistent UUID per device, separate from the per-room identities above.
// It's the credential the server keys campaign progress and flair on; treat it
// like a claim token. Also remembers the last-used display name so the campaign
// screen can start a level without asking again.

interface StoredProfile {
  token: string;
  name?: string;
}

const PROFILE_KEY = "cancel/profile/v1";

function readProfile(): StoredProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as StoredProfile) : null;
  } catch {
    return null;
  }
}

export function getProfileToken(): string {
  const existing = readProfile();
  if (existing?.token) return existing.token;
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...existing, token }));
  return token;
}

export function getProfileName(): string | null {
  return readProfile()?.name ?? null;
}

export function saveProfileName(name: string) {
  const token = getProfileToken();
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ token, name }));
}

export function markPreviewSeenLocal(roomCode: string, roundIndex: number) {
  const all = readAll();
  const id = all[roomCode];
  if (!id) return;
  if (!id.previewSeenRounds.includes(roundIndex)) {
    id.previewSeenRounds = [...id.previewSeenRounds, roundIndex];
    writeAll(all);
  }
}

export function hasSeenPreviewLocal(roomCode: string, roundIndex: number): boolean {
  const id = getIdentity(roomCode);
  return !!id && id.previewSeenRounds.includes(roundIndex);
}
