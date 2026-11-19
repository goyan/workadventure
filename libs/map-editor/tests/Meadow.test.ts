import { describe, expect, it } from "vitest";
import {
    altitudeGrowth,
    DRYING_SECONDS,
    GRASS_LINE_PX,
    GRAZE_SECONDS,
    Meadow,
    MEADOW_STEP_SECONDS,
    pavedTilesOf,
    seasonGrowth,
} from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import { SNOW_FULL_PX, SNOW_LINES, SNOW_PACE, snowCover, snowPace } from "../src/Terrain/SnowLine";
import { soilCode } from "../src/Terrain/Soils";
import { cellKey, withHeights, withSoils } from "../src/Terrain/TerrainGrid";
import { Season } from "../src/types";
import type { TerrainData } from "../src/types";

const dry: MeadowStepInput = {
    seconds: MEADOW_STEP_SECONDS,
    rainMmPerHour: 0,
    daylight: true,
    season: Season.Spring,
    waterAt: () => 0,
};
const size = { width: 12, height: 5 };
const run = (meadow: Meadow, seconds: number, input: MeadowStepInput = dry): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += MEADOW_STEP_SECONDS) meadow.step(input);
};
/** The four cells of a tile, painted or raised alike. */
const tile = (tileX: number, tileY: number, value: number): [string, number][] => [
    [cellKey(tileX * 2, tileY * 2), value],
    [cellKey(tileX * 2 + 1, tileY * 2), value],
    [cellKey(tileX * 2, tileY * 2 + 1), value],
    [cellKey(tileX * 2 + 1, tileY * 2 + 1), value],
];
/** A lake on the column 0 of the map. */
const lake = { ...dry, waterAt: (tileX: number) => (tileX === 0 ? 20 : 0) };

describe("the pace of the grass", () => {
    it("follows the season and the altitude", () => {
        expect(seasonGrowth(Season.Spring)).toBe(1);
        expect(seasonGrowth(Season.Summer)).toBe(1);
        expect(seasonGrowth(Season.Autumn)).toBeLessThan(1);
        expect(seasonGrowth(Season.Autumn)).toBeGreaterThan(0);
        expect(seasonGrowth(Season.Winter)).toBe(0);
        expect(altitudeGrowth(-64)).toBe(1);
        expect(altitudeGrowth(0)).toBe(1);
        expect(altitudeGrowth(GRASS_LINE_PX / 2)).toBeCloseTo(0.5);
        expect(altitudeGrowth(GRASS_LINE_PX)).toBe(0);
        expect(altitudeGrowth(GRASS_LINE_PX * 2)).toBe(0);
    });
});

describe("the moisture of the soil", () => {
    it("is soaked under water, spreads a few tiles from the shore, and leaves the land beyond dry", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 1800, lake);
        expect(meadow.moistureAt(0, 2)).toBe(1);
        expect(meadow.moistureAt(1, 2)).toBeGreaterThan(0.5);
        expect(meadow.moistureAt(3, 2)).toBeGreaterThan(0.25);
        expect(meadow.moistureAt(3, 2)).toBeLessThan(meadow.moistureAt(1, 2));
        expect(meadow.moistureAt(10, 2)).toBeLessThan(0.08);
    });

    it("rises with the rain, and goes away afterwards, faster through sand than through clay", () => {
        const terrain = withSoils(
            undefined,
            new Map([
                ...tile(2, 2, soilCode("sand")),
                ...tile(6, 2, soilCode("clay")),
                ...tile(9, 2, soilCode("rock")),
            ]),
        );
        const meadow = new Meadow(size, terrain, undefined);
        run(meadow, 600, { ...dry, rainMmPerHour: 2 });
        expect(meadow.moistureAt(4, 0)).toBeGreaterThan(0.25);
        // Rock holds no moisture at all.
        expect(meadow.moistureAt(9, 2)).toBe(0);
        meadow.set(2, 2, 0.6, 0);
        meadow.set(6, 2, 0.6, 0);
        run(meadow, 300);
        // The tiles around feed them both: the sand still holds less than the clay.
        expect(meadow.moistureAt(2, 2)).toBeLessThan(meadow.moistureAt(6, 2));
    });

    it("runs down a slope: the foot of a mount is wetter than its top", () => {
        const cells: [string, number][] = [];
        for (let tileX = 0; tileX < 12; tileX++) {
            for (let tileY = 0; tileY < 5; tileY++) cells.push(...tile(tileX, tileY, tileX < 6 ? 96 - tileX * 16 : 0));
        }
        const slope: TerrainData = withHeights(undefined, new Map(cells));
        const meadow = new Meadow(size, slope, undefined);
        run(meadow, 900, { ...dry, rainMmPerHour: 2 });
        expect(meadow.moistureAt(6, 2)).toBeGreaterThan(meadow.moistureAt(1, 2));
    });
});

