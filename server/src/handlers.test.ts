import { afterAll, describe, expect, it } from "vitest";
// Must be set before the first getDb() call (getDb is lazy; see rooms.test.ts).
process.env.DB_PATH = ":memory:";

import type { Server } from "socket.io";
import { closeDb } from "./db.js";
import { loadRoom, saveRoom } from "./rooms.js";
import { loadProfile, saveProfile, freshProfile } from "./profiles.js";
import {
  apiAckRoundEnd,
  apiCreateRoom,
  apiEquipFlair,
  apiGetProfile,
  apiJoinRoom,
  apiSubmitTurn,
  type ApiCtx,
} from "./handlers.js";

afterAll(() => closeDb());

// The handlers only touch io inside setImmediate(broadcastRoom); this stub makes
// that a no-op (no sockets in the room).
const ctx: ApiCtx = {
  io: { sockets: { adapter: { rooms: new Map() }, sockets: new Map() } } as unknown as Server,
};

const TOKEN = "test-profile-token-1234";

describe("campaign rooms (handlers path)", () => {
  it("createRoom with a campaign level derives config server-side and auto-starts", () => {
    const res = apiCreateRoom({ name: "Parker", campaignLevelId: "1-1", profileToken: TOKEN }, ctx);
    const room = loadRoom(res.roomCode)!;
    // Auto-start: no lobby stop.
    expect(room.phase).toBe("turn_submitting");
    // Config comes from the level (1-1: 2 rounds, pure_tone roster, 2 bots), not the request.
    expect(room.config.rounds).toBe(2);
    expect(room.config.powerUpMode).toBe("selected");
    expect(room.config.selectedRoundPowers).toEqual(["pure_tone"]);
    expect(room.config.solo).toBe(true);
    expect(room.players.filter((p) => p.isBot)).toHaveLength(2);
    expect(room.rounds[0].roundPower).toBe("pure_tone");
    // The campaign stamp holds the token server-side...
    expect(room.campaign).toEqual({ levelId: "1-1", profileToken: TOKEN });
    // ...but the projection never leaks it.
    expect(res.state.publicState.campaign).toEqual({ levelId: "1-1", result: undefined });
    expect(JSON.stringify(res.state)).not.toContain(TOKEN);
  });

  it("rejects a locked level and an unknown level", () => {
    expect(() =>
      apiCreateRoom({ name: "Parker", campaignLevelId: "1-2", profileToken: "fresh-token-5678" }, ctx),
    ).toThrow(/locked/i);
    expect(() =>
      apiCreateRoom({ name: "Parker", campaignLevelId: "9-9", profileToken: TOKEN }, ctx),
    ).toThrow(/unknown/i);
  });

  it("blocks fresh joins into a campaign room", () => {
    const res = apiCreateRoom({ name: "Parker", campaignLevelId: "1-1", profileToken: TOKEN }, ctx);
    expect(() => apiJoinRoom({ roomCode: res.roomCode, name: "Mallory" }, ctx)).toThrow(
      /single player/i,
    );
  });

  it("plays 1-1 to game_end, stamps the result, and records completion in the profile", () => {
    const token = "playthrough-token-0001";
    const res = apiCreateRoom({ name: "Parker", campaignLevelId: "1-1", profileToken: token }, ctx);
    const { roomCode, claimToken, playerId } = res;

    let guard = 0;
    for (;;) {
      if (++guard > 100) throw new Error("campaign game did not terminate");
      const room = loadRoom(roomCode)!;
      if (room.phase === "game_end") break;
      if (room.phase === "turn_submitting") {
        const handSize = room.players.length + 2;
        const lastTurnOfLastRound =
          room.currentRoundIndex + 1 >= room.config.rounds &&
          room.currentTurnIndex >= handSize - 1;
        if (lastTurnOfLastRound) {
          // Rig the standings before the final submit (the last round has no
          // round_end ack — resolveTurn ends the game straight from it) so the
          // "win" objective passes deterministically; one turn's delta can't
          // close a 99-point gap.
          const rigged = {
            ...room,
            players: room.players.map((p) => ({ ...p, totalScore: p.id === playerId ? 99 : 1 })),
          };
          saveRoom(rigged);
        }
        // Bots pre-submit; the human plays their lowest card and the turn resolves.
        const hand = loadRoom(roomCode)!.rounds[room.currentRoundIndex].hands[playerId];
        apiSubmitTurn({ roomCode, claimToken, number: hand[0] }, ctx);
      } else if (room.phase === "round_end") {
        apiAckRoundEnd({ roomCode, claimToken }, ctx);
      } else {
        throw new Error(`unexpected phase ${room.phase}`);
      }
    }

    const done = loadRoom(roomCode)!;
    expect(done.campaign?.result?.passed).toBe(true);
    expect(done.campaign?.result?.objectiveText).toBe("Win the game");
    // The first win pays out a flair (stamped on the result for the callout).
    expect(done.campaign?.result?.unlockedFlairs).toEqual(["shimmer"]);
    const profile = loadProfile(token);
    expect(profile.completedLevels["1-1"]).toBeTruthy();
    expect(profile.unlockedFlairs).toEqual(["shimmer"]);
    // Level 1-2 is now unlocked for this profile.
    const next = apiCreateRoom({ name: "Parker", campaignLevelId: "1-2", profileToken: token }, ctx);
    expect(loadRoom(next.roomCode)!.rounds[0].roundPower).toBe("harmony");
  });

  it("stamps a failed result without recording completion", () => {
    const token = "playthrough-token-0002";
    const res = apiCreateRoom({ name: "Parker", campaignLevelId: "1-1", profileToken: token }, ctx);
    const { roomCode, claimToken, playerId } = res;

    let guard = 0;
    for (;;) {
      if (++guard > 100) throw new Error("campaign game did not terminate");
      const room = loadRoom(roomCode)!;
      if (room.phase === "game_end") break;
      if (room.phase === "turn_submitting") {
        const handSize = room.players.length + 2;
        const lastTurnOfLastRound =
          room.currentRoundIndex + 1 >= room.config.rounds &&
          room.currentTurnIndex >= handSize - 1;
        if (lastTurnOfLastRound) {
          const rigged = {
            ...room,
            players: room.players.map((p) => ({ ...p, totalScore: p.id === playerId ? -99 : 50 })),
          };
          saveRoom(rigged);
        }
        const hand = loadRoom(roomCode)!.rounds[room.currentRoundIndex].hands[playerId];
        apiSubmitTurn({ roomCode, claimToken, number: hand[0] }, ctx);
      } else if (room.phase === "round_end") {
        apiAckRoundEnd({ roomCode, claimToken }, ctx);
      } else {
        throw new Error(`unexpected phase ${room.phase}`);
      }
    }

    const done = loadRoom(roomCode)!;
    expect(done.campaign?.result?.passed).toBe(false);
    expect(done.campaign?.result?.detail).toBeTruthy();
    expect(loadProfile(token).completedLevels["1-1"]).toBeUndefined();
  });
});

