import { describe, expect, it } from "vitest";
import { Meadow, MEADOW_STEP_SECONDS } from "../src/Terrain/Meadow";
import type { MeadowStepInput } from "../src/Terrain/Meadow";
import type { SnowWeather } from "../src/Terrain/Snow";
import { DEFAULT_POOL_STYLE, poolSoilCode } from "../src/Terrain/Pools";
import { cellKey, withSoils } from "../src/Terrain/TerrainGrid";
import { PX_PER_MM } from "../src/Terrain/WaterInputs";
import { Season } from "../src/types";

const size = { width: 21, height: 21 };
const frost: SnowWeather = { temperature: -10, humidity: 100, windSpeed: 0 };
const mild: SnowWeather = { temperature: 10, humidity: 50, windSpeed: 0 };
/** A lake of 16 px of water on the tile (10, 10), a puddle of 1 px on (4, 4), dry ground elsewhere. */
const lake = (tileX: number, tileY: number): number =>
    tileX === 10 && tileY === 10 ? 16 : tileX === 4 && tileY === 4 ? 1 : 0;
const under = (weather: SnowWeather | undefined, more: Partial<MeadowStepInput> = {}): MeadowStepInput => ({
    seconds: MEADOW_STEP_SECONDS,
    rainMmPerHour: 0,
    daylight: false,
    season: Season.Summer,
    waterAt: lake,
    random: () => 1,
    weather,
    ...more,
});
const run = (meadow: Meadow, steps: number, input: MeadowStepInput): void => {
    for (let step = 0; step < steps; step++) meadow.step(input);
};

describe("the water freezing", () => {
    it("takes in ice from its surface in the frost, thicker with time, and only where water lies", () => {
        const meadow = new Meadow(size, undefined, undefined);
        expect(meadow.icy()).toBe(false);
        run(meadow, 5, under(frost));
        // 10 s at -10 °C, the ice thickening 1200 times faster than the real clock (ICE_GROWTH_TIMES): about 3 cm.
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(20);
        expect(meadow.iceAt(10, 10)).toBeLessThan(40);
        run(meadow, 10, under(frost));
        expect(meadow.iceAt(10, 10)).toBeGreaterThan(45);
        expect(meadow.iceAt(10, 10)).toBeLessThan(62);
        expect(meadow.iceAt(11, 10)).toBe(0);
        expect(meadow.icy()).toBe(true);
    });

    it("is never thicker than the water under it: a puddle freezes through", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 60, under(frost));
        expect(meadow.iceAt(4, 4)).toBeCloseTo(1 / PX_PER_MM, 1);
    });

    it("holds at 0 °C, and in an air that is not known", () => {
        for (const weather of [{ ...frost, temperature: 0 }, undefined]) {
            const meadow = new Meadow(size, undefined, undefined);
            run(meadow, 10, under(frost));
            const before = meadow.iceAt(10, 10);
            run(meadow, 10, under(weather));
            expect(meadow.iceAt(10, 10)).toBeCloseTo(before);
        }
    });

    it("thaws in a mild air, without giving water of its own: it is the water under it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const before = meadow.iceAt(10, 10);
        expect(meadow.step(under(mild))).toBeUndefined();
        expect(meadow.iceAt(10, 10)).toBeLessThan(before);
        run(meadow, 200, under(mild));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });

    it("goes with the water that leaves", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        meadow.step(under(frost, { waterAt: () => 0 }));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });

    it("tells whether it moved at the last step", () => {
        const meadow = new Meadow(size, undefined, undefined);
        meadow.step(under(frost));
        expect(meadow.iceMoved()).toBe(true);
        meadow.step(under({ ...frost, temperature: 0 }));
        expect(meadow.iceMoved()).toBe(false);
    });
});

describe("the ice, the snow and the fire", () => {
    it("holds the snow that falls on it, even in an air that thaws", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        meadow.snowOn(10, 10, 0, 20);
        const melted = meadow.step(under({ temperature: 1, humidity: 50, windSpeed: 0 }));
        // On open water the 20 mm would have melted at once.
        expect(meadow.snowAt(10, 10)).toBeGreaterThan(15);
        expect(melted?.meltedMm[10 * size.width + 10] ?? 0).toBeLessThan(5);
    });

    it("melts under the heat of a fire, after the snow lying on it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const ice = meadow.iceAt(10, 10);
        meadow.snowOn(10, 10, 0, 10);
        meadow.warm(10, 10, 0, 20);
        meadow.step(under({ ...frost, temperature: 0 }));
        expect(meadow.snowAt(10, 10)).toBe(0);
        expect(meadow.iceAt(10, 10)).toBeCloseTo(ice - 10, 0);
    });

    it("is broken where asked, and melts with the snow where a fireball lands", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        expect(meadow.breakIce(10, 10, 1)).toBeGreaterThan(0);
        expect(meadow.iceAt(10, 10)).toBe(0);
        expect(meadow.iceAt(4, 4)).toBeGreaterThan(0);
        meadow.melt(4, 4, 0);
        expect(meadow.iceAt(4, 4)).toBe(0);
    });
});

