import { describe, expect, it } from "vitest";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import { SNOW_MAX_MM, THAW_SPEED } from "../src/Terrain/Snow";
import type { SnowWeather } from "../src/Terrain/Snow";
import { cellKey } from "../src/Terrain/TerrainGrid";
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
const mild: SnowWeather = { temperature: 10, humidity: 50, windSpeed: 0 };
const frost: SnowWeather = { temperature: -5, humidity: 100, windSpeed: 0 };
const under = (weather: SnowWeather | undefined, more: Partial<MeadowStepInput> = {}): MeadowStepInput => ({
    ...night,
    weather,
    ...more,
});
/** A room of one tile closed by walls, at tile (5, 5). */
const room = {
    east: new Set([cellKey(9, 10), cellKey(9, 11), cellKey(11, 10), cellKey(11, 11)]),
    south: new Set([cellKey(10, 9), cellKey(11, 9), cellKey(10, 11), cellKey(11, 11)]),
};
const total = (meadow: Meadow): number => {
    let sum = 0;
    for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) sum += meadow.snowAt(x, y);
    return sum;
};

describe("the snow falling on the meadow", () => {
    it("lies on a disc as wide as said, and nowhere else", () => {
        const meadow = new Meadow(size, undefined, undefined);
        expect(meadow.snowy()).toBe(false);
        expect(meadow.snowOn(10, 10, 2, 20)).toBeCloseTo(13 * 20);
        expect(meadow.snowAt(10, 10)).toBeCloseTo(20);
        expect(meadow.snowAt(12, 10)).toBeCloseTo(20);
        expect(meadow.snowAt(13, 10)).toBe(0);
        expect(meadow.snowAt(12, 12)).toBe(0);
        expect(meadow.snowy()).toBe(true);
    });

    it("lies on the whole meadow without a radius, outdoors only, and no higher than its most", () => {
        const meadow = new Meadow(size, undefined, room);
        meadow.snowOn(0, 0, undefined, 400);
        expect(meadow.snowAt(0, 0)).toBeCloseTo(400);
        expect(meadow.snowAt(20, 20)).toBeCloseTo(400);
        expect(meadow.snowAt(5, 5)).toBe(0);
        expect(meadow.snowOn(0, 0, 0, 400)).toBeCloseTo(SNOW_MAX_MM - 400);
        expect(meadow.snowAt(0, 0)).toBeCloseTo(SNOW_MAX_MM);
        expect(meadow.snowOn(0, 0, 0, Number.NaN)).toBe(0);
    });

    it("falls with the step on every tile outdoors", () => {
        const meadow = new Meadow(size, undefined, room);
        meadow.step(under(frost, { snowfallMm: 3 }));
        expect(meadow.snowAt(0, 0)).toBeCloseTo(3);
        expect(meadow.snowAt(5, 5)).toBe(0);
    });
});

