import { afterEach, describe, expect, it, vi } from "vitest";
import { rodEquippedStore } from "../../../../../src/front/Stores/FishingStore";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

vi.mock("../../../../../src/front/Phaser/Game/Fishing/FishingView", () => ({
    FishingView: class {
        update = vi.fn();
        destroy = vi.fn();
    },
}));

const { FishingManager } = await import("../../../../../src/front/Phaser/Game/Fishing/FishingManager");

/** A player seated in an ice fishing shack whose hole is at (318, 200), or standing anywhere (`hole` undefined). */
function harness(hole: { x: number; y: number } | undefined) {
    const connection = {
        fishingMessageStream: { subscribe: () => ({ unsubscribe: vi.fn() }) },
        emitCastFishingLine: vi.fn(),
        emitReelFishingLine: vi.fn(),
        getUserId: () => 1,
    };
    const scene = {
        connection,
        CurrentPlayer: {
            x: 300,
            y: 200,
            lastDirection: 2,
            setRodEquipped: vi.fn(),
            isSwimming: () => false,
            getFloorZ: () => 0,
        },
        getPlayerVariablesManager: () => undefined,
        userInputManager: { isControlsEnabled: true },
        iceShackManager: { ownHole: () => hole },
    };
    const manager = new FishingManager(scene as unknown as GameScene, undefined);
    rodEquippedStore.set(true);
    return { manager, connection };
}

afterEach(() => rodEquippedStore.set(false));

describe("fishing in an ice fishing shack", () => {
    it("lets the line straight down the hole at the press of SPACE, no gauge", () => {
        const { manager, connection } = harness({ x: 318, y: 200 });
        manager.pressKey(false);
        expect(connection.emitCastFishingLine).toHaveBeenCalledWith(318, 200);
        // Held down, the key does not cast again; let go, nothing more is cast.
        manager.pressKey(true);
        manager.releaseKey();
        expect(connection.emitCastFishingLine).toHaveBeenCalledTimes(1);
    });

    it("out of a shack, charges the cast as before", () => {
        const { manager, connection } = harness(undefined);
        manager.pressKey(false);
        expect(connection.emitCastFishingLine).not.toHaveBeenCalled();
    });
});
