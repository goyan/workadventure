import { describe, expect, it, vi } from "vitest";

const emitLaunchZombies = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            connection: { emitLaunchZombies },
            zombieCollisions: () => ({ collisions: "AQo=", collisionsWidth: 2, collisionsHeight: 5 }),
        }),
    },
}));

import { startZombies, stopZombies } from "../../../../src/front/Components/Catastrophe/zombieActions";
import {
    zombieCountStore,
    zombieHeadingStore,
    zombieMinutesStore,
} from "../../../../src/front/Stores/CatastropheStore";

describe("zombieActions", () => {
    it("sends the horde chosen in the panel with the collisions of the map, and leaves the rest to the server", () => {
        zombieCountStore.set(500);
        zombieMinutesStore.set(3);
        zombieHeadingStore.set(90);
        startZombies();
        expect(emitLaunchZombies).toHaveBeenCalledTimes(1);
        expect(emitLaunchZombies.mock.calls[0][0]).toMatchObject({
            count: 500,
            minutes: 3,
            heading: 90,
            seed: 0,
            startedAt: 0,
            durationMs: 0,
            // The collisions of the map as this browser reads them: the server freezes them for the horde.
            collisions: "AQo=",
            collisionsWidth: 2,
            collisionsHeight: 5,
        });
        expect(emitLaunchZombies.mock.calls[0][1]).toBeUndefined();
    });

    it("asks to stop the horde with the release flag", () => {
        emitLaunchZombies.mockClear();
        stopZombies();
        expect(emitLaunchZombies).toHaveBeenCalledWith(undefined, true);
    });
});
