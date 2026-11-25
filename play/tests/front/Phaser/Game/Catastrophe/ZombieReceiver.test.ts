import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import { decodeZombieLog, encodeZombieLog, encodeZombieTerrain, zombieTerrainHash } from "@workadventure/map-editor";
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
            collisions: "",
            collisionsWidth: 0,
            collisionsHeight: 0,
            anchorStep: 0,
            anchorAt: startedAt,
            msPerStep: 100,
            avatars: "",
            safeStep: (180_000 - impactInMs) / 100 + 25,
        },
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("ZombieReceiver", () => {
    it("waits for the ground of the horde, then tells it at each message, its log complete further", () => {
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
        // Told again without its ground: the same horde, its log complete a second further.
        receiver.report(told(168_000, false));
        expect(heard).toHaveLength(2);
        expect(heard[1]).toMatchObject({ id: 9, terrain: TERRAIN, safeStep: 145 });
        expect(receiver.current()).toBe(heard[1]);
        receiver.destroy();
    });

    it("glues the last entries each message tells to its log, and waits for the whole log after a lost message", () => {
        const heard: (ZombieHorde | undefined)[] = [];
        const receiver = new ZombieReceiver((horde) => heard.push(horde));
        const entry = (applyStep: number) => ({ applyStep, changes: [{ slot: 0, tile: applyStep }] });
        const message = (impactInMs: number, withTerrain: boolean, logFrom: number, steps: number[]) => {
            const base = told(impactInMs, withTerrain);
            if (!base.zombies) throw new Error("A horde is told");
            base.zombies.avatars = encodeZombieLog(steps.map(entry));
            base.zombies.logFrom = logFrom;
            return base;
        };
        const stepsOf = (horde: ZombieHorde | undefined) =>
            decodeZombieLog(horde?.avatars ?? "").map((told) => told.applyStep);
        // The whole log with the ground, then the entries from the third on, then from the fourth on.
        receiver.report(message(169_000, true, 0, [10, 20, 30]));
        receiver.report(message(168_000, false, 2, [30, 40]));
        expect(stepsOf(receiver.current())).toEqual([10, 20, 30, 40]);
        expect(receiver.current()?.safeStep).toBe(145);
        receiver.report(message(167_000, false, 4, []));
        expect(stepsOf(receiver.current())).toEqual([10, 20, 30, 40]);
        // A message lost (the entry 50): the next one starts past what is known. The clock goes on, the log and the
        // step it is complete to stay, until the whole log comes with the ground.
        receiver.report(message(165_000, false, 5, [60]));
        expect(stepsOf(receiver.current())).toEqual([10, 20, 30, 40]);
        expect(receiver.current()?.safeStep).toBe(155);
        receiver.report(message(164_000, true, 0, [10, 20, 30, 40, 50, 60]));
        expect(stepsOf(receiver.current())).toEqual([10, 20, 30, 40, 50, 60]);
        expect(receiver.current()?.safeStep).toBe(185);
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
        expect(relay.due(2010)).toEqual([expect.objectContaining({ kind: "catastrophes" })]);
        relay.receive(told(0, false), 3000);
        const [stopped] = relay.due(3010);
        expect(stopped).toMatchObject({ kind: "catastrophes" });
        expect(stopped).not.toHaveProperty("zombies");
    });
});
