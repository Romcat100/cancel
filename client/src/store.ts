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
  setState: (s) => set({ state: s }),
  markRevealsSeen: () =>
    set((cur) => ({
      lastSeenTurnIndex: cur.state?.publicState.round?.reveals.length ?? -1,
    })),
  reset: () => set({ state: null, lastSeenTurnIndex: -1 }),
}));