describe("the grass", () => {
    it("grows by itself in a ring around a lake: not under the water, not on the dry land beyond", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 2400, lake);
        expect(meadow.grassAt(0, 2)).toBe(0);
        expect(meadow.grassAt(2, 2)).toBeGreaterThan(0.9);
        expect(meadow.grassAt(10, 2)).toBe(0);
    });

    it("becomes a full meadow in about ten minutes of good conditions", () => {
        const meadow = new Meadow(size, undefined, undefined);
        // The usual rain of a map: 2 mm an hour.
        const moist = { ...dry, rainMmPerHour: 2 };
        run(meadow, 600, moist);
        const start = meadow.grassAt(5, 2);
        run(meadow, 300, moist);
        expect(meadow.grassAt(5, 2) - start).toBeCloseTo(0.5, 1);
    });

    it("waits for the day and for its season", () => {
        for (const input of [
            { ...lake, daylight: false },
            { ...lake, season: Season.Winter },
        ]) {
            const meadow = new Meadow(size, undefined, undefined);
            run(meadow, 1800, input);
            expect(meadow.grassAt(2, 2)).toBe(0);
        }
    });

    it("dies of thirst slowly once the soil is dry, and drowns fast under water", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(5, 2, 0, 1);
        run(meadow, 600);
        expect(meadow.grassAt(5, 2)).toBeCloseTo(0.5, 1);
        meadow.set(7, 2, 1, 1);
        run(meadow, 30, { ...dry, waterAt: (tileX) => (tileX === 7 ? 8 : 0) });
        expect(meadow.grassAt(7, 2)).toBeCloseTo(0.5, 1);
    });

    it("grows on a fertile soil only, faster on meadow, never on sand, rock nor gravel", () => {
        const terrain = withSoils(
            undefined,
            new Map([
                ...tile(1, 1, soilCode("meadow")),
                ...tile(1, 3, soilCode("clay")),
                ...tile(2, 1, soilCode("sand")),
                ...tile(2, 3, soilCode("gravel")),
            ]),
        );
        const meadow = new Meadow(size, terrain, undefined);
        run(meadow, 300, lake);
        // Kept moist by hand: the soils are compared for what they grow, not for what they hold.
        for (let step = 0; step < 150; step++) {
            for (const [tileX, tileY] of [
                [1, 1],
                [1, 3],
                [2, 1],
                [2, 3],
                [1, 2],
            ]) {
                meadow.set(tileX, tileY, 0.5, meadow.grassAt(tileX, tileY));
            }
            meadow.step(dry);
        }
        expect(meadow.grassAt(1, 1)).toBeGreaterThan(meadow.grassAt(1, 2));
        expect(meadow.grassAt(1, 2)).toBeGreaterThan(meadow.grassAt(1, 3));
        expect(meadow.grassAt(1, 3)).toBeGreaterThan(0);
        expect(meadow.grassAt(2, 1)).toBe(0);
        expect(meadow.grassAt(2, 3)).toBe(0);
    });

    it("grows slower up a mount, and not at all over the grass line", () => {
        const terrain = withHeights(undefined, new Map([...tile(4, 2, 96), ...tile(8, 2, 200)]));
        const meadow = new Meadow(size, terrain, undefined);
        for (let step = 0; step < 100; step++) {
            for (const tileX of [2, 4, 8]) meadow.set(tileX, 2, 0.5, meadow.grassAt(tileX, 2));
            meadow.step(dry);
        }
        expect(meadow.grassAt(2, 2)).toBeGreaterThan(0.2);
        expect(meadow.grassAt(4, 2)).toBeCloseTo(meadow.grassAt(2, 2) / 2, 1);
        expect(meadow.grassAt(8, 2)).toBe(0);
    });

    it("stays out of what walls close, and off the floors of the map tool", () => {
        // A room of the tiles 4 to 6 by 1 to 3: walls on its four sides, in cells.
        const east = new Set<string>();
        const south = new Set<string>();
        for (let cell = 2; cell < 8; cell++) {
            east.add(cellKey(7, cell));
            east.add(cellKey(13, cell));
        }
        for (let cell = 8; cell < 14; cell++) {
            south.add(cellKey(cell, 1));
            south.add(cellKey(cell, 7));
        }
        const paved = pavedTilesOf({
            entities: {
                floor: {
                    x: 320,
                    y: 64,
                    prefabRef: { id: "Carte Sols:sol-bois-uni:Default:Down", collectionName: "Carte Sols" },
                },
            },
        });
        expect([...paved]).toEqual(["10,2"]);
        const meadow = new Meadow(size, undefined, { east, south }, paved);
        run(meadow, 1200, { ...dry, rainMmPerHour: 2 });
        expect(meadow.grassAt(5, 2)).toBe(0);
        expect(meadow.moistureAt(5, 2)).toBe(0);
        expect(meadow.grassAt(10, 2)).toBe(0);
        expect(meadow.grassAt(1, 2)).toBeGreaterThan(0.5);
    });

    it("is written a byte a tile, read back, and kept when the map is edited", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 1200, lake);
        const copy = new Meadow(size, undefined, undefined);
        expect(copy.read(meadow.writeGrass(), meadow.writeMoisture())).toBe(true);
        expect(copy.grassAt(2, 2)).toBeCloseTo(meadow.grassAt(2, 2), 2);
        expect(copy.read(new Uint8Array(3), new Uint8Array(3))).toBe(false);
        const edited = new Meadow({ width: 14, height: 5 }, undefined, undefined);
        edited.takeFrom(meadow);
        expect(edited.grassAt(2, 2)).toBe(meadow.grassAt(2, 2));
        expect(edited.grassAt(13, 2)).toBe(0);
    });

    it("follows the paces the map sets: a faster growth, a slower thirst, soils that hold their moisture longer", () => {
        const usual = new Meadow(size, undefined, undefined);
        const fast = new Meadow(size, undefined, undefined);
        for (let step = 0; step < 60; step++) {
            usual.set(5, 2, 0.5, usual.grassAt(5, 2));
            fast.set(5, 2, 0.5, fast.grassAt(5, 2));
            usual.step(dry);
            fast.step({ ...dry, growSeconds: 300 });
        }
        expect(fast.grassAt(5, 2)).toBeCloseTo(usual.grassAt(5, 2) * 2, 1);
        const slow = new Meadow(size, undefined, undefined);
        slow.set(5, 2, 0, 1);
        run(slow, 600, { ...dry, thirstSeconds: 2400 });
        expect(slow.grassAt(5, 2)).toBeCloseTo(0.75, 1);
        const holding = new Meadow({ width: 1, height: 1 }, undefined, undefined);
        const leaking = new Meadow({ width: 1, height: 1 }, undefined, undefined);
        holding.set(0, 0, 0.8, 0);
        leaking.set(0, 0, 0.8, 0);
        run(holding, 600, { ...dry, moistureHold: 4 });
        run(leaking, 600);
        expect(holding.moistureAt(0, 0)).toBeGreaterThan(leaking.moistureAt(0, 0) * 1.8);
        holding.clear();
        expect(holding.moistureAt(0, 0)).toBe(0);
    });
});

