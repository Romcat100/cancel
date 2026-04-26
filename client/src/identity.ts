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