describe("the snow melting", () => {
    it("melts by the heat of the air, and gives its water back", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 20);
        // 2 mm an hour, 600 times faster, for 2 s.
        const melt = (2 * THAW_SPEED * MEADOW_STEP_SECONDS) / 3600;
        const melted = meadow.step(under(mild));
        expect(melted?.meltedMm[10 * size.width + 10]).toBeCloseTo(melt);
        expect(meadow.snowAt(10, 10)).toBeCloseTo(20 - melt);
    });

    it("wets the soil it melts on, as a rain would", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 20);
        meadow.step(under(frost));
        expect(meadow.moistureAt(10, 10)).toBe(0);
        meadow.step(under(mild));
        expect(meadow.moistureAt(10, 10)).toBeGreaterThan(0.5);
        // The soil next to it, without snow, only takes what spreads.
        expect(meadow.moistureAt(15, 10)).toBe(0);
    });

    it("holds at 0 °C and under, and in an air that is not known", () => {
        for (const weather of [{ ...mild, temperature: 0 }, frost, undefined]) {
            const meadow = new Meadow(size, undefined, undefined);
            meadow.snowOn(10, 10, 0, 20);
            expect(meadow.step(under(weather))).toBeUndefined();
            expect(meadow.snowAt(10, 10)).toBeCloseTo(20);
        }
    });

    it("goes without water in a dry wind", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 20);
        expect(meadow.step(under({ temperature: -10, humidity: 20, windSpeed: 30 }))).toBeUndefined();
        expect(meadow.snowAt(10, 10)).toBeCloseTo(20 - (0.48 * THAW_SPEED * MEADOW_STEP_SECONDS) / 3600);
    });

    it("gives back as water all that fell, when nothing is taken by the wind", () => {
        const meadow = new Meadow(size, undefined, undefined);
        const laid = meadow.snowOn(10, 10, 3, 100);
        let melted = 0;
        for (let step = 0; step < 200; step++) {
            const water = meadow.step(under({ temperature: 4, humidity: 100, windSpeed: 15 }));
            if (water) for (const mm of water.meltedMm) melted += mm;
        }
        expect(melted).toBeGreaterThan(0);
        expect(melted + total(meadow)).toBeCloseTo(laid, 1);
    });

    it("melts at once in open water, as water, in an air over 0 °C or not known", () => {
        for (const weather of [mild, undefined]) {
            const meadow = new Meadow(size, undefined, undefined);
            meadow.snowOn(10, 10, 0, 20);
            const melted = meadow.step(under(weather, { waterAt: (x, y) => (x === 10 && y === 10 ? 4 : 0) }));
            expect(melted?.meltedMm[10 * size.width + 10]).toBeCloseTo(20);
            expect(meadow.snowAt(10, 10)).toBe(0);
        }
    });

    it("holds on the water when it freezes: the water under it is as good as ice", () => {
        for (const weather of [frost, { ...frost, temperature: 0 }]) {
            const meadow = new Meadow(size, undefined, undefined);
            meadow.snowOn(10, 10, 0, 20);
            expect(meadow.step(under(weather, { waterAt: () => 4, snowfallMm: 5 }))).toBeUndefined();
            expect(meadow.snowAt(10, 10)).toBeCloseTo(25);
        }
    });

    it("melts faster under a warm rain", () => {
        const dry = new Meadow(size, undefined, undefined);
        const wet = new Meadow(size, undefined, undefined);
        dry.snowOn(10, 10, 0, 20);
        wet.snowOn(10, 10, 0, 20);
        dry.step(under(mild));
        wet.step(under(mild, { rainMmPerHour: 10 }));
        expect(wet.snowAt(10, 10)).toBeLessThan(dry.snowAt(10, 10));
    });

    it("melts all at once where asked, and tells how much", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 2, 20);
        expect(meadow.melt(10, 10, 1)).toBeCloseTo(5 * 20);
        expect(meadow.snowAt(10, 10)).toBe(0);
        expect(meadow.snowAt(12, 10)).toBeCloseTo(20);
    });
});

describe("the snow of a map without grass", () => {
    it("falls, melts and gives its water by itself, the grass untouched", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.set(10, 10, 0.5, 0.4);
        expect(meadow.stepSnowAlone(under(frost, { snowfallMm: 20 }))).toBeUndefined();
        expect(meadow.snowAt(10, 10)).toBeCloseTo(20);
        const melted = meadow.stepSnowAlone(under(mild));
        expect(melted?.meltedMm[10 * size.width + 10]).toBeGreaterThan(0);
        expect(meadow.stepSnowAlone(under(mild, { waterAt: () => 4 }))?.meltedMm[0]).toBeGreaterThan(19);
        expect(meadow.grassAt(10, 10)).toBeCloseTo(0.4);
        expect(meadow.moistureAt(10, 10)).toBeCloseTo(0.5);
    });
});

describe("the snow and the fire", () => {
    it("keeps a tile from taking fire, and puts a fire out", () => {
        const meadow = new Meadow(size, undefined, undefined);
        for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) meadow.set(x, y, 0.1, 1, 1);
        expect(meadow.ignite(4, 4, 0)).toBe(1);
        meadow.snowOn(4, 4, 0, 20);
        meadow.step(under(frost));
        expect(meadow.fireAt(4, 4)).toBe(0);
        meadow.snowOn(10, 10, 0, 20);
        expect(meadow.ignite(10, 10, 0)).toBe(0);
    });

    it("leaves the grass under it dormant: it neither dies of thirst nor grows", () => {
        const meadow = new Meadow(size, undefined, undefined);
        // A dry soil under the snow, a moist one in daylight under it: neither moves.
        meadow.set(10, 10, 0, 0.6);
        meadow.set(12, 10, 0, 0.6);
        meadow.snowOn(10, 10, 0, 100);
        for (let step = 0; step < 50; step++) meadow.step(under(frost));
        expect(meadow.grassAt(10, 10)).toBeCloseTo(0.6);
        expect(meadow.grassAt(12, 10)).toBeLessThan(0.6);
        meadow.set(14, 10, 0.5, 0.2);
        meadow.snowOn(14, 10, 0, 100);
        for (let step = 0; step < 50; step++) meadow.step(under(frost, { daylight: true }));
        expect(meadow.grassAt(14, 10)).toBeCloseTo(0.2);
    });
});