describe("an animal that grazes", () => {
    it("eats the grass of the tile under it, a full tile in its time, and nothing where there is none", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(2, 1, 0.5, 1);
        // The tile (2, 1) covers the pixels 64 to 95 by 32 to 63.
        expect(meadow.graze(70, 40, GRAZE_SECONDS / 4)).toBeCloseTo(0.25);
        expect(meadow.grassAt(2, 1)).toBeCloseTo(0.75);
        expect(meadow.grassAt(3, 1)).toBe(0);
        // It never eats more than there is.
        expect(meadow.graze(70, 40, GRAZE_SECONDS * 3)).toBeCloseTo(0.75);
        expect(meadow.grassAt(2, 1)).toBe(0);
        expect(meadow.graze(70, 40, 10)).toBe(0);
        // Out of the map, or for no time: nothing.
        expect(meadow.graze(-5, 40, 10)).toBe(0);
        expect(meadow.graze(9999, 40, 10)).toBe(0);
        meadow.set(2, 1, 0.5, 1);
        expect(meadow.graze(70, 40, 0)).toBe(0);
        expect(meadow.graze(70, 40, Number.NaN)).toBe(0);
        expect(meadow.grassAt(2, 1)).toBe(1);
    });
});

describe("the snow of the heights", () => {
    it("holds from a line that goes down in winter, and thickens above it", () => {
        expect(snowCover(0, Season.Winter)).toBe(0);
        expect(snowCover(SNOW_LINES[Season.Winter], Season.Winter)).toBe(0);
        expect(snowCover(SNOW_LINES[Season.Winter] + SNOW_FULL_PX / 2, Season.Winter)).toBe(0.5);
        expect(snowCover(SNOW_LINES[Season.Winter] + SNOW_FULL_PX, Season.Winter)).toBe(1);
        expect(snowCover(256, Season.Winter)).toBe(1);
        // The same mount keeps less snow, or none, in the other seasons.
        expect(snowCover(128, Season.Winter)).toBe(1);
        expect(snowCover(128, Season.Spring)).toBe(0);
        expect(snowCover(176, Season.Autumn)).toBe(0.5);
        expect(snowCover(176, Season.Summer)).toBe(0);
        expect(snowCover(256, Season.Summer)).toBe(1);
        expect(snowCover(Number.NaN, Season.Winter)).toBe(0);
    });

    it("slows the walk down with its cover", () => {
        expect(snowPace(0)).toBe(1);
        expect(snowPace(1)).toBe(SNOW_PACE);
        expect(snowPace(0.5)).toBeCloseTo((1 + SNOW_PACE) / 2);
        expect(snowPace(7)).toBe(SNOW_PACE);
    });

    it("kills the grass it covers, and leaves the grass under its line", () => {
        // Two tiles of a moist earth: one at the ground, one on a top the winter snow covers.
        const terrain: TerrainData = withHeights(undefined, new Map(tile(3, 2, 200)));
        const meadow = new Meadow(size, terrain, undefined);
        const winter: MeadowStepInput = { ...dry, season: Season.Winter, rainMmPerHour: 5 };
        meadow.set(1, 2, 0.5, 1);
        meadow.set(3, 2, 0.5, 1);
        run(meadow, 1300, winter);
        expect(meadow.grassAt(1, 2)).toBe(1);
        expect(meadow.grassAt(3, 2)).toBe(0);
        // In summer the same top is under the snow line: its grass stays.
        meadow.set(3, 2, 0.5, 1);
        run(meadow, 1300, { ...winter, season: Season.Summer });
        expect(meadow.grassAt(3, 2)).toBe(1);
    });
});

