import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { PositionMessage_Direction } from "@workadventure/messages";
import { Player } from "@wa/front/Phaser/Player/Player";
import { userSeatedStore } from "@wa/front/Stores/GameStore";

vi.mock("@wa/front/Rules/StatusRules/statusChangerFunctions", () => ({ passStatusToOnline: vi.fn() }));

/** The local player, with just what sitting down and standing up touch. */
function fixture(): Player {
    const player: Player = Object.create(Player.prototype);
    Object.assign(player, {
        _lastDirection: PositionMessage_Direction.DOWN,
        sprites: new Map(),
        playAnimation: vi.fn(),
        setDepthIfNeeded: vi.fn(),
        computeDepth: () => 0,
        scene: { markDirty: vi.fn() },
    });
    return player;
}

describe("userSeatedStore", () => {
    beforeEach(() => {
        userSeatedStore.set(false);
    });

    it("tells the interface when the local player sits down and stands up", () => {
        const player = fixture();

        player.sit(PositionMessage_Direction.UP);
        expect(get(userSeatedStore)).toBe(true);

        player.standUp();
        expect(get(userSeatedStore)).toBe(false);
    });
});