describe("profiles & flair (handlers path)", () => {
  it("getProfile returns a fresh empty profile for a new token", () => {
    const res = apiGetProfile("brand-new-token-xyz1");
    expect(res.profile).toEqual({ completedLevels: {}, unlockedFlairs: [], equippedFlair: null });
  });

  it("equip validates against unlocked flairs; null unequips", () => {
    const token = "flair-token-000000001";
    expect(() => apiEquipFlair({ profileToken: token, flair: "shimmer" })).toThrow(/not unlocked/i);
    const p = freshProfile();
    p.unlockedFlairs = ["shimmer"];
    saveProfile(token, p);
    expect(apiEquipFlair({ profileToken: token, flair: "shimmer" }).profile.equippedFlair).toBe(
      "shimmer",
    );
    expect(apiEquipFlair({ profileToken: token, flair: null }).profile.equippedFlair).toBeNull();
  });

  it("an equipped flair is snapshotted onto the seat and projected publicly", () => {
    const token = "flair-token-000000002";
    const p = freshProfile();
    p.unlockedFlairs = ["comet"];
    p.equippedFlair = "comet";
    saveProfile(token, p);
    const res = apiCreateRoom({ name: "Parker", profileToken: token }, ctx);
    const self = res.state.publicState.players.find((pl) => pl.id === res.playerId)!;
    expect(self.flair).toBe("comet");
    // Joiners see it too, and a joiner without a profile has none.
    const join = apiJoinRoom({ roomCode: res.roomCode, name: "Guest" }, ctx);
    const host = join.state.publicState.players.find((pl) => pl.id === res.playerId)!;
    expect(host.flair).toBe("comet");
    const guest = join.state.publicState.players.find((pl) => pl.id === join.playerId)!;
    expect(guest.flair).toBeUndefined();
  });

  it("backfills flairs earned under an older unlock schedule", () => {
    const token = "legacy-token-00000001";
    const p = freshProfile();
    // Completed 1-1 back when it granted nothing; the stored flair list is empty.
    p.completedLevels = { "1-1": { completedAt: 1 } };
    saveProfile(token, p);
    expect(apiGetProfile(token).profile.unlockedFlairs).toEqual(["shimmer"]);
    // And equip accepts the derived flair.
    expect(apiEquipFlair({ profileToken: token, flair: "shimmer" }).profile.equippedFlair).toBe(
      "shimmer",
    );
  });

  it("rejects malformed profile tokens", () => {
    expect(() => apiGetProfile("short")).toThrow(/invalid/i);
  });
});