describe("the ice kept", () => {
    it("is written in a byte a tile and read back, none in a state saved before it", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const ice = meadow.iceAt(10, 10);
        const read = new Meadow(size, undefined, undefined);
        expect(
            read.read(meadow.writeGrass(), meadow.writeMoisture(), undefined, undefined, undefined, meadow.writeIce()),
        ).toBe(true);
        expect(read.iceAt(10, 10)).toBeGreaterThan(ice * 0.85);
        expect(read.iceAt(10, 10)).toBeLessThan(ice * 1.15);
        expect(read.read(meadow.writeGrass(), meadow.writeMoisture())).toBe(true);
        expect(read.iceAt(10, 10)).toBe(0);
        expect(
            read.read(meadow.writeGrass(), meadow.writeMoisture(), undefined, undefined, undefined, new Uint8Array(3)),
        ).toBe(false);
    });

    it("follows the meadow that replaces it, and stays when the grass is turned off", () => {
        const meadow = new Meadow(size, undefined, undefined);
        run(meadow, 10, under(frost));
        const ice = meadow.iceAt(10, 10);
        const next = new Meadow(size, undefined, undefined);
        next.takeFrom(meadow);
        expect(next.iceAt(10, 10)).toBeCloseTo(ice);
        meadow.clear();
        expect(meadow.iceAt(10, 10)).toBeCloseTo(ice);
    });
});

describe("the pools freezing", () => {
    /** The four cells of a tile painted as a pool of that style. */
    const poolAt = (tileX: number, tileY: number, style: number): [string, number][] =>
        [0, 1].flatMap((y) =>
            [0, 1].map((x): [string, number] => [cellKey(tileX * 2 + x, tileY * 2 + y), poolSoilCode(style)]),
        );
    const terrain = withSoils(undefined, new Map([...poolAt(6, 6, 0), ...poolAt(8, 6, 1)]));
    const styles = [DEFAULT_POOL_STYLE, { ...DEFAULT_POOL_STYLE, hot: true }];
    /** The water of the relief the pump of the server keeps in the two pools. */
    const filled = (weather: SnowWeather | undefined): MeadowStepInput =>
        under(weather, { waterAt: (x, y) => (y === 6 && (x === 6 || x === 8) ? 46 : 0) });

    it("takes the water of a pool in ice as the water of a lake, and thaws it", () => {
        const meadow = new Meadow(size, terrain, undefined, undefined, styles);
        run(meadow, 30, filled(frost));
        expect(meadow.iceAt(6, 6)).toBeGreaterThan(45);
        expect(meadow.iceAt(7, 6)).toBe(0);
        run(meadow, 300, filled(mild));
        expect(meadow.iceAt(6, 6)).toBe(0);
    });

    it("never freezes a pool whose water is heated, and melts the snow that falls in it", () => {
        const meadow = new Meadow(size, terrain, undefined, undefined, styles);
        run(meadow, 30, filled(frost));
        expect(meadow.iceAt(8, 6)).toBe(0);
        meadow.snowOn(8, 6, 0, 20);
        meadow.step(filled(frost));
        expect(meadow.snowAt(8, 6)).toBe(0);
    });

    it("has no ice in a pool that was emptied", () => {
        const meadow = new Meadow(size, terrain, undefined, undefined, styles);
        run(meadow, 30, under(frost, { waterAt: () => 0 }));
        expect(meadow.iceAt(6, 6)).toBe(0);
    });
});

describe("the water freezing at the extremes of the conditions", () => {
    it("freezes the lake through in a polar storm without going beyond its water, and thaws it in a hot storm within seconds", () => {
        const meadow = new Meadow(size, undefined, undefined);
        const polar: SnowWeather = { temperature: -80, humidity: 50, windSpeed: 250 };
        run(meadow, 1, under(polar));
        const frozen = meadow.iceAt(10, 10);
        expect(Number.isFinite(frozen)).toBe(true);
        expect(frozen).toBeGreaterThan(0);
        expect(frozen).toBeLessThanOrEqual(16 / PX_PER_MM);
        run(meadow, 30, under(polar));
        expect(meadow.iceAt(10, 10)).toBeCloseTo(16 / PX_PER_MM, 2);
        // A hot storm thaws some 108 mm a step of 2 s: half a metre of ice is gone in a dozen seconds.
        const hot: SnowWeather = { temperature: 80, humidity: 100, windSpeed: 250 };
        run(meadow, 1, under(hot));
        expect(meadow.iceAt(10, 10)).toBeCloseTo(16 / PX_PER_MM - 108, 2);
        run(meadow, 5, under(hot));
        expect(meadow.iceAt(10, 10)).toBe(0);
    });
});
