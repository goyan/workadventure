import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import { encodeZombieTerrain, zombieTerrainHash } from "@workadventure/map-editor";
import type { ZombieHorde } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZombieReceiver } from "../../../../../src/front/Phaser/Game/Catastrophe/ZombieReceiver";
import { LocalCatastropheRelay } from "../../../../../src/front/Phaser/Game/Terrain/LocalCatastropheRelay";

const START = 1_800_000_000_000;
const TERRAIN = encodeZombieTerrain(new Uint8Array(40 * 30).fill(1, 100, 200));

function told(impactInMs: number, withTerrain: boolean, startedAt = START): CatastropheMessage {
    return {
        id: 9,
        kind: CatastropheKind.CATASTROPHE_ZOMBIES,
        x: 0,
        y: 0,
        impactInMs,
        radiusTiles: 0,
        wholeMap: true,
        zombies: {
            count: 1500,
            minutes: 3,
            heading: 90,
            seed: 1234,
            startedAt,
            durationMs: 180_000,
            dirX: 1,
            dirY: 0,
            anchorX: 320,
            anchorY: 240,
            widthCells: 40,
            heightCells: 30,
            terrain: withTerrain ? TERRAIN : "",
            terrainHash: zombieTerrainHash(TERRAIN),
        },
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("ZombieReceiver", () => {
    it("waits for the water of the horde, then tells the same horde once", () => {
        const heard: (ZombieHorde | undefined)[] = [];
        const receiver = new ZombieReceiver((horde) => heard.push(horde));
        // Joined between two tellings of its water: nothing yet.
        receiver.report(told(170_000, false));
        expect(heard).toEqual([]);
        receiver.report(told(169_000, true));
        expect(heard).toHaveLength(1);
        expect(heard[0]).toMatchObject({
            id: 9,
            seed: 1234,
            count: 1500,
            durationMs: 180_000,
            startedAt: START,
            dirX: 1,
            dirY: 0,
            widthCells: 40,
            heightCells: 30,
            terrain: TERRAIN,
        });
        // Told again without its water: the same horde, nothing new.
        receiver.report(told(168_000, false));
        expect(heard).toHaveLength(1);
        expect(receiver.current()).toBe(heard[0]);
        receiver.destroy();
    });

    it("forgets the horde when it is stopped, or when the server says nothing more", () => {
        vi.useFakeTimers();
        const heard: (ZombieHorde | undefined)[] = [];
        const receiver = new ZombieReceiver((horde) => heard.push(horde));
        receiver.report(told(100_000, true));
        receiver.report(told(0, false));
        expect(heard).toEqual([expect.objectContaining({ id: 9 }), undefined]);
        receiver.report(told(100_000, true));
        vi.advanceTimersByTime(4000);
        expect(heard[heard.length - 1]).toBeUndefined();
        expect(receiver.current()).toBeUndefined();
    });
});

describe("LocalCatastropheRelay, a horde of zombies", () => {
    it("tells the local ground the horde once its water is known, and when it is stopped", () => {
        const relay = new LocalCatastropheRelay();
        relay.receive(told(100_000, false), 0);
        expect(relay.due(10)).toEqual([]);
        relay.receive(told(99_000, true), 1000);
        const [state] = relay.due(1010);
        expect(state).toMatchObject({ kind: "catastrophes", zombies: { id: 9, seed: 1234, terrain: TERRAIN } });
        relay.receive(told(98_000, false), 2000);
        expect(relay.due(2010)).toEqual([]);
        relay.receive(told(0, false), 3000);
        const [stopped] = relay.due(3010);
        expect(stopped).toMatchObject({ kind: "catastrophes" });
        expect(stopped).not.toHaveProperty("zombies");
    });
});
