import { describe, expect, it } from "vitest";
import { FIRE_DEFAULT_TILES, fireTiles } from "../src/Catastrophe/FirePatch";
import { BURN_SECONDS, Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import { soilCode } from "../src/Terrain/Soils";
import { cellKey, withSoils } from "../src/Terrain/TerrainGrid";
import { Season } from "../src/types";

/** A dry night: nothing grows, nothing is wet. `random` at 1 means no luck: nothing spreads, nothing starts. */
const night: MeadowStepInput = {
    seconds: MEADOW_STEP_SECONDS,
    rainMmPerHour: 0,
    daylight: false,
    season: Season.Summer,
    waterAt: () => 0,
    random: () => 1,
};
const size = { width: 21, height: 21 };
const run = (meadow: Meadow, seconds: number, input: MeadowStepInput = night): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += MEADOW_STEP_SECONDS) meadow.step(input);
};
/** A meadow all in grass, as dry as said. */
const prairie = (dryness: number, terrain?: Parameters<typeof withSoils>[0]): Meadow => {
    const meadow = new Meadow(size, terrain, undefined);
    for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) meadow.set(x, y, 0.1, 1, dryness);
    return meadow;
};
const tile = (tileX: number, tileY: number, value: number): [string, number][] => [
    [cellKey(tileX * 2, tileY * 2), value],
    [cellKey(tileX * 2 + 1, tileY * 2), value],
    [cellKey(tileX * 2, tileY * 2 + 1), value],
    [cellKey(tileX * 2 + 1, tileY * 2 + 1), value],
];

describe("a patch of fire", () => {
    it("sets fire to the grass under it, a disc as wide as said", () => {
        const meadow = prairie(1);
        expect(meadow.ignite(10, 10, 2)).toBe(13);
        expect(meadow.fireAt(10, 10)).toBeGreaterThan(0);
        expect(meadow.fireAt(12, 10)).toBeGreaterThan(0);
        expect(meadow.fireAt(13, 10)).toBe(0);
        expect(meadow.fireAt(12, 12)).toBe(0);
        expect(meadow.burning()).toBe(13);
    });

    it("does not take on bare ground, on sand, on a sodden soil nor under water", () => {
        const terrain = withSoils(undefined, new Map(tile(4, 4, soilCode("sand"))));
        const meadow = prairie(1, terrain);
        meadow.set(6, 6, 0.1, 0, 1);
        meadow.set(8, 8, 1, 1, 1);
        for (const [x, y] of [
            [4, 4],
            [6, 6],
            [8, 8],
        ]) {
            expect(meadow.ignite(x, y, 0)).toBe(0);
            expect(meadow.fireAt(x, y)).toBe(0);
        }
        // The water lying on the ground is what the last step read.
        meadow.step({ ...night, waterAt: (tileX, tileY) => (tileX === 2 && tileY === 2 ? 4 : 0) });
        expect(meadow.ignite(2, 2, 0)).toBe(0);
        expect(meadow.ignite(3, 2, 0)).toBe(1);
        expect(meadow.ignite(-5, 400, 3)).toBe(0);
        expect(meadow.ignite(Number.NaN, 2, 1)).toBe(0);
    });

    it("keeps its size within what a patch may be", () => {
        expect(FIRE_DEFAULT_TILES).toBe(2);
        expect([0, 1, 8, 99, 3.4, Number.NaN].map(fireTiles)).toEqual([1, 1, 8, 8, 3, 2]);
    });
});

describe("a tile on fire", () => {
    it("burns for twenty seconds, then is ash: its grass is gone", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        expect(BURN_SECONDS).toBe(20);
        run(meadow, 6);
        expect(meadow.fireAt(10, 10)).toBe(1);
        expect(meadow.grassAt(10, 10)).toBeLessThan(1);
        run(meadow, 14);
        expect(meadow.fireAt(10, 10)).toBe(0);
        expect(meadow.grassAt(10, 10)).toBe(0);
        expect(meadow.ashAt(10, 10)).toBe(1);
        expect(meadow.drynessAt(10, 10)).toBe(0);
        expect(meadow.burning()).toBe(0);
    });

    it("leaves ash that does not burn again, until the grass is back", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 30);
        expect(meadow.ignite(10, 10, 0)).toBe(0);
        // The grass grows back: the ash goes as it comes.
        meadow.set(10, 10, 0.5, 0.3, 0);
        meadow.step(night);
        expect(meadow.ashAt(10, 10)).toBeCloseTo(0.7, 5);
        expect(meadow.ignite(10, 10, 0)).toBe(0);
        meadow.set(10, 10, 0.5, 0.8, 1);
        meadow.step(night);
        expect(meadow.ashAt(10, 10)).toBeCloseTo(0.2, 5);
        expect(meadow.ignite(10, 10, 0)).toBe(1);
    });

    it("is put out by water lying on it, by a sodden soil and by a hard rain", () => {
        const flooded = prairie(1);
        flooded.ignite(10, 10, 0);
        flooded.step({ ...night, waterAt: () => 2 });
        expect(flooded.fireAt(10, 10)).toBe(0);
        const soaked = prairie(1);
        soaked.ignite(10, 10, 0);
        soaked.soak(10, 10, 2);
        soaked.step(night);
        expect(soaked.fireAt(10, 10)).toBe(0);
        const rained = prairie(1);
        rained.ignite(10, 10, 0);
        run(rained, 4, { ...night, rainMmPerHour: 60 });
        expect(rained.fireAt(10, 10)).toBe(0);
        // Put out before it burnt through: some grass is left, and little ash.
        expect(rained.grassAt(10, 10)).toBeGreaterThan(0.7);
        expect(rained.ashAt(10, 10)).toBeLessThan(0.3);
    });

    it("goes out with a meadow that is turned off", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 2);
        meadow.clear();
        expect(meadow.burning()).toBe(0);
        expect(meadow.ashAt(10, 10)).toBe(0);
    });
});

