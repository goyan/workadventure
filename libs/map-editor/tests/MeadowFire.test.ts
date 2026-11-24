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

    it("does not take on bare green ground, on sand, on a sodden soil nor under water", () => {
        const terrain = withSoils(undefined, new Map(tile(4, 4, soilCode("sand"))));
        const meadow = prairie(1, terrain);
        meadow.set(6, 6, 0.1, 0, 0.1);
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

    it("takes on dry ground even where the grass is thin or gone: a dry land burns", () => {
        const meadow = prairie(1);
        meadow.set(6, 6, 0.05, 0.03, 1);
        meadow.set(8, 8, 0.05, 0, 1);
        expect(meadow.ignite(6, 6, 0)).toBe(1);
        expect(meadow.ignite(8, 8, 0)).toBe(1);
        // It burns twenty-four seconds, long enough to set its neighbours on fire, then is ash.
        run(meadow, 22);
        expect(meadow.fireAt(8, 8)).toBe(1);
        run(meadow, 2);
        expect(meadow.fireAt(8, 8)).toBe(0);
        expect(meadow.ashAt(8, 8)).toBe(1);
        expect(meadow.grassAt(6, 6)).toBe(0);
    });

    it("takes on a ground half dry already, where it burns less long: no sudden threshold", () => {
        const meadow = prairie(1);
        meadow.set(8, 8, 0.05, 0, 0.3);
        expect(meadow.ignite(8, 8, 0)).toBe(1);
        run(meadow, 12);
        expect(meadow.fireAt(8, 8)).toBe(0);
        expect(meadow.ashAt(8, 8)).toBe(1);
    });

    it("keeps its size within what a patch may be", () => {
        expect(FIRE_DEFAULT_TILES).toBe(2);
        expect([0, 1, 8, 99, 3.4, Number.NaN].map(fireTiles)).toEqual([1, 1, 8, 8, 3, 2]);
    });
});

