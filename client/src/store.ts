import { create } from "zustand";
import type { RoomStateForPlayer } from "../../shared/types.js";

interface AppState {
  state: RoomStateForPlayer | null;
  lastSeenTurnIndex: number;
  setState: (s: RoomStateForPlayer) => void;
  markRevealsSeen: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  state: null,
  lastSeenTurnIndex: -1,
  setState: (s) =>
    set((cur) => {
      // Drop out-of-order projections: our own HTTP reply and the socket broadcast are
      // unordered, so a late, older-rev state must not clobber a newer one. Equal rev is
      // kept (presence-only broadcasts reuse it); a different room is always accepted.
      const prev = cur.state;
      if (
        prev &&
        prev.publicState.roomCode === s.publicState.roomCode &&
        typeof prev.rev === "number" &&
        typeof s.rev === "number" &&
        s.rev < prev.rev
      ) {
        return { state: prev };
      }
      return { state: s };
    }),
  markRevealsSeen: () =>
    set((cur) => ({
      lastSeenTurnIndex: cur.state?.publicState.round?.reveals.length ?? -1,
    })),
  reset: () => set({ state: null, lastSeenTurnIndex: -1 }),
}));