describe("the dryness of the grass", () => {
    const burning: MeadowStepInput = { ...dry, daylight: false, fireDanger: 1 };

    it("rises on a dry soil when it is hot, dry and windy: most of the way in a minute and a half", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(3, 2, 0, 1);
        expect(DRYING_SECONDS).toBe(90);
        run(meadow, 90, burning);
        expect(meadow.drynessAt(3, 2)).toBeGreaterThan(0.6);
        expect(meadow.drynessAt(3, 2)).toBeLessThan(0.7);
        run(meadow, 360, burning);
        expect(meadow.drynessAt(3, 2)).toBeGreaterThan(0.95);
    });

    it("stays green on a sodden soil, and under water", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(3, 2, 1, 1);
        run(meadow, 20, { ...burning, rainMmPerHour: 50 });
        expect(meadow.drynessAt(3, 2)).toBeLessThan(0.05);
        const flooded = new Meadow(size, undefined, undefined);
        flooded.set(3, 2, 0, 1, 1);
        run(flooded, 600, { ...burning, waterAt: () => 4 });
        expect(flooded.drynessAt(3, 2)).toBeLessThan(0.05);
    });

    it("comes with a soil the hot, dry wind dries out: sodden earth is dry in two minutes at the highest danger", () => {
        // A whole map of sodden earth under grass: nowhere for its moisture to spread to.
        const sodden = (): Meadow => {
            const meadow = new Meadow(size, undefined, undefined);
            for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) meadow.set(x, y, 1, 1);
            return meadow;
        };
        const parched = sodden();
        run(parched, 120, burning);
        expect(parched.moistureAt(3, 2)).toBeLessThan(0.1);
        expect(parched.drynessAt(3, 2)).toBeGreaterThan(0.5);
        // In mild air the same earth is still wet.
        const mild = sodden();
        run(mild, 120, { ...dry, daylight: false });
        expect(mild.moistureAt(3, 2)).toBeGreaterThan(0.7);
        // And the rain keeps it wet whatever the air.
        const rained = sodden();
        run(rained, 120, { ...burning, rainMmPerHour: 20 });
        expect(rained.moistureAt(3, 2)).toBeGreaterThan(0.7);
    });

    it("goes back down when the conditions do", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(3, 2, 0, 1, 1);
        run(meadow, 90, { ...dry, daylight: false });
        expect(meadow.drynessAt(3, 2)).toBeLessThan(0.4);
        expect(meadow.drynessAt(3, 2)).toBeGreaterThan(0.3);
    });

    it("dries the bare ground too where grass can grow, and nothing where it cannot", () => {
        const terrain = withSoils(undefined, new Map(tile(5, 2, soilCode("sand"))));
        const meadow = new Meadow(size, terrain, undefined);
        // Bare earth, no grass on it: a fertile soil gone dry.
        meadow.set(3, 2, 0, 0);
        meadow.set(5, 2, 0, 0, 1);
        run(meadow, 180, burning);
        expect(meadow.drynessAt(3, 2)).toBeGreaterThan(0.8);
        // Sand grows nothing: nothing to dry.
        expect(meadow.drynessAt(5, 2)).toBe(0);
        expect(meadow.drynessAt(-1, 0)).toBe(0);
    });

    it("is written with the meadow, and a state saved without it is still read", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(3, 2, 0.5, 1, 0.8);
        const copy = new Meadow(size, undefined, undefined);
        expect(copy.read(meadow.writeGrass(), meadow.writeMoisture(), meadow.writeDryness())).toBe(true);
        expect(copy.drynessAt(3, 2)).toBeCloseTo(0.8, 2);
        const older = new Meadow(size, undefined, undefined);
        expect(older.read(meadow.writeGrass(), meadow.writeMoisture())).toBe(true);
        expect(older.grassAt(3, 2)).toBe(1);
        expect(older.drynessAt(3, 2)).toBe(0);
        expect(older.read(meadow.writeGrass(), meadow.writeMoisture(), new Uint8Array(3))).toBe(false);
    });

    it("follows the meadow that replaces it when the map is edited, and goes with a meadow turned off", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(3, 2, 0.5, 1, 0.8);
        const next = new Meadow(size, undefined, undefined);
        next.takeFrom(meadow);
        expect(next.drynessAt(3, 2)).toBeCloseTo(0.8, 5);
        next.clear();
        expect(next.drynessAt(3, 2)).toBe(0);
    });
});