describe("a tile on fire", () => {
    it("burns for thirty seconds, then is ash: its grass is gone", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        expect(BURN_SECONDS).toBe(30);
        run(meadow, 6);
        expect(meadow.fireAt(10, 10)).toBe(1);
        expect(meadow.grassAt(10, 10)).toBeLessThan(1);
        run(meadow, 22);
        expect(meadow.fireAt(10, 10)).toBe(1);
        run(meadow, 2);
        expect(meadow.fireAt(10, 10)).toBe(0);
        expect(meadow.grassAt(10, 10)).toBe(0);
        expect(meadow.ashAt(10, 10)).toBe(1);
        expect(meadow.drynessAt(10, 10)).toBe(0);
        expect(meadow.burning()).toBe(0);
    });

    it("leaves ash that does not burn again, until the grass is back", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 40);
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
        // Out within 70 s, before the ash of the first tiles starts going (see "the ground after a fire").
        run(meadow, 70, river);
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
        // A wind of 60 km/h from the west blows east. With this luck, only a chance over a half spreads: downwind.
        run(meadow, 12, { ...night, windFrom: 270, windSpeed: 60, random: () => 0.5 });
        expect(meadow.fireAt(11, 10) + meadow.ashAt(11, 10)).toBeGreaterThan(0);
        expect(meadow.fireAt(13, 10) + meadow.ashAt(13, 10)).toBeGreaterThan(0);
        expect(meadow.fireAt(9, 10) + meadow.ashAt(9, 10)).toBe(0);
        expect(meadow.fireAt(10, 9) + meadow.ashAt(10, 9)).toBe(0);
    });

    it("sweeps a dry land: without wind, a tile on fire sets most of its neighbours on fire before it is out", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        // A middling luck: half the draws would fail a chance of a half.
        run(meadow, 20, { ...night, random: () => 0.3 });
        for (const [x, y] of [
            [11, 10],
            [9, 10],
            [10, 11],
            [10, 9],
        ]) {
            expect(meadow.fireAt(x, y) + meadow.ashAt(x, y)).toBeGreaterThan(0);
        }
    });

    it("leaps ahead under a strong wind: embers carried several tiles downwind, over a firebreak too", () => {
        const lucky = { ...night, random: () => 0 };
        // Without wind the fire gains a tile at a step: two steps after it took, it is not three tiles away.
        const still = prairie(1);
        still.ignite(10, 10, 0);
        run(still, 4, lucky);
        expect(still.fireAt(13, 10)).toBe(0);
        // At 120 km/h from the west the head runs ten tiles east at each step: 20 km/h, as fast as grass fires go.
        const gale = prairie(1);
        gale.ignite(5, 10, 0);
        run(gale, 4, { ...lucky, windFrom: 270, windSpeed: 120 });
        expect(gale.fireAt(10, 10)).toBeGreaterThan(0);
        expect(gale.fireAt(15, 10)).toBeGreaterThan(0);
        expect(gale.fireAt(20, 10)).toBeGreaterThan(0);
        // Nothing leaps upwind.
        expect(gale.fireAt(2, 10)).toBe(0);
        // A strip of sand two tiles wide does not stop them.
        const sand = new Map<string, number>();
        for (let y = 0; y < size.height; y++) {
            for (const x of [8, 9]) for (const [key, value] of tile(x, y, soilCode("sand"))) sand.set(key, value);
        }
        const broken = prairie(1, withSoils(undefined, sand));
        broken.ignite(6, 10, 0);
        run(broken, 8, { ...lucky, windFrom: 270, windSpeed: 120 });
        expect(broken.fireAt(11, 10) + broken.ashAt(11, 10)).toBeGreaterThan(0);
        expect(broken.fireAt(8, 10)).toBe(0);
    });

    it("runs no faster in a storm of 250 km/h than at 125: ten tiles a step at most, never across the map at once", () => {
        const lucky = { ...night, random: () => 0 };
        const reach = (windSpeed: number): number[] => {
            const meadow = prairie(1);
            meadow.ignite(2, 10, 0);
            meadow.step({ ...lucky, windFrom: 270, windSpeed });
            return Array.from({ length: size.width }, (_, x) => meadow.fireAt(x, 10));
        };
        const storm = reach(250);
        expect(storm).toEqual(reach(125));
        expect(storm[12]).toBeGreaterThan(0);
        expect(storm.slice(13).every((fire) => fire === 0)).toBe(true);
        for (const fire of storm) expect(Number.isFinite(fire) && fire >= 0 && fire <= 1).toBe(true);
    });

    it("hardly spreads over green grass", () => {
        const meadow = prairie(0);
        meadow.ignite(10, 10, 0);
        // The chance over green grass is 0.35 × 0.05 = 0.0175 at most: this luck is not enough.
        run(meadow, 30, { ...night, random: () => 0.03 });
        expect(meadow.ashAt(10, 10)).toBe(1);
        expect(meadow.ashAt(11, 10)).toBe(0);
        expect(meadow.burning()).toBe(0);
    });

    it("burns a whole dry map out, and stops by itself", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 70, lucky);
        expect(meadow.burning()).toBe(0);
        expect(meadow.ashAt(0, 0)).toBe(1);
        expect(meadow.ashAt(20, 20)).toBe(1);
        // The grass comes back over the whole map, and nothing takes fire again. Then its own rules hold: this dry
        // soil makes it die slowly of thirst.
        run(meadow, 530, lucky);
        expect(meadow.burning()).toBe(0);
        for (const [x, y] of [
            [0, 0],
            [10, 10],
            [20, 20],
        ]) {
            expect(meadow.ashAt(x, y)).toBe(0);
            expect(meadow.grassAt(x, y)).toBeGreaterThan(0.7);
        }
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

describe("the ground after a fire", () => {
    /** An autumn night on a soil gone dry: the grass alone would not grow back at all. */
    const autumnNight: MeadowStepInput = { ...night, season: Season.Autumn };
    /** A tile burnt through: lit, burnt in 30 s, then 10 s in ash. */
    const burnt = (input: MeadowStepInput = autumnNight): Meadow => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 40, input);
        expect(meadow.fireAt(10, 10)).toBe(0);
        expect(meadow.ashAt(10, 10)).toBeGreaterThan(0.9);
        expect(meadow.grassAt(10, 10)).toBeLessThan(0.1);
        return meadow;
    };

    it("is green again in five minutes, by night, in autumn, on a dry soil", () => {
        const meadow = burnt();
        // The ash stays whole while the embers die, about 45 s.
        expect(meadow.ashAt(10, 10)).toBe(1);
        run(meadow, 30, autumnNight);
        expect(meadow.ashAt(10, 10)).toBe(1);
        run(meadow, 130, autumnNight);
        expect(meadow.ashAt(10, 10)).toBeGreaterThan(0.45);
        expect(meadow.ashAt(10, 10)).toBeLessThan(0.55);
        expect(meadow.grassAt(10, 10)).toBeCloseTo(1 - meadow.ashAt(10, 10), 5);
        // Five minutes after it burnt through.
        run(meadow, 130, autumnNight);
        expect(meadow.ashAt(10, 10)).toBe(0);
        expect(meadow.grassAt(10, 10)).toBe(1);
    });

    it("burns again once half of its grass is back, not before", () => {
        const meadow = burnt();
        run(meadow, 140, autumnNight);
        expect(meadow.ignite(10, 10, 0)).toBe(0);
        run(meadow, 40, autumnNight);
        expect(meadow.ignite(10, 10, 0)).toBe(1);
    });

    it("comes back as fast as the grass of a map that grows faster", () => {
        const fast = { ...autumnNight, growSeconds: 60 };
        const meadow = burnt(fast);
        run(meadow, 60, fast);
        expect(meadow.ashAt(10, 10)).toBe(0);
        expect(meadow.grassAt(10, 10)).toBe(1);
    });

    it("loses its ash under water, without grass coming back there", () => {
        const meadow = burnt();
        run(meadow, 300, { ...autumnNight, waterAt: (x, y) => (x === 10 && y === 10 ? 4 : 0) });
        expect(meadow.ashAt(10, 10)).toBe(0);
        expect(meadow.grassAt(10, 10)).toBe(0);
    });
});

