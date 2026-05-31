import type { HealthRes } from "../../shared/protocol.js";

// Detects when the server is serving a newer client build than the tab currently has loaded, so we
// can prompt the player to refresh. The baseline is the build id the server injected into the
// index.html this tab loaded (window.__BUILD_ID__), so it's race-free: it's literally the build that's
// running right now. In dev, Vite serves index.html with no injection, so the baseline is undefined and
// the whole check no-ops.
declare global {
  interface Window {
    __BUILD_ID__?: string;
  }
}

const baseline = typeof window !== "undefined" ? window.__BUILD_ID__ : undefined;
let staleHandler: (() => void) | null = null;
let firedStale = false;

export function setStaleHandler(fn: () => void): void {
  staleHandler = fn;
}

export function checkBuildId(serverId: string | undefined): void {
  if (!baseline || !serverId || serverId === "dev") return;
  if (serverId === baseline) return;
  if (firedStale) return;
  firedStale = true;
  staleHandler?.();
}

export async function pollHealth(): Promise<void> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    const data = (await res.json()) as HealthRes;
    checkBuildId(data.buildId);
  } catch {
    // Offline or server down: ignore and try again on the next trigger.
  }
}