describe("the heat of a fire on the snow", () => {
    const dryPrairie = (): Meadow => {
        const meadow = new Meadow(size, undefined, undefined);
        for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) meadow.set(x, y, 0.1, 1, 1);
        return meadow;
    };

    it("melts the snow it is brought to, whatever the cold, without wetting the soil it dries", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 3, 20);
        meadow.warm(10, 10, 1, 50);
        const melted = meadow.step(under(frost));
        expect(meadow.snowAt(10, 10)).toBe(0);
        expect(meadow.snowAt(11, 10)).toBe(0);
        expect(meadow.snowAt(12, 10)).toBeCloseTo(20);
        expect(melted?.meltedMm[10 * size.width + 10]).toBeCloseTo(20);
        expect(meadow.moistureAt(10, 10)).toBe(0);
        // The heat is spent: the snow that falls back holds.
        meadow.snowOn(10, 10, 0, 20);
        expect(meadow.step(under(frost))).toBeUndefined();
        expect(meadow.snowAt(10, 10)).toBeCloseTo(20);
    });

    it("melts less than it is given no snow, and is nothing where it is not a number", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 20);
        meadow.warm(10, 10, 0, 5);
        meadow.warm(10, 10, 0, Number.NaN);
        meadow.step(under(frost));
        expect(meadow.snowAt(10, 10)).toBeCloseTo(15);
    });

    it("melts the snow around a tile on fire, step after step", () => {
        const meadow = dryPrairie();
        expect(meadow.ignite(4, 4, 0)).toBe(1);
        meadow.snowOn(5, 4, 0, 40);
        meadow.snowOn(8, 4, 0, 40);
        meadow.step(under(frost));
        expect(meadow.snowAt(5, 4)).toBeLessThan(40);
        expect(meadow.snowAt(8, 4)).toBeCloseTo(40);
        for (let step = 0; step < 10; step++) meadow.step(under(frost));
        expect(meadow.snowAt(5, 4)).toBe(0);
    });

    it("is smothered by a snow that falls thicker than it melts", () => {
        const meadow = dryPrairie();
        meadow.ignite(4, 4, 0);
        meadow.snowOn(4, 4, 0, 300);
        meadow.step(under(frost));
        expect(meadow.fireAt(4, 4)).toBe(0);
        expect(meadow.snowAt(4, 4)).toBeGreaterThan(200);
    });

    it("leaves a tree its fire under a thin snow, and soaks it under a full cover", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 5);
        expect(meadow.soakedAt(10, 10)).toBe(false);
        meadow.snowOn(10, 10, 0, 10);
        expect(meadow.soakedAt(10, 10)).toBe(true);
    });
});

describe("the snow kept", () => {
    it("is written in a byte a tile and read back", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 15);
        const read = new Meadow(size, undefined, undefined);
        expect(read.read(meadow.writeGrass(), meadow.writeMoisture(), undefined, undefined, meadow.writeSnow())).toBe(
            true,
        );
        expect(read.snowAt(10, 10)).toBeGreaterThan(14);
        expect(read.snowAt(10, 10)).toBeLessThan(16);
        expect(read.snowAt(11, 10)).toBe(0);
    });

    it("is none in a state saved before the snow, and refused at another size", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 15);
        expect(meadow.read(meadow.writeGrass(), meadow.writeMoisture())).toBe(true);
        expect(meadow.snowAt(10, 10)).toBe(0);
        expect(meadow.read(meadow.writeGrass(), meadow.writeMoisture(), undefined, undefined, new Uint8Array(3))).toBe(
            false,
        );
    });

    it("follows the meadow that replaces it, and stays when the grass is turned off", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.snowOn(10, 10, 0, 15);
        const next = new Meadow(size, undefined, room);
        next.takeFrom(meadow);
        expect(next.snowAt(10, 10)).toBeCloseTo(15);
        meadow.clear();
        expect(meadow.snowAt(10, 10)).toBeCloseTo(15);
    });
});