describe("the fire spreading", () => {
    const lucky = { ...night, random: () => 0 };

    it("reaches the dry grass next to it, and stops at sand and at water", () => {
        const sand = new Map<string, number>();
        for (let y = 0; y < size.height; y++)
            for (const [key, value] of tile(14, y, soilCode("sand"))) sand.set(key, value);
        const meadow = prairie(1, withSoils(undefined, sand));
        const river = { ...lucky, waterAt: (tileX: number) => (tileX === 6 ? 4 : 0) };
        meadow.step({ ...river, random: () => 1 });
        meadow.ignite(10, 10, 0);
        run(meadow, 200, river);
        expect(meadow.burning()).toBe(0);
        // Everything between the river and the sand burnt.
        for (const x of [7, 9, 11, 13]) expect(meadow.ashAt(x, 3)).toBe(1);
        // Nothing beyond.
        for (const x of [0, 5, 6, 14, 15, 20]) {
            expect(meadow.ashAt(x, 10)).toBe(0);
            expect(meadow.fireAt(x, 10)).toBe(0);
        }
    });

    it("runs with the wind and hardly against it", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        // A wind of 60 km/h from the west blows east. With this luck, only a chance over 0.2 spreads.
        run(meadow, 12, { ...night, windFrom: 270, windSpeed: 60, random: () => 0.2 });
        expect(meadow.fireAt(11, 10) + meadow.ashAt(11, 10)).toBeGreaterThan(0);
        expect(meadow.fireAt(13, 10) + meadow.ashAt(13, 10)).toBeGreaterThan(0);
        expect(meadow.fireAt(9, 10) + meadow.ashAt(9, 10)).toBe(0);
        expect(meadow.fireAt(10, 9) + meadow.ashAt(10, 9)).toBe(0);
    });

    it("hardly spreads over green grass", () => {
        const meadow = prairie(0);
        meadow.ignite(10, 10, 0);
        // The chance over green grass is 0.15 × 0.15 = 0.0225 at most: this luck is not enough.
        run(meadow, 30, { ...night, random: () => 0.03 });
        expect(meadow.ashAt(10, 10)).toBe(1);
        expect(meadow.ashAt(11, 10)).toBe(0);
        expect(meadow.burning()).toBe(0);
    });

    it("burns a whole dry map out, and stops by itself", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 600, lucky);
        expect(meadow.burning()).toBe(0);
        expect(meadow.ashAt(0, 0)).toBe(1);
        expect(meadow.ashAt(20, 20)).toBe(1);
    });
});

describe("a fire starting by itself", () => {
    it("starts on straw when the danger is at its highest, and only then", () => {
        const straw = prairie(1);
        run(straw, 4, { ...night, fireDanger: 1, random: () => 0 });
        expect(straw.burning()).toBeGreaterThan(0);
        const calm = prairie(1);
        run(calm, 60, { ...night, fireDanger: 0.9, random: () => 0 });
        expect(calm.burning()).toBe(0);
        const green = prairie(0.5);
        green.step({ ...night, fireDanger: 1, random: () => 0 });
        expect(green.burning()).toBe(0);
    });

    it("is rare: about one try a minute", () => {
        const meadow = prairie(1);
        // A try needs a draw under 2 / 60.
        meadow.step({ ...night, fireDanger: 1, random: () => 0.05 });
        expect(meadow.burning()).toBe(0);
    });
});

describe("the ash", () => {
    it("is written with the meadow; the fire is not, and a state saved without ash is still read", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 30);
        meadow.ignite(3, 3, 0);
        const copy = new Meadow(size, undefined, undefined);
        expect(copy.read(meadow.writeGrass(), meadow.writeMoisture(), meadow.writeDryness(), meadow.writeAsh())).toBe(
            true,
        );
        expect(copy.ashAt(10, 10)).toBe(1);
        expect(copy.burning()).toBe(0);
        expect(meadow.writeFire()[3 * size.width + 3]).toBeGreaterThan(0);
        const older = new Meadow(size, undefined, undefined);
        expect(older.read(meadow.writeGrass(), meadow.writeMoisture(), meadow.writeDryness())).toBe(true);
        expect(older.ashAt(10, 10)).toBe(0);
        expect(older.read(meadow.writeGrass(), meadow.writeMoisture(), undefined, new Uint8Array(2))).toBe(false);
    });

    it("follows the meadow that replaces it when the map is edited, the fire too", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 30);
        meadow.ignite(3, 3, 0);
        const next = new Meadow(size, undefined, undefined);
        next.takeFrom(meadow);
        expect(next.ashAt(10, 10)).toBe(1);
        expect(next.fireAt(3, 3)).toBeGreaterThan(0);
    });
});