describe("the ash", () => {
    it("is written with the meadow; the fire is not, and a state saved without ash is still read", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 40);
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
        run(meadow, 40);
        meadow.ignite(3, 3, 0);
        const next = new Meadow(size, undefined, undefined);
        next.takeFrom(meadow);
        expect(next.ashAt(10, 10)).toBe(1);
        expect(next.fireAt(3, 3)).toBeGreaterThan(0);
        // The ash that just went out stays whole as long on the edited map.
        next.step(night);
        expect(next.ashAt(10, 10)).toBe(1);
    });
});

describe("the crater of a fireball", () => {
    it("lights green and sodden grass, and leaves its ground dry", () => {
        const meadow = prairie(0);
        for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) meadow.set(x, y, 1, 1, 0);
        expect(meadow.ignite(10, 10, 2)).toBe(0);
        expect(meadow.scorch(10, 10, 2)).toBe(13);
        expect(meadow.fireAt(10, 10)).toBeGreaterThan(0);
        expect(meadow.fireAt(12, 10)).toBeGreaterThan(0);
        expect(meadow.moistureAt(10, 10)).toBe(0);
        expect(meadow.drynessAt(10, 10)).toBe(1);
    });

    it("dries a bare fertile tile and lights its litter", () => {
        const meadow = prairie(0);
        meadow.set(6, 6, 0.6, 0, 0);
        expect(meadow.scorch(6, 6, 0)).toBe(1);
        expect(meadow.fireAt(6, 6)).toBeGreaterThan(0);
    });

    it("leaves sand and paved tiles alone", () => {
        const terrain = withSoils(undefined, new Map(tile(4, 4, soilCode("sand"))));
        const meadow = new Meadow(size, terrain, undefined, new Set(["8,8"]));
        meadow.set(4, 4, 0.5, 0, 0.2);
        meadow.set(8, 8, 0.5, 0, 0.2);
        expect(meadow.scorch(4, 4, 0)).toBe(0);
        expect(meadow.scorch(8, 8, 0)).toBe(0);
        expect(meadow.fireAt(4, 4)).toBe(0);
        expect(meadow.fireAt(8, 8)).toBe(0);
        expect(meadow.drynessAt(4, 4)).toBeCloseTo(0.2);
        expect(meadow.drynessAt(8, 8)).toBeCloseTo(0.2);
    });

    it("lights nothing under water", () => {
        const meadow = prairie(1);
        meadow.step({ ...night, waterAt: (tileX, tileY) => (tileX === 2 && tileY === 2 ? 4 : 0) });
        const moisture = meadow.moistureAt(2, 2);
        expect(meadow.scorch(2, 2, 0)).toBe(0);
        expect(meadow.fireAt(2, 2)).toBe(0);
        expect(meadow.moistureAt(2, 2)).toBe(moisture);
    });

    it("does not light again a tile on fire nor one still in ash", () => {
        const meadow = prairie(1);
        meadow.ignite(10, 10, 0);
        run(meadow, 40);
        expect(meadow.ashAt(10, 10)).toBe(1);
        expect(meadow.scorch(10, 10, 0)).toBe(0);
        expect(meadow.fireAt(10, 10)).toBe(0);
        meadow.ignite(3, 3, 0);
        expect(meadow.scorch(3, 3, 0)).toBe(0);
        expect(meadow.burning()).toBe(1);
    });

    it("touches nothing outside its disc, and nothing for a size that is not a number", () => {
        const meadow = prairie(0);
        expect(meadow.scorch(10, 10, 1)).toBe(5);
        expect(meadow.fireAt(12, 10)).toBe(0);
        expect(meadow.drynessAt(12, 10)).toBe(0);
        expect(meadow.scorch(10, 10, Number.NaN)).toBe(0);
        expect(meadow.scorch(-50, 400, 2)).toBe(0);
    });
});
